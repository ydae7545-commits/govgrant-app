"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  Pencil,
  Loader2,
  Sparkles,
  Clock,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GrantCard } from "@/components/grant/grant-card";
import { InviteTeamDialog } from "@/components/portfolio/invite-team-dialog";
import { useUserStore } from "@/store/user-store";
import { featureFlags } from "@/lib/env";
import { calculateMatchScore } from "@/lib/match-score";
import { daysUntil } from "@/lib/format";
import type { Grant } from "@/types/grant";
import type { MatchContext } from "@/types/user";
import { ORG_KIND_LABELS } from "@/types/user";

/**
 * /portfolio/[orgId] — 한 포트폴리오사의 추천 공고 상세.
 *
 * 흐름:
 *   1. URL param에서 orgId 추출
 *   2. useUserStore에서 해당 organization 찾기
 *   3. /api/grants fetch → matchScore 계산 → 내림차순 정렬
 *   4. GrantCard 리스트로 표시
 *
 * 이 페이지는 기존 /search 페이지의 축약형 + orgContext 고정 버전이다.
 * GrantCard 컴포넌트는 그대로 재사용해서 UI 일관성 유지.
 */

export default function PortfolioOrgDetailPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = use(params);
  const account = useUserStore((s) => s.account);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!featureFlags.usePortfolio) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/grants?limit=500");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { grants: Grant[] };
        if (!cancelled) setGrants(json.grants ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const org = account?.organizations.find((o) => o.id === orgId);

  const scoredGrants = useMemo(() => {
    if (!account || !org) return [];
    const ctx: MatchContext = {
      kind: "org",
      org,
      interests: account.interests,
    };
    return grants
      .map((g) => ({ ...g, matchScore: calculateMatchScore(g, ctx) }))
      .filter((g) => (g.matchScore ?? 0) >= 50)
      .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
  }, [grants, account, org]);

  const urgent = useMemo(
    () =>
      scoredGrants.filter((g) => {
        if (!g.applicationEnd) return false;
        const d = daysUntil(g.applicationEnd);
        return d >= 0 && d <= 7;
      }),
    [scoredGrants]
  );

  if (!featureFlags.usePortfolio) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 text-sm text-gray-600">
        기능이 비활성화되어 있습니다.
      </div>
    );
  }

  if (!account) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 text-center">
        <p className="text-sm text-gray-500">로그인이 필요합니다.</p>
      </div>
    );
  }

  if (!org) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 text-center">
        <p className="text-sm text-gray-500">조직을 찾을 수 없습니다.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/portfolio">포트폴리오로 돌아가기</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 pb-24">
      <Link
        href="/portfolio"
        className="mb-4 inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        포트폴리오
      </Link>

      {/* 헤더 */}
      <Card className="mb-6 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {/* h1 + 배지 row: 좁은 모바일에서 회사명이 길거나 배지가 두 개일 때
                wrap 되도록 flex-wrap 추가. break-keep-all 로 한국어 단어 단위
                줄바꿈을 유지해서 글자가 어색하게 끊기지 않게 한다. */}
            <div className="flex flex-wrap items-center gap-2">
              <Building2 className="h-5 w-5 shrink-0 text-gray-400" />
              <h1 className="break-keep-all text-xl font-bold text-gray-900">
                {org.name}
              </h1>
              {org.businessStatusCode === "01" && (
                <Badge className="bg-green-100 text-green-700">
                  {org.businessStatusLabel ?? "계속사업자"}
                </Badge>
              )}
              {org.businessStatusCode &&
                org.businessStatusCode !== "01" && (
                  <Badge className="bg-amber-100 text-amber-700">
                    {org.businessStatusLabel}
                  </Badge>
                )}
            </div>
            <p className="mt-1 break-keep-all text-sm text-gray-600">
              {ORG_KIND_LABELS[org.kind]} · {org.region}
              {org.industry ? ` · ${org.industry}` : ""}
              {org.techField ? ` · ${org.techField}` : ""}
            </p>
            {(org.businessAge != null || org.employeeCount != null) && (
              <p className="mt-0.5 text-xs text-gray-500">
                {org.businessAge != null && `업력 ${org.businessAge}년`}
                {org.businessAge != null && org.employeeCount != null && " · "}
                {org.employeeCount != null && `종업원 ${org.employeeCount}인`}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <InviteTeamDialog orgId={org.id} orgName={org.name}>
              <Button variant="outline" size="sm">
                <UserPlus className="mr-1 h-3.5 w-3.5" />
                팀원 초대
              </Button>
            </InviteTeamDialog>
            <Button variant="outline" size="sm" asChild>
              <Link href="/mypage">
                <Pencil className="mr-1 h-3.5 w-3.5" />
                수정
              </Link>
            </Button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3 border-t pt-4">
          <MetricBox
            icon={<Sparkles className="h-4 w-4" />}
            label="맞춤 추천"
            value={loading ? "…" : `${scoredGrants.length}건`}
          />
          <MetricBox
            icon={<Clock className="h-4 w-4" />}
            label="마감 임박"
            value={loading ? "…" : `${urgent.length}건`}
            urgent={urgent.length > 0}
          />
          <MetricBox
            icon={<Building2 className="h-4 w-4" />}
            label="조직 유형"
            value={ORG_KIND_LABELS[org.kind]}
          />
        </div>
      </Card>

      {/* 추천 리스트 */}
      {loading ? (
        <Card className="flex items-center justify-center p-12">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          <span className="ml-2 text-sm text-gray-500">추천 계산 중...</span>
        </Card>
      ) : error ? (
        <Card className="border-red-200 bg-red-50 p-6">
          <p className="text-sm text-red-700">불러오기 실패: {error}</p>
        </Card>
      ) : scoredGrants.length === 0 ? (
        <Card className="p-12 text-center text-sm text-gray-500">
          매칭된 공고가 없습니다. 조직 프로필을 채우면 추천이 나타납니다.
        </Card>
      ) : (
        <>
          {urgent.length > 0 && (
            <section className="mb-6">
              <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-gray-900">
                <Clock className="h-4 w-4 text-red-600" />
                마감 임박 ({urgent.length})
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {urgent.slice(0, 6).map((g) => (
                  <GrantCard key={g.id} grant={g} />
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-gray-900">
              <Sparkles className="h-4 w-4 text-blue-600" />
              맞춤 추천 ({scoredGrants.length})
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {scoredGrants.slice(0, 30).map((g) => (
                <GrantCard key={g.id} grant={g} />
              ))}
            </div>
            {scoredGrants.length > 30 && (
              <p className="mt-4 text-center text-xs text-gray-400">
                상위 30건 표시 · 전체 {scoredGrants.length}건
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function MetricBox({
  icon,
  label,
  value,
  urgent = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  urgent?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div
        className={`flex items-center gap-1.5 text-xs ${
          urgent ? "text-red-600" : "text-gray-500"
        }`}
      >
        {icon}
        <span className="truncate">{label}</span>
      </div>
      {/* "조직 유형" value 가 "중소기업·스타트업" 처럼 길어질 수 있으므로
          좁은 모바일(< 380px)에서 옆 column 침범하지 않게 truncate 한다. */}
      <div
        className={`mt-1 truncate text-lg font-semibold ${
          urgent ? "text-red-600" : "text-gray-900"
        }`}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}
