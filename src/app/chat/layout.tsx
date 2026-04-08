import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI 상담",
  description:
    "정부지원금에 대한 궁금증을 AI 챗봇에게 물어보세요. 자격 조건, 신청 방법, 추천 사업까지 24시간 답변.",
  alternates: { canonical: "/chat" },
  openGraph: {
    title: "AI 상담 | 지원금 찾기",
    description:
      "정부지원금 자격·신청·추천에 대한 궁금증을 AI 챗봇에게 물어보세요.",
    url: "/chat",
  },
};

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
