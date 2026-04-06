import type { UserType, GrantCategory } from "./grant";

export interface IndividualProfile {
  age: number;
  region: string;
  incomeLevel: "저소득" | "중위소득" | "일반";
  employmentStatus: "재직" | "구직" | "학생" | "기타";
  householdType: "1인" | "신혼" | "다자녀" | "일반";
}

export interface SMEProfile {
  businessAge: number; // 업력 (년)
  industry: string;
  employeeCount: number;
  revenue: number; // 억 원
  region: string;
  techField: string;
}

export interface ResearchProfile {
  affiliation: string;
  researchField: string;
  careerYears: number;
  region: string;
}

export interface UserProfile {
  type: UserType;
  name: string;
  interests: GrantCategory[];
  individual?: IndividualProfile;
  sme?: SMEProfile;
  research?: ResearchProfile;
  completedOnboarding: boolean;
}
