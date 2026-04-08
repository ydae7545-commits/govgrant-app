import "server-only";

import { z } from "zod";
import { getLLM } from "@/lib/llm/router";

/**
 * Phase 6.5: HTML 본문 → 구조화된 grant 메타데이터 추출.
 *
 * 어댑터가 적재한 grants.raw / grants.description / grants.summary에는
 * dataContents (BIZINFO/MSS) 또는 첨부파일 본문이 포함된다. 이걸 LLM에
 * 한 번 넘겨서 정규화된 JSON으로 빼내면 카드 표시·매칭·필터링 모두
 * 정확해진다.
 *
 * 추출하는 필드:
 *   - amountLabel: 사람이 읽기 쉬운 금액 (예: "최대 3억원")
 *   - amountMin / amountMax: 정수 (만원 단위)
 *   - businessAgeMax: 업력 상한 (년)
 *   - employeeMax: 종업원 수 상한
 *   - revenueMax: 매출 상한 (억원)
 *   - requiresResearchInstitute: 기업부설연구소 필수
 *   - requirements: 그 외 자격 요건 텍스트 배열
 *   - tags: 추출된 키워드/분야 (5-10개)
 *
 * 비용: gpt-4o-mini 기준 1건당 약 $0.0005~0.001 (입력 ~2k tokens, 출력 ~300 tokens)
 *      → 1,000건 enrichment 시 $0.5~1
 */

// ----------------------------------------------------------------------------
// LLM 출력 스키마 (zod)
// ----------------------------------------------------------------------------

export const ExtractedGrantSchema = z.object({
  /** 사람이 읽는 금액 표현 ("최대 3억원", "1억원 ~ 5억원", null) */
  amountLabel: z.string().nullable(),
  /** 만원 단위 정수, 모르면 null */
  amountMin: z.number().int().nullable(),
  amountMax: z.number().int().nullable(),
  /** 업력 N년 이하 조건 */
  businessAgeMax: z.number().int().nullable(),
  /** 종업원 N인 이하 */
  employeeMax: z.number().int().nullable(),
  /** 매출액 N억원 이하 */
  revenueMax: z.number().int().nullable(),
  /** 기업부설연구소 보유 필수 여부 */
  requiresResearchInstitute: z.boolean(),
  /** 연구개발전담부서 이상 보유 필수 여부 */
  requiresResearchDepartment: z.boolean(),
  /** 그 외 자격 요건 (각 30자 이내, 최대 10개) */
  requirements: z.array(z.string()).max(10),
  /** 추출된 핵심 키워드/분야 태그 (각 12자 이내, 최대 10개) */
  tags: z.array(z.string()).max(10),
});

export type ExtractedGrant = z.infer<typeof ExtractedGrantSchema>;

// ----------------------------------------------------------------------------
// 프롬프트
// ----------------------------------------------------------------------------

const SYSTEM_PROMPT = `당신은 한국 정부 지원사업·R&D 과제 공고문을 분석하여 구조화된 데이터로 변환하는 정보 추출 전문가입니다.

원칙:
1. 본문에 명시된 정보만 추출합니다. 추측하지 마세요. 없으면 null 또는 false.
2. 금액은 "만원" 단위 정수로 변환합니다.
   - "3억원" → 30000
   - "5천만원" → 5000
   - "1억 5천만원" → 15000
   - "최대 1억원, 평균 5천만원" → amountMin=5000, amountMax=10000
3. 업력/종업원/매출 상한은 정확한 숫자만. "중소기업"이라는 단어만 있고 명시 안 됐으면 null.
4. 기업부설연구소 / 전담부서는 명시적으로 "필수"라고 적힌 경우만 true.
5. requirements는 각 항목 30자 이내, 자격을 한 줄로 요약. (예: "업력 7년 이내", "벤처기업 인증 보유")
6. tags는 본문의 핵심 분야/키워드. 12자 이내, 5-10개. (예: "AI", "스마트팩토리", "수출")
7. 출력은 반드시 지정된 JSON 스키마를 따릅니다. 다른 텍스트 절대 추가 금지.`;

/**
 * 프롬프트의 user 메시지: 공고 본문을 깨끗하게 정리해서 넘긴다.
 */
function buildUserPrompt(args: {
  title: string;
  organization: string | null;
  body: string;
}): string {
  return `다음 정부 지원사업 공고문에서 구조화된 정보를 추출하세요.

공고명: ${args.title}
주관기관: ${args.organization ?? "(미상)"}

본문:
\`\`\`
${args.body}
\`\`\`

위 본문을 분석해서 다음 JSON 스키마에 정확히 맞춰 응답하세요:

{
  "amountLabel": string | null,        // "최대 3억원" 같은 사람이 읽는 표현
  "amountMin": number | null,          // 만원 단위 정수
  "amountMax": number | null,          // 만원 단위 정수
  "businessAgeMax": number | null,     // 업력 N년 이하
  "employeeMax": number | null,        // 종업원 N인 이하
  "revenueMax": number | null,         // 매출액 N억원 이하
  "requiresResearchInstitute": boolean,
  "requiresResearchDepartment": boolean,
  "requirements": string[],            // 자격 요건 (최대 10개, 각 30자 이내)
  "tags": string[]                     // 핵심 키워드 (최대 10개, 각 12자 이내)
}

본문에 정보가 없으면 null 또는 false를 사용하세요. JSON만 출력하고 다른 설명은 하지 마세요.`;
}

// ----------------------------------------------------------------------------
// 메인 함수
// ----------------------------------------------------------------------------

export interface EnrichmentResult {
  ok: true;
  data: ExtractedGrant;
  costUsd: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface EnrichmentSkipped {
  ok: false;
  reason: "body_too_short" | "parse_failed" | "schema_mismatch" | "llm_error";
  message: string;
  costUsd: number;
  model: string;
}

/**
 * 한 건의 grant 본문을 LLM에 넘겨 구조화된 데이터로 변환.
 *
 * 본문이 너무 짧으면 (200자 미만) skip — LLM 비용 낭비 방지.
 *
 * 호출자(/api/admin/enrich-grants)는 system 사용자이므로 LLMCallOptions의
 * userId는 "system:enrich-grants"라는 합성 ID를 사용한다.
 */
export async function extractGrantMetadata(args: {
  title: string;
  organization: string | null;
  body: string;
  /**
   * Override LLM provider. Default = use LLM_DEFAULT_PROVIDER env (anthropic in
   * our setup since OpenAI account has no credit). gpt-4o-mini would be ~5x
   * cheaper per call ($0.15/$0.60 vs $3/$15 per 1M tokens) — top up the
   * OpenAI account and pass "openai" here to save on bulk enrichment.
   */
  preferredProvider?: "anthropic" | "openai";
  /** Synthetic user id for usage_events tracking. */
  userId?: string;
}): Promise<EnrichmentResult | EnrichmentSkipped> {
  const cleanBody = args.body.trim();
  if (cleanBody.length < 200) {
    return {
      ok: false,
      reason: "body_too_short",
      message: `본문 ${cleanBody.length}자 — enrichment 가치 없음`,
      costUsd: 0,
      model: "none",
    };
  }

  // 본문이 너무 길면 잘라서 토큰 폭주 방지. 보통 공고문 핵심은 앞 4000자 안.
  const trimmedBody = cleanBody.slice(0, 4000);

  // preferredProvider가 명시 안 되면 router의 환경변수 기반 default 사용.
  const llm = getLLM(args.preferredProvider);

  let result;
  try {
    result = await llm.complete(
      [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: buildUserPrompt({
            title: args.title,
            organization: args.organization,
            body: trimmedBody,
          }),
        },
      ],
      {
        temperature: 0,
        maxTokens: 800,
        userId: args.userId ?? "system:enrich-grants",
        kind: "grant_enrichment",
      }
    );
  } catch (err) {
    return {
      ok: false,
      reason: "llm_error",
      message: err instanceof Error ? err.message : String(err),
      costUsd: 0,
      model: "unknown",
    };
  }

  // LLM 응답에서 JSON 추출 (모델이 가끔 ```json fence를 붙임)
  const text = result.text.trim();
  const jsonText = stripJsonFence(text);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return {
      ok: false,
      reason: "parse_failed",
      message: `JSON parse failed. Output starts with: ${text.slice(0, 100)}`,
      costUsd: result.costUsd,
      model: result.model,
    };
  }

  const validation = ExtractedGrantSchema.safeParse(parsed);
  if (!validation.success) {
    return {
      ok: false,
      reason: "schema_mismatch",
      message: validation.error.message.slice(0, 200),
      costUsd: result.costUsd,
      model: result.model,
    };
  }

  return {
    ok: true,
    data: validation.data,
    costUsd: result.costUsd,
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}

function stripJsonFence(s: string): string {
  // ```json\n{...}\n``` 또는 ```\n{...}\n``` 패턴 제거
  const fenceRe = /^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/;
  const m = s.match(fenceRe);
  if (m) return m[1].trim();
  return s;
}
