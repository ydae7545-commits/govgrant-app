import { format, differenceInDays, parseISO, isValid } from "date-fns";
import { ko } from "date-fns/locale";

/**
 * Parse an ISO date string defensively. Returns `null` when the input is
 * empty, undefined, or not a valid date.
 *
 * 왜 필요한가: Phase 6 실데이터 어댑터들 중 MSIT/MSS 일부 공고는
 * application_start/end 가 비어 있다. 이전엔 `parseISO("")` 가 Invalid
 * Date 를 반환 → `format()` 이 throw → 전체 페이지 crash ("This page
 * couldn't load") 되는 문제가 있었다. 모든 format/daysUntil 호출은
 * 반드시 이 헬퍼를 거쳐야 한다.
 */
function safeParse(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  try {
    const d = parseISO(dateStr);
    return isValid(d) ? d : null;
  } catch {
    return null;
  }
}

export function formatDate(dateStr: string | null | undefined): string {
  const d = safeParse(dateStr);
  if (!d) return "기간 미정";
  return format(d, "yyyy.MM.dd", { locale: ko });
}

export function formatDateFull(dateStr: string | null | undefined): string {
  const d = safeParse(dateStr);
  if (!d) return "기간 미정";
  return format(d, "yyyy년 M월 d일", { locale: ko });
}

/**
 * Returns `NaN` when the input is empty/invalid — callers should branch
 * on `Number.isNaN(days)` to render "기간 미정" 라벨 대신 D-NaN이 찍히지
 * 않도록 한다. `getDeadlineLabel` 이 이걸 담당함.
 */
export function daysUntil(dateStr: string | null | undefined): number {
  const d = safeParse(dateStr);
  if (!d) return NaN;
  return differenceInDays(d, new Date());
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

/**
 * "원문 보기" 용 URL 생성.
 *
 * Mock 데이터의 grant.url 은 일부가 기관 홈페이지/랜딩으로만 연결되어 있다
 * (세부 공고 URL은 운영 중 자주 바뀌고 영구 링크가 보장되지 않아
 * 인위적으로 고정하면 쉽게 404가 된다).
 *
 * 이 헬퍼는 다음 규칙으로 "실제 세부 공고"에 가까운 링크를 만든다:
 *
 * 1) grant.url 이 이미 세부 경로(홈페이지 루트가 아닌 path·query 를 가진 URL)
 *    이면 그대로 사용한다. 예) `gov.kr/search?srhQuery=...`,
 *    `nrf.re.kr/biz/info/notice/list?menu_no=378`.
 * 2) 홈페이지 루트에 가까운 URL(`/`, `/landing` 등)이면 정부24 통합 검색
 *    `https://www.gov.kr/search?srhQuery=<공고 제목>` 으로 교체한다.
 *    정부24는 한국 정부의 공식 통합 포털로 부처·지자체·기관의 복지/사업
 *    공고를 모두 색인하므로, 실제 공고가 존재하면 상단에 노출된다.
 * 3) URL 파싱 실패 시 원본 URL을 그대로 반환한다.
 */
export function getOriginalSourceUrl(params: {
  url: string;
  title: string;
  organization: string;
}): string {
  const { url, title } = params;
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, ""); // 끝 슬래시 제거
    const hasQuery = parsed.search.length > 0;
    const isHomepageRoot =
      (path === "" || path === "/landing" || path === "/main") && !hasQuery;
    if (!isHomepageRoot) {
      // 이미 세부 경로·쿼리가 지정된 URL이면 그대로 사용
      return url;
    }
    const q = encodeURIComponent(title);
    return `https://www.gov.kr/search?srhQuery=${q}`;
  } catch {
    return url;
  }
}

export function formatBirthDate(birthDate: string | undefined): string {
  if (!birthDate) return "-";
  try {
    return format(parseISO(birthDate), "yyyy.MM.dd", { locale: ko });
  } catch {
    return birthDate;
  }
}

export function getDeadlineLabel(dateStr: string | null | undefined): {
  text: string;
  urgent: boolean;
} {
  const days = daysUntil(dateStr);
  // 날짜가 없거나 파싱 불가 → "기간 미정" (D-NaN 방지)
  if (Number.isNaN(days)) return { text: "기간 미정", urgent: false };
  if (days < 0) return { text: "마감", urgent: false };
  if (days === 0) return { text: "오늘 마감", urgent: true };
  if (days <= 3) return { text: `D-${days}`, urgent: true };
  if (days <= 7) return { text: `D-${days}`, urgent: true };
  if (days <= 30) return { text: `D-${days}`, urgent: false };
  return { text: `D-${days}`, urgent: false };
}
