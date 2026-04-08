"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Landmark, Search, Bell } from "lucide-react";
import { ContextSwitcher } from "@/components/profile/context-switcher";
import { useUserStore } from "@/store/user-store";
import { featureFlags } from "@/lib/env";

export function Header() {
  const pathname = usePathname();
  const account = useUserStore((s) => s.account);

  if (pathname === "/" || pathname.startsWith("/onboarding")) return null;

  return (
    <header className="sticky top-0 z-50 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Landmark className="h-6 w-6 text-blue-600" />
          <span className="text-lg font-bold text-gray-900">지원금 찾기</span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          <NavLink href="/dashboard" current={pathname}>
            홈
          </NavLink>
          <NavLink href="/search" current={pathname}>
            검색
          </NavLink>
          <NavLink href="/calendar" current={pathname}>
            캘린더
          </NavLink>
          <NavLink href="/chat" current={pathname}>
            AI 상담
          </NavLink>
          {featureFlags.useProposalAi && (
            <NavLink href="/proposals" current={pathname}>
              사업계획서
            </NavLink>
          )}
          {(featureFlags.usePortfolio ||
            (account?.organizations?.length ?? 0) >= 2) && (
            <NavLink href="/portfolio" current={pathname}>
              포트폴리오
            </NavLink>
          )}
          <NavLink href="/mypage" current={pathname}>
            마이
          </NavLink>
        </nav>

        <div className="flex items-center gap-2">
          {account ? (
            <ContextSwitcher />
          ) : (
            <Link
              href={featureFlags.useSupabase ? "/auth/sign-in" : "/onboarding"}
              className="hidden rounded-full bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 sm:block"
            >
              시작하기
            </Link>
          )}
          <Link
            href="/search"
            aria-label="검색"
            className="rounded-full p-2 hover:bg-gray-100 md:hidden"
          >
            <Search className="h-5 w-5 text-gray-600" />
          </Link>
          {/*
            Bell: Phase 5 이메일 opt-in 토글이 마이페이지 알림 탭에 있으므로
            종 아이콘은 그쪽으로 연결한다. 클릭 시 라우팅이 일어나야 dead UI
            인상을 주지 않는다. (실제 알림 inbox UI 는 Phase 5 확장에서 추가)
          */}
          <Link
            href="/mypage"
            aria-label="알림 설정"
            className="rounded-full p-2 hover:bg-gray-100"
          >
            <Bell className="h-5 w-5 text-gray-600" />
          </Link>
        </div>
      </div>
    </header>
  );
}

function NavLink({
  href,
  current,
  children,
}: {
  href: string;
  current: string;
  children: React.ReactNode;
}) {
  const active = current.startsWith(href);
  return (
    <Link
      href={href}
      className={`text-sm font-medium transition-colors ${
        active ? "text-blue-600" : "text-gray-600 hover:text-gray-900"
      }`}
    >
      {children}
    </Link>
  );
}
