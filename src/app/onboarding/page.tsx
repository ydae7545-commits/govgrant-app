"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Plus,
  Building2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OrgFormDialog } from "@/components/profile/org-form";
import { useUserStore } from "@/store/user-store";
import { REGIONS } from "@/data/mock-regions";
import type { GrantCategory } from "@/types/grant";
import type { Organization } from "@/types/user";
import { ORG_KIND_LABELS } from "@/types/user";

const GRANT_CATEGORIES: GrantCategory[] = [
  "창업지원",
  "R&D",
  "정책자금",
  "고용지원",
  "수출지원",
  "교육훈련",
  "복지",
  "주거",
  "컨설팅",
  "기타",
];

const STEPS = ["가입", "개인 정보", "소속 기관", "관심 분야", "완료"];

export default function OnboardingPage() {
  const router = useRouter();
  const account = useUserStore((s) => s.account);
  const signIn = useUserStore((s) => s.signIn);
  const updatePersonal = useUserStore((s) => s.updatePersonal);
  const addOrganization = useUserStore((s) => s.addOrganization);
  const removeOrganization = useUserStore((s) => s.removeOrganization);
  const setInterests = useUserStore((s) => s.setInterests);
  const completeOnboarding = useUserStore((s) => s.completeOnboarding);

  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState(1);

  // Step 1 (local form state; committed to store on next)
  const [displayName, setDisplayName] = useState("");

  // Step 2
  const [birthDate, setBirthDate] = useState("");
  const [region, setRegion] = useState("");
  const [incomeLevel, setIncomeLevel] = useState<
    "저소득" | "중위소득" | "일반" | ""
  >("");
  const [employmentStatus, setEmploymentStatus] = useState<
    "재직" | "구직" | "학생" | "기타" | ""
  >("");
  const [householdType, setHouseholdType] = useState<
    "1인" | "신혼" | "다자녀" | "일반" | ""
  >("");

  // Step 3
  const [orgDialogOpen, setOrgDialogOpen] = useState(false);

  // Step 4
  const [interests, setInterestsLocal] = useState<GrantCategory[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 이미 온보딩 완료된 경우 대시보드로
  useEffect(() => {
    if (mounted && account?.completedOnboarding) {
      router.replace("/dashboard");
    }
  }, [mounted, account, router]);

  // 기존 account가 있으면 기존 값 프리필
  useEffect(() => {
    if (!mounted || !account) return;
    setDisplayName(account.displayName || "");
    setBirthDate(account.personal.birthDate ?? "");
    setRegion(account.personal.region ?? "");
    setIncomeLevel(account.personal.incomeLevel ?? "");
    setEmploymentStatus(account.personal.employmentStatus ?? "");
    setHouseholdType(account.personal.householdType ?? "");
    setInterestsLocal(account.interests);
  }, [mounted, account]);

  const toggleInterest = (cat: GrantCategory) => {
    setInterestsLocal((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const canNext = () => {
    if (step === 1) return displayName.trim().length > 0;
    if (step === 4) return interests.length > 0;
    return true;
  };

  const handleNext = () => {
    if (step === 1) {
      signIn(displayName.trim());
    }
    if (step === 2) {
      updatePersonal({
        birthDate: birthDate || undefined,
        age: undefined, // 새 필드(birthDate)로 대체. 잔존 v2 데이터 정리.
        region: region || undefined,
        incomeLevel: incomeLevel || undefined,
        employmentStatus: employmentStatus || undefined,
        householdType: householdType || undefined,
      });
    }
    if (step === 4) {
      setInterests(interests);
    }
    if (step < 5) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleComplete = () => {
    completeOnboarding();
    router.push("/dashboard");
  };

  if (!mounted)
    return <div className="p-8 text-center text-gray-400">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Step Indicator */}
      <div className="border-b bg-white px-4 py-6">
        <div className="mx-auto max-w-2xl">
          <div className="mb-2 flex items-center justify-between">
            {STEPS.map((label, i) => (
              <div key={label} className="flex items-center gap-2">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                    i + 1 < step
                      ? "bg-blue-600 text-white"
                      : i + 1 === step
                        ? "bg-blue-600 text-white"
                        : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {i + 1 < step ? <Check className="h-4 w-4" /> : i + 1}
                </div>
                <span
                  className={`hidden text-sm sm:inline ${
                    i + 1 <= step ? "font-medium text-gray-900" : "text-gray-400"
                  }`}
                >
                  {label}
                </span>
                {i < STEPS.length - 1 && (
                  <div
                    className={`mx-2 hidden h-px w-6 sm:block ${
                      i + 1 < step ? "bg-blue-600" : "bg-gray-200"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-blue-600 transition-all"
              style={{ width: `${(step / STEPS.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Step 1 — Sign in */}
        {step === 1 && (
          <div>
            <h2 className="mb-2 text-2xl font-bold text-gray-900">
              무엇이라고 불러드릴까요?
            </h2>
            <p className="mb-8 text-gray-500">
              이 기기에 저장되며 다음 방문에도 유지됩니다. 언제든 마이페이지에서
              변경할 수 있어요.
            </p>
            <div className="space-y-4">
              <div>
                <Label>이름 또는 닉네임</Label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="홍길동"
                  autoFocus
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 2 — Personal */}
        {step === 2 && (
          <div>
            <h2 className="mb-2 text-2xl font-bold text-gray-900">
              개인 정보를 입력해주세요
            </h2>
            <p className="mb-8 text-gray-500">
              개인 복지 지원금 추천에 사용됩니다. 모두 선택 입력이며 나중에
              수정할 수 있어요.
            </p>
            <div className="space-y-4">
              <div>
                <Label>생년월일</Label>
                <Input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  max={new Date().toISOString().split("T")[0]}
                />
                <p className="mt-1 text-xs text-gray-400">
                  복지 정책의 연령 요건과 정확하게 매칭하기 위해 사용됩니다.
                </p>
              </div>
              <div>
                <Label>거주 지역</Label>
                <Select value={region} onValueChange={setRegion}>
                  <SelectTrigger>
                    <SelectValue placeholder="지역 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {REGIONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>소득 수준</Label>
                <Select
                  value={incomeLevel}
                  onValueChange={(v) =>
                    setIncomeLevel(v as "저소득" | "중위소득" | "일반")
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="저소득">저소득</SelectItem>
                    <SelectItem value="중위소득">중위소득</SelectItem>
                    <SelectItem value="일반">일반</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>취업 상태</Label>
                <Select
                  value={employmentStatus}
                  onValueChange={(v) =>
                    setEmploymentStatus(v as "재직" | "구직" | "학생" | "기타")
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="재직">재직</SelectItem>
                    <SelectItem value="구직">구직</SelectItem>
                    <SelectItem value="학생">학생</SelectItem>
                    <SelectItem value="기타">기타</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>가구 유형</Label>
                <Select
                  value={householdType}
                  onValueChange={(v) =>
                    setHouseholdType(v as "1인" | "신혼" | "다자녀" | "일반")
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1인">1인 가구</SelectItem>
                    <SelectItem value="신혼">신혼 부부</SelectItem>
                    <SelectItem value="다자녀">다자녀 가구</SelectItem>
                    <SelectItem value="일반">일반</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {/* Step 3 — Organizations */}
        {step === 3 && (
          <div>
            <h2 className="mb-2 text-2xl font-bold text-gray-900">
              소속 기관을 등록해주세요
            </h2>
            <p className="mb-8 text-gray-500">
              창업기업·연구실·소상공인 사업장 등 여러 기관을 등록할 수 있어요.
              각 기관마다 개별 추천을 받아볼 수 있습니다. (선택 사항)
            </p>
            <div className="space-y-2">
              {account?.organizations.map((org: Organization) => (
                <Card
                  key={org.id}
                  className="flex items-center gap-3 p-4"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                    <Building2 className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-gray-900">
                        {org.name}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {ORG_KIND_LABELS[org.kind]}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">{org.region}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-500 hover:bg-red-50 hover:text-red-600"
                    onClick={() => removeOrganization(org.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </Card>
              ))}
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setOrgDialogOpen(true)}
              >
                <Plus className="mr-1 h-4 w-4" />
                기관 추가
              </Button>
            </div>

            <OrgFormDialog
              open={orgDialogOpen}
              onOpenChange={setOrgDialogOpen}
              onSubmit={(data) => addOrganization(data)}
              title="기관 추가"
            />
          </div>
        )}

        {/* Step 4 — Interests */}
        {step === 4 && (
          <div>
            <h2 className="mb-2 text-2xl font-bold text-gray-900">
              관심 분야를 선택해주세요
            </h2>
            <p className="mb-8 text-gray-500">
              여러 개를 선택할 수 있습니다 (최소 1개)
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {GRANT_CATEGORIES.map((cat) => {
                const checked = interests.includes(cat);
                return (
                  <label
                    key={cat}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-all ${
                      checked
                        ? "border-blue-600 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleInterest(cat)}
                    />
                    <span
                      className={`text-sm font-medium ${
                        checked ? "text-blue-700" : "text-gray-700"
                      }`}
                    >
                      {cat}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 5 — Complete */}
        {step === 5 && (
          <div className="flex flex-col items-center py-12 text-center">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
              <Check className="h-10 w-10 text-green-600" />
            </div>
            <h2 className="mb-2 text-2xl font-bold text-gray-900">
              {account?.displayName ?? "사용자"}님, 준비 완료!
            </h2>
            <p className="mb-8 text-gray-500">
              개인 복지와 {account?.organizations.length ?? 0}개 기관별 맞춤
              추천을 확인해보세요.
            </p>
            <Button size="lg" onClick={handleComplete}>
              대시보드로 이동
            </Button>
          </div>
        )}

        {/* Navigation Buttons */}
        {step < 5 && (
          <div className="mt-8 flex items-center justify-between">
            <Button variant="outline" onClick={handleBack} disabled={step === 1}>
              <ChevronLeft className="mr-1 h-4 w-4" />
              이전
            </Button>
            <div className="flex items-center gap-2">
              {(step === 2 || step === 3) && (
                <Button variant="ghost" onClick={handleNext}>
                  건너뛰기
                </Button>
              )}
              <Button onClick={handleNext} disabled={!canNext()}>
                {step === 4 ? "완료" : "다음"}
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
