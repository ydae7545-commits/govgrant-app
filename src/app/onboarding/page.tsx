"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  User,
  Building2,
  GraduationCap,
  ChevronLeft,
  ChevronRight,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUserStore } from "@/store/user-store";
import { INDUSTRIES, RESEARCH_FIELDS } from "@/lib/constants";
import { REGIONS } from "@/data/mock-regions";
import type { UserType, GrantCategory } from "@/types/grant";
import type {
  UserProfile,
  IndividualProfile,
  SMEProfile,
  ResearchProfile,
} from "@/types/user";

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

const STEPS = ["사용자 유형", "프로필 정보", "관심 분야", "완료"];

export default function OnboardingPage() {
  const router = useRouter();
  const { setProfile } = useUserStore();
  const [step, setStep] = useState(1);
  const [userType, setUserType] = useState<UserType | null>(null);
  const [name, setName] = useState("");
  const [interests, setInterests] = useState<GrantCategory[]>([]);

  // Individual fields
  const [age, setAge] = useState("");
  const [region, setRegion] = useState("");
  const [incomeLevel, setIncomeLevel] = useState<"저소득" | "중위소득" | "일반">("일반");
  const [employmentStatus, setEmploymentStatus] = useState<"재직" | "구직" | "학생" | "기타">("구직");
  const [householdType, setHouseholdType] = useState<"1인" | "신혼" | "다자녀" | "일반">("일반");

  // SME fields
  const [businessAge, setBusinessAge] = useState("");
  const [industry, setIndustry] = useState("");
  const [employeeCount, setEmployeeCount] = useState("");
  const [revenue, setRevenue] = useState("");
  const [smeRegion, setSmeRegion] = useState("");
  const [techField, setTechField] = useState("");

  // Research fields
  const [affiliation, setAffiliation] = useState("");
  const [researchField, setResearchField] = useState("");
  const [careerYears, setCareerYears] = useState("");
  const [researchRegion, setResearchRegion] = useState("");

  const handleNext = () => {
    if (step === 1 && !userType) return;
    if (step < 4) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleComplete = () => {
    if (!userType) return;

    const profile: UserProfile = {
      type: userType,
      name: name || "사용자",
      interests,
      completedOnboarding: true,
    };

    if (userType === "individual") {
      profile.individual = {
        age: parseInt(age) || 25,
        region,
        incomeLevel,
        employmentStatus,
        householdType,
      };
    } else if (userType === "sme") {
      profile.sme = {
        businessAge: parseInt(businessAge) || 1,
        industry,
        employeeCount: parseInt(employeeCount) || 5,
        revenue: parseFloat(revenue) || 1,
        region: smeRegion,
        techField,
      };
    } else if (userType === "research") {
      profile.research = {
        affiliation,
        researchField,
        careerYears: parseInt(careerYears) || 3,
        region: researchRegion,
      };
    }

    setProfile(profile);
  };

  const toggleInterest = (cat: GrantCategory) => {
    setInterests((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

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
                    className={`mx-2 hidden h-px w-8 sm:block ${
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
              style={{ width: `${(step / 4) * 100}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Step 1: User Type */}
        {step === 1 && (
          <div>
            <h2 className="mb-2 text-2xl font-bold text-gray-900">
              사용자 유형을 선택해주세요
            </h2>
            <p className="mb-8 text-gray-500">
              유형에 따라 맞춤 추천이 달라집니다
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              {([
                {
                  type: "individual" as UserType,
                  icon: User,
                  title: "개인",
                  desc: "청년, 구직자, 학생 등",
                  color: "purple",
                },
                {
                  type: "sme" as UserType,
                  icon: Building2,
                  title: "중소기업\u00B7스타트업",
                  desc: "창업기업, 소상공인 등",
                  color: "blue",
                },
                {
                  type: "research" as UserType,
                  icon: GraduationCap,
                  title: "연구기관\u00B7대학",
                  desc: "교수, 연구원, 대학원생 등",
                  color: "green",
                },
              ] as const).map((item) => {
                const Icon = item.icon;
                const selected = userType === item.type;
                return (
                  <Card
                    key={item.type}
                    className={`cursor-pointer p-6 transition-all ${
                      selected
                        ? "border-blue-600 bg-blue-50 ring-2 ring-blue-600"
                        : "hover:border-gray-300"
                    }`}
                    onClick={() => setUserType(item.type)}
                  >
                    <div className="flex flex-col items-center gap-3 text-center">
                      <div
                        className={`rounded-xl p-3 ${
                          item.color === "purple"
                            ? "bg-purple-100"
                            : item.color === "blue"
                              ? "bg-blue-100"
                              : "bg-green-100"
                        }`}
                      >
                        <Icon
                          className={`h-8 w-8 ${
                            item.color === "purple"
                              ? "text-purple-600"
                              : item.color === "blue"
                                ? "text-blue-600"
                                : "text-green-600"
                          }`}
                        />
                      </div>
                      <h3 className="font-semibold text-gray-900">{item.title}</h3>
                      <p className="text-sm text-gray-500">{item.desc}</p>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 2: Profile Info */}
        {step === 2 && (
          <div>
            <h2 className="mb-2 text-2xl font-bold text-gray-900">
              프로필 정보를 입력해주세요
            </h2>
            <p className="mb-8 text-gray-500">
              맞춤 추천을 위해 기본 정보가 필요합니다
            </p>

            <div className="space-y-4">
              <div>
                <Label>이름</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="이름을 입력하세요"
                />
              </div>

              {userType === "individual" && (
                <>
                  <div>
                    <Label>나이</Label>
                    <Input
                      type="number"
                      value={age}
                      onChange={(e) => setAge(e.target.value)}
                      placeholder="25"
                    />
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
                      onValueChange={(v) => setIncomeLevel(v as "저소득" | "중위소득" | "일반")}
                    >
                      <SelectTrigger>
                        <SelectValue />
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
                      onValueChange={(v) => setEmploymentStatus(v as "재직" | "구직" | "학생" | "기타")}
                    >
                      <SelectTrigger>
                        <SelectValue />
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
                      onValueChange={(v) => setHouseholdType(v as "1인" | "신혼" | "다자녀" | "일반")}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1인">1인 가구</SelectItem>
                        <SelectItem value="신혼">신혼 부부</SelectItem>
                        <SelectItem value="다자녀">다자녀 가구</SelectItem>
                        <SelectItem value="일반">일반</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {userType === "sme" && (
                <>
                  <div>
                    <Label>업력 (년)</Label>
                    <Input
                      type="number"
                      value={businessAge}
                      onChange={(e) => setBusinessAge(e.target.value)}
                      placeholder="3"
                    />
                  </div>
                  <div>
                    <Label>업종</Label>
                    <Select value={industry} onValueChange={setIndustry}>
                      <SelectTrigger>
                        <SelectValue placeholder="업종 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {INDUSTRIES.map((ind) => (
                          <SelectItem key={ind} value={ind}>
                            {ind}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>종업원 수</Label>
                    <Input
                      type="number"
                      value={employeeCount}
                      onChange={(e) => setEmployeeCount(e.target.value)}
                      placeholder="10"
                    />
                  </div>
                  <div>
                    <Label>매출액 (억 원)</Label>
                    <Input
                      type="number"
                      value={revenue}
                      onChange={(e) => setRevenue(e.target.value)}
                      placeholder="5"
                    />
                  </div>
                  <div>
                    <Label>지역</Label>
                    <Select value={smeRegion} onValueChange={setSmeRegion}>
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
                    <Label>기술 분야</Label>
                    <Input
                      value={techField}
                      onChange={(e) => setTechField(e.target.value)}
                      placeholder="예: AI, 바이오, IoT"
                    />
                  </div>
                </>
              )}

              {userType === "research" && (
                <>
                  <div>
                    <Label>소속 기관</Label>
                    <Input
                      value={affiliation}
                      onChange={(e) => setAffiliation(e.target.value)}
                      placeholder="예: 서울대학교"
                    />
                  </div>
                  <div>
                    <Label>연구 분야</Label>
                    <Select value={researchField} onValueChange={setResearchField}>
                      <SelectTrigger>
                        <SelectValue placeholder="연구 분야 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {RESEARCH_FIELDS.map((f) => (
                          <SelectItem key={f} value={f}>
                            {f}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>경력 (년)</Label>
                    <Input
                      type="number"
                      value={careerYears}
                      onChange={(e) => setCareerYears(e.target.value)}
                      placeholder="5"
                    />
                  </div>
                  <div>
                    <Label>지역</Label>
                    <Select value={researchRegion} onValueChange={setResearchRegion}>
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
                </>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Interest Categories */}
        {step === 3 && (
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

        {/* Step 4: Complete */}
        {step === 4 && (
          <div className="flex flex-col items-center py-12 text-center">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
              <Check className="h-10 w-10 text-green-600" />
            </div>
            <h2 className="mb-2 text-2xl font-bold text-gray-900">
              프로필 설정 완료!
            </h2>
            <p className="mb-8 text-gray-500">
              맞춤 추천 결과를 확인해보세요
            </p>
            <Button
              size="lg"
              onClick={() => {
                handleComplete();
                router.push("/dashboard");
              }}
            >
              대시보드로 이동
            </Button>
          </div>
        )}

        {/* Navigation Buttons */}
        {step < 4 && (
          <div className="mt-8 flex items-center justify-between">
            <Button variant="outline" onClick={handleBack} disabled={step === 1}>
              <ChevronLeft className="mr-1 h-4 w-4" />
              이전
            </Button>
            <Button
              onClick={handleNext}
              disabled={
                (step === 1 && !userType) ||
                (step === 3 && interests.length === 0)
              }
            >
              {step === 3 ? "완료" : "다음"}
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
