import "server-only";

/**
 * Per-model price table.
 *
 * Prices are USD **per 1 million tokens** as of April 2026. Update when
 * Anthropic or OpenAI publishes new pricing — these numbers drive
 * `LLMResult.costUsd` and the daily guard.
 *
 * Sources:
 *   - Anthropic: https://docs.anthropic.com/en/docs/about-claude/models
 *   - OpenAI:    https://openai.com/api/pricing/
 *
 * If a model name is not in the table, we fall back to a conservative
 * "expensive" rate so cost is overestimated rather than underestimated.
 * That keeps the daily guard safe even when a new model name slips through.
 */

export interface ModelPrice {
  /** USD per 1M input tokens. */
  inputPerMTokens: number;
  /** USD per 1M output tokens. */
  outputPerMTokens: number;
}

/**
 * Anthropic Claude pricing.
 * Sonnet/Haiku/Opus tiers — pick the model that matches your latency/cost target.
 */
const ANTHROPIC_PRICES: Record<string, ModelPrice> = {
  // Sonnet 4.5 (default for proposal generation: best quality/cost balance)
  "claude-sonnet-4-5": { inputPerMTokens: 3.0, outputPerMTokens: 15.0 },
  "claude-sonnet-4": { inputPerMTokens: 3.0, outputPerMTokens: 15.0 },
  // Opus 4.x (highest quality, ~5x more expensive than Sonnet)
  "claude-opus-4-6": { inputPerMTokens: 15.0, outputPerMTokens: 75.0 },
  "claude-opus-4": { inputPerMTokens: 15.0, outputPerMTokens: 75.0 },
  // Haiku 4.x (cheapest, fastest)
  "claude-haiku-4-5": { inputPerMTokens: 0.25, outputPerMTokens: 1.25 },
  // Legacy 3.x kept for backwards compat with older configs
  "claude-3-5-sonnet-20241022": { inputPerMTokens: 3.0, outputPerMTokens: 15.0 },
  "claude-3-5-haiku-20241022": { inputPerMTokens: 0.8, outputPerMTokens: 4.0 },
};

/**
 * OpenAI GPT pricing.
 * gpt-4o-mini is the cheapest reasonable model and is used as a fallback
 * for chat. text-embedding-3-small powers Phase 4 vector search.
 */
const OPENAI_PRICES: Record<string, ModelPrice> = {
  // gpt-4o-mini (default fallback)
  "gpt-4o-mini": { inputPerMTokens: 0.15, outputPerMTokens: 0.6 },
  "gpt-4o": { inputPerMTokens: 2.5, outputPerMTokens: 10.0 },
  "gpt-4-turbo": { inputPerMTokens: 10.0, outputPerMTokens: 30.0 },
  // Embedding models — output cost is 0 since they don't generate tokens.
  "text-embedding-3-small": { inputPerMTokens: 0.02, outputPerMTokens: 0 },
  "text-embedding-3-large": { inputPerMTokens: 0.13, outputPerMTokens: 0 },
};

/** Conservative fallback used for unknown models. */
const FALLBACK_PRICE: ModelPrice = {
  inputPerMTokens: 15.0,
  outputPerMTokens: 75.0,
};

export function getModelPrice(
  provider: "anthropic" | "openai",
  model: string
): ModelPrice {
  const table = provider === "anthropic" ? ANTHROPIC_PRICES : OPENAI_PRICES;
  return table[model] ?? FALLBACK_PRICE;
}

/**
 * Calculate the dollar cost for a single completion call.
 *
 * The math is straightforward: tokens × (price / 1_000_000). Result is
 * rounded to 6 decimal places (microcents) which is enough granularity
 * for any realistic per-call cost.
 */
export function calculateCost(
  provider: "anthropic" | "openai",
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const price = getModelPrice(provider, model);
  const cost =
    (inputTokens * price.inputPerMTokens +
      outputTokens * price.outputPerMTokens) /
    1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
