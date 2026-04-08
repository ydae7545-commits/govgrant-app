"use client";

import { useEffect } from "react";

/**
 * Root-level error boundary (Next.js 16 file convention).
 *
 * Triggered when an error happens INSIDE the root `layout.tsx` itself —
 * which `error.tsx` cannot catch because the regular error boundary is
 * mounted as a child of the layout.
 *
 * Constraints:
 *   - Must include its own `<html>` and `<body>` tags (it replaces the root
 *     layout when active).
 *   - No metadata exports (Client Component limitation in Next.js 16).
 *     Use React `<title>` element instead.
 *   - Cannot import global CSS via `import "./globals.css"` because the
 *     stylesheet expects to be in the layout. We inline the bare minimum.
 *
 * In practice this fires very rarely — only when the AuthHydrationProvider,
 * Header, or MobileNav crashes. The styling is intentionally minimal so it
 * works even if Tailwind isn't available.
 */

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[govgrant-app] global error:", error);
  }, [error]);

  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          backgroundColor: "#f9fafb",
          padding: "16px",
        }}
      >
        <title>심각한 오류 | 지원금 찾기</title>
        <div
          style={{
            maxWidth: "440px",
            width: "100%",
            backgroundColor: "white",
            borderRadius: "12px",
            border: "1px solid #e5e7eb",
            padding: "32px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "56px",
              height: "56px",
              borderRadius: "9999px",
              backgroundColor: "#fee2e2",
              marginBottom: "16px",
            }}
          >
            <span style={{ fontSize: "28px" }}>⚠️</span>
          </div>
          <h1
            style={{
              fontSize: "20px",
              fontWeight: 700,
              color: "#111827",
              marginBottom: "8px",
            }}
          >
            앱을 표시할 수 없어요
          </h1>
          <p
            style={{
              fontSize: "14px",
              color: "#6b7280",
              marginBottom: "24px",
              lineHeight: 1.6,
            }}
          >
            치명적인 오류가 발생했어요. 잠시 후 다시 시도해주세요.
            <br />
            문제가 계속되면 페이지를 새로고침해주세요.
          </p>

          <button
            type="button"
            onClick={() => unstable_retry()}
            style={{
              width: "100%",
              padding: "12px 16px",
              backgroundColor: "#2563eb",
              color: "white",
              border: "none",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            다시 시도
          </button>

          {error.digest && (
            <p
              style={{
                marginTop: "24px",
                fontSize: "12px",
                color: "#9ca3af",
                wordBreak: "break-all",
              }}
            >
              오류 코드: <code>{error.digest}</code>
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
