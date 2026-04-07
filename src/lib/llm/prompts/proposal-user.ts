import "server-only";

import type { Grant } from "@/types/grant";
import type {
  PersonalProfile,
  Organization,
  UserAccount,
} from "@/types/user";
import type { ProposalSectionKey } from "@/types/proposal";
import { SECTION_LABELS } from "@/types/proposal";
import { calculateAge, formatAmountRange, formatDate } from "@/lib/format";
import { SECTION_INSTRUCTIONS } from "./proposal-sections";

/**
 * Format the per-call user message that contains:
 *   1. Grant context (제목, 주관기관, 카테고리, 지원금, 자격요건)
 *   2. Applicant context (개인 또는 조직)
 *   3. Section-specific instructions
 *
 * The system prompt (proposal-system.ts) takes care of the role/style,
 * so this function focuses on packing relevant facts into a structured
 * Korean prompt.
 *
 * Length budget: aim for ~1500 characters of context. The model can read
 * much more, but we want to keep token cost predictable per generation.
 * For Phase 4 we'll add a "선정 사례" RAG block here.
 */

/** Format the grant block. */
function formatGrant(grant: Grant): string {
  const lines: string[] = [];
  lines.push(`## 과제 정보`);
  lines.push(`- **제목**: ${grant.title}`);
  lines.push(`- **주관기관**: ${grant.organization}`);
  lines.push(`- **카테고리**: ${grant.category}`);
  lines.push(`- **출처**: ${grant.source}`);
  lines.push(`- **대상**: ${grant.targetTypes.join(", ")}`);
  lines.push(`- **지역**: ${grant.region}`);
  lines.push(
    `- **지원금액**: ${formatAmountRange(grant.amountMin, grant.amountMax)}`
  );
  lines.push(
    `- **접수기간**: ${formatDate(grant.applicationStart)} ~ ${formatDate(grant.applicationEnd)}`
  );
  if (grant.summary) lines.push(`- **요약**: ${grant.summary}`);
  if (grant.description) {
    // Truncate to keep prompt size predictable
    const desc =
      grant.description.length > 400
        ? grant.description.slice(0, 400) + "..."
        : grant.description;
    lines.push(`- **상세 설명**: ${desc}`);
  }

  // Eligibility requirements
  const elig = grant.eligibility;
  const reqLines: string[] = [];
  if (elig.requirements && elig.requirements.length > 0) {
    for (const r of elig.requirements) reqLines.push(`  - ${r}`);
  }
  if (elig.ageMin || elig.ageMax) {
    const range = [
      elig.ageMin ? `만 ${elig.ageMin}세 이상` : null,
      elig.ageMax ? `만 ${elig.ageMax}세 이하` : null,
    ]
      .filter(Boolean)
      .join(" ~ ");
    reqLines.push(`  - 연령: ${range}`);
  }
  if (elig.businessAgeMax)
    reqLines.push(`  - 업력: ${elig.businessAgeMax}년 이하`);
  if (elig.employeeMax)
    reqLines.push(`  - 종업원: ${elig.employeeMax}인 이하`);
  if (elig.revenueMax)
    reqLines.push(`  - 매출: ${elig.revenueMax}억 원 이하`);
  if (elig.requiresResearchInstitute)
    reqLines.push(`  - 기업부설연구소 보유 필수`);
  if (elig.requiresResearchDepartment)
    reqLines.push(`  - 연구개발전담부서 이상 보유 필수`);
  if (reqLines.length > 0) {
    lines.push(`- **자격 요건**:`);
    lines.push(...reqLines);
  }

  // Tags
  if (grant.tags && grant.tags.length > 0) {
    lines.push(`- **태그**: ${grant.tags.join(", ")}`);
  }

  // Consortium info
  if (grant.consortium?.possible) {
    lines.push(`- **컨소시엄 참여 가능**: ${grant.consortium.role ?? "공동연구"}`);
    if (grant.consortium.applicableTechFields.length > 0) {
      lines.push(
        `  - 적용 가능 기술분야: ${grant.consortium.applicableTechFields.join(", ")}`
      );
    }
  }

  return lines.join("\n");
}

/** Format the personal applicant block. */
function formatPersonal(
  account: UserAccount,
  personal: PersonalProfile
): string {
  const lines: string[] = [];
  lines.push(`## 지원자 정보 (개인)`);
  lines.push(`- **이름**: ${account.displayName}`);
  const age = calculateAge(personal.birthDate, personal.age);
  if (age != null) lines.push(`- **나이**: 만 ${age}세`);
  if (personal.region) {
    const region = personal.subRegion
      ? `${personal.region} ${personal.subRegion}`
      : personal.region;
    lines.push(`- **거주지**: ${region}`);
  }
  if (personal.incomeLevel) lines.push(`- **소득 수준**: ${personal.incomeLevel}`);
  if (personal.employmentStatus)
    lines.push(`- **취업 상태**: ${personal.employmentStatus}`);
  if (personal.householdType)
    lines.push(`- **가구 유형**: ${personal.householdType}`);

  const flags: string[] = [];
  if (personal.hasChildren) flags.push("자녀 있음");
  if (personal.isDisabled) flags.push("장애인 등록");
  if (personal.isVeteran) flags.push("국가유공자/보훈대상");
  if (flags.length > 0) lines.push(`- **추가 상태**: ${flags.join(", ")}`);

  if (account.interests.length > 0) {
    lines.push(`- **관심 분야**: ${account.interests.join(", ")}`);
  }

  return lines.join("\n");
}

/** Format the organization applicant block. */
function formatOrganization(
  account: UserAccount,
  org: Organization
): string {
  const lines: string[] = [];
  lines.push(`## 지원자 정보 (기관)`);
  lines.push(`- **기관명**: ${org.name}`);
  lines.push(`- **유형**: ${org.kind}`);
  lines.push(`- **지역**: ${org.region}`);
  if (org.businessAge != null) lines.push(`- **업력**: ${org.businessAge}년`);
  if (org.employeeCount != null)
    lines.push(`- **종업원**: ${org.employeeCount}명`);
  if (org.revenue != null) lines.push(`- **매출**: ${org.revenue}억 원`);
  if (org.industry) lines.push(`- **업종**: ${org.industry}`);
  if (org.techField) lines.push(`- **기술분야**: ${org.techField}`);
  if (org.researchField) lines.push(`- **연구분야**: ${org.researchField}`);
  if (org.careerYears != null)
    lines.push(`- **대표자 경력**: ${org.careerYears}년`);

  // Research org capabilities (Phase 1 fields)
  const researchFlags: string[] = [];
  if (org.hasResearchInstitute) researchFlags.push("기업부설연구소");
  if (org.hasResearchDepartment) researchFlags.push("연구개발전담부서");
  if (researchFlags.length > 0)
    lines.push(`- **연구조직**: ${researchFlags.join(", ")}`);

  if (org.certifications && org.certifications.length > 0) {
    lines.push(`- **보유 인증**: ${org.certifications.join(", ")}`);
  }

  if (account.interests.length > 0) {
    lines.push(`- **관심 분야**: ${account.interests.join(", ")}`);
  }

  if (org.notes) lines.push(`- **메모**: ${org.notes}`);

  return lines.join("\n");
}

export interface BuildProposalUserPromptInput {
  grant: Grant;
  account: UserAccount;
  /**
   * Which context to use. If `organization` is provided we treat the
   * applicant as that organization; otherwise we use account.personal.
   */
  organization?: Organization;
  sectionKey: ProposalSectionKey;
  /**
   * (Phase 4) Past selected proposal excerpts retrieved by RAG.
   * Phase 3 leaves this empty.
   */
  pastExamples?: string[];
}

/**
 * Assemble the full user message for one section generation call.
 */
export function buildProposalUserPrompt(
  input: BuildProposalUserPromptInput
): string {
  const grantBlock = formatGrant(input.grant);
  const applicantBlock = input.organization
    ? formatOrganization(input.account, input.organization)
    : formatPersonal(input.account, input.account.personal);

  const sectionLabel = SECTION_LABELS[input.sectionKey];
  const sectionInstruction = SECTION_INSTRUCTIONS[input.sectionKey];

  const parts: string[] = [grantBlock, "", applicantBlock, ""];

  if (input.pastExamples && input.pastExamples.length > 0) {
    parts.push("## 과거 선정 사례 발췌");
    for (const ex of input.pastExamples) {
      parts.push(`> ${ex.replace(/\n/g, "\n> ")}`);
    }
    parts.push("");
  }

  parts.push("## 작성 요청");
  parts.push(`아래 한 섹션만 작성해주세요: **${sectionLabel}**`);
  parts.push("");
  parts.push("### 섹션별 지시사항");
  parts.push(sectionInstruction);
  parts.push("");
  parts.push(`섹션 제목 \`## ${sectionLabel}\` 으로 시작합니다.`);

  return parts.join("\n");
}
