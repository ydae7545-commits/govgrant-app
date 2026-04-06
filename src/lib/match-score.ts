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

  // 매핑 가능한 기관이면 타겟 필터 필수
  if (mappedType && !grant.targetTypes.includes(mappedType)) return 0;

  // 매핑 불가(public/nonprofit/other)인 기관은 타입 보너스 없이 카테고리·지역만 반영, 상한 60
  let score = 0;
  let cap = 100;

  if (mappedType) {
    score += 30;
  } else {
    cap = 60; // 타입 매칭 없는 경우 최대 60으로 제한
  }

  // +20 지역 일치
  if (regionMatch(grant, org.region)) score += 20;

  // +15 관심 카테고리 일치
  if (interests.includes(grant.category)) score += 15;

  // +10 태그 겹침
  if (tagOverlap(grant.tags, interests)) score += 10;

  // +10 eligibility 세부 (sme 계열만)
  if (mappedType === "sme") {
    const elig = grant.eligibility;
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
    score += Math.min(10, bonus);
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
