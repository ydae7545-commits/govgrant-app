"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  User,
  Bookmark,
  Bell,
  Settings,
  ChevronRight,
  Building2,
  GraduationCap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { GrantCard } from "@/components/grant/grant-card";
import { useUserStore } from "@/store/user-store";
import { mockGrants } from "@/data/mock-grants";
import type { Grant } from "@/types/grant";

export default function MyPage() {
  const [mounted, setMounted] = useState(false);
  const { profile, savedGrantIds } = useUserStore();

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

  const userTypeLabel =
    profile?.type === "individual"
      ? "개인"
      : profile?.type === "sme"
        ? "중소기업\u00B7스타트업"
        : profile?.type === "research"
          ? "연구기관\u00B7대학"
          : "";

  const UserIcon =
    profile?.type === "sme"
      ? Building2
      : profile?.type === "research"
        ? GraduationCap
        : User;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      {/* Profile Header */}
      {profile ? (
        <div className="mb-6 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100">
            <UserIcon className="h-7 w-7 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{profile.name}</h1>
            <p className="text-sm text-gray-500">{userTypeLabel}</p>
          </div>
        </div>
      ) : (
        <Card className="mb-6 p-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
              <User className="h-7 w-7 text-gray-400" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">
                프로필을 설정해주세요
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                맞춤 추천과 저장 기능을 이용할 수 있습니다
              </p>
            </div>
            <Button asChild>
              <Link href="/onboarding">
                프로필 설정하기
                <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </Card>
      )}

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
        <TabsContent value="profile" className="mt-4">
          {profile ? (
            <Card className="p-5">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">기본 정보</h3>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/onboarding">수정하기</Link>
                  </Button>
                </div>

                <Separator />

                <InfoRow label="이름" value={profile.name} />
                <InfoRow label="사용자 유형" value={userTypeLabel} />

                {profile.individual && (
                  <>
                    <InfoRow label="나이" value={`${profile.individual.age}세`} />
                    <InfoRow label="지역" value={profile.individual.region} />
                    <InfoRow label="소득 수준" value={profile.individual.incomeLevel} />
                    <InfoRow label="취업 상태" value={profile.individual.employmentStatus} />
                    <InfoRow label="가구 유형" value={profile.individual.householdType} />
                  </>
                )}

                {profile.sme && (
                  <>
                    <InfoRow label="업력" value={`${profile.sme.businessAge}년`} />
                    <InfoRow label="업종" value={profile.sme.industry} />
                    <InfoRow label="종업원 수" value={`${profile.sme.employeeCount}명`} />
                    <InfoRow label="매출액" value={`${profile.sme.revenue}억 원`} />
                    <InfoRow label="지역" value={profile.sme.region} />
                    <InfoRow label="기술 분야" value={profile.sme.techField} />
                  </>
                )}

                {profile.research && (
                  <>
                    <InfoRow label="소속" value={profile.research.affiliation} />
                    <InfoRow label="연구 분야" value={profile.research.researchField} />
                    <InfoRow label="경력" value={`${profile.research.careerYears}년`} />
                    <InfoRow label="지역" value={profile.research.region} />
                  </>
                )}

                <Separator />

                <div>
                  <Label className="text-gray-400">관심 분야</Label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {profile.interests.map((interest) => (
                      <Badge key={interest} variant="secondary">
                        {interest}
                      </Badge>
                    ))}
                    {profile.interests.length === 0 && (
                      <span className="text-sm text-gray-400">
                        설정된 관심 분야가 없습니다
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="p-8 text-center text-gray-400">
              프로필이 설정되지 않았습니다
              <br />
              <Button asChild className="mt-4">
                <Link href="/onboarding">프로필 설정하기</Link>
              </Button>
            </Card>
          )}
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
