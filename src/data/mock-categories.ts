import type { GrantCategory } from "@/types/grant";

export const CATEGORIES: { value: GrantCategory; label: string; icon: string }[] = [
  { value: "창업지원", label: "창업지원", icon: "Rocket" },
  { value: "R&D", label: "R&D", icon: "FlaskConical" },
  { value: "정책자금", label: "정책자금", icon: "Landmark" },
  { value: "고용지원", label: "고용지원", icon: "Briefcase" },
  { value: "수출지원", label: "수출지원", icon: "Globe" },
  { value: "교육훈련", label: "교육훈련", icon: "GraduationCap" },
  { value: "복지", label: "복지", icon: "Heart" },
  { value: "주거", label: "주거", icon: "Home" },
  { value: "컨설팅", label: "컨설팅", icon: "MessageSquare" },
  { value: "기타", label: "기타", icon: "MoreHorizontal" },
];
