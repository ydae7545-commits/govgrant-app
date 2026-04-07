import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { LLMResult } from "./types";

/**
 * Usage metering — appends a row to `public.usage_events` for every LLM
 * call. Used by the daily guard (`guard.ts`) and Phase 8 plan-aware cost
 * limits.
 *
 * We use the service_role admin client because:
 *   1. The user's auth context might not be available (e.g. server-side
 *      cron jobs).
 *   2. RLS only allows users to *read* their own usage_events; inserts are
 *      restricted to service_role.
 *
 * Inserts are intentionally fire-and-forget — if logging fails, we don't
 * want to block the user from getting their LLM response. The error is
 * surfaced via `console.error` for debugging instead.
 *
 * Schema reminder (`supabase/migrations/20260410000000_phase1_core_schema.sql`):
 *   usage_events (
 *     id bigserial primary key,
 *     user_id uuid not null,
 *     kind text not null,
 *     provider text,
 *     model text,
 *     input_tokens int,
 *     output_tokens int,
 *     cost_usd numeric(10, 6),
 *     metadata jsonb,
 *     created_at timestamptz
 *   )
 */

export interface RecordUsageInput {
  userId: string;
  kind: string;
  result: LLMResult;
  metadata?: Record<string, unknown>;
}

/**
 * Insert one usage event. Returns nothing — fire-and-forget.
 *
 * NOTE: This function does NOT throw on Supabase errors so that LLM calls
 * succeed even when metering is broken. We log errors to console with a
 * stable prefix so they're greppable.
 */
export async function recordUsage(input: RecordUsageInput): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("usage_events").insert({
      user_id: input.userId,
      kind: input.kind,
      provider: input.result.provider,
      model: input.result.model,
      input_tokens: input.result.inputTokens,
      output_tokens: input.result.outputTokens,
      cost_usd: input.result.costUsd,
      metadata: input.metadata ?? null,
    });
    if (error) {
      console.error("[govgrant-llm:metering]", error);
    }
  } catch (err) {
    console.error("[govgrant-llm:metering]", err);
  }
}

/**
 * Sum of `cost_usd` from `usage_events` for one user since UTC midnight.
 * Returns `0` on any error (fail-open) so a temporary Supabase outage
 * doesn't accidentally lock users out of LLM features. The trade-off is
 * acceptable because the daily limit is a soft cost cap, not a security
 * boundary.
 */
export async function getDailyCostUsd(userId: string): Promise<number> {
  try {
    const supabase = createAdminClient();
    // Today's UTC midnight as ISO. Postgres comparison is lexicographic on
    // ISO strings so this works for `created_at >= today`.
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const sinceIso = todayStart.toISOString();

    const { data, error } = await supabase
      .from("usage_events")
      .select("cost_usd")
      .eq("user_id", userId)
      .gte("created_at", sinceIso);

    if (error) {
      console.error("[govgrant-llm:metering:dailyCost]", error);
      return 0;
    }
    if (!data || data.length === 0) return 0;

    let total = 0;
    for (const row of data) {
      const v = (row as { cost_usd: number | string | null }).cost_usd;
      if (v == null) continue;
      total += typeof v === "string" ? parseFloat(v) : v;
    }
    return total;
  } catch (err) {
    console.error("[govgrant-llm:metering:dailyCost]", err);
    return 0;
  }
}
