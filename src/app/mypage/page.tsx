"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  User,
  Bookmark,
  Bell,
  Settings,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GrantCard } from "@/components/grant/grant-card";
import { OrgList } from "@/components/profile/org-list";
import { SignInBanner } from "@/components/profile/sign-in-banner";
import { useUserStore } from "@/store/user-store";
import { mockGrants } from "@/data/mock-grants";
import { calculateAge, formatBirthDate } from "@/lib/format";
import { featureFlags } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";
import type { Grant } from "@/types/grant";

export default function MyPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const account = useUserStore((s) => s.account);
  const savedGrantIds = useUserStore((s) => s.savedGrantIds);
  const signOut = useUserStore((s) => s.signOut);
  const setEmailNotificationsEnabled = useUserStore(
    (s) => s.setEmailNotificationsEnabled
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted)
    return <div className="p-8 text-center text-gray-400">Loading...</div>;

  const savedGrants: Grant[] = savedGrantIds
    .map((id) => mockGrants.find((g) => g.id === id))
    .filter((g): g is Grant => !!g);

  const handleSignOut = async () => {
    const msg = featureFlags.useSupabase
      ? "로그아웃하시겠습니까?"
      : "로그아웃하시겠습니까? 저장된 프로필과 기관 정보가 이 기기에서 지워집니다.";
    if (!confirm(msg)) return;

    // In Supabase mode: call the real auth signOut so cookies are cleared.
    // The hydration hook will then see no user and clear the store.
    if (featureFlags.useSupabase) {
      try {
        const supabase = createClient();
        await supabase.auth.signOut();
      } catch {
        // Fall through — we still want to clear local state below.
      }
    }

    // Always clear the local Zustand store as a final safety net.
    signOut();
    router.push("/");
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      {/* Profile Header */}
      {account ? (
        <div className="mb-6 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100">
            <User className="h-7 w-7 text-blue-600" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">
              {account.displayName}
            </h1>
            {account.email && (
              <p className="text-sm text-gray-500">{account.email}</p>
            )}
            <p className="text-xs text-gray-400">
              {account.organizations.length > 0
                ? `${account.organizations.length}개 기관 등록`
                : "개인 사용자"}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSignOut}
            className="text-gray-500"
          >
            <LogOut className="mr-1 h-4 w-4" />
            로그아웃
          </Button>
        </div>
      ) : (
        <SignInBanner
          title="로그인하면 프로필과 소속 기관이 유지됩니다"
          description="마이페이지에서 여러 기관을 등록하고 각각 맞춤 추천을 받아보세요."
        />
      )}

      {account && (
        <Tabs defaultValue="saved">
          <TabsList className="w-full">
            <TabsTrigger value="saved" className="flex-1">
              <Bookmark className="mr-1 h-4 w-4" />
              저장한 과제
            </TabsTrigger>
            <TabsTrigger value="profile" className="flex-1">
              <Settings className="mr-1 h-4 w-4" />
              프로필
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex-1">
              <Bell className="mr-1 h-4 w-4" />
              알림 설정
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Saved Grants */}
          <TabsContent value="saved" className="mt-4">
            {savedGrants.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {savedGrants.map((grant) => (
                  <GrantCard key={grant.id} grant={grant} />
                ))}
              </div>
            ) : (
              <Card className="p-8 text-center text-gray-400">
                저장한 과제가 없습니다
                <br />
                <Link
                  href="/search"
                  className="mt-2 inline-block text-sm text-blue-600 hover:underline"
                >
                  지원사업 검색하기
                </Link>
              </Card>
            )}
          </TabsContent>

          {/* Tab 2: Profile */}
          <TabsContent value="profile" className="mt-4 space-y-6">
            {/* 개인 정보 */}
            <Card className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">개인 정보</h3>
                <Button asChild variant="outline" size="sm">
                  <Link href="/onboarding">수정하기</Link>
                </Button>
              </div>
              <Separator className="mb-4" />
              <div className="space-y-3">
                <InfoRow label="이름" value={account.displayName} />
                {(account.personal.birthDate || account.personal.age != null) && (
                  <InfoRow
                    label="생년월일"
                    value={
                      account.personal.birthDate
                        ? `${formatBirthDate(account.personal.birthDate)} (만 ${calculateAge(account.personal.birthDate, account.personal.age)}세)`
                        : `만 ${account.personal.age}세`
                    }
                  />
                )}
                {account.personal.gender && (
                  <InfoRow
                    label="성별"
                    value={
                      account.personal.gender === "male" ? "남성" : "여성"
                    }
                  />
                )}
                {account.personal.region && (
                  <InfoRow label="거주 지역" value={account.personal.region} />
                )}
                {account.personal.incomeLevel && (
                  <InfoRow label="소득 수준" value={account.personal.incomeLevel} />
                )}
                {account.personal.employmentStatus && (
                  <InfoRow
                    label="취업 상태"
                    value={account.personal.employmentStatus}
                  />
                )}
                {account.personal.householdType && (
                  <InfoRow
                    label="가구 유형"
                    value={account.personal.householdType}
                  />
                )}
              </div>
            </Card>

            {/* 소속 기관 */}
            <Card className="p-5">
              <OrgList />
            </Card>

            {/* 관심 분야 */}
            <Card className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">관심 분야</h3>
                <Button asChild variant="outline" size="sm">
                  <Link href="/onboarding">수정하기</Link>
                </Button>
              </div>
              <Separator className="mb-4" />
              <div className="flex flex-wrap gap-2">
                {account.interests.length > 0 ? (
                  account.interests.map((interest) => (
                    <Badge key={interest} variant="secondary">
                      {interest}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-gray-400">
                    설정된 관심 분야가 없습니다
                  </span>
                )}
              </div>
            </Card>
          </TabsContent>

          {/* Tab 3: Notification Settings */}
          <TabsContent value="notifications" className="mt-4">
            <Card className="p-5">
              <h3 className="mb-4 font-semibold text-gray-900">이메일 알림</h3>
              <div className="space-y-4">
                <ToggleRow
                  label="포트폴리오 매일 다이제스트"
                  description="등록한 기관별로 마감 임박 + 신규 매칭 과제를 매일 아침 이메일로 보내드립니다."
                  checked={account.emailNotificationsEnabled}
                  onChange={setEmailNotificationsEnabled}
                />
              </div>
              <div className="mt-6 space-y-1 rounded-lg bg-gray-50 p-3 text-xs text-gray-500">
                <p>
                  • 한국 개인정보보호법에 따라 <strong>기본 OFF</strong> 입니다.
                  명시적으로 동의해주셔야 발송됩니다.
                </p>
                <p>
                  • 발송 빈도(D-7/3/1) 세부 설정은 곧 추가될 예정입니다 — 현재는
                  매일 1회 발송.
                </p>
                <p>
                  • 언제든 이 토글을 OFF로 돌리면 다음 발송부터 즉시 중단됩니다.
                </p>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-400">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value || "-"}</span>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-400">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
          checked ? "bg-blue-600" : "bg-gray-200"
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
