import type { GrantCategory } from "./grant";

/**
 * 자유 확장형 기관 유형.
 * 매칭 로직은 이 값을 grant.targetTypes(sme/research/individual)에 맵핑하여 사용한다.
 * - sme, sole        → grant.targetTypes "sme"
 * - research         → grant.targetTypes "research"
 * - public, nonprofit, other → 타입 매칭 보너스 없이 카테고리/지역 기반만
 */
export type OrgKind =
  | "sme" // 중소기업/스타트업
  | "research" // 연구기관/대학
  | "sole" // 소상공인/자영업
  | "public" // 공공/지자체
  | "nonprofit" // 비영리/사회적기업
  | "other";

export const ORG_KIND_LABELS: Record<OrgKind, string> = {
  sme: "중소기업·스타트업",
  research: "연구기관·대학",
  sole: "소상공인·자영업",
  public: "공공·지자체",
  nonprofit: "비영리·사회적기업",
  other: "기타",
};

export interface Organization {
  id: string; // uuid
  name: string; // 자유 입력
  kind: OrgKind;
  region: string; // "전국" 또는 시도
  // 선택 필드 (kind에 따라 일부만 사용)
  businessAge?: number;
  employeeCount?: number;
  revenue?: number; // 억 원
  industry?: string;
  techField?: string;
  researchField?: string;
  careerYears?: number;
  notes?: string;
}

export interface PersonalProfile {
  age?: number;
  region?: string;
  incomeLevel?: "저소득" | "중위소득" | "일반";
  employmentStatus?: "재직" | "구직" | "학생" | "기타";
  householdType?: "1인" | "신혼" | "다자녀" | "일반";
}

export type ContextId = "personal" | string; // "personal" 또는 org.id

export interface UserAccount {
  id: string; // 로컬 uuid (Phase 2: Supabase auth.users.id로 교체)
  displayName: string;
  email?: string; // Phase 2 준비 필드
  personal: PersonalProfile;
  organizations: Organization[];
  interests: GrantCategory[];
  activeContextId: ContextId;
  createdAt: string; // ISO
  completedOnboarding: boolean;
}

/**
 * 매칭 계산에 사용하는 컨텍스트.
 * store.getActiveContext()가 반환하며 API · 페이지 모두 이 타입을 전달한다.
 */
export type MatchContext =
  | { kind: "personal"; profile: PersonalProfile; interests: GrantCategory[] }
  | { kind: "org"; org: Organization; interests: GrantCategory[] };
