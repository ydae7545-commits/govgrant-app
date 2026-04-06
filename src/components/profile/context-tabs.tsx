"use client";

import { Heart, Building2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUserStore } from "@/store/user-store";

/**
 * 대시보드·검색 상단에 배치하는 컨텍스트 스위처 탭.
 * store.activeContextId에 바인딩되어 헤더 스위처와 자동 동기화.
 * 계정이 없으면 렌더하지 않는다(상위에서 SignInBanner로 대체).
 */
export function ContextTabs() {
  const account = useUserStore((s) => s.account);
  const setActiveContext = useUserStore((s) => s.setActiveContext);

  if (!account) return null;

  const handleChange = (value: string) => setActiveContext(value);

  return (
    <Tabs
      value={account.activeContextId}
      onValueChange={handleChange}
      className="mb-6"
    >
      <TabsList className="h-auto w-full flex-wrap justify-start gap-1 p-1">
        <TabsTrigger
          value="personal"
          className="flex items-center gap-1.5 data-[state=active]:bg-pink-50 data-[state=active]:text-pink-700"
        >
          <Heart className="h-3.5 w-3.5" />
          개인 복지
        </TabsTrigger>
        {account.organizations.map((org) => (
          <TabsTrigger
            key={org.id}
            value={org.id}
            className="flex items-center gap-1.5 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700"
          >
            <Building2 className="h-3.5 w-3.5" />
            {org.name}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
