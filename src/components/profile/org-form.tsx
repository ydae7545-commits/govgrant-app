"use client";

import { useState, useEffect } from "react";
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
  }, [open, initial]);

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
