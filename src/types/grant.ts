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
  matchScore?: number; // 런타임 계산
}
