"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, MessageSquare, CalendarDays, User } from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "홈", icon: Home },
  { href: "/search", label: "검색", icon: Search },
  { href: "/chat", label: "AI 상담", icon: MessageSquare },
  { href: "/calendar", label: "캘린더", icon: CalendarDays },
  { href: "/mypage", label: "마이", icon: User },
];

export function MobileNav() {
  const pathname = usePathname();

  if (pathname === "/" || pathname.startsWith("/onboarding")) return null;

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
