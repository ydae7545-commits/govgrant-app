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
  /** 기업부설연구소 보유 (한국산업기술진흥협회 KOITA 인정) */
  hasResearchInstitute?: boolean;
  /** 연구개발전담부서 보유 (KOITA 인정) */
  hasResearchDepartment?: boolean;
  /** 보유 인증 (이노비즈·벤처·메인비즈·ISO·특허 등) */
  certifications?: string[];
  notes?: string;

  /**
   * 사업자등록번호 + 국세청 검증 결과 (Phase 6).
   *
   * 사용자가 OrgFormDialog에서 사업자등록번호를 입력하고 "확인" 버튼을
   * 누르면 /api/business/verify가 호출되고, 결과가 여기 저장된다.
   * matchScore에서 statusCode가 "01" (계속사업자)이 아니면 R&D · 정책자금
   * 같은 활동 사업자 대상 과제를 강하게 감점한다.
   */
  businessNo?: string; // 10자리 숫자, 하이픈 없음
  /** 국세청 상태 코드: 01 계속사업자 / 02 휴업자 / 03 폐업자 */
  businessStatusCode?: "01" | "02" | "03";
  /** 국세청 응답 라벨 (e.g. "계속사업자") */
  businessStatusLabel?: string;
  /** 과세 유형 (부가세 일반과세자/간이과세자/면세사업자 등) */
  businessTaxType?: string;
  /** 폐업일 (해당 시) ISO yyyy-mm-dd */
  businessClosedAt?: string;
  /** 마지막 국세청 검증 ISO 시각 */
  businessVerifiedAt?: string;
}

export interface PersonalProfile {
  /** ISO date string YYYY-MM-DD */
  birthDate?: string;
  /** @deprecated v2 잔존 필드. 새 코드는 birthDate 사용. 마이그레이션에서 birthDate가 없을 때 fallback. */
  age?: number;
  /**
   * Phase 6.6: 성별. 임산부/여성 전용 복지, 군인/국가유공자 등 성별 특정
   * 서비스 매칭을 위해 필요. null/undefined면 매칭 점수에서 무시 (penalty 없음)
   * — 사용자가 명시적으로 설정한 경우에만 필터링 적용.
   */
  gender?: "male" | "female";
  region?: string;
  /** 시·도 하위의 구·군 (예: 강남구, 분당구) */
  subRegion?: string;
  incomeLevel?: "저소득" | "중위소득" | "일반";
  employmentStatus?: "재직" | "구직" | "학생" | "기타";
  householdType?: "1인" | "신혼" | "다자녀" | "일반";
  /** 자녀 유무 (출산/육아 혜택 매칭) */
  hasChildren?: boolean;
  /** 등록 장애인 (장애인 혜택 매칭) */
  isDisabled?: boolean;
  /** 국가유공자/보훈대상 (보훈 혜택 매칭) */
  isVeteran?: boolean;
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
