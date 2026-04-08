import "server-only";

/**
 * National Tax Service (국세청) 사업자등록 상태조회 API.
 *
 * Source: 국세청_사업자등록정보 진위확인 및 상태조회 서비스
 * Base:   https://api.odcloud.kr/api
 * Status: POST /nts-businessman/v1/status?serviceKey=...
 *
 * Use this to verify a business registration number (사업자등록번호) is real
 * and currently active. Returns a status code that lets us tell whether
 * the business is 계속사업자 / 휴업자 / 폐업자.
 *
 * Daily limit: 1,000,000 — effectively unlimited for our use case.
 *
 * Phase 6 use case: when a user adds an organization to their account,
 * they can paste their 사업자등록번호 and we will:
 *   1. Validate it's a real number recognized by NTS
 *   2. Check if it's still operating (b_stt_cd === "01")
 *   3. Store the verified status on the organization
 *   4. Use that status in match-score to deprioritize/exclude grants the
 *      business is no longer eligible for (e.g. 폐업자는 R&D 과제 신청 불가)
 *
 * Privacy note: 사업자등록번호 is not strictly secret (it's printed on
 * receipts) but we still treat it carefully — store on the organization
 * row only, never log it, and let the user clear it from their profile.
 */

const ENDPOINT = "https://api.odcloud.kr/api/nts-businessman/v1/status";

/** Raw shape returned by the NTS API for one business number. */
export interface NtsBusinessStatusRaw {
  b_no: string;
  /** Korean label e.g. "계속사업자", "휴업자", "폐업자", "국세청에 등록되지 않은 사업자등록번호입니다." */
  b_stt: string | null;
  /** Numeric code: "01" 계속사업자, "02" 휴업자, "03" 폐업자 */
  b_stt_cd: string | null;
  /** 과세유형 라벨 (e.g. "부가가치세 일반과세자") */
  tax_type: string | null;
  tax_type_cd: string | null;
  /** 폐업일 yyyymmdd, only present for 폐업자 */
  end_dt: string | null;
  utcc_yn: string | null;
  tax_type_change_dt: string | null;
  invoice_apply_dt: string | null;
  rbf_tax_type: string | null;
  rbf_tax_type_cd: string | null;
}

export interface NtsLookupResult {
  /** "OK" if the API call succeeded; otherwise the API's error code. */
  statusCode: string;
  matchCount: number;
  requestCount: number;
  data: NtsBusinessStatusRaw[];
}

/**
 * App-friendly summary of one business number lookup. This is what we
 * persist on the organization row and what the UI renders.
 */
export interface BusinessStatusSummary {
  /** Normalized 10-digit number with no hyphens. */
  bNo: string;
  /** True only if recognized AND currently operating (계속사업자). */
  active: boolean;
  /** Raw status code: "01" 계속사업자 / "02" 휴업자 / "03" 폐업자 / null if unknown. */
  statusCode: "01" | "02" | "03" | null;
  /** Korean status label as returned by NTS, for display. */
  statusLabel: string;
  /** 과세유형 (부가세 일반과세자, 간이과세자 등) */
  taxType: string | null;
  /** Closure date if 폐업자, ISO yyyy-mm-dd. */
  closedAt: string | null;
  /** Last verification timestamp. */
  verifiedAt: string;
}

/**
 * Strip non-digit characters from a 사업자등록번호 input string. The user
 * may type "123-45-67890" or "1234567890" — both should be accepted.
 * Returns null if the result isn't exactly 10 digits.
 */
export function normalizeBusinessNo(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length !== 10) return null;
  return digits;
}

/**
 * Look up one or more business registration numbers via NTS.
 * Throws on network/auth errors. Returns the parsed envelope.
 */
export async function lookupBusinessStatus(opts: {
  serviceKey: string;
  bNos: string[];
}): Promise<NtsLookupResult> {
  const { serviceKey, bNos } = opts;
  if (bNos.length === 0) {
    return { statusCode: "OK", matchCount: 0, requestCount: 0, data: [] };
  }

  const url = `${ENDPOINT}?serviceKey=${encodeURIComponent(serviceKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      // odcloud.kr/api gateway is friendlier than the older apis.data.go.kr
      // host but we still pin a UA to avoid future bot blocks.
      "User-Agent":
        "Mozilla/5.0 (compatible; govgrant-app/1.0; +https://govgrant-app.vercel.app)",
    },
    body: JSON.stringify({ b_no: bNos }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`NTS API ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    status_code?: string;
    match_cnt?: number;
    request_cnt?: number;
    data?: NtsBusinessStatusRaw[];
  };

  return {
    statusCode: json.status_code ?? "UNKNOWN",
    matchCount: Number(json.match_cnt ?? 0),
    requestCount: Number(json.request_cnt ?? 0),
    data: Array.isArray(json.data) ? json.data : [],
  };
}

/**
 * High-level helper: verify a single 사업자등록번호 and return a clean
 * summary the UI can show.
 */
export async function verifyBusinessNo(opts: {
  serviceKey: string;
  input: string;
}): Promise<{ ok: true; summary: BusinessStatusSummary } | { ok: false; reason: string }> {
  const bNo = normalizeBusinessNo(opts.input);
  if (!bNo) {
    return { ok: false, reason: "사업자등록번호는 10자리 숫자여야 합니다." };
  }

  let result: NtsLookupResult;
  try {
    result = await lookupBusinessStatus({ serviceKey: opts.serviceKey, bNos: [bNo] });
  } catch (err) {
    return {
      ok: false,
      reason: `국세청 API 호출 실패: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const row = result.data[0];
  if (!row) {
    return { ok: false, reason: "응답에 데이터가 없습니다." };
  }

  // NTS uses a special label for unknown numbers — surface as "not found"
  // rather than treating it as a valid record.
  if (
    !row.b_stt_cd ||
    /등록되지 않은/.test(row.b_stt ?? "") ||
    row.b_stt_cd === ""
  ) {
    return {
      ok: false,
      reason: "국세청에 등록되지 않은 사업자등록번호입니다.",
    };
  }

  const code = row.b_stt_cd as "01" | "02" | "03";
  return {
    ok: true,
    summary: {
      bNo,
      active: code === "01",
      statusCode: code,
      statusLabel: row.b_stt ?? "",
      taxType: row.tax_type ?? null,
      closedAt: formatYmd(row.end_dt),
      verifiedAt: new Date().toISOString(),
    },
  };
}

/** Convert NTS yyyymmdd to ISO yyyy-mm-dd, or null. */
function formatYmd(s: string | null): string | null {
  if (!s) return null;
  const cleaned = s.replace(/\D/g, "");
  if (cleaned.length !== 8) return null;
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}`;
}
