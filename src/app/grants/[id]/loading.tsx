import { Card } from "@/components/ui/card";

/**
 * 과제 상세 페이지 스켈레톤.
 *
 * 실제 grants/[id]/page.tsx 의 레이아웃을 반영해 다음 영역을 미리
 * 그려둔다:
 *   - 상단: 카테고리/마감 배지 + 제목
 *   - 메인 카드: 한 줄 요약 + 설명 + 자격
 *   - 사이드: 기관/지역/금액/마감/CTA 버튼
 *
 * 데이터 fetch (Supabase grants 조회 + 매칭 점수 계산) 가 끝날 때까지
 * 약 200~600ms 동안 흰 화면이 보이는 것을 방지한다.
 *
 * Server Component.
 */

export default function GrantDetailLoading() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      {/* 뒤로가기 버튼 placeholder */}
      <div className="mb-4 h-8 w-20 animate-pulse rounded bg-gray-100" />

      {/* 헤더: 배지 row + 제목 */}
      <div className="mb-6">
        <div className="mb-3 flex items-center gap-2">
          <div className="h-6 w-16 animate-pulse rounded-full bg-gray-100" />
          <div className="h-6 w-20 animate-pulse rounded-full bg-gray-100" />
        </div>
        <div className="space-y-2">
          <div className="h-7 w-4/5 animate-pulse rounded bg-gray-100" />
          <div className="h-7 w-3/5 animate-pulse rounded bg-gray-100" />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* 메인 카드 (2 col) */}
        <div className="space-y-4 md:col-span-2">
          <Card className="space-y-3 p-6">
            <div className="h-5 w-24 animate-pulse rounded bg-gray-100" />
            <div className="space-y-2">
              <div className="h-4 w-full animate-pulse rounded bg-gray-100" />
              <div className="h-4 w-full animate-pulse rounded bg-gray-100" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-gray-100" />
            </div>
          </Card>

          <Card className="space-y-3 p-6">
            <div className="h-5 w-32 animate-pulse rounded bg-gray-100" />
            <div className="space-y-2">
              <div className="h-4 w-full animate-pulse rounded bg-gray-100" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-gray-100" />
              <div className="h-4 w-4/6 animate-pulse rounded bg-gray-100" />
              <div className="h-4 w-full animate-pulse rounded bg-gray-100" />
            </div>
          </Card>
        </div>

        {/* 사이드: 메타 정보 + CTA */}
        <Card className="h-fit space-y-4 p-5">
          <div className="space-y-2">
            <div className="h-3 w-12 animate-pulse rounded bg-gray-100" />
            <div className="h-5 w-32 animate-pulse rounded bg-gray-100" />
          </div>
          <div className="space-y-2">
            <div className="h-3 w-12 animate-pulse rounded bg-gray-100" />
            <div className="h-5 w-24 animate-pulse rounded bg-gray-100" />
          </div>
          <div className="space-y-2">
            <div className="h-3 w-12 animate-pulse rounded bg-gray-100" />
            <div className="h-5 w-28 animate-pulse rounded bg-gray-100" />
          </div>
          <div className="space-y-2">
            <div className="h-3 w-12 animate-pulse rounded bg-gray-100" />
            <div className="h-5 w-20 animate-pulse rounded bg-gray-100" />
          </div>

          <div className="space-y-2 pt-2">
            <div className="h-10 animate-pulse rounded-md bg-gray-100" />
            <div className="h-10 animate-pulse rounded-md bg-gray-100" />
          </div>
        </Card>
      </div>
    </div>
  );
}
