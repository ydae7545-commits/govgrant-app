import type { GrantCategory, GrantStatus, UserType } from "./grant";

export interface SearchFilters {
  keyword: string;
  category: GrantCategory | "all";
  targetType: UserType | "all";
  region: string; // "all" or specific region
  status: GrantStatus | "all";
  amountMin?: number;
  amountMax?: number;
  deadlineWithinDays?: number;
  sort: "match" | "deadline" | "amount" | "latest";
  page: number;
  limit: number;
}
