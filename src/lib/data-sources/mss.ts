import "server-only";

import type { GrantCategory, UserType } from "@/types/grant";
import type { GrantDbRow } from "./msit";

/**
 * 중소벤처기업부 (MSS) 사업공고 API adapter.
 *
 * Source: https://www.data.go.kr/data/15113297/openapi.do
 * Endpoint: https://apis.data.go.kr/1421000/mssBizService_v2/getbizList_v2
 * Auth:   data.go.kr serviceKey (shared with MSIT — same account)
 *
 * Data shape: XML only (no json mode supported by this endpoint).
 *   <response>
 *     <header><resultCode>00</resultCode><resultMsg>NORMAL_CODE</resultMsg></header>
 *     <body>
 *       <numOfRows>10</numOfRows>
 *       <pageNo>1</pageNo>
 *       <totalCount>2052</totalCount>
 *       <items>
 *         <item>
 *           <itemId>1067009</itemId>
 *           <title><![CDATA[...]]></title>
 *           <dataContents><![CDATA[<p>HTML 본문</p>]]></dataContents>
 *           <applicationStartDate>2026-04-06</applicationStartDate>
 *           <applicationEndDate>2026-04-24</applicationEndDate>
 *           <writerName>이솔아</writerName>
 *           <writerPosition>제조혁신과</writerPosition>
 *           <writerPhone>044-204-7471</writerPhone>
 *           <writerEmail>lsalsa@korea.kr</writerEmail>
 *           <viewUrl><![CDATA[https://www.mss.go.kr/...]]></viewUrl>
 *           <fileName>...</fileName>  // 반복
 *           <fileUrl>...</fileUrl>    // 반복
 *         </item>
 *       </items>
 *     </body>
 *   </response>
 *
 * Daily limit: 100 — very small. Use sparingly: a once-a-day cron is fine,
 * but interactive sync calls should be avoided.
 */

const ENDPOINT =
  "https://apis.data.go.kr/1421000/mssBizService_v2/getbizList_v2";

export interface MssRow {
  itemId?: string;
  title?: string;
  dataContents?: string;
  applicationStartDate?: string;
  applicationEndDate?: string;
  writerName?: string;
  writerPosition?: string;
  writerPhone?: string;
  writerEmail?: string;
  viewUrl?: string;
  /** 첨부 파일 이름 목록 (raw에 그대로 보관). */
  fileNames?: string[];
  fileUrls?: string[];
}

export interface MssFetchOptions {
  serviceKey: string;
  pageNo?: number;
  /** Items per page. The endpoint accepts 1..N (no observed cap). */
  numOfRows?: number;
}

export interface MssPage {
  rows: MssRow[];
  totalCount: number;
  pageNo: number;
  numOfRows: number;
}

/**
 * Fetch one page of MSS announcements (always XML, then parsed).
 */
export async function fetchMssPage(opts: MssFetchOptions): Promise<MssPage> {
  const { serviceKey, pageNo = 1, numOfRows = 100 } = opts;

  const url = new URL(ENDPOINT);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("pageNo", String(pageNo));
  url.searchParams.set("numOfRows", String(numOfRows));

  const res = await fetch(url.toString(), {
    next: { revalidate: 60 * 60 * 6 }, // 6 hour edge cache (daily-refresh source)
    headers: {
      Accept: "application/xml",
      "User-Agent":
        "Mozilla/5.0 (compatible; govgrant-app/1.0; +https://govgrant-app.vercel.app)",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`MSS API ${res.status}: ${text.slice(0, 300)}`);
  }

  const xml = await res.text();

  // API errors come back as XML too — surface them as thrown errors.
  const resultCode = matchOne(xml, /<resultCode>([^<]+)<\/resultCode>/);
  if (resultCode && resultCode !== "00") {
    const resultMsg = matchOne(xml, /<resultMsg>([^<]+)<\/resultMsg>/);
    throw new Error(`MSS API result error ${resultCode}: ${resultMsg ?? "unknown"}`);
  }

  const totalCount =
    parseInt(matchOne(xml, /<totalCount>(\d+)<\/totalCount>/) ?? "0", 10) || 0;
  const reportedPageNo =
    parseInt(matchOne(xml, /<pageNo>(\d+)<\/pageNo>/) ?? String(pageNo), 10) ||
    pageNo;
  const reportedNumOfRows =
    parseInt(
      matchOne(xml, /<numOfRows>(\d+)<\/numOfRows>/) ?? String(numOfRows),
      10
    ) || numOfRows;

  const rows = parseItems(xml);

  return {
    rows,
    totalCount,
    pageNo: reportedPageNo,
    numOfRows: reportedNumOfRows,
  };
}

/**
 * Parse all <item>...</item> blocks out of the response XML.
 *
 * The schema is shallow and predictable, so a tag-by-tag regex extraction
 * is more robust than a full XML parser here — and avoids pulling in a
 * dependency for ~150 lines of work.
 */
function parseItems(xml: string): MssRow[] {
  const rows: MssRow[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml))) {
    const inner = m[1];
    rows.push({
      itemId: extractField(inner, "itemId"),
      title: extractField(inner, "title"),
      dataContents: extractField(inner, "dataContents"),
      applicationStartDate: extractField(inner, "applicationStartDate"),
      applicationEndDate: extractField(inner, "applicationEndDate"),
      writerName: extractField(inner, "writerName"),
      writerPosition: extractField(inner, "writerPosition"),
      writerPhone: extractField(inner, "writerPhone"),
      writerEmail: extractField(inner, "writerEmail"),
      viewUrl: extractField(inner, "viewUrl"),
      fileNames: extractAllFields(inner, "fileName"),
      fileUrls: extractAllFields(inner, "fileUrl"),
    });
  }
  return rows;
}

/** Extract the first occurrence of `<tag>...</tag>` (with optional CDATA). */
function extractField(inner: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`);
  const m = inner.match(re);
  if (!m) return undefined;
  return stripCdata(m[1]).trim() || undefined;
}

/** Extract every occurrence of `<tag>...</tag>` (for repeating fileName/fileUrl). */
function extractAllFields(inner: string, tag: string): string[] {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner))) {
    const v = stripCdata(m[1]).trim();
    if (v) out.push(v);
  }
  return out;
}

function matchOne(xml: string, re: RegExp): string | undefined {
  const m = xml.match(re);
  return m?.[1];
}

function stripCdata(s: string): string {
  return s.replace(/^\s*<!\[CDATA\[/, "").replace(/\]\]>\s*$/, "");
}

// ----------------------------------------------------------------------------
// Normalization
// ----------------------------------------------------------------------------

/**
 * MSS 공고는 거의 모두 중기부 부서가 발행하므로 organization은 단순히
 * "중소벤처기업부"로 묶고, 부서는 description prefix에 둔다.
 */
function inferCategory(title: string, body: string): GrantCategory {
  const t = title + " " + body;
  if (/창업|예비창업|초기창업|이어드림/.test(t)) return "창업지원";
  if (/R&D|연구개발|기술개발|스마트공장|제조데이터/.test(t)) return "R&D";
  if (/정책자금|융자|보증|투자/.test(t)) return "정책자금";
  if (/고용|채용|일자리|인력양성|교육생/.test(t)) return "고용지원";
  if (/수출|해외|글로벌/.test(t)) return "수출지원";
  if (/교육|훈련|아카데미/.test(t)) return "교육훈련";
  if (/컨설팅|자문|진단/.test(t)) return "컨설팅";
  if (/소상공인|자영업/.test(t)) return "정책자금";
  return "기타";
}

function inferTargetTypes(title: string): UserType[] {
  const t = title;
  // 중기부 사업은 기본적으로 SME 대상
  const out = new Set<UserType>(["sme"]);
  if (/연구기관|대학/.test(t)) out.add("research");
  if (/청년|학생|개인|예비/.test(t)) out.add("individual");
  return [...out];
}

/** HTML 본문 → plain text (요약용, 500자 cap). */
function htmlToText(html: string | undefined): string | null {
  if (!html) return null;
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&middot;/g, "·")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500) || null;
}

export function normalizeMssRow(row: MssRow): GrantDbRow | null {
  const title = (row.title ?? "").trim();
  if (!title) return null;

  const externalId = row.itemId ?? `mss-${title.slice(0, 50)}`;
  const summary = htmlToText(row.dataContents) ?? title;
  const category = inferCategory(title, row.dataContents ?? "");
  const targetTypes = inferTargetTypes(title);
  const orgName = row.writerPosition
    ? `중소벤처기업부 ${row.writerPosition}`
    : "중소벤처기업부";

  return {
    external_id: `mss:${externalId}`,
    title,
    summary,
    description: htmlToText(row.dataContents),
    organization_name: orgName,
    source: "MSS",
    category,
    target_types: targetTypes,
    region: "전국",
    amount_min: null,
    amount_max: null,
    application_start: row.applicationStartDate ?? null,
    application_end: row.applicationEndDate ?? null,
    eligibility: { requirements: [] },
    tags: [],
    url: row.viewUrl ?? null,
    consortium: null,
    raw: row as unknown as Record<string, unknown>,
    fetched_at: new Date().toISOString(),
  };
}
