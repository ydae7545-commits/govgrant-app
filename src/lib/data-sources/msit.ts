import "server-only";

import type { Grant, GrantCategory, UserType } from "@/types/grant";

/**
 * 과학기술정보통신부_사업공고 OpenAPI adapter.
 *
 * Source: https://www.data.go.kr/data/15074634/openapi.do
 * Endpoint: https://apis.data.go.kr/1721000/msitannouncementinfo/businessAnnouncMentList
 *
 * Data is updated once per day on the data.go.kr side, so a daily cron is
 * sufficient. Each call returns at most ~1000 rows; we paginate via pageNo.
 *
 * The API returns R&D 사업공고 records with sparse structured fields:
 *   - 공고명, URL, 부서, 담당자, 등록일, 첨부파일
 * Most of the discriminating signals our app needs (category, region,
 * 자격 요건, 금액) are NOT in the API and have to be inferred from the
 * title text. We do best-effort heuristic extraction in `normalize()` and
 * stash the original payload in `Grant.raw` so a future LLM-based enrichment
 * pass (Phase 6.5) can re-derive better values.
 */

const ENDPOINT =
  "https://apis.data.go.kr/1721000/msitannouncementinfo/businessAnnouncMentList";

/** Shape of a single row in the API response, after JSON normalization. */
export interface MsitRow {
  bsnsAncmId?: string | number;
  bsnsAncmNm?: string;        // 공고명
  bsnsAncmUrl?: string;       // 상세 URL
  drtDeptNm?: string;         // 담당 부서
  cntcManNm?: string;         // 담당자
  cntcManTelno?: string;      // 담당자 연락처
  rgsDt?: string;             // 등록일 yyyy-mm-dd
  // 첨부파일 관련 (사용 안 함, raw로만 보관)
  [k: string]: unknown;
}

export interface MsitFetchOptions {
  serviceKey: string;
  pageNo?: number;
  numOfRows?: number;
  /** "json" | "xml" — defaults to json. Sent to the API as `returnType`. */
  returnType?: "json" | "xml";
}

export interface MsitPage {
  rows: MsitRow[];
  totalCount: number;
  pageNo: number;
  numOfRows: number;
}

/**
 * Fetch a single page from the MSIT API.
 *
 * data.go.kr endpoints typically wrap responses as:
 * {
 *   "response": {
 *     "header": { "resultCode": "00", "resultMsg": "NORMAL SERVICE." },
 *     "body":   { "items": [...], "totalCount": N, "pageNo": 1, "numOfRows": 10 }
 *   }
 * }
 * but item shape varies by API. We tolerate a few common arrangements.
 */
export async function fetchMsitPage(
  opts: MsitFetchOptions
): Promise<MsitPage> {
  const { serviceKey, pageNo = 1, numOfRows = 100, returnType = "json" } = opts;

  // Per the data.go.kr spec for this API:
  //   ServiceKey  (capital S, K) — auth key
  //   pageNo
  //   numOfRows
  //   returnType  ("json" | "xml", default xml if omitted)
  //
  // Note: data.go.kr's own preview button uses lowercase `serviceKey`. The
  // spec table in 활용신청 상세기능정보 says `ServiceKey`. Both appear to be
  // accepted in practice for many endpoints, but we use the documented form
  // to match the spec exactly.
  const url = new URL(ENDPOINT);
  url.searchParams.set("ServiceKey", serviceKey);
  url.searchParams.set("pageNo", String(pageNo));
  url.searchParams.set("numOfRows", String(numOfRows));
  url.searchParams.set("returnType", returnType);

  const res = await fetch(url.toString(), {
    // The API only refreshes once a day, so a 6-hour edge cache is safe.
    next: { revalidate: 60 * 60 * 6 },
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`MSIT API ${res.status}: ${text.slice(0, 300)}`);
  }

  const text = await res.text();
  // Some data.go.kr endpoints quietly fall back to XML even when type=json
  // is requested. Detect that and bail with a clearer message.
  if (text.trimStart().startsWith("<")) {
    throw new Error(
      `MSIT API returned XML instead of JSON. First chars: ${text.slice(0, 200)}`
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `MSIT API JSON parse failed: ${(err as Error).message} — body: ${text.slice(0, 200)}`
    );
  }

  return extractPage(json, pageNo, numOfRows);
}

function extractPage(
  json: unknown,
  pageNo: number,
  numOfRows: number
): MsitPage {
  const j = json as Record<string, unknown>;
  // Common envelope: { response: { header, body: { items, totalCount, ... } } }
  const response = (j.response ?? j) as Record<string, unknown> | undefined;
  const body = (response?.body ?? response) as Record<string, unknown> | undefined;
  if (!body) {
    return { rows: [], totalCount: 0, pageNo, numOfRows };
  }

  let items = body.items as unknown;
  // items can be: { item: [...] } | { item: {...} } | [...] | undefined
  if (items && typeof items === "object" && !Array.isArray(items)) {
    items = (items as Record<string, unknown>).item;
  }
  if (items && !Array.isArray(items) && typeof items === "object") {
    items = [items];
  }
  const rows: MsitRow[] = Array.isArray(items) ? (items as MsitRow[]) : [];

  return {
    rows,
    totalCount: Number(body.totalCount ?? rows.length) || rows.length,
    pageNo: Number(body.pageNo ?? pageNo) || pageNo,
    numOfRows: Number(body.numOfRows ?? numOfRows) || numOfRows,
  };
}

// ----------------------------------------------------------------------------
// Heuristic enrichment — turn a sparse API row into our internal Grant shape.
// ----------------------------------------------------------------------------

/**
 * Cheap keyword categorizer. Phase 6.5 will replace this with an LLM pass that
 * reads the title + 첨부 파일 본문 and emits a richer category + 자격 요건.
 */
function inferCategory(title: string): GrantCategory {
  const t = title;
  if (/창업|예비창업|초기창업|창업패키지/.test(t)) return "창업지원";
  if (/R&D|연구개발|기술개발|연구과제|개발사업/i.test(t)) return "R&D";
  if (/정책자금|융자|보증/.test(t)) return "정책자금";
  if (/고용|채용|일자리/.test(t)) return "고용지원";
  if (/수출|해외|글로벌/.test(t)) return "수출지원";
  if (/교육|훈련|아카데미/.test(t)) return "교육훈련";
  if (/컨설팅|자문/.test(t)) return "컨설팅";
  return "R&D"; // MSIT 사업공고는 대부분 R&D 성격
}

/**
 * Most MSIT 공고 are open to SMEs and research institutes; individuals are
 * rarely the direct target unless the title hints at it.
 */
function inferTargetTypes(title: string): UserType[] {
  const t = title;
  const out = new Set<UserType>(["sme", "research"]);
  if (/개인|청년|예비|학생/.test(t)) out.add("individual");
  return [...out];
}

/** Pull date-like substrings from a Korean title. Defensive only. */
function extractDateRange(title: string): { start?: string; end?: string } {
  // e.g. "(2026.04.10 ~ 2026.05.10)" or "신청기간: 2026-04-10~2026-05-10"
  const pattern =
    /(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})\s*[~-]\s*(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/;
  const m = title.match(pattern);
  if (!m) return {};
  const pad = (s: string) => s.padStart(2, "0");
  return {
    start: `${m[1]}-${pad(m[2])}-${pad(m[3])}`,
    end: `${m[4]}-${pad(m[5])}-${pad(m[6])}`,
  };
}

/**
 * Map an MSIT API row into our internal Grant shape, plus the database row
 * shape we'll upsert into `public.grants`. The two shapes diverge slightly
 * (camelCase vs snake_case) — the DB row is what `sync-grants` writes.
 */
export function normalizeMsitRow(row: MsitRow): GrantDbRow | null {
  const title = (row.bsnsAncmNm ?? "").toString().trim();
  if (!title) return null;

  const externalId = String(
    row.bsnsAncmId ?? `msit-${hashString(title + (row.rgsDt ?? ""))}`
  );

  const url = (row.bsnsAncmUrl ?? "").toString().trim() || null;
  const orgName = (row.drtDeptNm ?? "과학기술정보통신부").toString().trim();
  const registeredAt = (row.rgsDt ?? "").toString().slice(0, 10) || null;

  const dates = extractDateRange(title);
  const category = inferCategory(title);
  const targetTypes = inferTargetTypes(title);

  return {
    external_id: `msit:${externalId}`,
    title,
    summary: title, // 요약 필드가 없어서 일단 title을 재사용
    description: null,
    organization_name: orgName,
    source: "MSIT",
    category,
    target_types: targetTypes,
    region: "전국",
    amount_min: null,
    amount_max: null,
    application_start: dates.start ?? registeredAt,
    application_end: dates.end ?? null,
    eligibility: { requirements: [] },
    tags: [],
    url,
    consortium: null,
    raw: row as unknown as Record<string, unknown>,
    fetched_at: new Date().toISOString(),
  };
}

/** DB row shape that maps 1:1 to public.grants columns. */
export interface GrantDbRow {
  external_id: string;
  title: string;
  summary: string | null;
  description: string | null;
  organization_name: string | null;
  source: string;
  category: GrantCategory;
  target_types: UserType[];
  region: string;
  amount_min: number | null;
  amount_max: number | null;
  application_start: string | null;
  application_end: string | null;
  eligibility: Record<string, unknown>;
  tags: string[];
  url: string | null;
  consortium: Record<string, unknown> | null;
  raw: Record<string, unknown>;
  fetched_at: string;
}

/**
 * Convert a DB row back to the runtime `Grant` shape used everywhere in the
 * frontend. Used by the grants repository when reading from Supabase.
 */
export function dbRowToGrant(row: GrantDbRow & { id: string }): Grant {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary ?? row.title,
    description: row.description ?? "",
    organization: row.organization_name ?? "",
    source: row.source,
    category: row.category,
    targetTypes: row.target_types,
    region: row.region,
    amountMin: row.amount_min ?? 0,
    amountMax: row.amount_max ?? 0,
    applicationStart: row.application_start ?? "",
    applicationEnd: row.application_end ?? "",
    eligibility:
      (row.eligibility as unknown as Grant["eligibility"]) ?? {
        requirements: [],
      },
    tags: row.tags ?? [],
    url: row.url ?? "",
    consortium: (row.consortium as Grant["consortium"]) ?? undefined,
  };
}

/** Tiny non-cryptographic hash for synthetic external_id fallback. */
function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}
