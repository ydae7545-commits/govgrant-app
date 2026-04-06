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
