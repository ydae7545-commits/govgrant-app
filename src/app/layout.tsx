import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Header } from "@/components/layout/header";
import { MobileNav } from "@/components/layout/mobile-nav";
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
        <Header />
        <main className="flex-1 pb-16 md:pb-0">{children}</main>
        <MobileNav />
      </body>
    </html>
  );
}
