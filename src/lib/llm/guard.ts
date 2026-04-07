import "server-only";

import { serverEnv } from "@/lib/env.server";
import { getDailyCostUsd } from "./metering";
import { DailyLimitExceededError } from "./types";

/**
 * Per-user daily cost guard.
 *
 * Called BEFORE every LLM request to refuse the call when a user has
 * already burned through their day's budget. The limit comes from
 * `LLM_MAX_DAILY_COST_USD_PER_USER` env var (default 2.00) and applies to
 * EVERY user equally for now. Phase 8 will add plan-aware limits (free vs
 * pro vs business).
 *
 * Behavior:
 *   - canSpend({ userId, estimateUsd }) returns void on success.
 *   - Throws `DailyLimitExceededError` when the user has spent
 *     `>= limit` already, OR when the new request's estimated cost would
 *     push them over.
 *   - Route handlers should catch this and return HTTP 429 with the
 *     `{ error, limit, used }` payload below.
 *
 * NOTE: We use the *current* spending plus the request's *estimated* cost
 * for the check. The actual cost (after the call) is logged separately by
 * `metering.recordUsage`. So a single request that exceeds the cap is
 * still allowed if at the time of check the user was below it — we don't
 * try to claw back midstream. Tighter limits would require pre-token-counting
 * which Anthropic doesn't expose synchronously.
 */

export interface CanSpendInput {
  userId: string;
  /**
   * Best-effort upfront estimate. For chat/proposal calls a rough $0.05
   * is conservative enough; pass 0 if you really have no idea (then we
   * just check the historical balance).
   */
  estimateUsd?: number;
}

export interface DailyUsageStatus {
  limitUsd: number;
  usedUsd: number;
  remainingUsd: number;
}

/**
 * Check whether a user can spend more LLM money today. Throws on denial.
 *
 * @throws DailyLimitExceededError when the limit is hit.
 */
export async function canSpend(input: CanSpendInput): Promise<void> {
  const limit = serverEnv().LLM_MAX_DAILY_COST_USD_PER_USER;
  const used = await getDailyCostUsd(input.userId);
  const projected = used + (input.estimateUsd ?? 0);
  if (projected >= limit) {
    throw new DailyLimitExceededError(input.userId, limit, used);
  }
}

/**
 * Read-only variant: returns the current usage status without throwing.
 * Useful for UI that wants to show "X% of daily quota used".
 */
export async function getDailyUsage(
  userId: string
): Promise<DailyUsageStatus> {
  const limit = serverEnv().LLM_MAX_DAILY_COST_USD_PER_USER;
  const used = await getDailyCostUsd(userId);
  return {
    limitUsd: limit,
    usedUsd: used,
    remainingUsd: Math.max(0, limit - used),
  };
}
