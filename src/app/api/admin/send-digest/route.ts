import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildPortfolioDigest } from "@/lib/notifications/digest";
import { renderPortfolioDigest } from "@/lib/email/templates/portfolio-digest";
import { sendEmail } from "@/lib/email/client";
import type { Organization } from "@/types/user";

/**
 * POST /api/admin/send-digest
 *
 * 포트폴리오 digest 이메일을 발송한다. 수동 테스트 + cron 트리거 양쪽에서
 * 사용. 로직:
 *
 *   1. users 테이블에서 "포트폴리오 운영자" 후보 뽑기
 *      - 지금 기준: organizations 배열 크기 >= 1 인 모든 유저
 *      - (Phase 7에서 opt-in 설정 추가 예정)
 *   2. 각 유저마다:
 *      - organizations + interests 로드
 *      - buildPortfolioDigest() 호출
 *      - hasContent = true 인 경우에만 이메일 발송
 *      - notifications 테이블에 로그 기록
 *
 * Query params:
 *   ?userId=<uuid>   — 한 명만 대상 (디버깅)
 *   ?email=<addr>    — 실제 이메일 주소 override (테스트용)
 *   ?dryRun=1        — 이메일 발송 skip, digest 내용만 반환
 *   ?limit=N         — 최대 몇 명에게 보낼지 (default 50, cap 100)
 *
 * Auth: Bearer ADMIN_SYNC_TOKEN.
 *
 * 비용: Resend 무료 플랜 월 3,000건 / 하루 100건. 현재 테스트 단계에선
 * 여유 충분.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const HARD_CAP = 100;

interface UserRowForDigest {
  id: string;
  display_name: string;
  email: string | null;
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
  const singleUserId = url.searchParams.get("userId");
  const overrideEmail = url.searchParams.get("email");
  const dryRun = url.searchParams.get("dryRun") === "1";
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1),
    HARD_CAP
  );

  const supabase = createAdminClient();

  // ----- 수신 대상 선정 -----
  let userQuery = supabase
    .from("users")
    .select("id, display_name, email")
    .not("email", "is", null);
  if (singleUserId) {
    userQuery = userQuery.eq("id", singleUserId);
  } else {
    userQuery = userQuery.limit(limit);
  }
  const { data: users, error: usersErr } = await userQuery;
  if (usersErr) {
    return NextResponse.json(
      { error: "users_fetch_failed", message: usersErr.message },
      { status: 500 }
    );
  }
  if (!users || users.length === 0) {
    return NextResponse.json({
      ok: true,
      mode: dryRun ? "dryRun" : "live",
      processed: 0,
      message: "no eligible users",
    });
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const dateLabel = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  const results: Array<{
    userId: string;
    email: string | null;
    status: "sent" | "skipped_empty" | "no_email" | "failed" | "dry";
    reason?: string;
    totalUrgent?: number;
    totalNew?: number;
    resendId?: string;
  }> = [];

  for (const u of users as UserRowForDigest[]) {
    const targetEmail = overrideEmail ?? u.email;
    if (!targetEmail) {
      results.push({
        userId: u.id,
        email: null,
        status: "no_email",
      });
      continue;
    }

    // 이 사용자의 organizations + interests 로드
    const [{ data: orgRows }, { data: interestRows }] = await Promise.all([
      supabase
        .from("organizations")
        .select("*")
        .eq("owner_user_id", u.id),
      supabase
        .from("user_interests")
        .select("category")
        .eq("user_id", u.id),
    ]);

    const organizations: Organization[] = (orgRows ?? []).map((row) =>
      mapOrgRow(row as Record<string, unknown>)
    );
    const interests = (interestRows ?? []).map(
      (r) => (r as { category: string }).category
    );

    if (organizations.length === 0) {
      results.push({
        userId: u.id,
        email: targetEmail,
        status: "skipped_empty",
        reason: "no organizations",
      });
      continue;
    }

    // Digest 빌드
    let digest;
    try {
      digest = await buildPortfolioDigest({
        userId: u.id,
        organizations,
        interests,
      });
    } catch (err) {
      results.push({
        userId: u.id,
        email: targetEmail,
        status: "failed",
        reason: `digest build: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
      continue;
    }

    if (!digest.hasContent) {
      results.push({
        userId: u.id,
        email: targetEmail,
        status: "skipped_empty",
        reason: "no urgent or new recommendations",
        totalUrgent: digest.totalUrgent,
        totalNew: digest.totalNew,
      });
      continue;
    }

    const rendered = renderPortfolioDigest({
      recipientName: u.display_name ?? "사용자",
      recipientEmail: targetEmail,
      appUrl,
      dateLabel,
      orgBlocks: digest.orgBlocks,
    });

    if (dryRun) {
      results.push({
        userId: u.id,
        email: targetEmail,
        status: "dry",
        totalUrgent: digest.totalUrgent,
        totalNew: digest.totalNew,
      });
      continue;
    }

    const send = await sendEmail({
      to: targetEmail,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });

    if (!send.ok) {
      results.push({
        userId: u.id,
        email: targetEmail,
        status: "failed",
        reason: `${send.reason}: ${send.error ?? ""}`,
      });
      continue;
    }

    // notifications 테이블에 로그 (best-effort)
    try {
      await supabase.from("notifications").insert({
        user_id: u.id,
        kind: "portfolio_digest",
        payload: {
          totalUrgent: digest.totalUrgent,
          totalNew: digest.totalNew,
          orgCount: digest.orgBlocks.length,
          resendId: send.id,
        },
        sent_at: new Date().toISOString(),
      });
    } catch {
      // ignore
    }

    results.push({
      userId: u.id,
      email: targetEmail,
      status: "sent",
      totalUrgent: digest.totalUrgent,
      totalNew: digest.totalNew,
      resendId: send.id,
    });
  }

  const summary = {
    processed: results.length,
    sent: results.filter((r) => r.status === "sent").length,
    dry: results.filter((r) => r.status === "dry").length,
    skipped: results.filter((r) => r.status === "skipped_empty").length,
    noEmail: results.filter((r) => r.status === "no_email").length,
    failed: results.filter((r) => r.status === "failed").length,
  };

  console.info("[notifications:digest]", JSON.stringify(summary));

  return NextResponse.json({
    ok: summary.failed === 0,
    mode: dryRun ? "dryRun" : "live",
    ...summary,
    results,
  });
}

/**
 * Supabase organizations 스키마(row)를 런타임 Organization 타입으로 변환.
 * snake_case → camelCase. 일부 필드는 Supabase가 그대로 넘겨주는 형태.
 */
function mapOrgRow(row: Record<string, unknown>): Organization {
  return {
    id: row.id as string,
    name: row.name as string,
    kind: row.kind as Organization["kind"],
    region: (row.region as string) ?? "전국",
    businessAge: (row.business_age as number) ?? undefined,
    employeeCount: (row.employee_count as number) ?? undefined,
    revenue: (row.revenue as number) ?? undefined,
    industry: (row.industry as string) ?? undefined,
    techField: (row.tech_field as string) ?? undefined,
    researchField: (row.research_field as string) ?? undefined,
    careerYears: (row.career_years as number) ?? undefined,
    hasResearchInstitute:
      (row.has_research_institute as boolean) ?? undefined,
    hasResearchDepartment:
      (row.has_research_department as boolean) ?? undefined,
    certifications: (row.certifications as string[]) ?? undefined,
    notes: (row.notes as string) ?? undefined,
    businessNo: (row.business_no as string) ?? undefined,
    businessStatusCode:
      (row.business_status_code as "01" | "02" | "03") ?? undefined,
    businessStatusLabel: (row.business_status_label as string) ?? undefined,
    businessTaxType: (row.business_tax_type as string) ?? undefined,
    businessClosedAt: (row.business_closed_at as string) ?? undefined,
    businessVerifiedAt: (row.business_verified_at as string) ?? undefined,
  };
}
