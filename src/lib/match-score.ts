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

/**
 * Phase 6.6: 복지 태그 기반 "해당 없음" 제외 필터.
 *
 * 복지 공고 (category === "복지")는 bokjiro API의 trgterIndvdlArray /
 * intrsThemaArray 를 tags 에 담고 있다. 사용자 프로필과 명백히 상충하는
 * 태그가 있으면 즉시 0점 처리해서 검색/추천에서 완전히 배제한다.
 *
 * 배제 규칙 (명시적 성별/가족/연령 태그가 있을 때만 적용 — 없으면 통과):
 *   - "임산부"/"여성": male 사용자 배제
 *   - "다문화가족"/"한부모": 그 가구 타입이 아닌 사람 배제하진 않음 (조건 완화)
 *   - "노인"/"어르신": 만 60세 미만 배제
 *   - "청소년": 만 30세 초과 배제
 *   - "아동": 만 19세 초과 배제 (아동 본인 지원이 아닌 부모 지원은 hasChildren으로 보정)
 *
 * gender / age 를 설정하지 않은 사용자에게는 배제 적용 안 함 — 불확실한
 * 추론으로 과도하게 필터하는 것보단 여전히 보이게 두는 쪽이 낫다.
 */
function isExcludedByTargeting(
  grant: Grant,
  personal: PersonalProfile,
  userAge: number | null
): boolean {
  // 복지 카테고리가 아니면 배제 규칙 적용 안 함
  if (grant.category !== "복지") return false;

  const tagsLower = grant.tags.map((t) => t.toLowerCase());
  const has = (kw: string) => tagsLower.some((t) => t.includes(kw));

  // 성별 제한
  if (personal.gender === "male") {
    if (has("임산부") || has("산모") || has("여성")) return true;
  }
  if (personal.gender === "female") {
    // 드물지만 "남성" 전용 공고 (군인 등) 배제
    if (has("남성") && !has("여성")) return true;
  }

  // 연령대 제한 (userAge 있을 때만)
  if (userAge != null) {
    if ((has("노인") || has("어르신")) && userAge < 55) return true;
    if (has("청소년") && userAge > 30) return true;
    if (has("영유아") && userAge > 6 && !personal.hasChildren) return true;
    if (has("아동") && userAge > 19 && !personal.hasChildren) return true;
  }

  // 자녀 없는 사람에게 부모 전용 복지 배제
  if (!personal.hasChildren) {
    if (has("한부모") && personal.householdType !== "1인") return true;
    if (has("다자녀")) return true;
  }

  return false;
}

function scorePersonal(
  grant: Grant,
  personal: PersonalProfile,
  interests: string[]
): number {
  // 개인 복지 컨텍스트에서는 individual 대상이 아닌 과제는 즉시 0점
  if (!grant.targetTypes.includes("individual")) return 0;

  // Phase 6.6: 복지 태그 기반 명시적 배제 (성별/연령/가족)
  const userAge = calculateAge(personal.birthDate, personal.age) ?? null;
  if (isExcludedByTargeting(grant, personal, userAge)) return 0;

  let score = 30; // individual 매칭 기본점

  // +20 지역 일치
  if (regionMatch(grant, personal.region)) score += 20;

  // +15 관심 카테고리 일치
  if (interests.includes(grant.category)) score += 15;

  // +10 태그 겹침
  if (tagOverlap(grant.tags, interests)) score += 10;

  // +10 나이 범위 일치 (userAge 는 위에서 이미 계산함)
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

/**
 * Phase 6: 사업자등록번호가 검증된 SME/소상공인 컨텍스트에서 사업자 상태가
 * 비활동 (휴업/폐업) 인 경우, R&D · 정책자금 · 창업지원 · 고용지원 같은
 * "활동 사업자만 신청 가능" 카테고리는 강하게 감점한다.
 *
 * 비활동 사업자도 절세 강좌(교육훈련) 등 일부 카테고리는 신청 가능하므로
 * 모든 과제를 0점으로 만들지는 않고, 활동 사업자 한정 과제만 패널티를
 * 준다. 검증을 안 한 경우(businessStatusCode 미설정)는 패널티 없음.
 */
function businessStatusPenalty(grant: Grant, org: Organization): number {
  if (!org.businessStatusCode) return 0;
  if (org.businessStatusCode === "01") return 0; // 계속사업자 — 정상

  const activeOnlyCategories = new Set([
    "R&D",
    "정책자금",
    "창업지원",
    "고용지원",
    "수출지원",
  ]);
  if (activeOnlyCategories.has(grant.category)) {
    // 휴업자(02): 강한 감점, 폐업자(03): 사실상 제외
    return org.businessStatusCode === "03" ? -100 : -40;
  }
  return 0;
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

  // Phase 6: 사업자 상태 패널티는 모든 분기에서 마지막에 적용된다.
  // 여기서 미리 계산해서 각 return 직전에 더하지 말고, 함수 끝에서 한 번에 적용.
  const bizPenalty = businessStatusPenalty(grant, org);

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
    score += bizPenalty;
    return Math.max(0, Math.min(80, score)); // 직접 대상보다는 낮은 상한
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

  // Phase 6: 사업자 비활동 상태 패널티 적용
  score += bizPenalty;

  return Math.max(0, Math.min(cap, Math.min(100, score)));
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
