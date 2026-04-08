import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Header } from "@/components/layout/header";
import { MobileNav } from "@/components/layout/mobile-nav";
import { AuthHydrationProvider } from "@/components/auth/hydration-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "지원금 찾기 - 나에게 맞는 정부지원금 추천",
  description:
    "정부지원금, 국가 R&D 과제를 AI가 맞춤 추천해드립니다. 개인, 중소기업, 연구기관 모두를 위한 원스톱 플랫폼.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${geistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans" suppressHydrationWarning>
        <AuthHydrationProvider />
        <Header />
        {/*
          pb-20 (80px) 는 mobile-nav 의 fixed 64px + 8px safe-area 마진 +
          가로 모드/안드로이드 시스템 바 여유. 일부 페이지(/portfolio,
          /proposals/[id])는 별도 pb-24 를 추가로 줘서 더 안전. md 이상
          에서는 mobile-nav 가 숨겨지므로 pb 제거.
        */}
        <main className="flex-1 pb-20 md:pb-0">{children}</main>
        <MobileNav />
      </body>
    </html>
  );
}
