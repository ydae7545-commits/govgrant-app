import "server-only";

import JSZip from "jszip";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { serverEnv } from "@/lib/env.server";
import { ExtractedGrantSchema, type ExtractedGrant } from "./extract";

/**
 * Phase B: 첨부 파일(.pdf, .hwpx) 파싱으로 enrichment 심화.
 *
 * Phase 6.5 extract.ts 는 grants.description / summary HTML만 분석하는데,
 * 대부분의 공고에서 정확한 금액과 정량 자격(업력/매출/연구소 필수 여부)은
 * HTML 본문에 없고 첨부 공고문(.pdf / .hwpx / .hwp)에만 있다. 이 모듈은:
 *
 *   1. grants.raw에 저장된 첨부 URL 목록에서 파싱 가능한 파일 하나를 고름
 *      (우선순위: .pdf > .hwpx > .hwp 포기)
 *   2. 파일을 메모리에 다운로드
 *   3. PDF는 Claude Sonnet 4.5 의 native document input으로 그대로 전달
 *      .hwpx는 ZIP → section XML 텍스트 추출 → LLM에 text로 전달
 *   4. LLM이 ExtractedGrantSchema 형식의 JSON을 반환
 *   5. extract.ts 와 동일한 결과 구조로 반환 (호출자는 똑같이 사용)
 *
 * 제한:
 *   - .hwp (binary)는 파싱 안 함. 다행히 MSIT/MSS/BIZINFO 대부분이 .hwpx나
 *     .pdf 를 함께 제공해서 실용적으로는 크게 문제 없음.
 *   - 파일 크기 상한: 5 MB. 더 큰 파일은 skip (Claude 비용 + latency 이슈).
 *   - Claude PDF input은 페이지 수에 비례해 비용 증가. 장문 공고는 많이 나옴.
 *
 * 비용:
 *   - PDF 5-10 페이지: ~$0.02 (Sonnet 4.5)
 *   - .hwpx 텍스트 추출 후 LLM 호출: ~$0.01
 */

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const DOWNLOAD_TIMEOUT_MS = 20_000;

// ----------------------------------------------------------------------------
// 1. 첨부 URL 추출: 각 source 별로 raw 객체 형태가 달라서 여기서 통일
// ----------------------------------------------------------------------------

export interface AttachmentCandidate {
  fileName: string;
  fileUrl: string;
  extension: "pdf" | "hwpx" | "hwp" | "odt" | "zip" | "other";
}

/**
 * grants.raw에서 첨부 파일 목록을 추출한다.
 *
 * - BIZINFO: raw.fileNm / raw.flpthNm (공고문 URL은 flpthNm인데 이건 이미지)
 *            실제로는 pblancUrl 페이지에 파일 링크가 있는 구조라 API 응답만으로는
 *            직접 첨부 파일에 접근하기 어려움. 다만 raw.fileNm / fileUrl 필드가
 *            있는 경우가 있어 최대한 가져옴.
 * - MSIT:    raw.files = [{ file: { fileName, fileUrl } }, ...] — 2단 wrap
 * - MSS:     raw.fileNames[], raw.fileUrls[] — 배열 두 개 (parseItems에서 합침)
 */
export function extractAttachments(
  source: string,
  raw: Record<string, unknown> | null | undefined
): AttachmentCandidate[] {
  if (!raw) return [];
  const candidates: AttachmentCandidate[] = [];

  if (source === "MSIT") {
    // raw.files = [{ file: { fileName, fileUrl } }, ...]
    const files = raw.files;
    if (Array.isArray(files)) {
      for (const entry of files) {
        const wrapped = (entry as { file?: { fileName?: string; fileUrl?: string } })?.file;
        if (wrapped?.fileName && wrapped?.fileUrl) {
          candidates.push(toCandidate(wrapped.fileName, wrapped.fileUrl));
        }
      }
    }
  } else if (source === "MSS") {
    // fileNames / fileUrls 병렬 배열 (mss.ts parseItems 출력)
    const names = (raw.fileNames as string[] | undefined) ?? [];
    const urls = (raw.fileUrls as string[] | undefined) ?? [];
    for (let i = 0; i < Math.min(names.length, urls.length); i++) {
      candidates.push(toCandidate(names[i], urls[i]));
    }
  } else if (source === "BIZINFO") {
    // BIZINFO API 응답은 fileNm(단일 문자열, @로 join), 이미지는 flpthNm
    // 파일명만 있고 직접 URL이 없어서 대부분 비어 있다.
    // pblancUrl 페이지를 스크레이핑하면 실제 링크 나오지만 그건 후속 단계.
    const fileNm = raw.fileNm;
    if (typeof fileNm === "string" && fileNm.length > 0) {
      // BIZINFO 는 직접 URL 없음. 향후 pblancUrl HTML 스크레이핑으로 보강.
    }
  }

  return candidates;
}

function toCandidate(fileName: string, fileUrl: string): AttachmentCandidate {
  const lower = fileName.toLowerCase();
  let ext: AttachmentCandidate["extension"] = "other";
  if (lower.endsWith(".pdf")) ext = "pdf";
  else if (lower.endsWith(".hwpx")) ext = "hwpx";
  else if (lower.endsWith(".hwp")) ext = "hwp";
  else if (lower.endsWith(".odt")) ext = "odt";
  else if (lower.endsWith(".zip")) ext = "zip";
  return { fileName, fileUrl, extension: ext };
}

/**
 * 첨부 목록에서 파싱 가능한 "최선의" 하나를 고른다.
 *
 * 우선순위:
 *   1. .pdf (Claude native input, 가장 품질 좋음)
 *   2. .hwpx (XML 파싱 후 텍스트 전달)
 *   3. 없음
 *
 * .hwp (binary) / .odt / .zip은 현재 skip. 붙임 파일 (예: "별첨.zip")는
 * 보통 서식이라 메인 공고문에 비해 가치 낮음 — fileName에 "공고"/"안내"가
 * 들어간 항목을 우선한다.
 */
export function chooseBestAttachment(
  candidates: AttachmentCandidate[]
): AttachmentCandidate | null {
  if (candidates.length === 0) return null;

  const keyWords = /공고|안내|모집|지원사업/;

  const isMain = (c: AttachmentCandidate) => keyWords.test(c.fileName);

  // PDF 우선
  const pdfMain = candidates.find((c) => c.extension === "pdf" && isMain(c));
  if (pdfMain) return pdfMain;
  const pdfAny = candidates.find((c) => c.extension === "pdf");
  if (pdfAny) return pdfAny;

  // 그 다음 hwpx
  const hwpxMain = candidates.find(
    (c) => c.extension === "hwpx" && isMain(c)
  );
  if (hwpxMain) return hwpxMain;
  const hwpxAny = candidates.find((c) => c.extension === "hwpx");
  if (hwpxAny) return hwpxAny;

  return null;
}

// ----------------------------------------------------------------------------
// 2. 다운로드
// ----------------------------------------------------------------------------

export interface DownloadedFile {
  bytes: Uint8Array;
  contentType: string;
  sizeBytes: number;
}

export async function downloadAttachment(
  url: string
): Promise<DownloadedFile> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      signal: controller.signal,
      headers: {
        // 한국 정부 사이트들은 기본 User-Agent 차단하는 경우가 있다.
        "User-Agent":
          "Mozilla/5.0 (compatible; govgrant-app/1.0; +https://govgrant-app.vercel.app)",
      },
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error(`download failed: ${res.status} ${res.statusText}`);
  }

  const contentLength = Number(res.headers.get("content-length") ?? 0);
  if (contentLength > MAX_FILE_BYTES) {
    throw new Error(`file too large: ${contentLength} bytes`);
  }

  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_FILE_BYTES) {
    throw new Error(`file too large after read: ${buf.byteLength} bytes`);
  }

  return {
    bytes: buf,
    contentType: res.headers.get("content-type") ?? "application/octet-stream",
    sizeBytes: buf.byteLength,
  };
}

// ----------------------------------------------------------------------------
// 3. .hwpx 텍스트 추출
// ----------------------------------------------------------------------------

/**
 * .hwpx 는 ZIP 아카이브이고 내부 구조는:
 *   Contents/section0.xml, section1.xml, ... — 본문 섹션
 *   Contents/header.xml                    — 문서 메타데이터
 *   META-INF/manifest.xml
 *
 * section*.xml은 OpenXML 비슷한 구조로 <hp:t>...</hp:t> 태그에 실제 텍스트가
 * 들어 있다. 정규식으로 모든 <hp:t> 내용을 뽑아 순서대로 이어붙이면 거의
 * 완벽한 plain text가 나온다.
 */
export async function extractHwpxText(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);

  // section0.xml, section1.xml ... 순서대로 정렬
  const sectionFiles = Object.keys(zip.files)
    .filter((name) => /Contents\/section\d+\.xml$/i.test(name))
    .sort();

  if (sectionFiles.length === 0) {
    throw new Error("no Contents/section*.xml found — not a valid .hwpx?");
  }

  const parts: string[] = [];
  for (const name of sectionFiles) {
    const entry = zip.file(name);
    if (!entry) continue;
    const xml = await entry.async("string");
    const re = /<hp:t[^>]*>([\s\S]*?)<\/hp:t>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml))) {
      const text = unescapeXml(m[1]);
      if (text.trim()) parts.push(text);
    }
  }

  // 너무 많은 공백/줄바꿈 정리
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

// ----------------------------------------------------------------------------
// 4. LLM 호출 — PDF는 native document, hwpx는 텍스트
// ----------------------------------------------------------------------------

const SYSTEM_PROMPT = `당신은 한국 정부 지원사업·R&D 과제 공고문을 분석하여 구조화된 데이터로 변환하는 정보 추출 전문가입니다.

원칙:
1. 공고문에 명시된 정보만 추출합니다. 추측 금지. 없으면 null 또는 false.
2. 금액은 "만원" 단위 정수로 변환합니다.
   - "3억원" → 30000
   - "5천만원" → 5000
   - "1억 5천만원" → 15000
   - "최대 1억원, 평균 5천만원" → amountMin=5000, amountMax=10000
3. 업력/종업원/매출 상한은 공고문에 정확한 숫자가 있을 때만. "중소기업"
   단어만 있고 구체 숫자 없으면 null.
4. 기업부설연구소 / 전담부서는 "필수", "의무" 같은 표현이 있을 때만 true.
5. requirements는 각 항목 30자 이내, 자격을 한 줄로 요약.
6. tags는 공고의 핵심 분야/키워드 5~10개, 각 12자 이내.
7. 출력은 지정된 JSON 스키마만. 다른 텍스트 절대 추가 금지. \`\`\`json fence도 금지.`;

const USER_PROMPT_INSTRUCTIONS = `다음 JSON 스키마에 정확히 맞춰 응답하세요:

{
  "amountLabel": string | null,
  "amountMin": number | null,
  "amountMax": number | null,
  "businessAgeMax": number | null,
  "employeeMax": number | null,
  "revenueMax": number | null,
  "requiresResearchInstitute": boolean,
  "requiresResearchDepartment": boolean,
  "requirements": string[],
  "tags": string[]
}`;

let anthropicClient: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (anthropicClient) return anthropicClient;
  anthropicClient = new Anthropic({ apiKey: serverEnv().ANTHROPIC_API_KEY });
  return anthropicClient;
}

export interface AttachmentEnrichmentResult {
  ok: true;
  data: ExtractedGrant;
  costUsd: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  source: "pdf" | "hwpx";
  attachmentName: string;
}

export interface AttachmentEnrichmentSkipped {
  ok: false;
  reason:
    | "no_attachment"
    | "download_failed"
    | "too_large"
    | "parse_failed"
    | "llm_error"
    | "schema_mismatch"
    | "json_parse_failed";
  message: string;
  costUsd: number;
}

/** Claude Sonnet 4.5 input/output 단가 (1M tokens 기준). */
const SONNET_PRICE = { input: 3.0, output: 15.0 };

function costUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * SONNET_PRICE.input +
    (outputTokens / 1_000_000) * SONNET_PRICE.output
  );
}

/**
 * 한 건의 grant에 대해 첨부 파일 기반 enrichment 실행.
 */
export async function enrichFromAttachment(args: {
  title: string;
  organization: string | null;
  source: string;
  raw: Record<string, unknown> | null;
}): Promise<AttachmentEnrichmentResult | AttachmentEnrichmentSkipped> {
  // 1. 첨부 선정
  const attachments = extractAttachments(args.source, args.raw);
  const best = chooseBestAttachment(attachments);
  if (!best) {
    return {
      ok: false,
      reason: "no_attachment",
      message: `no parsable attachment (pdf or hwpx) for source=${args.source}`,
      costUsd: 0,
    };
  }

  // 2. 다운로드
  let downloaded: DownloadedFile;
  try {
    downloaded = await downloadAttachment(best.fileUrl);
  } catch (err) {
    return {
      ok: false,
      reason: (err as Error).message.includes("too large")
        ? "too_large"
        : "download_failed",
      message: `${best.fileName}: ${(err as Error).message}`,
      costUsd: 0,
    };
  }

  // 3. LLM 호출 (포맷별 분기)
  const anthropic = getAnthropic();
  const model = "claude-sonnet-4-5";
  const userPrefix = `공고명: ${args.title}\n주관기관: ${args.organization ?? "(미상)"}\n\n아래 첨부된 공고문을 분석하세요.`;

  let msg;
  try {
    if (best.extension === "pdf") {
      const base64 = Buffer.from(downloaded.bytes).toString("base64");
      msg = await anthropic.messages.create({
        model,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: base64,
                },
              },
              { type: "text", text: `${userPrefix}\n\n${USER_PROMPT_INSTRUCTIONS}` },
            ],
          },
        ],
      });
    } else if (best.extension === "hwpx") {
      let text: string;
      try {
        text = await extractHwpxText(downloaded.bytes);
      } catch (err) {
        return {
          ok: false,
          reason: "parse_failed",
          message: `hwpx parse: ${(err as Error).message}`,
          costUsd: 0,
        };
      }
      // 너무 길면 앞 8000자만 (공고문 핵심은 앞에 있음)
      const trimmed = text.slice(0, 8000);
      msg = await anthropic.messages.create({
        model,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `${userPrefix}\n\n공고문 본문:\n\`\`\`\n${trimmed}\n\`\`\`\n\n${USER_PROMPT_INSTRUCTIONS}`,
          },
        ],
      });
    } else {
      return {
        ok: false,
        reason: "no_attachment",
        message: `unsupported extension: ${best.extension}`,
        costUsd: 0,
      };
    }
  } catch (err) {
    return {
      ok: false,
      reason: "llm_error",
      message: err instanceof Error ? err.message : String(err),
      costUsd: 0,
    };
  }

  const inputTokens = msg.usage.input_tokens;
  const outputTokens = msg.usage.output_tokens;
  const cost = costUsd(inputTokens, outputTokens);

  // 4. 응답 파싱
  const firstBlock = msg.content[0];
  if (!firstBlock || firstBlock.type !== "text") {
    return {
      ok: false,
      reason: "llm_error",
      message: "no text block in Claude response",
      costUsd: cost,
    };
  }

  const text = firstBlock.text.trim();
  const jsonText = text
    .replace(/^```(?:json)?\s*\n?/, "")
    .replace(/\n?```\s*$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return {
      ok: false,
      reason: "json_parse_failed",
      message: `JSON parse failed. Output: ${text.slice(0, 150)}`,
      costUsd: cost,
    };
  }

  const validation = ExtractedGrantSchema.safeParse(parsed);
  if (!validation.success) {
    return {
      ok: false,
      reason: "schema_mismatch",
      message: validation.error.message.slice(0, 200),
      costUsd: cost,
    };
  }

  return {
    ok: true,
    data: validation.data,
    costUsd: cost,
    model,
    inputTokens,
    outputTokens,
    source: best.extension as "pdf" | "hwpx",
    attachmentName: best.fileName,
  };
}

// Re-export so callers can use a single import.
export { ExtractedGrantSchema };
export type { ExtractedGrant };

// Keep z from being tree-shaken unused warning
void z;
