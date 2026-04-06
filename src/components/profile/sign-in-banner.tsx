"use client";

import Link from "next/link";
import { ArrowRight, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function SignInBanner({
  title = "시작하려면 로그인이 필요해요",
  description = "이름만 입력하면 프로필·기관·관심 분야가 이 기기에 저장돼 다음에 방문해도 그대로 유지됩니다.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <Card className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 p-6">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white">
            <UserPlus className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{title}</h3>
            <p className="mt-1 text-sm text-gray-500">{description}</p>
          </div>
        </div>
        <Button asChild>
          <Link href="/onboarding">
            시작하기
            <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </Card>
  );
}
