import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  getLLM,
  canSpend,
  withFallback,
  DailyLimitExceededError,
  LLMError,
  type LLMMessage,
} from "@/lib/llm";
import { featureFlags } from "@/lib/env";

/**
 * POST /api/llm/complete — Internal test endpoint for LLM provider sanity
 * checks. NOT a public API.
 *
 * Security model:
 *   - Requires an authenticated Supabase session (server-side getUser()).
 *   - Uses the authenticated user's id for the daily cost guard and
 *     usage_events row, so anyone abusing this endpoint hits their own
 *     daily limit immediately.
 *   - Disabled entirely unless either NEXT_PUBLIC_USE_LLM_CHAT or
 *     NEXT_PUBLIC_USE_PROPOSAL_AI flag is true (= dev / pilot environment).
 *     This prevents accidental cost exposure on production until Phase 3
 *     intentionally turns it on.
 *
 * Request body (JSON):
 *   {
 *     "messages": [{ "role": "user", "content": "Hello" }],
 *     "provider"?: "anthropic" | "openai",
 *     "model"?: string,
 *     "temperature"?: number,
 *     "maxTokens"?: number
 *   }
 *
 * Response:
 *   200 { text, inputTokens, outputTokens, costUsd, provider, model }
 *   401 { error: "unauthorized" }
 *   403 { error: "feature_disabled" }
 *   429 { error: "daily_limit_reached", limit, used }
 *   400 { error: "invalid_request", details: ZodError }
 *   500 { error: "llm_error", message }
 *
 * This route is used by:
 *   - Phase 2: developer smoke testing during local dev
 *   - Phase 3: not directly — proposal/chat endpoints have their own
 *     handlers that call getLLM() with proposal-specific prompts
 */

const RequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string().min(1),
      })
    )
    .min(1),
  provider: z.enum(["anthropic", "openai"]).optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(1).optional(),
  maxTokens: z.number().int().positive().max(8192).optional(),
  /**
   * When true, retries with the fallback provider on LLMError. Default
   * false to keep test calls deterministic.
   */
  withFallback: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  // Feature flag gate
  if (!featureFlags.useLlmChat && !featureFlags.useProposalAi) {
    return NextResponse.json(
      { error: "feature_disabled" },
      { status: 403 }
    );
  }

  // Authenticate
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Parse + validate
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_request", details: "Invalid JSON body" },
      { status: 400 }
    );
  }
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", details: parsed.error.format() },
      { status: 400 }
    );
  }

  // Daily cost guard. Estimate $0.05 to be safe — actual cost is logged
  // later by recordUsage().
  try {
    await canSpend({ userId: user.id, estimateUsd: 0.05 });
  } catch (err) {
    if (err instanceof DailyLimitExceededError) {
      return NextResponse.json(
        {
          error: "daily_limit_reached",
          limit: err.limitUsd,
          used: err.usedUsd,
        },
        { status: 429 }
      );
    }
    throw err;
  }

  // Run the LLM call
  try {
    const messages: LLMMessage[] = parsed.data.messages;
    const callOpts = {
      model: parsed.data.model,
      temperature: parsed.data.temperature,
      maxTokens: parsed.data.maxTokens,
      userId: user.id,
      kind: "test" as const,
      metadata: { route: "/api/llm/complete" },
    };

    const result = parsed.data.withFallback
      ? await withFallback(parsed.data.provider, (provider) =>
          provider.complete(messages, callOpts)
        )
      : await getLLM(parsed.data.provider).complete(messages, callOpts);

    return NextResponse.json({
      text: result.text,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: result.costUsd,
      provider: result.provider,
      model: result.model,
      finishReason: result.finishReason,
    });
  } catch (err) {
    if (err instanceof LLMError) {
      return NextResponse.json(
        {
          error: "llm_error",
          provider: err.provider,
          message: err.message,
        },
        { status: 502 }
      );
    }
    return NextResponse.json(
      {
        error: "internal_error",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
