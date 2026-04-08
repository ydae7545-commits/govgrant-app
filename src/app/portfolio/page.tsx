"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2,
  Plus,
  Clock,
  Bookmark,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useUserStore } from "@/store/user-store";
import { featureFlags } from "@/lib/env";
import { calculateMatchScore } from "@/lib/match-score";
import { daysUntil } from "@/lib/format";
import type { Grant } from "@/types/grant";
import type { Organization, MatchContext } from "@/types/user";
import { ORG_KIND_LABELS } from "@/types/user";

/**
 * Phase C: /portfolio — B2B 포트폴리오 대시보드.
 *
 * 이 페이지는 한 운영자 계정(액셀러레이터/창업보육센터 등)이 관리하는
 * 여러 포트폴리오사를 한눈에 보여준다. 각 회사 카드에는:
 *   - 회사명, 유형, 지역
 *   - 맞춤 추천 공고 수 (match score >= 60 기준)
 *   - 마감 임박 공고 수 (7일 이내)
 *   - 저장한 공고 수
 *
 * 데이터 흐름:
 *   1. useUserStore의 organizations 배열을 그대로 사용 (Phase 1 구조 재활용)
 *   2. 한 번만 /api/grants 전체를 fetch (이미 server에서 마감 필터 적용됨)
 *   3. 각 회사별로 계산된 matchScore >= 60 건만 집계
 *
 * feature flag: NEXT_PUBLIC_USE_PORTFOLIO.
 */

interface OrgStats {
  orgId: string;
  recommendedCount: number;
  urgentCount: number; // 마감 7일 이내
  savedCount: number;
}

export default function PortfolioListPage() {
  const account = useUserStore((s) => s.account);
  const savedGrantIds = useUserStore((s) => s.savedGrantIds);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Phase 5 (알림) 단계에서 풍성하게 할 예정. 지금은 client-side 계산.
  useEffect(() => {
    if (!featureFlags.usePortfolio) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // 전체 활성 공고 긁기 — 회사별 매칭은 client에서 계산
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

  const orgStats: Record<string, OrgStats> = useMemo(() => {
    if (!account) return {};
    const out: Record<string, OrgStats> = {};
    for (const org of account.organizations) {
      const ctx: MatchContext = {
        kind: "org",
        org,
        interests: account.interests,
      };
      const scored = grants.map((g) => ({
        grant: g,
        score: calculateMatchScore(g, ctx),
      }));
      const recommended = scored.filter((s) => s.score >= 60);
      const urgent = recommended.filter((s) => {
        if (!s.grant.applicationEnd) return false;
        const d = daysUntil(s.grant.applicationEnd);
        return d >= 0 && d <= 7;
      });
      const saved = recommended.filter((s) =>
        savedGrantIds.includes(s.grant.id)
      );
      out[org.id] = {
        orgId: org.id,
        recommendedCount: recommended.length,
        urgentCount: urgent.length,
        savedCount: saved.length,
      };
    }
    return out;
  }, [account, grants, savedGrantIds]);

  // 오늘의 매칭 총합 (대시보드 상단 배지)
  const summary = useMemo(() => {
    const totals = Object.values(orgStats);
    return {
      orgCount: totals.length,
      totalRecommended: totals.reduce((s, t) => s + t.recommendedCount, 0),
      totalUrgent: totals.reduce((s, t) => s + t.urgentCount, 0),
    };
  }, [orgStats]);

  if (!featureFlags.usePortfolio) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-2xl font-bold text-gray-900">포트폴리오 대시보드</h1>
        <p className="mt-3 text-sm text-gray-600">
          이 기능은 아직 비활성화되어 있습니다.{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">
            NEXT_PUBLIC_USE_PORTFOLIO
          </code>{" "}
          를 켜면 사용할 수 있습니다.
        </p>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 text-center">
        <p className="text-sm text-gray-500">로그인이 필요합니다.</p>
        <Button asChild className="mt-4">
          <Link href="/auth/sign-in?next=/portfolio">로그인</Link>
        </Button>
      </div>
    );
  }

  const orgs = account.organizations;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 pb-24">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            포트폴리오 대시보드
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            {account.displayName}님이 관리 중인 {orgs.length}개 조직의 추천
            공고를 한눈에 확인하세요.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/mypage">
            <Plus className="mr-1.5 h-4 w-4" />
            조직 추가
          </Link>
        </Button>
      </div>

      {/* 상단 요약 */}
      {summary.orgCount > 0 && (
        <Card className="mb-6 flex flex-wrap items-center gap-6 border-blue-200 bg-blue-50/40 p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-blue-600" />
            <span className="text-sm font-medium text-gray-700">
              오늘의 매칭
            </span>
          </div>
          <Stat label="관리 조직" value={`${summary.orgCount}개`} />
          <Stat label="추천 공고" value={`${summary.totalRecommended}건`} />
          <Stat
            label="마감 임박"
            value={`${summary.totalUrgent}건`}
            urgent={summary.totalUrgent > 0}
          />
        </Card>
      )}

      {loading ? (
        <Card className="flex items-center justify-center p-12">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          <span className="ml-2 text-sm text-gray-500">추천 계산 중...</span>
        </Card>
      ) : error ? (
        <Card className="border-red-200 bg-red-50 p-6">
          <p className="text-sm text-red-700">불러오기 실패: {error}</p>
        </Card>
      ) : orgs.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {orgs.map((org) => (
            <OrgCard
              key={org.id}
              org={org}
              stats={orgStats[org.id]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function OrgCard({
  org,
  stats,
}: {
  org: Organization;
  stats: OrgStats | undefined;
}) {
  const recommended = stats?.recommendedCount ?? 0;
  const urgent = stats?.urgentCount ?? 0;
  const saved = stats?.savedCount ?? 0;

  return (
    <Link href={`/portfolio/${org.id}`}>
      <Card className="flex h-full flex-col p-4 transition hover:border-blue-300 hover:shadow-sm">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-gray-900">
              {org.name}
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {ORG_KIND_LABELS[org.kind]} · {org.region}
            </p>
          </div>
          <Badge variant="outline" className="shrink-0">
            <Building2 className="mr-1 h-3 w-3" />
            {org.industry || org.techField || org.researchField || "기타"}
          </Badge>
        </div>

        {org.businessStatusCode && (
          <div className="mb-3 text-[11px] text-gray-500">
            {org.businessStatusLabel ?? "검증 완료"}
            {org.businessTaxType ? ` · ${org.businessTaxType}` : ""}
          </div>
        )}

        <div className="mt-auto grid grid-cols-3 gap-2 border-t pt-3">
          <MiniStat
            icon={<Sparkles className="h-3 w-3" />}
            label="추천"
            value={recommended}
          />
          <MiniStat
            icon={<Clock className="h-3 w-3" />}
            label="임박"
            value={urgent}
            urgent={urgent > 0}
          />
          <MiniStat
            icon={<Bookmark className="h-3 w-3" />}
            label="저장"
            value={saved}
          />
        </div>
      </Card>
    </Link>
  );
}

function MiniStat({
  icon,
  label,
  value,
  urgent = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  urgent?: boolean;
}) {
  return (
    <div className="text-center">
      <div
        className={`flex items-center justify-center gap-1 text-[11px] ${
          urgent ? "text-red-600" : "text-gray-500"
        }`}
      >
        {icon}
        <span>{label}</span>
      </div>
      <div
        className={`mt-0.5 text-lg font-semibold ${
          urgent ? "text-red-600" : "text-gray-900"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  urgent = false,
}: {
  label: string;
  value: string;
  urgent?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] text-gray-500">{label}</div>
      <div
        className={`text-lg font-semibold ${
          urgent ? "text-red-600" : "text-gray-900"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="flex flex-col items-center gap-3 p-12 text-center">
      <Building2 className="h-10 w-10 text-gray-300" />
      <p className="text-sm text-gray-500">
        아직 등록된 포트폴리오 조직이 없습니다.
      </p>
      <Button asChild variant="outline" className="mt-2">
        <Link href="/mypage">
          <Plus className="mr-1.5 h-4 w-4" />첫 조직 추가하기
        </Link>
      </Button>
    </Card>
  );
}
