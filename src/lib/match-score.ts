import type { Grant } from "@/types/grant";
import type { UserProfile } from "@/types/user";
import { daysUntil } from "./format";

export function calculateMatchScore(
  grant: Grant,
  profile: UserProfile | null
): number {
  if (!profile) return 50;

  let score = 0;

  // +30: 사용자 유형 일치
  if (grant.targetTypes.includes(profile.type)) {
    score += 30;
  }

  // +20: 지역 일치
  const userRegion = getUserRegion(profile);
  if (
    grant.region === "전국" ||
    grant.region === userRegion ||
    (grant.eligibility.regions &&
      userRegion &&
      grant.eligibility.regions.includes(userRegion))
  ) {
    score += 20;
  }

  // +15: 관심 카테고리 일치
  if (profile.interests.includes(grant.category)) {
    score += 15;
  }

  // +10: 태그 겹침
  const interestKeywords = profile.interests.map((i) => i.toLowerCase());
  const tagOverlap = grant.tags.some((tag) =>
    interestKeywords.some((kw) => tag.toLowerCase().includes(kw))
  );
  if (tagOverlap) {
    score += 10;
  }

  // +10: 자격 조건 세부 충족
  score += checkEligibility(grant, profile);

  // +15: 마감 임박 부스트
  const days = daysUntil(grant.applicationEnd);
  if (days >= 0 && days <= 30) {
    score += 15;
  }

  return Math.min(100, score);
}

function getUserRegion(profile: UserProfile): string | null {
  if (profile.individual) return profile.individual.region;
  if (profile.sme) return profile.sme.region;
  if (profile.research) return profile.research.region;
  return null;
}

function checkEligibility(grant: Grant, profile: UserProfile): number {
  let bonus = 0;
  const elig = grant.eligibility;

  if (profile.type === "individual" && profile.individual) {
    const ind = profile.individual;
    if (elig.ageMin && elig.ageMax) {
      if (ind.age >= elig.ageMin && ind.age <= elig.ageMax) bonus += 5;
    } else if (elig.ageMin && ind.age >= elig.ageMin) {
      bonus += 3;
    } else if (elig.ageMax && ind.age <= elig.ageMax) {
      bonus += 3;
    }
  }

  if (profile.type === "sme" && profile.sme) {
    const sme = profile.sme;
    if (elig.businessAgeMax && sme.businessAge <= elig.businessAgeMax) {
      bonus += 5;
    }
    if (elig.employeeMax && sme.employeeCount <= elig.employeeMax) {
      bonus += 3;
    }
    if (elig.revenueMax && sme.revenue <= elig.revenueMax) {
      bonus += 2;
    }
  }

  return Math.min(10, bonus);
}
