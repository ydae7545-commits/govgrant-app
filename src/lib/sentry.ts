/**
 * Sentry 통합 — DSN 가드 패턴.
 *
 * SENTRY_DSN env 가 없으면 모든 함수가 no-op 으로 동작해서 dev/CI 환경
 * 에서 sentry 계정 없이도 빌드 ・ 실행이 깨지지 않음. prod 에서 DSN 을
 * Vercel env 에 추가하면 즉시 활성화.
 *
 * 이 모듈은 client + server 양쪽에서 import 가능하지만, 실제 sentry-nextjs
 * 는 별도 instrumentation 파일 (instrumentation.ts) 로 init 한다. 이 모듈
 * 의 captureException 은 instrumentation 후 사용 가능하며, init 안 됐을
 * 때는 console.error 만 남긴다.
 */

import * as Sentry from "@sentry/nextjs";

const enabled =
  typeof process !== "undefined" && !!process.env.NEXT_PUBLIC_SENTRY_DSN;

export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (enabled) {
    try {
      Sentry.captureException(err, context ? { extra: context } : undefined);
    } catch {
      // Sentry 자체가 깨졌을 때는 fallback console
      console.error("[sentry] capture failed", err);
    }
  } else {
    // DSN 미설정 — console 에만 남김 (dev / pre-prod)
    console.error("[error]", err, context ?? "");
  }
}

export function captureMessage(
  message: string,
  level: "info" | "warning" | "error" = "info"
): void {
  if (enabled) {
    try {
      Sentry.captureMessage(message, level);
    } catch {
      console.warn("[sentry] message failed", message);
    }
  } else if (level === "error") {
    console.error("[message]", message);
  }
}

export function isSentryEnabled(): boolean {
  return enabled;
}
