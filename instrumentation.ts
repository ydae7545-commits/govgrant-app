/**
 * Next.js instrumentation hook — Sentry 초기화 진입점.
 *
 * Next.js 16 은 instrumentation.ts 를 빌드 시 자동 감지해서 server start
 * 시점에 register() 를 호출. Sentry 의 server-side init 을 여기서 한다.
 *
 * NEXT_PUBLIC_SENTRY_DSN 이 없으면 init 자체를 skip — 빌드 ・ 런타임 모두
 * 깨끗하게 동작.
 *
 * 클라이언트 init 은 sentry.client.config.ts 에서 별도로 처리 (있을 경우).
 * 우리는 일단 server-side 만 활성화해서 API route 의 unhandled error 를
 * 잡는 데 집중. 클라이언트 측은 ErrorBoundary 에서 직접 captureException
 * 호출.
 */

export async function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    // dev / pre-prod — Sentry 없음. 조용히 종료.
    return;
  }

  if (process.env.NEXT_RUNTIME === "nodejs") {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn,
      // sampling: prod 에서 모든 에러 수집, transaction 은 10%만
      tracesSampleRate: 0.1,
      // PII 자동 수집 비활성화 (개인정보보호법 - 명시적 동의 없이 수집 X)
      sendDefaultPii: false,
      environment: process.env.NEXT_PUBLIC_APP_ENV ?? "production",
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn,
      tracesSampleRate: 0.1,
      sendDefaultPii: false,
      environment: process.env.NEXT_PUBLIC_APP_ENV ?? "production",
    });
  }
}
