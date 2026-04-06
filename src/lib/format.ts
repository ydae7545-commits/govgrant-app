import { format, differenceInDays, parseISO } from "date-fns";
import { ko } from "date-fns/locale";

export function formatDate(dateStr: string): string {
  return format(parseISO(dateStr), "yyyy.MM.dd", { locale: ko });
}

export function formatDateFull(dateStr: string): string {
  return format(parseISO(dateStr), "yyyy년 M월 d일", { locale: ko });
}

export function daysUntil(dateStr: string): number {
  return differenceInDays(parseISO(dateStr), new Date());
}

export function formatAmount(amountManWon: number): string {
  if (amountManWon === 0) return "무료";
  if (amountManWon >= 10000) {
    const eok = amountManWon / 10000;
    return eok % 1 === 0 ? `${eok}억 원` : `${eok.toFixed(1)}억 원`;
  }
  return `${amountManWon.toLocaleString()}만 원`;
}

export function formatAmountRange(min: number, max: number): string {
  if (min === 0 && max === 0) return "무료 / 현물 지원";
  if (min === max) return formatAmount(max);
  if (min === 0) return `최대 ${formatAmount(max)}`;
  return `${formatAmount(min)} ~ ${formatAmount(max)}`;
}

/**
 * 만 나이 계산. 생년월일이 있으면 만 나이를, 없으면 fallbackAge(구 v2 데이터)를 반환.
 * 둘 다 없으면 undefined.
 */
export function calculateAge(
  birthDate: string | undefined,
  fallbackAge: number | undefined = undefined
): number | undefined {
  if (birthDate) {
    const birth = parseISO(birthDate);
    if (isNaN(birth.getTime())) return fallbackAge;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  }
  return fallbackAge;
}

export function formatBirthDate(birthDate: string | undefined): string {
  if (!birthDate) return "-";
  try {
    return format(parseISO(birthDate), "yyyy.MM.dd", { locale: ko });
  } catch {
    return birthDate;
  }
}

export function getDeadlineLabel(dateStr: string): {
  text: string;
  urgent: boolean;
} {
  const days = daysUntil(dateStr);
  if (days < 0) return { text: "마감", urgent: false };
  if (days === 0) return { text: "오늘 마감", urgent: true };
  if (days <= 3) return { text: `D-${days}`, urgent: true };
  if (days <= 7) return { text: `D-${days}`, urgent: true };
  if (days <= 30) return { text: `D-${days}`, urgent: false };
  return { text: `D-${days}`, urgent: false };
}
