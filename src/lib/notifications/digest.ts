import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { dbRowToGrant, type GrantDbRow } from "@/lib/data-sources/msit";
import { calculateMatchScore } from "@/lib/match-score";
import { daysUntil } from "@/lib/format";
import type { Grant } from "@/types/grant";
import type { MatchContext, Organization } from "@/types/user";
import type { PortfolioDigestOrgBlock } from "@/lib/email/templates/portfolio-digest";

/**
 * Phase C-C: 포트폴리오 운영자에게 보낼 digest 데이터 빌더.
 *
 * 한 user(운영자)의 모든 포트폴리오 조직을 돌며:
 *   1. 각 조직 컨텍스트로 calculateMatchScore 계산
 *   2. 마감 7일 이내인 "임박" 공고를 추출
 *   3. 최근 24시간 안에 grants 테이블에 들어온 "신규" 공고 중 매칭된 것 추출
 *
 * 반환 구조는 renderPortfolioDigest() 의 입력과 1:1 매칭.
 *
 * 빈 조직 (임박 0 + 신규 0) 은 기본적으로 블록에서 제외해서 이메일이
 * 깔끔해지도록 한다. 이메일 자체를 보낼지 말지 판단은 호출자가.
 */

const URGENT_DAYS_MAX = 7;
const NEW_RECENT_HOURS = 24;
const MATCH_SCORE_THRESHOLD = 60;

export interface DigestBuilderArgs {
  userId: string;
  organizations: Organization[];
  interests: string[];
}

export interface DigestBuildResult {
  orgBlocks: PortfolioDigestOrgBlock[];
  totalUrgent: number;
  totalNew: number;
  /** true if there's anything worth sending (at least one match anywhere). */
  hasContent: boolean;
}

export async function buildPortfolioDigest(
  args: DigestBuilderArgs
): Promise<DigestBuildResult> {
  if (args.organizations.length === 0) {
    return {
      orgBlocks: [],
      totalUrgent: 0,
      totalNew: 0,
      hasContent: false,
    };
  }

  // 1. 후보 grants 가져오기
  //    마감되지 않은 + fetched_at 이 최근인 행들로 좁혀서 매칭 후보를 줄임.
  //    하루에 한 번 돌아가는 cron 이므로 performance 이슈는 크지 않지만,
  //    전체 grants 테이블 스캔하지 않는 게 좋음.
  const supabase = createAdminClient();
  const todayIso = new Date().toISOString().slice(0, 10);
  const recentCutoff = new Date(
    Date.now() - NEW_RECENT_HOURS * 60 * 60 * 1000
  ).toISOString();

  const { data: grantRows, error } = await supabase
    .from("grants")
    .select("*")
    .or(
      `application_end.gte.${todayIso},application_end.is.null`
    )
    .limit(1000);

  if (error) {
    throw new Error(`digest: grants fetch failed: ${error.message}`);
  }

  const allGrants: Grant[] = (grantRows ?? []).map((r) =>
    dbRowToGrant(r as GrantDbRow & { id: string })
  );

  // fetched_at은 grant 원본 crawl 시각. recent grants는 별도 계산 필요.
  // 위의 query에서 application_end 기반으로 활성 과제만 가져왔으니,
  // 여기서 신규 여부는 row.fetched_at (혹은 created_at) 을 써야 한다.
  // select * 로 가져왔으므로 raw row에서 fetched_at 접근 가능.
  const newGrantIds = new Set<string>();
  for (const row of (grantRows ?? []) as Array<
    GrantDbRow & { id: string; created_at?: string }
  >) {
    const ts =
      (row.fetched_at as string | undefined) ??
      (row.created_at as string | undefined);
    if (ts && ts >= recentCutoff) {
      newGrantIds.add(row.id);
    }
  }

  // 2. 조직별로 매칭
  const orgBlocks: PortfolioDigestOrgBlock[] = [];
  let totalUrgent = 0;
  let totalNew = 0;

  for (const org of args.organizations) {
    const ctx: MatchContext = {
      kind: "org",
      org,
      interests: args.interests as MatchContext["interests"],
    };
    const scored = allGrants
      .map((g) => ({ grant: g, score: calculateMatchScore(g, ctx) }))
      .filter((s) => s.score >= MATCH_SCORE_THRESHOLD);

    const urgent = scored
      .filter((s) => {
        if (!s.grant.applicationEnd) return false;
        const d = daysUntil(s.grant.applicationEnd);
        return d >= 0 && d <= URGENT_DAYS_MAX;
      })
      .sort((a, b) => {
        const da = daysUntil(a.grant.applicationEnd);
        const db = daysUntil(b.grant.applicationEnd);
        return da - db;
      })
      .map((s) => s.grant);

    const newRecommendations = scored
      .filter((s) => newGrantIds.has(s.grant.id))
      .sort((a, b) => b.score - a.score)
      .map((s) => s.grant);

    // 중복 제거: urgent에도 있고 new에도 있는 grant는 urgent로만 표시
    const urgentIds = new Set(urgent.map((g) => g.id));
    const freshOnly = newRecommendations.filter((g) => !urgentIds.has(g.id));

    orgBlocks.push({
      orgId: org.id,
      orgName: org.name,
      urgentGrants: urgent,
      newRecommendations: freshOnly,
    });

    totalUrgent += urgent.length;
    totalNew += freshOnly.length;
  }

  // 완전히 비어 있는 조직 블록은 제외
  const nonEmptyBlocks = orgBlocks.filter(
    (b) => b.urgentGrants.length > 0 || b.newRecommendations.length > 0
  );

  return {
    orgBlocks: nonEmptyBlocks,
    totalUrgent,
    totalNew,
    hasContent: totalUrgent + totalNew > 0,
  };
}
