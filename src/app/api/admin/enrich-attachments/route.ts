import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { enrichFromAttachment } from "@/lib/enrichment/attachments";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/admin/enrich-attachments
 *
 * Phase B: 첨부 파일(.pdf, .hwpx) 기반 심화 enrichment.
 *
 * /api/admin/enrich-grants 는 dataContents HTML을 LLM에 넘기는데, 한국
 * 정부 공고는 핵심 정보(금액/정량 자격)가 대부분 첨부 공고문에만 있다.
 * 이 route는 각 grant의 raw.files에서 PDF 또는 HWPX를 골라 다운로드한 뒤
 * Claude에 넘겨서 정확한 메타데이터를 추출한다.
 *
 * Auth: Bearer ADMIN_SYNC_TOKEN.
 *
 * Query:
 *   ?limit=N         — 몇 건 처리할지 (default 5, cap 30, PDF가 느려서 작음)
 *   ?source=MSIT|MSS — 특정 소스만 처리 (BIZINFO는 raw에 직접 파일 URL 없음)
 *   ?dryRun=1        — DB 쓰기 건너뜀
 *   ?id=<uuid>       — 한 건만 처리 (디버깅용)
 *
 * Batch 운영:
 *   - Cron에서 호출하기엔 느림 (Claude PDF input이 1건당 5~15초).
 *   - 현재는 enrichment_status='enriched' 인 행만 대상 (HTML enrichment
 *     1차 통과 후 → 첨부로 2차 보강). enrichment_status='pending' 행이
 *     남아 있으면 enrich-grants 가 먼저 처리하도록 유도.
 *
 * 비용 예산:
 *   - PDF 5~10 페이지: ~$0.02
 *   - HWPX (텍스트만): ~$0.01
 *   - 500건 BIZINFO/MSIT 처리 시 약 $5~10
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const HARD_CAP = 30;

interface Row {
  id: string;
  title: string;
  organization_name: string | null;
  source: string;
  raw: Record<string, unknown> | null;
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  const expected = process.env.ADMIN_SYNC_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: "missing_admin_token_env" },
      { status: 500 }
    );
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = clamp(
    parseInt(url.searchParams.get("limit") ?? "5", 10) || 5,
    1,
    HARD_CAP
  );
  const sourceFilter = url.searchParams.get("source");
  const dryRun = url.searchParams.get("dryRun") === "1";
  const singleId = url.searchParams.get("id");

  const supabase = createAdminClient();

  // 대상 선정: enriched 상태 + raw JSON 가진 행. BIZINFO 는 raw에 직접
  // 파일 URL이 없어서 default로 제외하지만 명시 지정하면 허용.
  let query = supabase
    .from("grants")
    .select("id, title, organization_name, source, raw")
    .order("updated_at", { ascending: true });

  if (singleId) {
    query = query.eq("id", singleId);
  } else {
    if (sourceFilter) {
      query = query.eq("source", sourceFilter);
    } else {
      query = query.in("source", ["MSIT", "MSS"]);
    }
    query = query.limit(limit);
  }

  const { data: rows, error } = await query;
  if (error) {
    return NextResponse.json(
      { error: "fetch_failed", message: error.message },
      { status: 500 }
    );
  }

  if (!rows || rows.length === 0) {
    return NextResponse.json({
      ok: true,
      mode: dryRun ? "dryRun" : "live",
      processed: 0,
      message: "no rows to process",
    });
  }

  const startedAt = Date.now();
  const results: Array<{
    id: string;
    title: string;
    status: "enriched" | "skipped" | "failed";
    reason?: string;
    source?: "pdf" | "hwpx";
    attachmentName?: string;
    costUsd: number;
    extracted?: unknown;
  }> = [];
  let totalCost = 0;

  for (const row of rows as Row[]) {
    const result = await enrichFromAttachment({
      title: row.title,
      organization: row.organization_name,
      source: row.source,
      raw: row.raw,
    });

    totalCost += result.costUsd;

    if (!result.ok) {
      results.push({
        id: row.id,
        title: row.title.slice(0, 60),
        status: result.reason === "no_attachment" ? "skipped" : "failed",
        reason: `${result.reason}: ${result.message}`,
        costUsd: result.costUsd,
      });
      continue;
    }

    results.push({
      id: row.id,
      title: row.title.slice(0, 60),
      status: "enriched",
      source: result.source,
      attachmentName: result.attachmentName,
      costUsd: result.costUsd,
      extracted: result.data,
    });

    if (!dryRun) {
      // 기존 eligibility에 덮어쓰기. 첨부 기반이라 더 정확하다고 가정.
      const data = result.data;
      const eligibility: Record<string, unknown> = {
        requirements: data.requirements,
        ...(data.businessAgeMax != null
          ? { businessAgeMax: data.businessAgeMax }
          : {}),
        ...(data.employeeMax != null ? { employeeMax: data.employeeMax } : {}),
        ...(data.revenueMax != null ? { revenueMax: data.revenueMax } : {}),
        ...(data.requiresResearchInstitute
          ? { requiresResearchInstitute: true }
          : {}),
        ...(data.requiresResearchDepartment
          ? { requiresResearchDepartment: true }
          : {}),
      };

      const updates: Record<string, unknown> = {
        enrichment_status: "enriched",
        enriched_at: new Date().toISOString(),
        enrichment_model: `${result.model}+attachment`,
        enrichment_cost_usd: result.costUsd,
        amount_label: data.amountLabel,
        eligibility,
      };
      if (data.amountMin != null) updates.amount_min = data.amountMin;
      if (data.amountMax != null) updates.amount_max = data.amountMax;
      if (data.tags.length > 0) updates.tags = data.tags;

      const { error: updateError } = await supabase
        .from("grants")
        .update(updates)
        .eq("id", row.id);

      if (updateError) {
        results[results.length - 1].status = "failed";
        results[results.length - 1].reason = `db_update: ${updateError.message}`;
      }
    }
  }

  // 다른 admin route 들과 동일 패턴: 부분 실패도 ok=false + 207 로 내려야
  // cron/daily 가 잡아낸다.
  const failedCount = results.filter((r) => r.status === "failed").length;
  const summary = {
    processed: results.length,
    enriched: results.filter((r) => r.status === "enriched").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: failedCount,
    totalCost,
    tookMs: Date.now() - startedAt,
  };

  if (failedCount > 0) {
    console.warn(
      "[grants:enrich-attachments] partial failure",
      JSON.stringify(summary)
    );
  } else {
    console.info("[grants:enrich-attachments]", JSON.stringify(summary));
  }

  return NextResponse.json(
    {
      ok: failedCount === 0,
      mode: dryRun ? "dryRun" : "live",
      processed: results.length,
      enriched: summary.enriched,
      skipped: summary.skipped,
      failed: failedCount,
      totalCostUsd: totalCost,
      tookMs: summary.tookMs,
      results: dryRun
        ? results
        : results.map((r) => ({ ...r, extracted: undefined })),
    },
    { status: failedCount === 0 ? 200 : 207 }
  );
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
