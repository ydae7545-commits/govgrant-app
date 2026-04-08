import { ImageResponse } from "next/og";

/**
 * /opengraph-image — Next.js 16 file convention.
 *
 * 카카오톡 / 트위터 / 페이스북 / 디스코드 등에서 govgrant-app 링크를
 * 공유했을 때 표시되는 1200×630 카드 이미지를 빌드 시 자동 생성.
 *
 * 디자인 원칙:
 *   - 브랜드 색상 (blue-600 = #2563eb) + 흰 배경
 *   - 큰 wordmark "지원금 찾기" + 영문 부제
 *   - Landmark 아이콘은 SVG 인라인 (외부 폰트/이미지 의존 0)
 *   - 한글 폰트는 Edge runtime 의 system sans-serif fallback. 한국어가
 *     깨질 수 있으므로 메인 워드마크는 영문 + 부제로 한국어. 카카오톡/네
 *     이버는 시스템 폰트가 한국어를 잘 렌더링한다.
 *
 * twitter-image 는 같은 이미지를 자동 사용 (Next.js 가 opengraph-image
 * 를 twitter:image 로도 매핑). 별도 twitter-image 파일 불필요.
 *
 * 빌드 시점에 한 번 생성되어 캐시. Request-time API 미사용.
 */

export const runtime = "edge";

export const alt = "지원금 찾기 — 정부지원금·R&D 과제 맞춤 추천";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "space-between",
          background:
            "linear-gradient(135deg, #ffffff 0%, #eff6ff 50%, #dbeafe 100%)",
          padding: "80px",
          fontFamily: "sans-serif",
        }}
      >
        {/* 상단: 브랜드 로고 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
          }}
        >
          {/* Landmark icon (인라인 SVG) */}
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#2563eb"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="3" x2="21" y1="22" y2="22" />
            <line x1="6" x2="6" y1="18" y2="11" />
            <line x1="10" x2="10" y1="18" y2="11" />
            <line x1="14" x2="14" y1="18" y2="11" />
            <line x1="18" x2="18" y1="18" y2="11" />
            <polygon points="12 2 20 7 4 7" />
          </svg>
          <div
            style={{
              fontSize: "36px",
              fontWeight: 700,
              color: "#1f2937",
            }}
          >
            지원금 찾기
          </div>
        </div>

        {/* 중앙: 메인 카피 */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          <div
            style={{
              fontSize: "72px",
              fontWeight: 800,
              color: "#111827",
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
            }}
          >
            나에게 맞는
          </div>
          <div
            style={{
              fontSize: "72px",
              fontWeight: 800,
              color: "#2563eb",
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
            }}
          >
            정부지원금 추천
          </div>
        </div>

        {/* 하단: 부제 + 도메인 */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            width: "100%",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div
              style={{
                fontSize: "28px",
                color: "#4b5563",
                fontWeight: 500,
              }}
            >
              개인 복지 · 중소기업 R&D · 창업 지원
            </div>
            <div
              style={{
                fontSize: "20px",
                color: "#6b7280",
              }}
            >
              5개 정부 데이터 소스 · 6,000+ 공고 · AI 사업계획서
            </div>
          </div>
          <div
            style={{
              fontSize: "22px",
              color: "#2563eb",
              fontWeight: 600,
            }}
          >
            govgrant-app.vercel.app
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
