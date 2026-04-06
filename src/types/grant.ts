export type UserType = "individual" | "sme" | "research";

export type GrantStatus = "모집중" | "모집예정" | "마감임박" | "마감";

export type GrantCategory =
  | "창업지원"
  | "R&D"
  | "정책자금"
  | "고용지원"
  | "수출지원"
  | "교육훈련"
  | "복지"
  | "주거"
  | "컨설팅"
  | "기타";

export interface GrantEligibility {
  ageMin?: number;
  ageMax?: number;
  regions?: string[];
  businessAgeMax?: number; // 업력 N년 이하
  employeeMax?: number;
  revenueMax?: number; // 매출액 상한 (억 원)
  /** 기업부설연구소 보유가 필수 */
  requiresResearchInstitute?: boolean;
  /** 연구개발전담부서 이상 보유 필수 (연구소 or 전담부서) */
  requiresResearchDepartment?: boolean;
  requirements: string[];
}

export interface Grant {
  id: string;
  title: string;
  summary: string;
  description: string;
  organization: string; // 주관기관
  source: string; // 데이터 출처 (정부24, NTIS 등)
  category: GrantCategory;
  targetTypes: UserType[];
  region: string; // "전국" 또는 특정 지역
  amountMin: number; // 만원 단위
  amountMax: number;
  applicationStart: string; // ISO date
  applicationEnd: string;
  eligibility: GrantEligibility;
  tags: string[];
  url: string; // 원문 링크
  /**
   * 컨소시엄 참여 가능 정보.
   * 기업이 주관 대상이 아니더라도 적용 가능 기술분야가 맞으면 공동연구/위탁 형태로 참여 가능.
   */
  consortium?: {
    possible: boolean;
    /** 적용 가능 기술분야 (AI, 바이오, IoT 등) */
    applicableTechFields: string[];
    /** 참여 역할 (주관, 공동연구, 위탁, 공급기업 등) */
    role?: string;
  };
  matchScore?: number; // 런타임 계산
  /** 사용자 techField가 컨소시엄 분야와 매칭되었는지 (런타임) */
  consortiumMatch?: boolean;
}
