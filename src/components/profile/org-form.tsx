"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { REGIONS } from "@/data/mock-regions";
import { INDUSTRIES, RESEARCH_FIELDS } from "@/lib/constants";
import type { Organization, OrgKind } from "@/types/user";
import { ORG_KIND_LABELS } from "@/types/user";

const ORG_KIND_OPTIONS: OrgKind[] = [
  "sme",
  "research",
  "sole",
  "public",
  "nonprofit",
  "other",
];

/**
 * 10자리 사업자등록번호를 사람이 읽기 쉬운 `123-45-67890` 형식으로 변환.
 * 입력이 10자리 숫자가 아니면 그대로 반환.
 */
function formatBusinessNo(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 10) return raw;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

interface OrgFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Organization | null;
  onSubmit: (org: Omit<Organization, "id">) => void;
  title?: string;
}

export function OrgFormDialog({
  open,
  onOpenChange,
  initial,
  onSubmit,
  title,
}: OrgFormDialogProps) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<OrgKind>("sme");
  const [region, setRegion] = useState("전국");
  const [businessAge, setBusinessAge] = useState("");
  const [employeeCount, setEmployeeCount] = useState("");
  const [revenue, setRevenue] = useState("");
  const [industry, setIndustry] = useState("");
  const [techField, setTechField] = useState("");
  const [researchField, setResearchField] = useState("");
  const [careerYears, setCareerYears] = useState("");
  const [hasResearchInstitute, setHasResearchInstitute] = useState(false);
  const [hasResearchDepartment, setHasResearchDepartment] = useState(false);
  const [certifications, setCertifications] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  // 사업자등록번호 + 국세청 검증 상태 (Phase 6)
  const [businessNoInput, setBusinessNoInput] = useState("");
  const [businessStatusCode, setBusinessStatusCode] = useState<
    "01" | "02" | "03" | undefined
  >(undefined);
  const [businessStatusLabel, setBusinessStatusLabel] = useState<string | undefined>(
    undefined
  );
  const [businessTaxType, setBusinessTaxType] = useState<string | undefined>(
    undefined
  );
  const [businessClosedAt, setBusinessClosedAt] = useState<string | undefined>(
    undefined
  );
  const [businessVerifiedAt, setBusinessVerifiedAt] = useState<string | undefined>(
    undefined
  );
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // 모달이 열릴 때 initial 값으로 초기화
  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setKind(initial?.kind ?? "sme");
    setRegion(initial?.region ?? "전국");
    setBusinessAge(initial?.businessAge?.toString() ?? "");
    setEmployeeCount(initial?.employeeCount?.toString() ?? "");
    setRevenue(initial?.revenue?.toString() ?? "");
    setIndustry(initial?.industry ?? "");
    setTechField(initial?.techField ?? "");
    setResearchField(initial?.researchField ?? "");
    setCareerYears(initial?.careerYears?.toString() ?? "");
    setHasResearchInstitute(initial?.hasResearchInstitute ?? false);
    setHasResearchDepartment(initial?.hasResearchDepartment ?? false);
    setCertifications(initial?.certifications ?? []);
    setNotes(initial?.notes ?? "");
    // 사업자번호 관련 6개 필드
    setBusinessNoInput(initial?.businessNo ? formatBusinessNo(initial.businessNo) : "");
    setBusinessStatusCode(initial?.businessStatusCode);
    setBusinessStatusLabel(initial?.businessStatusLabel);
    setBusinessTaxType(initial?.businessTaxType);
    setBusinessClosedAt(initial?.businessClosedAt);
    setBusinessVerifiedAt(initial?.businessVerifiedAt);
    setVerifyError(null);
  }, [open, initial]);

  /**
   * 사용자가 "확인" 버튼을 누르면 서버에 사업자등록번호 검증 요청.
   * 서버는 국세청 API로 진위/상태를 확인하고 결과를 반환한다.
   */
  const handleVerifyBusinessNo = async () => {
    setVerifyError(null);
    setVerifying(true);
    try {
      const res = await fetch("/api/business/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bNo: businessNoInput }),
      });
      const json = (await res.json()) as
        | {
            ok: true;
            summary: {
              bNo: string;
              statusCode: "01" | "02" | "03";
              statusLabel: string;
              taxType: string | null;
              closedAt: string | null;
              verifiedAt: string;
            };
          }
        | { ok: false; reason: string }
        | { error: string };

      if ("error" in json) {
        setVerifyError(json.error);
        return;
      }
      if (!json.ok) {
        setVerifyError(json.reason);
        // 검증 실패 시 기존 검증 결과는 지움
        setBusinessStatusCode(undefined);
        setBusinessStatusLabel(undefined);
        setBusinessTaxType(undefined);
        setBusinessClosedAt(undefined);
        setBusinessVerifiedAt(undefined);
        return;
      }
      // 정상
      setBusinessNoInput(formatBusinessNo(json.summary.bNo));
      setBusinessStatusCode(json.summary.statusCode);
      setBusinessStatusLabel(json.summary.statusLabel);
      setBusinessTaxType(json.summary.taxType ?? undefined);
      setBusinessClosedAt(json.summary.closedAt ?? undefined);
      setBusinessVerifiedAt(json.summary.verifiedAt);
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : String(err));
    } finally {
      setVerifying(false);
    }
  };

  const handleSave = () => {
    if (!name.trim()) return;
    const org: Omit<Organization, "id"> = {
      name: name.trim(),
      kind,
      region,
    };
    if (businessAge) org.businessAge = Number(businessAge);
    if (employeeCount) org.employeeCount = Number(employeeCount);
    if (revenue) org.revenue = Number(revenue);
    if (industry) org.industry = industry;
    if (techField) org.techField = techField;
    if (researchField) org.researchField = researchField;
    if (careerYears) org.careerYears = Number(careerYears);
    if (hasResearchInstitute) org.hasResearchInstitute = true;
    if (hasResearchDepartment) org.hasResearchDepartment = true;
    if (certifications.length > 0) org.certifications = certifications;
    if (notes) org.notes = notes;
    // 사업자번호: 검증 성공한 경우만 저장 (입력만 하고 검증 안 했으면 무시)
    if (businessStatusCode) {
      org.businessNo = businessNoInput.replace(/\D/g, "");
      org.businessStatusCode = businessStatusCode;
      if (businessStatusLabel) org.businessStatusLabel = businessStatusLabel;
      if (businessTaxType) org.businessTaxType = businessTaxType;
      if (businessClosedAt) org.businessClosedAt = businessClosedAt;
      if (businessVerifiedAt) org.businessVerifiedAt = businessVerifiedAt;
    }
    onSubmit(org);
    onOpenChange(false);
  };

  const isSme = kind === "sme" || kind === "sole";
  const isResearch = kind === "research";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title ?? (initial ? "기관 수정" : "기관 추가")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>기관명 *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 홍길동 제작소"
            />
          </div>
          <div>
            <Label>유형 *</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as OrgKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORG_KIND_OPTIONS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {ORG_KIND_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>지역</Label>
            <Select value={region} onValueChange={setRegion}>
              <SelectTrigger>
                <SelectValue />
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

          {isSme && (
            <>
              <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50/50 p-3">
                <Label className="text-sm font-medium">
                  사업자등록번호
                  <span className="ml-1.5 text-xs font-normal text-gray-500">
                    국세청 검증
                  </span>
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={businessNoInput}
                    onChange={(e) => {
                      setBusinessNoInput(e.target.value);
                      // 입력이 바뀌면 기존 검증 결과를 무효화
                      if (businessStatusCode) {
                        setBusinessStatusCode(undefined);
                        setBusinessStatusLabel(undefined);
                        setBusinessTaxType(undefined);
                        setBusinessClosedAt(undefined);
                        setBusinessVerifiedAt(undefined);
                      }
                      setVerifyError(null);
                    }}
                    placeholder="123-45-67890"
                    inputMode="numeric"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleVerifyBusinessNo}
                    disabled={verifying || !businessNoInput.trim()}
                  >
                    {verifying ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "확인"
                    )}
                  </Button>
                </div>

                {/* 검증 결과 표시 */}
                {businessStatusCode === "01" && (
                  <div className="flex items-center gap-1.5 text-xs text-green-700">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>
                      {businessStatusLabel ?? "계속사업자"}
                      {businessTaxType ? ` · ${businessTaxType}` : ""}
                    </span>
                  </div>
                )}
                {(businessStatusCode === "02" || businessStatusCode === "03") && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-700">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>
                      {businessStatusLabel}
                      {businessClosedAt ? ` (${businessClosedAt})` : ""}
                    </span>
                  </div>
                )}
                {verifyError && (
                  <div className="flex items-start gap-1.5 text-xs text-red-600">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{verifyError}</span>
                  </div>
                )}
                <p className="text-[11px] text-gray-500">
                  검증된 사업자만 R&D · 정책자금 같은 활동 사업자 대상 과제에 추천됩니다.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
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
                  <Label>종업원 수</Label>
                  <Input
                    type="number"
                    value={employeeCount}
                    onChange={(e) => setEmployeeCount(e.target.value)}
                    placeholder="10"
                  />
                </div>
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
                <Label>기술 분야</Label>
                <Input
                  value={techField}
                  onChange={(e) => setTechField(e.target.value)}
                  placeholder="예: AI, 바이오, IoT"
                />
              </div>
              <div className="space-y-3 rounded-lg border p-3">
                <Label className="text-sm font-medium">연구조직 보유 현황</Label>
                <label className="flex cursor-pointer items-start gap-3">
                  <Checkbox
                    checked={hasResearchInstitute}
                    onCheckedChange={(v) => setHasResearchInstitute(v === true)}
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-700">
                      기업부설연구소
                    </span>
                    <p className="text-xs text-gray-400">
                      한국산업기술진흥협회(KOITA) 인정
                    </p>
                  </div>
                </label>
                <label className="flex cursor-pointer items-start gap-3">
                  <Checkbox
                    checked={hasResearchDepartment}
                    onCheckedChange={(v) => setHasResearchDepartment(v === true)}
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-700">
                      연구개발전담부서
                    </span>
                    <p className="text-xs text-gray-400">KOITA 인정</p>
                  </div>
                </label>
              </div>
              <div className="space-y-3 rounded-lg border p-3">
                <Label className="text-sm font-medium">
                  보유 인증 (해당 시 체크)
                </Label>
                {[
                  "이노비즈(Innobiz)",
                  "벤처기업",
                  "메인비즈(Mainbiz)",
                  "ISO 인증",
                  "특허 보유",
                ].map((cert) => (
                  <label
                    key={cert}
                    className="flex cursor-pointer items-center gap-3"
                  >
                    <Checkbox
                      checked={certifications.includes(cert)}
                      onCheckedChange={(v) =>
                        setCertifications((prev) =>
                          v === true
                            ? [...prev, cert]
                            : prev.filter((c) => c !== cert)
                        )
                      }
                    />
                    <span className="text-sm text-gray-700">{cert}</span>
                  </label>
                ))}
              </div>
            </>
          )}

          {isResearch && (
            <>
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
            </>
          )}

          <div>
            <Label>메모 (선택)</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="내부용 메모"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            {initial ? "저장" : "추가"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
