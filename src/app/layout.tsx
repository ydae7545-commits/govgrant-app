import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { Header } from "@/components/layout/header";
import { MobileNav } from "@/components/layout/mobile-nav";
import { AuthHydrationProvider } from "@/components/auth/hydration-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://govgrant-app.vercel.app";
const SITE_NAME = "지원금 찾기";
const DEFAULT_TITLE = "지원금 찾기 — 나에게 맞는 정부지원금 추천";
const DEFAULT_DESCRIPTION =
  "정부지원금·국가 R&D 과제·복지 서비스를 AI가 맞춤 추천. 개인 복지부터 중소기업 R&D, 창업 지원까지 5개 정부 데이터 소스 6,000+건을 한 곳에서.";

/**
 * App-wide metadata baseline. 페이지별 metadata 가 export 되면 이 값을
 * 부분적으로 덮어쓴다. metadataBase 가 있어야 OG/Twitter 이미지 URL 이
 * 절대 경로로 출력되어 외부 크롤러가 정상 인식한다.
 *
 * 참고:
 *   - opengraph-image.tsx 가 자동으로 og:image / twitter:image 태그를
 *     주입하므로 여기서 별도 image 필드를 줄 필요는 없다 (Next.js가 합침).
 *   - title.template 은 페이지 metadata 가 제목만 줘도 자동으로
 *     "{page} | 지원금 찾기" 형태로 만들어주는 패턴.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: DEFAULT_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  keywords: [
    "정부지원금",
    "국가 R&D",
    "창업지원",
    "복지",
    "기업마당",
    "정책자금",
    "사업계획서 AI",
    "중소기업",
    "맞춤 추천",
  ],
  authors: [{ name: SITE_NAME }],
  applicationName: SITE_NAME,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  /**
   * 검색엔진 소유권 검증.
   *
   * - google: Google Search Console (https://search.google.com/search-console)
   *   에서 발급. /sitemap.xml 자동 색인 + 검색 분석.
   * - naver-site-verification: Naver Search Advisor
   *   (https://searchadvisor.naver.com) 에서 발급. 한국 검색 트래픽 핵심.
   *
   * 이 메타 태그는 prod 페이지의 <head> 에 노출되며, 양쪽 콘솔에서 "확인"
   * 버튼을 누르면 verify 된다. verify 후에도 메타 태그는 계속 유지해야
   * 소유권이 풀리지 않는다.
   */
  verification: {
    google: "f69S0sSaJHyb_u0bGyU24gpW9LVzuelVv0JcMiQEE30",
    other: {
      "naver-site-verification":
        "849d48e340feca31227922b4b5db7027dd7f4e14",
    },
  },
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
        {/*
          Vercel Analytics — 무료 티어로 페이지뷰 ・ 이탈률 측정.
          Vercel 대시보드 → Analytics 탭에서 통계 확인. 자동 활성화 (env 0).
        */}
        <Analytics />
      </body>
    </html>
  );
}
