"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, Home, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * App-level Error Boundary (Next.js 16 file convention).
 *
 * Catches runtime errors thrown from page/segment components below the root
 * layout. The root layout itself is NOT wrapped — for that you need
 * `global-error.tsx`.
 *
 * Next.js 16 prop signature changed:
 *   - 13–15: { error, reset }
 *   - 16:    { error, unstable_retry }
 * `unstable_retry` re-fetches and re-renders the segment children. We expose
 * a regular "다시 시도" button that calls it.
 *
 * The `error.digest` field is the hash of the server-side error that you can
 * use to grep production logs (Vercel Functions logs). We surface it as small
 * gray text so users can copy-paste when reporting issues.
 *
 * Must be a Client Component (`"use client"`) per Next.js docs — error
 * boundaries are React Error Boundaries which can only run on the client.
 */

export default function GlobalRouteError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // Log to console so dev tools surface it. In Phase 9 we'll swap this
    // for Sentry / PostHog capture.
    console.error("[govgrant-app] route error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md p-8 text-center">
        <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
          <AlertTriangle className="h-7 w-7 text-red-600" />
        </div>

        <h1 className="mb-2 text-xl font-bold text-gray-900">
          문제가 발생했어요
        </h1>
        <p className="mb-6 text-sm text-gray-500">
          페이지를 표시하던 중 예상치 못한 오류가 발생했어요.
          <br />
          잠시 후 다시 시도해보세요.
        </p>

        <div className="flex flex-col gap-2">
          <Button onClick={() => unstable_retry()} className="w-full">
            <RotateCw className="mr-2 h-4 w-4" />
            다시 시도
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href="/">
              <Home className="mr-2 h-4 w-4" />
              홈으로 이동
            </Link>
          </Button>
        </div>

        {error.digest && (
          <p className="mt-6 break-all text-xs text-gray-400">
            오류 코드: <code className="font-mono">{error.digest}</code>
          </p>
        )}
      </Card>
    </div>
  );
}
