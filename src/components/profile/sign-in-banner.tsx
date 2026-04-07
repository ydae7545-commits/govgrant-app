"use client";

import Link from "next/link";
import { ArrowRight, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { featureFlags } from "@/lib/env";

/**
 * CTA banner shown to unauthenticated visitors on pages that require a
 * profile to be useful (dashboard, mypage, etc.).
 *
 * When Supabase auth is enabled (`NEXT_PUBLIC_USE_SUPABASE=true`) the banner
 * points to `/auth/sign-in` so the user can sign in with Google or Kakao.
 * Otherwise it falls back to the local-only `/onboarding` flow that stores
 * data in `localStorage`.
 */
export function SignInBanner({
  title,
  description,
}: {
  title?: string;
  description?: string;
}) {
  const supabaseMode = featureFlags.useSupabase;

  const finalTitle =
    title ??
    (supabaseMode
      ? "로그인하고 어디서든 이어서 쓰세요"
      : "시작하려면 로그인이 필요해요");

  const finalDescription =
    description ??
    (supabaseMode
      ? "Google 또는 카카오로 로그인하면 프로필·기관·저장한 과제가 클라우드에 안전하게 저장되어 여러 기기에서 같은 정보를 볼 수 있어요."
      : "이름만 입력하면 프로필·기관·관심 분야가 이 기기에 저장돼 다음에 방문해도 그대로 유지됩니다.");

  const destination = supabaseMode ? "/auth/sign-in" : "/onboarding";

  return (
    <Card className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 p-6">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white">
            <UserPlus className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{finalTitle}</h3>
            <p className="mt-1 text-sm text-gray-500">{finalDescription}</p>
          </div>
        </div>
        <Button asChild>
          <Link href={destination}>
            시작하기
            <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </Card>
  );
}
