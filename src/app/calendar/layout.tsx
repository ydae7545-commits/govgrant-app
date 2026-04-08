import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "지원사업 캘린더",
  description:
    "마감 임박 정부지원금과 R&D 과제를 월별 캘린더로 한눈에. 관심 분야 공고를 놓치지 마세요.",
  alternates: { canonical: "/calendar" },
  openGraph: {
    title: "지원사업 캘린더 | 지원금 찾기",
    description:
      "마감 임박 정부지원금을 월별 캘린더로 한눈에 확인하세요.",
    url: "/calendar",
  },
};

export default function CalendarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
