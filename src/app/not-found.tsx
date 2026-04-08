import Link from "next/link";
import { Landmark, Search, Home, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * App-wide 404 page (Next.js 16 file convention).
 *
 * Triggered when:
 *   1. A user navigates to an unmatched route (e.g. /this-page-does-not-exist)
 *   2. A server component calls `notFound()` from `next/navigation`
 *
 * Design goals:
 *   - Brand-consistent (Landmark icon + 지원금 찾기 wordmark, blue accent)
 *   - Actionable: 3 clear paths out (검색, 홈, 뒤로) instead of a dead-end
 *   - Ko-friendly copy: Korean primary, English fallback in metadata
 *
 * NOTE: this is a Server Component by default. We don't need any browser
 * APIs here, so keeping it server-rendered avoids shipping JS for the
 * 404 path itself.
 */

export const metadata = {
  title: "페이지를 찾을 수 없어요 | 지원금 찾기",
};

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-12">
      <Link
        href="/"
        className="mb-6 flex items-center gap-2 text-gray-600 hover:text-gray-900"
      >
        <Landmark className="h-5 w-5 text-blue-600" />
        <span className="text-base font-bold">지원금 찾기</span>
      </Link>

      <Card className="w-full max-w-md p-8 text-center">
        <div className="mb-2 text-6xl font-bold text-blue-600">404</div>
        <h1 className="mb-2 text-xl font-bold text-gray-900">
          페이지를 찾을 수 없어요
        </h1>
        <p className="mb-6 text-sm text-gray-500">
          요청하신 페이지가 이동되었거나 더 이상 존재하지 않아요.
          <br />
          아래에서 다음 행동을 골라주세요.
        </p>

        <div className="flex flex-col gap-2">
          <Button asChild className="w-full">
            <Link href="/search">
              <Search className="mr-2 h-4 w-4" />
              지원사업 검색하기
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href="/">
              <Home className="mr-2 h-4 w-4" />
              홈으로 이동
            </Link>
          </Button>
        </div>
      </Card>

      <Link
        href="/"
        className="mt-6 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" />
        돌아가기
      </Link>
    </div>
  );
}
