import "server-only";

/**
 * LLM module entry point.
 *
 * Re-exports the public surface so consumers can do:
 *
 *   import { getLLM, withFallback, canSpend } from "@/lib/llm";
 *
 * instead of importing from individual files. The actual implementations
 * stay in their own modules so they're easy to test and replace.
 *
 * Anything imported from this module is server-only — every sub-module
 * declares `import "server-only"` at the top, so trying to use these from
 * a client component fails the build with a clear error.
 */

export {
  getLLM,
  getEmbeddingProvider,
  withFallback,
} from "./router";

export {
  canSpend,
  getDailyUsage,
  type CanSpendInput,
  type DailyUsageStatus,
} from "./guard";

export {
  recordUsage,
  getDailyCostUsd,
  type RecordUsageInput,
} from "./metering";

export {
  calculateCost,
  getModelPrice,
  type ModelPrice,
} from "./cost";

export {
  LLMError,
  DailyLimitExceededError,
  type LLMRole,
  type LLMMessage,
  type LLMCallOptions,
  type LLMResult,
  type LLMStreamChunk,
  type LLMStream,
  type LLMProvider,
} from "./types";
