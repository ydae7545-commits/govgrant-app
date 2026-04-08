import "server-only";

import type { GrantCategory, UserType } from "@/types/grant";
import type { GrantDbRow } from "./msit";

/**
 * 복지로 (bokjiro) 복지서비스 API adapter.
 *
 * 두 개의 data.go.kr OpenAPI 를 통합 처리:
 *
 *   1. 중앙부처복지서비스
 *      https://www.data.go.kr/data/15090532/openapi.do
 *      Endpoint: https://apis.data.go.kr/B554287/NationalWelfareInformationsV001/NationalWelfarelistV001
 *      약 360건
 *
 *   2. 지자체복지서비스
 *      https://www.data.go.kr/data/15108347/openapi.do
 *      Endpoint: https://apis.data.go.kr/B554287/LocalGovernmentWelfareInformations/LcgvWelfarelist
 *      약 4,000건
 *
 * 둘 다 data.go.kr 인증키 사용 (DATA_GO_KR_SERVICE_KEY). 응답 형식은
 * 비슷하지만 필드 이름이 약간 다를 수 있어서 adapter 안에서 포맷별
 * normalize. 실제 응답 스키마는 활성화 후 dryRun 으로 확인해서 보정.
 *
 * 카테고리 매핑:
 *   - 생애주기 (임신/출산/영유아/아동/청소년/청년/중장년/노년)
 *   - 가구 (다문화/다자녀/보훈/장애인/한부모/1인가구)
 *   - 분야 (고용/교육/주거/의료/문화/경제/안전)
 *
 * 우리 Grant 스키마와의 매핑:
 *   - grant.category = "복지" 고정 (세부 카테고리는 tags 에 저장)
 *   - grant.targetTypes = ["individual"] (복지는 모두 개인 대상)
 *   - grant.region = 시도 (지자체) 또는 "전국" (중앙)
 *   - grant.amountMin/Max = 지원 금액 (있으면 파싱)
 *
 * ⚠️ 활성화 직후엔 실제 응답 필드명이 이 파일의 interface와 다를 수
 * 있어서, 첫 dryRun 결과를 보고 normalizeXxxRow 를 수정해야 한다.
 * MSIT adapter 에서 이미 여러 번 겪은 패턴.
 */

// ----------------------------------------------------------------------------
// Endpoints
// ----------------------------------------------------------------------------

const CENTRAL_ENDPOINT =
  "https://apis.data.go.kr/B554287/NationalWelfareInformationsV001/NationalWelfarelistV001";
// LocalGovernmentWelfareInformations 는 V001 versioned form 과 unversioned
// 둘 다 관측됨 — 실제 응답 먼저 받은 뒤 고정할 예정.
const LOCAL_ENDPOINT =
  "https://apis.data.go.kr/B554287/LocalGovernmentWelfareInformations/LcgvWelfarelist";

// ----------------------------------------------------------------------------
// 1. 중앙부처복지서비스
// ----------------------------------------------------------------------------

/**
 * 복지로 API 응답 rough shape (data.go.kr XML 기반).
 *
 * 문서상 필드 (활성화 후 실제 응답과 대조 필요):
 *   servId          - 서비스 ID (WLF_xxxx)
 *   servNm          - 서비스 명
 *   jurMnofNm       - 소관 부처명
 *   servDgst        - 서비스 요약
 *   servDtlLink     - 상세 URL
 *   lifeNmArray     - 생애주기 배열 (청년/중장년 등)
 *   intrsThemaArray - 관심 주제 배열
 *   trgterIndvdlArray - 대상자 개별특성 배열
 *   ctpvNm          - 시도명 (지자체 버전에만)
 *   sggNm           - 시군구명 (지자체 버전에만)
 */
export interface BokjiroRow {
  servId?: string;
  servNm?: string;
  jurMnofNm?: string;         // 중앙: 소관 부처
  jurOrgNm?: string;          // 지자체: 소관 기관
  bizChrDeptNm?: string;      // 담당 부서
  servDgst?: string;          // 서비스 요약
  servDtlLink?: string;       // 상세 URL
  lifeNmArray?: string;       // 생애주기 (콤마 구분)
  intrsThemaArray?: string;   // 관심주제
  trgterIndvdlArray?: string; // 대상자 개별특성
  ctpvNm?: string;            // 시도 (지자체)
  sggNm?: string;             // 시군구 (지자체)
  aplyMtdCn?: string;         // 신청 방법
  sprtCycNm?: string;         // 지원 주기
  srvPvsnNm?: string;         // 제공 유형 (현금/현물/서비스)
  lastModYmd?: string;        // 최종 수정일
  [k: string]: unknown;
}

// ----------------------------------------------------------------------------
// 2. Fetch helpers
// ----------------------------------------------------------------------------

export interface BokjiroFetchOptions {
  serviceKey: string;
  pageNo?: number;
  numOfRows?: number;
}

export interface BokjiroPage {
  rows: BokjiroRow[];
  totalCount: number;
  pageNo: number;
  numOfRows: number;
}

/** 중앙부처 버전 */
export async function fetchBokjiroCentralPage(
  opts: BokjiroFetchOptions
): Promise<BokjiroPage> {
  return fetchBokjiroGeneric(CENTRAL_ENDPOINT, opts, "central");
}

/** 지자체 버전 */
export async function fetchBokjiroLocalPage(
  opts: BokjiroFetchOptions
): Promise<BokjiroPage> {
  return fetchBokjiroGeneric(LOCAL_ENDPOINT, opts, "local");
}

async function fetchBokjiroGeneric(
  endpoint: string,
  opts: BokjiroFetchOptions,
  variant: "central" | "local"
): Promise<BokjiroPage> {
  const { serviceKey, pageNo = 1, numOfRows = 100 } = opts;

  const url = new URL(endpoint);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("pageNo", String(pageNo));
  url.searchParams.set("numOfRows", String(numOfRows));
  // 기본 응답은 XML. callTp=L (목록) / D (상세).
  url.searchParams.set("callTp", "L");

  // 파라미터 차이:
  // - central: srchKeyCode 필수 (003 = 서비스명+내용 통합 검색)
  // - local  : srchKeyCode 없음, callTp 만으로 충분
  if (variant === "central") {
    url.searchParams.set("srchKeyCode", "003");
  }

  const res = await fetch(url.toString(), {
    next: { revalidate: 60 * 60 * 12 }, // 복지는 하루 1회 이하 갱신
    headers: {
      Accept: "application/xml",
      "User-Agent":
        "Mozilla/5.0 (compatible; govgrant-app/1.0; +https://govgrant-app.vercel.app)",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Bokjiro API ${res.status}: ${text.slice(0, 300)}`);
  }

  const xml = await res.text();

  // API 에러는 XML envelope 안에 실려 옴
  const resultCode = matchOne(xml, /<resultCode>([^<]+)<\/resultCode>/);
  if (resultCode && resultCode !== "0" && resultCode !== "00") {
    const resultMsg = matchOne(xml, /<resultMsg>([^<]+)<\/resultMsg>/);
    throw new Error(
      `Bokjiro API result error ${resultCode}: ${resultMsg ?? "unknown"}`
    );
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

// ----------------------------------------------------------------------------
// 3. XML parsing (정규식 기반, 외부 의존성 0)
// ----------------------------------------------------------------------------

/**
 * 복지로 API 는 <servList> 또는 <wantedList> 같은 wrapper 안에 항목이
 * 반복되는 구조가 일반적. 이름이 API 별로 약간 달라서 여러 wrapper 를
 * 시도.
 */
function parseItems(xml: string): BokjiroRow[] {
  const rows: BokjiroRow[] = [];

  // 가능한 item 태그 이름들
  const itemTags = ["servList", "wantedList", "item"];

  for (const tag of itemTags) {
    const itemRe = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "g");
    let m: RegExpExecArray | null;
    while ((m = itemRe.exec(xml))) {
      const inner = m[1];
      rows.push({
        servId: extractField(inner, "servId"),
        servNm: extractField(inner, "servNm"),
        jurMnofNm: extractField(inner, "jurMnofNm"),
        jurOrgNm: extractField(inner, "jurOrgNm"),
        bizChrDeptNm: extractField(inner, "bizChrDeptNm"),
        servDgst: extractField(inner, "servDgst"),
        servDtlLink: extractField(inner, "servDtlLink"),
        lifeNmArray: extractField(inner, "lifeNmArray"),
        intrsThemaArray: extractField(inner, "intrsThemaArray"),
        trgterIndvdlArray: extractField(inner, "trgterIndvdlArray"),
        ctpvNm: extractField(inner, "ctpvNm"),
        sggNm: extractField(inner, "sggNm"),
        aplyMtdCn: extractField(inner, "aplyMtdCn"),
        sprtCycNm: extractField(inner, "sprtCycNm"),
        srvPvsnNm: extractField(inner, "srvPvsnNm"),
        lastModYmd: extractField(inner, "lastModYmd"),
      });
    }
    if (rows.length > 0) break; // 한 번이라도 파싱되면 그 태그를 사용
  }

  return rows;
}

function extractField(inner: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`);
  const m = inner.match(re);
  if (!m) return undefined;
  return stripCdata(m[1]).trim() || undefined;
}

function stripCdata(s: string): string {
  return s.replace(/^\s*<!\[CDATA\[/, "").replace(/\]\]>\s*$/, "");
}

function matchOne(xml: string, re: RegExp): string | undefined {
  const m = xml.match(re);
  return m?.[1];
}

// ----------------------------------------------------------------------------
// 4. Normalization
// ----------------------------------------------------------------------------

/** 시도명 정규화 — MSIT/bizinfo 와 동일한 규칙. */
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

function inferRegion(ctpv: string | undefined): string {
  if (!ctpv) return "전국";
  for (const { pat, out } of REGION_PATTERNS) {
    if (pat.test(ctpv)) return out;
  }
  return "전국";
}

/**
 * 복지 카테고리는 기본 "복지" 하나로 묶고, 세부 분류는 tags 에 넣어서
 * 검색/매칭에 활용한다. 생애주기와 분야는 모두 태그화.
 */
function buildTags(row: BokjiroRow): string[] {
  const tags = new Set<string>();

  const splitComma = (s: string | undefined) =>
    (s ?? "")
      .split(/[,\u3001·]/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && t.length < 20);

  splitComma(row.lifeNmArray).forEach((t) => tags.add(t));
  splitComma(row.intrsThemaArray).forEach((t) => tags.add(t));
  splitComma(row.trgterIndvdlArray).forEach((t) => tags.add(t));

  if (row.ctpvNm) tags.add(row.ctpvNm);
  if (row.sggNm) tags.add(row.sggNm);
  if (row.srvPvsnNm) tags.add(row.srvPvsnNm); // 현금/현물/서비스

  return [...tags].slice(0, 15);
}

/**
 * 대상 유형: 복지는 기본 individual. 일부 기업 대상 복지(예: 고용 지원)
 * 는 제목이나 태그에 "기업/사업자" 키워드가 있으면 sme 추가.
 */
function inferTargetTypes(row: BokjiroRow): UserType[] {
  const out = new Set<UserType>(["individual"]);
  const combined = `${row.servNm ?? ""} ${row.intrsThemaArray ?? ""}`;
  if (/기업|사업자|소상공인|자영/.test(combined)) out.add("sme");
  return [...out];
}

/**
 * 복지 서비스를 grant 스키마로 변환.
 *
 * Normalize 방식 (소스 = central/local):
 *   - source 값이 "BOKJIRO_CENTRAL" 또는 "BOKJIRO_LOCAL" 로 구분
 *   - 전부 category = "복지"
 *   - region: 지자체는 ctpvNm, 중앙은 "전국"
 *   - external_id: servId 그대로 + 접두어
 */
export function normalizeBokjiroRow(
  row: BokjiroRow,
  variant: "central" | "local"
): GrantDbRow | null {
  const title = (row.servNm ?? "").trim();
  if (!title) return null;

  const externalId =
    row.servId ?? `bokjiro-${variant}-${title.slice(0, 50)}`;
  const source = variant === "central" ? "BOKJIRO_CENTRAL" : "BOKJIRO_LOCAL";

  const organization =
    row.jurMnofNm ?? row.jurOrgNm ?? (variant === "central" ? "정부" : "지자체");
  const description = row.servDgst ?? null;
  const region = variant === "local" ? inferRegion(row.ctpvNm) : "전국";
  const tags = buildTags(row);
  const targetTypes = inferTargetTypes(row);

  return {
    external_id: `${source}:${externalId}`,
    title,
    summary: row.servDgst ?? title,
    description,
    organization_name: organization,
    source,
    category: "복지" as GrantCategory,
    target_types: targetTypes,
    region,
    amount_min: null,
    amount_max: null,
    application_start: null,
    application_end: null,
    eligibility: { requirements: [] },
    tags,
    url: row.servDtlLink ?? null,
    consortium: null,
    raw: row as unknown as Record<string, unknown>,
    fetched_at: new Date().toISOString(),
  };
}
