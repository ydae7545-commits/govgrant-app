"use client";

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Search,
  SlidersHorizontal,
  X,
  Sparkles,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { GrantCard } from "@/components/grant/grant-card";
import { ContextTabs } from "@/components/profile/context-tabs";
import { SignInBanner } from "@/components/profile/sign-in-banner";
import { useUserStore } from "@/store/user-store";
import { REGIONS } from "@/data/mock-regions";
import { calculateMatchScore } from "@/lib/match-score";
import type { Grant, GrantCategory } from "@/types/grant";

const CATEGORIES: GrantCategory[] = [
  "창업지원",
  "R&D",
  "정책자금",
  "고용지원",
  "수출지원",
  "교육훈련",
  "복지",
  "주거",
  "컨설팅",
  "기타",
];

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">Loading...</div>
      }
    >
      <SearchContent />
    </Suspense>
  );
}

function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const account = useUserStore((s) => s.account);

  const [mounted, setMounted] = useState(false);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  // Filters
  const [keyword, setKeyword] = useState(searchParams.get("keyword") || "");
  const [category, setCategory] = useState(searchParams.get("category") || "");
  const [region, setRegion] = useState(searchParams.get("region") || "");
  const [status, setStatus] = useState(searchParams.get("status") || "");
  const [sort, setSort] = useState(searchParams.get("sort") || "deadline");
  const [sheetOpen, setSheetOpen] = useState(false);

  /**
   * "맞춤 추천" 모드 (기본 ON): 활성 컨텍스트(개인/조직)의 프로필을 반영해
   * 매칭 스코어를 클라이언트에서 계산하고, 점수 내림차순 정렬 + 낮은 점수
   * 제외. OFF면 서버가 보내준 원본 정렬을 그대로 유지.
   *
   * 왜 client-side? 모든 컨텍스트 데이터(지역/업종/연구소 보유 여부 등)가
   * Zustand store에 있어서 서버로 재전달하지 않아도 됨. 663건 in-memory
   * 매칭은 수십 ms로 부담 없음.
   */
  const [personalized, setPersonalized] = useState(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  // activeContextId 변화 감지 → refetch
  const activeContextId = account?.activeContextId ?? null;
  const activeOrg =
    account?.activeContextId && account.activeContextId !== "personal"
      ? account.organizations.find((o) => o.id === account.activeContextId)
      : null;
  const activeOrgKind = activeOrg?.kind ?? "";

  const fetchGrants = useCallback(
    async (currentPage: number, append = false) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (keyword) params.set("keyword", keyword);
        if (category) params.set("category", category);
        if (region) params.set("region", region);
        if (status) params.set("status", status);
        params.set("sort", sort);
        params.set("page", String(currentPage));
        params.set("limit", "12");

        // 컨텍스트 필터
        if (activeContextId === "personal") {
          params.set("contextKind", "personal");
        } else if (activeContextId && activeOrgKind) {
          params.set("contextKind", "org");
          params.set("orgKind", activeOrgKind);
        }

        const res = await fetch(`/api/grants?${params.toString()}`);
        const data = await res.json();

        if (append) {
          setGrants((prev) => [...prev, ...(data.grants || [])]);
        } else {
          setGrants(data.grants || []);
        }
        setTotal(data.total || 0);
        setPage(data.page || 1);
        setTotalPages(data.totalPages || 1);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    },
    [keyword, category, region, status, sort, activeContextId, activeOrgKind]
  );

  useEffect(() => {
    if (!mounted) return;
    fetchGrants(1);
  }, [mounted, fetchGrants]);

  /**
   * 조직 컨텍스트 변경 시 region 필터를 자동으로 해당 조직의 region으로
   * 세팅. 사용자가 수동으로 변경한 region 이 있다면 건드리지 않음.
   * 단, 사용자가 region 필터를 명시적으로 "all" 로 바꾸면 유지.
   */
  useEffect(() => {
    if (!mounted) return;
    if (!activeOrg) return;
    // 사용자가 이미 region을 명시적으로 설정했다면 덮어쓰지 않음
    if (region && region !== "") return;
    if (activeOrg.region && activeOrg.region !== "전국") {
      setRegion(activeOrg.region);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, activeOrg?.id]);

  /**
   * 매칭 스코어 기반 정렬 + 필터링 (personalized 모드).
   *
   * 기본 점수 기준:
   *   >= 60 : 우수 매칭 (상단 노출)
   *   30-59 : 참고 매칭 (함께 노출)
   *   < 30  : 제외 (personalized ON 일 때)
   */
  const matchContext = useMemo(() => {
    if (!account) return null;
    return account.activeContextId === "personal"
      ? { kind: "personal" as const, profile: account.personal, interests: account.interests }
      : activeOrg
      ? { kind: "org" as const, org: activeOrg, interests: account.interests }
      : null;
  }, [account, activeOrg]);

  const displayGrants = useMemo(() => {
    if (!personalized || !matchContext) {
      return grants;
    }
    const scored = grants.map((g) => ({
      ...g,
      matchScore: calculateMatchScore(g, matchContext),
    }));
    // 점수 30 미만은 숨김, 나머지는 점수 내림차순 정렬.
    // 동점이면 같은 시도(서울특별시/경기도/...)에 속한 공고가 인접하게
    // 정렬되도록 secondary sort 추가 — bokjiro_local 데이터가 시군구 단위로
    // 흩어져 있어서 같은 종류 공고가 검색 결과에 띄엄띄엄 나오는 문제를
    // 완화한다. 같은 시도 안에서는 region 알파벳 순 (= 시군구 가나다순).
    return scored
      .filter((g) => (g.matchScore ?? 0) >= 30)
      .sort((a, b) => {
        const diff = (b.matchScore ?? 0) - (a.matchScore ?? 0);
        if (diff !== 0) return diff;
        const aProvince = a.region.split(/\s+/)[0] || a.region;
        const bProvince = b.region.split(/\s+/)[0] || b.region;
        if (aProvince !== bProvince) return aProvince.localeCompare(bProvince);
        return a.region.localeCompare(b.region);
      });
  }, [grants, personalized, matchContext]);

  const hiddenByMatch = personalized && matchContext
    ? grants.length - displayGrants.length
    : 0;

  // Sync filters to URL
  useEffect(() => {
    if (!mounted) return;
    const params = new URLSearchParams();
    if (keyword) params.set("keyword", keyword);
    if (category) params.set("category", category);
    if (region) params.set("region", region);
    if (status) params.set("status", status);
    if (sort !== "deadline") params.set("sort", sort);
    router.replace(`/search?${params.toString()}`, { scroll: false });
  }, [mounted, keyword, category, region, status, sort, router]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchGrants(1);
  };

  const loadMore = () => {
    if (page < totalPages) {
      fetchGrants(page + 1, true);
    }
  };

  if (!mounted)
    return <div className="p-8 text-center text-gray-400">Loading...</div>;

  const FilterPanel = () => (
    <div className="space-y-4">
      <div>
        <Label>지역</Label>
        <Select value={region} onValueChange={setRegion}>
          <SelectTrigger>
            <SelectValue placeholder="전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            {REGIONS.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>모집 상태</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger>
            <SelectValue placeholder="전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="모집중">모집중</SelectItem>
            <SelectItem value="마감임박">마감임박</SelectItem>
            <SelectItem value="모집예정">모집예정</SelectItem>
            <SelectItem value="마감">마감</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Sign-in Banner */}
      {!account && <SignInBanner />}

      {/* Context Tabs */}
      {account && <ContextTabs />}

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="지원사업 검색 (예: 창업, R&D, 청년)"
            className="pl-10"
          />
        </div>
      </form>

      {/* Category Chips */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Badge
          variant={category === "" ? "default" : "outline"}
          className="cursor-pointer"
          onClick={() => setCategory("")}
        >
          전체
        </Badge>
        {CATEGORIES.map((cat) => (
          <Badge
            key={cat}
            variant={category === cat ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setCategory(category === cat ? "" : cat)}
          >
            {cat}
          </Badge>
        ))}
      </div>

      <div className="flex gap-6">
        {/* Desktop Filter Sidebar */}
        <aside className="hidden w-56 shrink-0 md:block">
          <h3 className="mb-3 font-semibold text-gray-900">필터</h3>
          <FilterPanel />
        </aside>

        {/* Main Content */}
        <div className="flex-1">
          {/* Top Bar */}
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm text-gray-500">{total}개의 결과</span>
            <div className="flex items-center gap-2">
              <Select value={sort} onValueChange={setSort}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deadline">마감임박순</SelectItem>
                  <SelectItem value="amount">지원금액순</SelectItem>
                  <SelectItem value="latest">최신순</SelectItem>
                </SelectContent>
              </Select>

              {/* Mobile Filter Button */}
              <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" className="md:hidden">
                    <SlidersHorizontal className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right">
                  <SheetHeader>
                    <SheetTitle>필터</SheetTitle>
                  </SheetHeader>
                  <div className="mt-6">
                    <FilterPanel />
                  </div>
                  <Button
                    className="mt-6 w-full"
                    onClick={() => {
                      setSheetOpen(false);
                      fetchGrants(1);
                    }}
                  >
                    적용하기
                  </Button>
                </SheetContent>
              </Sheet>
            </div>
          </div>

          {/* Active Filters */}
          {(region || status) && (
            <div className="mb-4 flex flex-wrap gap-2">
              {region && region !== "all" && (
                <Badge variant="secondary" className="gap-1">
                  {region}
                  <X
                    className="h-3 w-3 cursor-pointer"
                    onClick={() => setRegion("")}
                  />
                </Badge>
              )}
              {status && status !== "all" && (
                <Badge variant="secondary" className="gap-1">
                  {status}
                  <X
                    className="h-3 w-3 cursor-pointer"
                    onClick={() => setStatus("")}
                  />
                </Badge>
              )}
            </div>
          )}

          {/* Personalized mode toggle + hint */}
          {matchContext && (
            <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50/50 p-3">
              <div className="flex items-start gap-2 text-xs text-blue-900">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                <div>
                  {personalized ? (
                    <>
                      <strong>
                        {matchContext.kind === "org"
                          ? matchContext.org.name
                          : "개인"}
                      </strong>
                      에게 맞는 과제만 추리는 중입니다.
                      {hiddenByMatch > 0 && (
                        <span className="text-blue-700">
                          {" "}
                          ({hiddenByMatch}건 숨김)
                        </span>
                      )}
                    </>
                  ) : (
                    <>맞춤 추천 모드가 꺼져 있어 전체 과제를 표시합니다.</>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant={personalized ? "default" : "outline"}
                onClick={() => setPersonalized((v) => !v)}
                className="shrink-0 text-xs"
              >
                {personalized ? "맞춤 ON" : "맞춤 OFF"}
              </Button>
            </div>
          )}

          {/* 프로필 완성 유도 — 활성 조직의 핵심 필드가 비어 있으면 노출 */}
          {matchContext?.kind === "org" && personalized && (
            <ProfileGapNotice org={matchContext.org} />
          )}

          {/* Results */}
          {loading && grants.length === 0 ? (
            <div className="py-12 text-center text-gray-400">검색 중...</div>
          ) : displayGrants.length > 0 ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                {displayGrants.map((grant) => (
                  <GrantCard key={grant.id} grant={grant} />
                ))}
              </div>
              {page < totalPages && !personalized && (
                <div className="mt-6 text-center">
                  <Button variant="outline" onClick={loadMore} disabled={loading}>
                    {loading ? "불러오는 중..." : "더 보기"}
                  </Button>
                </div>
              )}
              {personalized && page < totalPages && (
                <div className="mt-6 text-center">
                  <Button variant="outline" onClick={loadMore} disabled={loading}>
                    {loading ? "불러오는 중..." : `더 많은 과제 불러오기`}
                  </Button>
                </div>
              )}
            </>
          ) : personalized && grants.length > 0 ? (
            <div className="py-12 text-center text-sm text-gray-500">
              현재 필터로 맞춤 추천이 없습니다.
              <br />
              <button
                type="button"
                onClick={() => setPersonalized(false)}
                className="mt-2 text-blue-600 underline"
              >
                맞춤 OFF로 전체 과제 보기
              </button>
            </div>
          ) : (
            <div className="py-12 text-center text-gray-400">
              검색 결과가 없습니다
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 조직 프로필에서 매칭에 중요한 필드가 비어 있으면 채우라고 유도하는 배너.
 * 어느 정도 필수 필드를 채운 사용자에게는 표시되지 않도록 조건을 엄격하게.
 */
function ProfileGapNotice({
  org,
}: {
  org: import("@/types/user").Organization;
}) {
  const gaps: string[] = [];
  if (!org.region || org.region === "전국") gaps.push("지역");
  if (org.kind === "sme" || org.kind === "sole") {
    if (!org.industry && !org.techField) gaps.push("업종/기술 분야");
    if (org.businessAge == null) gaps.push("업력");
    if (org.employeeCount == null) gaps.push("종업원 수");
  }

  if (gaps.length === 0) return null;

  return (
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <div className="flex-1 text-amber-900">
        <strong>{org.name}</strong> 프로필에{" "}
        <span className="font-medium">{gaps.join(", ")}</span>가 비어 있어요.
        정확한 맞춤 추천을 받으려면 프로필을 완성해 주세요.
      </div>
      <Link
        href="/mypage"
        className="shrink-0 rounded-md border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
      >
        프로필 완성
      </Link>
    </div>
  );
}
