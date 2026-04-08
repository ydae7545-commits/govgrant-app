import "server-only";

import type { Grant, GrantCategory, UserType } from "@/types/grant";
import type { GrantDbRow } from "./msit";

/**
 * 기업마당 (bizinfo.go.kr) 지원사업정보 API adapter.
 *
 * Source: https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do
 * Auth:   bizinfo.go.kr 자체 회원가입 후 발급되는 `crtfcKey` (NOT data.go.kr)
 *
 * Range: 중앙부처 + 지자체 + 유관기관의 지원사업 공고 통합 제공.
 *        산업통상자원부, 중소벤처기업부, 고용노동부, 농식품부, 환경부 등
 *        모든 부처의 사업공고를 한 API로 가져올 수 있다.
 *
 * 반환 필드가 MSIT보다 훨씬 풍부함:
 *   - pblancId          공고 안정적 ID (PBLN_xxxxxxxxxxx)
 *   - pblancNm          공고명
 *   - pblancUrl         상세 URL
 *   - trgetNm           대상 (중소기업/소상공인/개인 등)
 *   - jrsdInsttNm       소관기관 (지역 추출 가능)
 *   - excInsttNm        수행기관
 *   - reqstBeginEndDe   신청 기간 ("2026-03-30 ~ 2026-04-13" 또는 "예산 소진시까지")
 *   - reqstMthPapersCn  접수 방법
 *   - pldirSportRealmLclasCodeNm  대분류 (기술/경영 등)
 *   - pldirSportRealmMlsfcCodeNm  중분류 (공동기술개발/컨설팅 등)
 *   - bsnsSumryCn       사업 요약 (HTML)
 *   - hashtags          태그 (콤마 구분)
 *   - totCnt            전체 공고 개수
 */

const ENDPOINT = "https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do";

export interface BizinfoRow {
  pblancId?: string;            // PBLN_000000000120517
  pblancNm?: string;            // 공고명
  pblancUrl?: string;           // 상세 URL
  trgetNm?: string;             // 중소기업 / 소상공인 / 개인 등
  jrsdInsttNm?: string;         // 소관기관 (시·도 또는 부처)
  excInsttNm?: string;          // 수행기관
  reqstBeginEndDe?: string;     // "2026-03-30 ~ 2026-04-13" or "예산 소진시까지"
  reqstMthPapersCn?: string;    // 접수 방법
  pldirSportRealmLclasCodeNm?: string;  // 대분류 (기술/경영/금융 등)
  pldirSportRealmMlsfcCodeNm?: string;  // 중분류
  bsnsSumryCn?: string;         // 사업 요약 (HTML)
  hashtags?: string;            // "기술,경영,부산,..."
  totCnt?: number;
  inqireCo?: number;            // 조회수
  creatPnttm?: string;          // 등록일시
  updtPnttm?: string;           // 수정일시
  fileNm?: string;
  refrncNm?: string;
  [k: string]: unknown;
}

export interface BizinfoFetchOptions {
  crtfcKey: string;
  /** 1-based page index. */
  pageIndex?: number;
  /** Items per page. The API caps this around 100; we default to 50. */
  pageUnit?: number;
  /** Free-text search filter (optional). */
  searchKrwd?: string;
  /** Category code filter (optional). */
  hashtags?: string;
}

export interface BizinfoPage {
  rows: BizinfoRow[];
  totalCount: number;
  pageIndex: number;
  pageUnit: number;
}

/**
 * Fetch a single page from the bizinfo API.
 *
 * The API ALWAYS returns JSON when dataType=json is set, but the envelope
 * is just `{ jsonArray: [...] }` — no header / body wrapping. totCnt is
 * embedded inside each row (every item carries the same totCnt). On
 * parameter errors the API returns `{ reqErr: "..." }` which we surface
 * as a thrown Error.
 */
export async function fetchBizinfoPage(
  opts: BizinfoFetchOptions
): Promise<BizinfoPage> {
  const {
    crtfcKey,
    pageIndex = 1,
    pageUnit = 50,
    searchKrwd,
    hashtags,
  } = opts;

  const url = new URL(ENDPOINT);
  url.searchParams.set("crtfcKey", crtfcKey);
  url.searchParams.set("dataType", "json");
  url.searchParams.set("pageIndex", String(pageIndex));
  url.searchParams.set("pageUnit", String(pageUnit));
  // searchCnt seems to be a no-op when pageUnit is set, but the API requires
  // it to be present in some clients. We mirror pageUnit to be safe.
  url.searchParams.set("searchCnt", String(pageUnit));
  if (searchKrwd) url.searchParams.set("searchKrwd", searchKrwd);
  if (hashtags) url.searchParams.set("hashtags", hashtags);

  const res = await fetch(url.toString(), {
    next: { revalidate: 60 * 60 * 6 }, // 6시간 edge cache
    headers: {
      Accept: "application/json",
      // bizinfo blocks default Node fetch UA in some configurations.
      "User-Agent":
        "Mozilla/5.0 (compatible; govgrant-app/1.0; +https://govgrant-app.vercel.app)",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Bizinfo API ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = (await res.json()) as
    | { jsonArray: BizinfoRow[] }
    | { reqErr: string };

  if ("reqErr" in json) {
    throw new Error(`Bizinfo API error: ${json.reqErr}`);
  }

  const rows = Array.isArray(json.jsonArray) ? json.jsonArray : [];
  const totalCount = Number(rows[0]?.totCnt ?? rows.length) || rows.length;

  return { rows, totalCount, pageIndex, pageUnit };
}

// ----------------------------------------------------------------------------
// Normalization
// ----------------------------------------------------------------------------

/** 시·도 이름 정규화 (jrsdInsttNm에서 추출). */
const REGION_PATTERNS: Array<{ pat: RegExp; out: string }> = [
  { pat: /서울/, out: "서울특별시" },
  { pat: /부산/, out: "부산광역시" },
  { pat: /대구/, out: "대구광역시" },
  { pat: /인천/, out: "인천광역시" },
  { pat: /광주/, out: "광주광역시" },
  { pat: /대전/, out: "대전광역시" },
  { pat: /울산/, out: "울산광역시" },
  { pat: /세종/, out: "세종특별자치시" },
  { pat: /경기/, out: "경기도" },
  { pat: /강원/, out: "강원특별자치도" },
  { pat: /충청북도|충북/, out: "충청북도" },
  { pat: /충청남도|충남/, out: "충청남도" },
  { pat: /전라북도|전북/, out: "전북특별자치도" },
  { pat: /전라남도|전남/, out: "전라남도" },
  { pat: /경상북도|경북/, out: "경상북도" },
  { pat: /경상남도|경남/, out: "경상남도" },
  { pat: /제주/, out: "제주특별자치도" },
];

function inferRegion(jrsdInsttNm: string | undefined): string {
  if (!jrsdInsttNm) return "전국";
  for (const { pat, out } of REGION_PATTERNS) {
    if (pat.test(jrsdInsttNm)) return out;
  }
  return "전국";
}

/** 기업마당 대분류 → 우리 GrantCategory 매핑. */
function mapCategory(
  lclasCodeNm: string | undefined,
  mlsfcCodeNm: string | undefined,
  title: string
): GrantCategory {
  const big = (lclasCodeNm ?? "") + " " + (mlsfcCodeNm ?? "");
  if (/창업|예비창업|초기창업/.test(big + title)) return "창업지원";
  if (/기술|연구개발|R&D|공동기술/i.test(big)) return "R&D";
  if (/금융|자금|융자|보증/.test(big)) return "정책자금";
  if (/고용|채용|일자리/.test(big)) return "고용지원";
  if (/수출|해외|글로벌/.test(big)) return "수출지원";
  if (/교육|훈련|인력양성/.test(big)) return "교육훈련";
  if (/컨설팅|자문|진단/.test(big)) return "컨설팅";
  if (/주거|주택/.test(big)) return "주거";
  if (/복지|보건|장애/.test(big)) return "복지";
  return "기타";
}

/** trgetNm → 우리 UserType 배열. */
function mapTargetTypes(trgetNm: string | undefined): UserType[] {
  if (!trgetNm) return ["sme"];
  const out = new Set<UserType>();
  if (/중소기업|중견기업|벤처|스타트업/.test(trgetNm)) out.add("sme");
  if (/소상공인|자영업/.test(trgetNm)) out.add("sme");
  if (/대학|연구기관|연구소/.test(trgetNm)) out.add("research");
  if (/개인|국민|청년|학생/.test(trgetNm)) out.add("individual");
  if (out.size === 0) out.add("sme"); // 기본값
  return [...out];
}

/** "2026-03-30 ~ 2026-04-13" 같은 문자열에서 시작/마감 분리. */
function splitDateRange(s: string | undefined): { start: string | null; end: string | null } {
  if (!s) return { start: null, end: null };
  const m = s.match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/);
  if (m) return { start: m[1], end: m[2] };
  // 단일 날짜만 있을 수도
  const m2 = s.match(/(\d{4}-\d{2}-\d{2})/);
  if (m2) return { start: m2[1], end: null };
  // "예산 소진시까지" 같은 텍스트 → 둘 다 null
  return { start: null, end: null };
}

/** 해시태그 문자열을 배열로 변환. */
function parseHashtags(s: string | undefined): string[] {
  if (!s) return [];
  return s
    .split(/[,\u3001]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t.length < 30);
}

/** HTML 태그 제거 (사업 요약을 plain text로). */
function stripHtml(html: string | undefined): string | null {
  if (!html) return null;
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500); // 너무 길면 자름
}

export function normalizeBizinfoRow(row: BizinfoRow): GrantDbRow | null {
  const title = (row.pblancNm ?? "").trim();
  if (!title) return null;

  const externalId = row.pblancId ?? `bizinfo-${title.slice(0, 50)}`;
  const url = row.pblancUrl ?? null;
  const region = inferRegion(row.jrsdInsttNm);
  const category = mapCategory(
    row.pldirSportRealmLclasCodeNm,
    row.pldirSportRealmMlsfcCodeNm,
    title
  );
  const targetTypes = mapTargetTypes(row.trgetNm);
  const dates = splitDateRange(row.reqstBeginEndDe);
  const summary = stripHtml(row.bsnsSumryCn) ?? title;
  const tags = parseHashtags(row.hashtags);

  return {
    external_id: `bizinfo:${externalId}`,
    title,
    summary,
    description: stripHtml(row.bsnsSumryCn),
    organization_name: row.excInsttNm ?? row.jrsdInsttNm ?? null,
    source: "BIZINFO",
    category,
    target_types: targetTypes,
    region,
    amount_min: null,
    amount_max: null,
    application_start: dates.start,
    application_end: dates.end,
    eligibility: { requirements: [] },
    tags,
    url,
    consortium: null,
    raw: row as unknown as Record<string, unknown>,
    fetched_at: new Date().toISOString(),
  };
}

// dbRowToGrant 는 msit.ts 의 것을 재사용한다 (모든 소스가 같은 GrantDbRow 형태로 들어옴).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _ReuseGrantType = Grant; // 타입만 import 유지
