import { Card } from "@/components/ui/card";

/**
 * Search 페이지 전용 스켈레톤.
 *
 * 검색 결과 그리드 (sm:grid-cols-2) 와 카테고리 chip row 의 모양을 미리
 * 그려두어 사용자가 실제 데이터가 도착하기 전에도 페이지의 형태를
 * 인지할 수 있게 한다. 스켈레톤 카드의 개수와 비율은 GrantCard 의
 * 평균 길이에 맞춰 6개 (모바일 1열 = 6개 스크롤, 데스크톱 2열 = 3행).
 *
 * Server Component (no "use client") — 인터랙션 없음.
 */

export default function SearchLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* 검색바 placeholder */}
      <div className="mb-4 h-10 animate-pulse rounded-md bg-gray-100" />

      {/* 카테고리 chips placeholder */}
      <div className="mb-4 flex flex-wrap gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-6 w-16 animate-pulse rounded-full bg-gray-100"
          />
        ))}
      </div>

      <div className="flex gap-6">
        {/* Desktop sidebar placeholder */}
        <aside className="hidden w-56 shrink-0 space-y-4 md:block">
          <div className="h-5 w-12 animate-pulse rounded bg-gray-100" />
          <div className="h-9 animate-pulse rounded bg-gray-100" />
          <div className="h-9 animate-pulse rounded bg-gray-100" />
        </aside>

        <div className="flex-1">
          {/* Top bar */}
          <div className="mb-4 flex items-center justify-between">
            <div className="h-4 w-24 animate-pulse rounded bg-gray-100" />
            <div className="h-9 w-36 animate-pulse rounded bg-gray-100" />
          </div>

          {/* 결과 카드 그리드 (실제 GrantCard 와 같은 구조) */}
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonGrantCard key={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SkeletonGrantCard() {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <div className="h-5 w-12 animate-pulse rounded bg-gray-100" />
        <div className="h-4 w-16 animate-pulse rounded bg-gray-100" />
      </div>
      <div className="h-5 w-4/5 animate-pulse rounded bg-gray-100" />
      <div className="space-y-1.5">
        <div className="h-3 w-full animate-pulse rounded bg-gray-100" />
        <div className="h-3 w-3/4 animate-pulse rounded bg-gray-100" />
      </div>
      <div className="flex items-center gap-3">
        <div className="h-3 w-20 animate-pulse rounded bg-gray-100" />
        <div className="h-3 w-12 animate-pulse rounded bg-gray-100" />
      </div>
      <div className="flex items-center justify-between">
        <div className="h-4 w-24 animate-pulse rounded bg-gray-100" />
        <div className="h-1.5 w-16 animate-pulse rounded-full bg-gray-100" />
      </div>
    </Card>
  );
}
