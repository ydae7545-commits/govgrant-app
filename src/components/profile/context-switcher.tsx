"use client";

import { Heart, Building2, ChevronDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUserStore } from "@/store/user-store";

/**
 * 헤더에 배치하는 드롭다운 컨텍스트 스위처.
 * 데스크톱에서만 노출(sm:flex), 모바일은 대시보드/검색 내 ContextTabs로 대체.
 */
export function ContextSwitcher() {
  const account = useUserStore((s) => s.account);
  const setActiveContext = useUserStore((s) => s.setActiveContext);

  if (!account) return null;

  const active = account.activeContextId;
  const activeLabel =
    active === "personal"
      ? "개인 복지"
      : account.organizations.find((o) => o.id === active)?.name ?? "개인 복지";

  return (
    <div className="hidden sm:block">
      <Select value={active} onValueChange={setActiveContext}>
        <SelectTrigger className="h-9 w-auto min-w-[140px] gap-1 border-gray-200 text-sm">
          <div className="flex items-center gap-1.5">
            {active === "personal" ? (
              <Heart className="h-3.5 w-3.5 text-pink-500" />
            ) : (
              <Building2 className="h-3.5 w-3.5 text-blue-500" />
            )}
            <SelectValue aria-label={activeLabel}>{activeLabel}</SelectValue>
          </div>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="personal">
            <div className="flex items-center gap-2">
              <Heart className="h-3.5 w-3.5 text-pink-500" />
              개인 복지
            </div>
          </SelectItem>
          {account.organizations.map((org) => (
            <SelectItem key={org.id} value={org.id}>
              <div className="flex items-center gap-2">
                <Building2 className="h-3.5 w-3.5 text-blue-500" />
                {org.name}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
