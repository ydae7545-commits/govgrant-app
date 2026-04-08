import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { extractGrantMetadata } from "@/lib/enrichment/extract";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Admin endpoint for running LLM enrichment on grants in `public.grants`.
 *
 * Picks up rows where `enrichment_status = 'pending'` (oldest first), calls
 * the LLM extractor for each, and writes the result back into the row's
 * structured columns plus `enrichment_status = 'enriched'`.
 *
 * Auth: Bearer ADMIN_SYNC_TOKEN (same gate as sync-grants).
 *
 * Query params:
 *   ?limit=N         (default 10, hard cap 100) — how many rows to process
 *   ?source=msit     (optional) — only enrich rows from one source
 *   ?dryRun=1        (optional) — call the LLM but don't write back to DB
 *   ?id=<uuid>       (optional) — process exactly one row by id (overrides limit/source)
 *
 * The route runs in the Seoul region per vercel.json so OpenAI calls go
 * out from Korea (latency win) and any future Korean source-related work
 * stays consistent.
 *
 * Cost rough estimate (gpt-4o-mini, 1500-token in / 300-token out):
 *   per row: ~$0.0006
 *   1,000 rows: ~$0.6
 *
 * Manual smoke test:
 *   curl -X POST -H "Authorization: Bearer $ADMIN_SYNC_TOKEN" \
 *     "https://govgrant-app.vercel.app/api/admin/enrich-grants?limit=5&dryRun=1"
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const HARD_CAP_LIMIT = 100;

interface GrantRow {
  id: string;
  title: string;
  organization_name: string | null;
  description: string | null;
  summary: string | null;
  source: string;
  enrichment_status: string;
}

export async function POST(request: NextRequest) {
  // ----- Auth -----
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

  // ----- Params -----
  const url = new URL(request.url);
  const limit = clamp(
    parseInt(url.searchParams.get("limit") ?? "10", 10) || 10,
    1,
    HARD_CAP_LIMIT
  );
  const sourceFilter = url.searchParams.get("source");
  const dryRun = url.searchParams.get("dryRun") === "1";
  const singleId = url.searchParams.get("id");

  // ----- Pick rows to enrich -----
  const supabase = createAdminClient();
  let query = supabase
    .from("grants")
    .select(
      "id, title, organization_name, description, summary, source, enrichment_status"
    );

  if (singleId) {
    query = query.eq("id", singleId);
  } else {
    query = query.eq("enrichment_status", "pending").order("created_at", {
      ascending: true,
    });
    if (sourceFilter) query = query.eq("source", sourceFilter);
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
      message: "no pending rows to enrich",
    });
  }

  // ----- Process each row sequentially (rate-limit friendly) -----
  const startedAt = Date.now();
  const results: Array<{
    id: string;
    title: string;
    status: "enriched" | "skipped" | "failed";
    reason?: string;
    costUsd: number;
    extracted?: unknown;
  }> = [];
  let totalCost = 0;

  for (const row of rows as GrantRow[]) {
    // Body 우선순위: description (긴 본문) > summary (짧은 fallback)
    const body = (row.description ?? row.summary ?? "").trim();

    const result = await extractGrantMetadata({
      title: row.title,
      organization: row.organization_name,
      body,
    });

    totalCost += result.costUsd;

    if (!result.ok) {
      results.push({
        id: row.id,
        title: row.title.slice(0, 60),
        status: result.reason === "body_too_short" ? "skipped" : "failed",
        reason: `${result.reason}: ${result.message}`,
        costUsd: result.costUsd,
      });

      if (!dryRun) {
        await supabase
          .from("grants")
          .update({
            enrichment_status:
              result.reason === "body_too_short" ? "skipped" : "failed",
            enriched_at: new Date().toISOString(),
            enrichment_model: result.model,
            enrichment_cost_usd: result.costUsd,
          })
          .eq("id", row.id);
      }
      continue;
    }

    const data = result.data;
    results.push({
      id: row.id,
      title: row.title.slice(0, 60),
      status: "enriched",
      costUsd: result.costUsd,
      extracted: data,
    });

    if (!dryRun) {
      // Compose new eligibility object: keep what's already there if any,
      // overlay the LLM-extracted fields. Currently grants.eligibility is
      // mostly empty for source-imported rows so this is essentially a
      // straight write.
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
        enrichment_model: result.model,
        enrichment_cost_usd: result.costUsd,
        amount_label: data.amountLabel,
        eligibility,
      };

      // Only set amount_min/max if LLM produced them — preserve any prior values.
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

  console.info(
    "[grants:enrich]",
    JSON.stringify({
      processed: results.length,
      enriched: results.filter((r) => r.status === "enriched").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      failed: results.filter((r) => r.status === "failed").length,
      totalCost,
      tookMs: Date.now() - startedAt,
    })
  );

  return NextResponse.json({
    ok: true,
    mode: dryRun ? "dryRun" : "live",
    processed: results.length,
    enriched: results.filter((r) => r.status === "enriched").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed").length,
    totalCostUsd: totalCost,
    tookMs: Date.now() - startedAt,
    results: dryRun ? results : results.map((r) => ({ ...r, extracted: undefined })),
  });
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
