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
import { Label } from "@/components/ui/label";
import { GrantCard } from "@/components/grant/grant-card";
import { OrgList } from "@/components/profile/org-list";
import { SignInBanner } from "@/components/profile/sign-in-banner";
import { useUserStore } from "@/store/user-store";
import { mockGrants } from "@/data/mock-grants";
import { calculateAge, formatBirthDate } from "@/lib/format";
import type { Grant } from "@/types/grant";

export default function MyPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const account = useUserStore((s) => s.account);
  const savedGrantIds = useUserStore((s) => s.savedGrantIds);
  const signOut = useUserStore((s) => s.signOut);

  // Notification toggles (UI only)
  const [notifyD7, setNotifyD7] = useState(true);
  const [notifyD3, setNotifyD3] = useState(true);
  const [notifyD1, setNotifyD1] = useState(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted)
    return <div className="p-8 text-center text-gray-400">Loading...</div>;

  const savedGrants: Grant[] = savedGrantIds
    .map((id) => mockGrants.find((g) => g.id === id))
    .filter((g): g is Grant => !!g);

  const handleSignOut = () => {
    if (confirm("로그아웃하시겠습니까? 저장된 프로필과 기관 정보가 모두 지워집니다.")) {
      signOut();
      router.push("/");
    }
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
            <p className="text-sm text-gray-500">
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
              <h3 className="mb-4 font-semibold text-gray-900">마감 알림 설정</h3>
              <div className="space-y-4">
                <ToggleRow
                  label="마감 D-7 알림"
                  description="마감 7일 전에 알림을 받습니다"
                  checked={notifyD7}
                  onChange={setNotifyD7}
                />
                <Separator />
                <ToggleRow
                  label="마감 D-3 알림"
                  description="마감 3일 전에 알림을 받습니다"
                  checked={notifyD3}
                  onChange={setNotifyD3}
                />
                <Separator />
                <ToggleRow
                  label="마감 D-1 알림"
                  description="마감 하루 전에 알림을 받습니다"
                  checked={notifyD1}
                  onChange={setNotifyD1}
                />
              </div>
              <p className="mt-6 text-xs text-gray-400">
                * 알림 기능은 현재 데모 모드로 제공됩니다.
              </p>
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
