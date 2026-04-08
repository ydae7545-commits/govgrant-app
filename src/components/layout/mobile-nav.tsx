"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Search,
  FileText,
  CalendarDays,
  User,
  Briefcase,
} from "lucide-react";
import { featureFlags } from "@/lib/env";
import { useUserStore } from "@/store/user-store";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

/**
 * Build the visible mobile nav items based on feature flags and how many
 * organizations the user has. We cap at 5 items to avoid the iOS tab-bar
 * squeeze; when all flags are on and the user has multiple orgs we drop
 * 캘린더 first since the dashboard/search links already surface deadlines.
 */
function buildNavItems(orgCount: number): NavItem[] {
  const base: NavItem[] = [
    { href: "/dashboard", label: "홈", icon: Home },
    { href: "/search", label: "검색", icon: Search },
  ];

  if (featureFlags.useProposalAi) {
    base.push({ href: "/proposals", label: "계획서", icon: FileText });
  }

  const showPortfolio = featureFlags.usePortfolio || orgCount >= 2;
  if (showPortfolio) {
    base.push({ href: "/portfolio", label: "포트폴리오", icon: Briefcase });
  }

  // 캘린더: 5칸 한계를 피하기 위해 포트폴리오가 없을 때만 포함
  if (!showPortfolio) {
    base.push({ href: "/calendar", label: "캘린더", icon: CalendarDays });
  }

  base.push({ href: "/mypage", label: "마이", icon: User });
  return base;
}

export function MobileNav() {
  const pathname = usePathname();
  const orgCount = useUserStore(
    (s) => s.account?.organizations?.length ?? 0
  );

  if (pathname === "/" || pathname.startsWith("/onboarding")) return null;

  const navItems = buildNavItems(orgCount);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-white md:hidden">
      <div className="flex items-center justify-around">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
                active
                  ? "text-blue-600"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
