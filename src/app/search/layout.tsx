import type { Metadata } from "next";

/**
 * Search segment metadata. /search 페이지가 client component 라
 * page.tsx 에 직접 metadata 를 export 할 수 없어 layout.tsx 로 분리.
 *
 * 이 layout 은 children 만 그대로 렌더링하고 추가 UI 를 그리지 않는다
 * (root layout 의 Header / MobileNav 가 이미 충분).
 */

export const metadata: Metadata = {
  title: "지원사업 검색",
  description:
    "정부지원금, R&D 과제, 복지 서비스 6,000+건을 키워드·카테고리·지역으로 검색. 개인 맞춤 추천과 마감 임박 알림 제공.",
  alternates: { canonical: "/search" },
  openGraph: {
    title: "지원사업 검색 | 지원금 찾기",
    description:
      "정부지원금, R&D 과제, 복지 서비스 6,000+건을 한 번에 검색.",
    url: "/search",
  },
};

export default function SearchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
