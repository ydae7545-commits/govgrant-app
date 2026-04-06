"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";
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
import { REGIONS } from "@/data/mock-regions";
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
    <Suspense fallback={<div className="flex items-center justify-center py-20">Loading...</div>}>
      <SearchContent />
    </Suspense>
  );
}

function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mounted, setMounted] = useState(false);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  // Filters
  const [keyword, setKeyword] = useState(searchParams.get("keyword") || "");
  const [category, setCategory] = useState(searchParams.get("category") || "");
  const [targetType, setTargetType] = useState(searchParams.get("targetType") || "");
  const [region, setRegion] = useState(searchParams.get("region") || "");
  const [status, setStatus] = useState(searchParams.get("status") || "");
  const [sort, setSort] = useState(searchParams.get("sort") || "deadline");
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchGrants = useCallback(
    async (currentPage: number, append = false) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (keyword) params.set("keyword", keyword);
        if (category) params.set("category", category);
        if (targetType) params.set("targetType", targetType);
        if (region) params.set("region", region);
        if (status) params.set("status", status);
        params.set("sort", sort);
        params.set("page", String(currentPage));
        params.set("limit", "12");

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
        // silent fail
      } finally {
        setLoading(false);
      }
    },
    [keyword, category, targetType, region, status, sort]
  );

  useEffect(() => {
    if (!mounted) return;
    fetchGrants(1);
  }, [mounted, fetchGrants]);

  // Sync filters to URL
  useEffect(() => {
    if (!mounted) return;
    const params = new URLSearchParams();
    if (keyword) params.set("keyword", keyword);
    if (category) params.set("category", category);
    if (targetType) params.set("targetType", targetType);
    if (region) params.set("region", region);
    if (status) params.set("status", status);
    if (sort !== "deadline") params.set("sort", sort);
    router.replace(`/search?${params.toString()}`, { scroll: false });
  }, [mounted, keyword, category, targetType, region, status, sort, router]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchGrants(1);
  };

  const loadMore = () => {
    if (page < totalPages) {
      fetchGrants(page + 1, true);
    }
  };

  if (!mounted) return <div className="p-8 text-center text-gray-400">Loading...</div>;

  const FilterPanel = () => (
    <div className="space-y-4">
      <div>
        <Label>대상 유형</Label>
        <Select value={targetType} onValueChange={setTargetType}>
          <SelectTrigger>
            <SelectValue placeholder="전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="individual">개인</SelectItem>
            <SelectItem value="sme">중소기업</SelectItem>
            <SelectItem value="research">연구기관</SelectItem>
          </SelectContent>
        </Select>
      </div>
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
            <span className="text-sm text-gray-500">
              {total}개의 결과
            </span>
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
          {(targetType || region || status) && (
            <div className="mb-4 flex flex-wrap gap-2">
              {targetType && targetType !== "all" && (
                <Badge variant="secondary" className="gap-1">
                  {targetType === "individual"
                    ? "개인"
                    : targetType === "sme"
                      ? "중소기업"
                      : "연구기관"}
                  <X
                    className="h-3 w-3 cursor-pointer"
                    onClick={() => setTargetType("")}
                  />
                </Badge>
              )}
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

          {/* Results */}
          {loading && grants.length === 0 ? (
            <div className="py-12 text-center text-gray-400">검색 중...</div>
          ) : grants.length > 0 ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                {grants.map((grant) => (
                  <GrantCard key={grant.id} grant={grant} />
                ))}
              </div>
              {page < totalPages && (
                <div className="mt-6 text-center">
                  <Button variant="outline" onClick={loadMore} disabled={loading}>
                    {loading ? "불러오는 중..." : "더 보기"}
                  </Button>
                </div>
              )}
            </>
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
