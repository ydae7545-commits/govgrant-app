"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Landmark, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { publicEnv, featureFlags } from "@/lib/env";

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-sm text-gray-500">Loading...</div>
        </div>
      }
    >
      <SignInContent />
    </Suspense>
  );
}

function SignInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/dashboard";

  const [loading, setLoading] = useState<"google" | "kakao" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const supabaseConfigured = featureFlags.useSupabase;

  const signInWithProvider = async (provider: "google" | "kakao") => {
    console.log("[sign-in] click", provider);
    setLoading(provider);
    setError(null);
    try {
      const supabase = createClient();
      console.log("[sign-in] supabase client created");
      const redirectTo = `${publicEnv.APP_URL}/auth/callback?next=${encodeURIComponent(
        nextPath
      )}`;
      console.log("[sign-in] redirectTo", redirectTo);
      const { data, error: authError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          // Supabase defaults: offline_access scope for refresh token.
        },
      });
      console.log("[sign-in] result", { data, authError });
      if (authError) {
        setError(authError.message);
        setLoading(null);
      }
      // On success Supabase redirects the browser away; no return value.
    } catch (e) {
      console.error("[sign-in] caught error", e);
      setError(e instanceof Error ? e.message : "로그인에 실패했어요.");
      setLoading(null);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 px-4">
      <Link
        href="/"
        className="mb-8 flex items-center gap-2 text-gray-700 hover:text-gray-900"
      >
        <Landmark className="h-6 w-6 text-blue-600" />
        <span className="text-lg font-bold">지원금 찾기</span>
      </Link>

      <Card className="w-full max-w-md p-8">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">
          로그인 또는 가입
        </h1>
        <p className="mb-8 text-sm text-gray-500">
          소셜 계정으로 시작하면 어느 기기에서나 같은 정보를 이어서 볼 수
          있어요.
        </p>

        {!supabaseConfigured && (
          <div className="mb-6 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">개발 모드: Supabase 로그인 비활성화</p>
              <p className="mt-1 text-amber-700">
                실제 소셜 로그인은 `NEXT_PUBLIC_USE_SUPABASE=true` 환경변수를
                켜야 동작합니다. 지금은 온보딩으로 이동해 로컬 프로필을
                만드세요.
              </p>
              <Button
                size="sm"
                className="mt-3"
                onClick={() => router.push("/onboarding")}
              >
                로컬 온보딩으로 이동
              </Button>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-3">
          <Button
            onClick={() => signInWithProvider("google")}
            disabled={loading !== null || !supabaseConfigured}
            variant="outline"
            className="w-full justify-center gap-3 border-gray-300 bg-white py-6 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <GoogleIcon />
            {loading === "google" ? "Google로 이동 중..." : "Google로 계속하기"}
          </Button>

          <Button
            onClick={() => signInWithProvider("kakao")}
            disabled={loading !== null || !supabaseConfigured}
            className="w-full justify-center gap-3 bg-[#FEE500] py-6 text-sm font-medium text-[#000000] hover:bg-[#FDD800]"
          >
            <KakaoIcon />
            {loading === "kakao" ? "카카오로 이동 중..." : "카카오로 계속하기"}
          </Button>
        </div>

        <p className="mt-8 text-center text-xs text-gray-400">
          계속 진행하시면{" "}
          <Link href="/terms" className="underline hover:text-gray-600">
            이용약관
          </Link>
          과{" "}
          <Link href="/privacy" className="underline hover:text-gray-600">
            개인정보처리방침
          </Link>
          에 동의한 것으로 간주됩니다.
        </p>
      </Card>

      <Link
        href="/"
        className="mt-6 text-sm text-gray-500 hover:text-gray-700"
      >
        ← 돌아가기
      </Link>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C12.955 4 4 12.955 4 24s8.955 20 20 20s20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}

function KakaoIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 3C6.477 3 2 6.58 2 11c0 2.85 1.86 5.34 4.67 6.76l-.95 3.47c-.08.3.23.54.49.37L10.37 19c.54.08 1.09.13 1.63.13 5.523 0 10-3.58 10-8s-4.477-8-10-8Z" />
    </svg>
  );
}
