import type { MetadataRoute } from "next";

/**
 * /robots.txt — 크롤러 접근 정책 (Next.js 16 file convention).
 *
 * 정책 요약:
 *   - 공개 콘텐츠 (홈, 검색, 과제 상세, 캘린더, 챗)는 모두 색인 허용.
 *   - 사용자 개인 영역 (/mypage, /portfolio, /proposals, /onboarding)
 *     과 인증/콜백 (/auth) 은 색인 금지 — 검색 결과에 노출돼봤자 의미
 *     없고 일부는 RLS 가 막아서 401 페이지가 색인되는 것도 방지.
 *   - /api/* 는 모두 차단. JSON 응답은 검색 가치 0.
 *   - 사이트맵 URL 명시 — 구글/네이버 봇이 먼저 sitemap 부터 읽고
 *     색인 우선순위를 잡는다.
 *
 * NEXT_PUBLIC_APP_URL 이 없으면 prod 도메인 fallback. dev 환경에서
 * 빌드해도 의도한 도메인이 sitemap URL 에 들어가게 한다.
 */

const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://govgrant-app.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/search", "/grants/", "/calendar", "/chat"],
        disallow: [
          "/api/",
          "/auth/",
          "/onboarding",
          "/mypage",
          "/portfolio",
          "/proposals",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
