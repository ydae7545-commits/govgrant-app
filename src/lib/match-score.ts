import type { Grant, UserType } from "@/types/grant";
import type {
  MatchContext,
  OrgKind,
  PersonalProfile,
  Organization,
} from "@/types/user";
import { daysUntil, calculateAge } from "./format";

/**
 * OrgKind → grant.targetTypes 매핑.
 * sme/sole은 sme 타겟, research는 research 타겟으로 매칭.
 * public/nonprofit/other는 매칭할 타겟 타입이 없어 null을 반환 (타입 보너스 없음).
 */
function orgKindToUserType(kind: OrgKind): UserType | null {
  switch (kind) {
    case "sme":
    case "sole":
      return "sme";
    case "research":
      return "research";
    case "public":
    case "nonprofit":
    case "other":
      return null;
  }
}

export function calculateMatchScore(
  grant: Grant,
  ctx: MatchContext | null
): number {
  if (!ctx) return 50;

  if (ctx.kind === "personal") {
    return scorePersonal(grant, ctx.profile, ctx.interests);
  }
  return scoreOrg(grant, ctx.org, ctx.interests);
}

/**
 * 기관이 주관 대상이 아니어도 컨소시엄 참여 가능한지 검사하고,
 * 매칭 시 grant.consortiumMatch를 true로 표시한 뒤 점수를 반환한다.
 * 이 함수는 calculateMatchScore 이후 추가 점수 부여가 필요한 케이스를 처리한다.
 */
function scoreConsortium(
  grant: Grant,
  org: Organization
): { score: number; matched: boolean } {
  if (!grant.consortium?.possible) return { score: 0, matched: false };
  const userTech = (org.techField || org.researchField || "").toLowerCase();
  if (!userTech) return { score: 0, matched: false };
  const matched = grant.consortium.applicableTechFields.some((field) => {
    const f = field.toLowerCase();
    return userTech.includes(f) || f.includes(userTech);
  });
  return { score: matched ? 10 : 0, matched };
}

function scorePersonal(
  grant: Grant,
  personal: PersonalProfile,
  interests: string[]
): number {
  // 개인 복지 컨텍스트에서는 individual 대상이 아닌 과제는 즉시 0점
  if (!grant.targetTypes.includes("individual")) return 0;

  let score = 30; // individual 매칭 기본점

  // +20 지역 일치
  if (regionMatch(grant, personal.region)) score += 20;

  // +15 관심 카테고리 일치
  if (interests.includes(grant.category)) score += 15;

  // +10 태그 겹침
  if (tagOverlap(grant.tags, interests)) score += 10;

  // +10 나이 범위 일치 (생년월일에서 만 나이 계산, 없으면 v2 fallback age 사용)
  const userAge = calculateAge(personal.birthDate, personal.age);
  if (userAge != null) {
    const { ageMin, ageMax } = grant.eligibility;
    if (ageMin != null && ageMax != null) {
      if (userAge >= ageMin && userAge <= ageMax) score += 10;
    } else if (ageMin != null && userAge >= ageMin) {
      score += 6;
    } else if (ageMax != null && userAge <= ageMax) {
      score += 6;
    }
  }

  // 복지 특성 매칭 (자녀/장애/보훈)
  const tagsLower = grant.tags.map((t) => t.toLowerCase());
  const has = (kw: string) => tagsLower.some((t) => t.includes(kw));
  if (
    personal.hasChildren &&
    (has("출산") || has("육아") || has("다자녀") || has("양육"))
  ) {
    score += 8;
  }
  if (personal.isDisabled && (has("장애인") || has("장애"))) {
    score += 8;
  }
  if (personal.isVeteran && (has("보훈") || has("국가유공자"))) {
    score += 8;
  }

  // +15 마감 임박 보너스
  const days = daysUntil(grant.applicationEnd);
  if (days >= 0 && days <= 30) score += 15;

  return Math.min(100, score);
}

function scoreOrg(
  grant: Grant,
  org: Organization,
  interests: string[]
): number {
  const mappedType = orgKindToUserType(org.kind);
  const elig = grant.eligibility;

  // 컨소시엄 참여 가능 여부 사전 평가
  const cons = scoreConsortium(grant, org);

  // 매핑 가능한 기관 + 타겟 불일치 ⇒ 컨소시엄 매칭이 있으면 별도 경로로 추천, 없으면 0점
  if (mappedType && !grant.targetTypes.includes(mappedType)) {
    if (!cons.matched) return 0;
    grant.consortiumMatch = true;
    // 컨소시엄 참여 가능 과제: 베이스 30 + 컨소시엄 보너스
    let score = 30 + 10;
    if (regionMatch(grant, org.region)) score += 15;
    if (interests.includes(grant.category)) score += 10;
    if (tagOverlap(grant.tags, interests)) score += 5;
    const days = daysUntil(grant.applicationEnd);
    if (days >= 0 && days <= 30) score += 10;
    return Math.min(80, score); // 직접 대상보다는 낮은 상한
  }

  // 연구소/전담부서 필수 과제인데 미보유면 즉시 0점 (필터링)
  if (elig.requiresResearchInstitute && !org.hasResearchInstitute) return 0;
  if (
    elig.requiresResearchDepartment &&
    !(org.hasResearchInstitute || org.hasResearchDepartment)
  )
    return 0;

  // 매핑 불가(public/nonprofit/other)인 기관은 타입 보너스 없이 카테고리·지역만 반영, 상한 60
  let score = 0;
  let cap = 100;

  if (mappedType) {
    score += 30;
  } else {
    cap = 60; // 타입 매칭 없는 경우 최대 60으로 제한
  }

  // 컨소시엄 매칭 (직접 대상이면서 컨소시엄도 가능한 경우 추가 가산)
  if (cons.matched) {
    grant.consortiumMatch = true;
    score += cons.score;
  }

  // +20 지역 일치
  if (regionMatch(grant, org.region)) score += 20;

  // +15 관심 카테고리 일치
  if (interests.includes(grant.category)) score += 15;

  // +10 태그 겹침
  if (tagOverlap(grant.tags, interests)) score += 10;

  // +10 eligibility 세부 (sme 계열만)
  if (mappedType === "sme") {
    let bonus = 0;
    if (
      elig.businessAgeMax != null &&
      org.businessAge != null &&
      org.businessAge <= elig.businessAgeMax
    )
      bonus += 5;
    if (
      elig.employeeMax != null &&
      org.employeeCount != null &&
      org.employeeCount <= elig.employeeMax
    )
      bonus += 3;
    if (
      elig.revenueMax != null &&
      org.revenue != null &&
      org.revenue <= elig.revenueMax
    )
      bonus += 2;
    // 연구소 필수 과제 충족 시 가산점
    if (elig.requiresResearchInstitute && org.hasResearchInstitute) bonus += 5;
    if (
      elig.requiresResearchDepartment &&
      (org.hasResearchInstitute || org.hasResearchDepartment)
    )
      bonus += 5;
    score += Math.min(15, bonus);
  }

  // +15 마감 임박 보너스
  const days = daysUntil(grant.applicationEnd);
  if (days >= 0 && days <= 30) score += 15;

  return Math.min(cap, Math.min(100, score));
}

function regionMatch(grant: Grant, userRegion: string | undefined): boolean {
  if (!userRegion) return grant.region === "전국";
  if (grant.region === "전국") return true;
  if (grant.region === userRegion) return true;
  if (grant.eligibility.regions?.includes(userRegion)) return true;
  return false;
}

function tagOverlap(tags: string[], interests: string[]): boolean {
  if (interests.length === 0) return false;
  const keywords = interests.map((i) => i.toLowerCase());
  return tags.some((tag) =>
    keywords.some((kw) => tag.toLowerCase().includes(kw))
  );
}
