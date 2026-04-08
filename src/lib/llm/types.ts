import "server-only";

/**
 * Provider-agnostic LLM types.
 *
 * The shape mirrors the common ground between Anthropic Claude and OpenAI
 * GPT so the rest of the app can call `getLLM().complete(...)` without
 * caring which underlying SDK runs the request. Provider-specific features
 * (e.g. Claude's prompt caching, OpenAI's function calling) intentionally
 * stay out of this layer — Phase 3 (proposal generator) will use simple
 * text completions only.
 *
 * Anything that touches a network call lives here, so this module imports
 * `server-only` to fail the build if a client component tries to use it.
 */

export type LLMRole = "system" | "user" | "assistant";

export interface LLMMessage {
  role: LLMRole;
  /**
   * Plain text content. Multimodal content (images, files) is not supported
   * at this layer; if a provider needs them, extend this type with a tagged
   * union later.
   */
  content: string;
}

export interface LLMCallOptions {
  /**
   * Override the default model. When omitted, each provider falls back to
   * the model name from `LLM_DEFAULT_MODEL_*` env vars.
   */
  model?: string;
  /** 0 (deterministic) ~ 1 (most creative). Defaults to 0.7. */
  temperature?: number;
  /** Maximum tokens the model is allowed to generate. Defaults to 4096. */
  maxTokens?: number;
  /**
   * Required: who initiated this request. Used for usage metering and the
   * daily cost guard. Pass the Supabase auth user id when running inside an
   * authenticated request, or a synthetic id (e.g. `"system:cron"`) for
   * background jobs.
   */
  userId: string;
  /**
   * What kind of work this call is doing. Lets us aggregate cost by feature
   * later. Add new values as new features ship.
   */
  kind:
    | "chat"
    | "proposal_generate"
    | "proposal_section"
    | "proposal_refine"
    | "embedding_query"
    | "grant_enrichment"
    | "test";
  /** Optional metadata recorded with the usage event. */
  metadata?: Record<string, unknown>;
}

export interface LLMResult {
  /** Concatenated text the model produced. */
  text: string;
  /** Tokens the model consumed from the prompt. */
  inputTokens: number;
  /** Tokens the model produced. */
  outputTokens: number;
  /** Computed dollar cost using `cost.ts` rates. */
  costUsd: number;
  provider: "anthropic" | "openai";
  model: string;
  /**
   * Why generation stopped. Providers normalize their values into a small
   * shared vocabulary; unknown values are passed through as `"other"`.
   */
  finishReason: "stop" | "length" | "content_filter" | "error" | "other";
}

/**
 * Stream chunk emitted while a `stream()` call is in progress. Each chunk
 * carries only the new text delta — accumulating the full output is the
 * caller's responsibility (or `finalize()` after the stream ends).
 */
export interface LLMStreamChunk {
  delta: string;
}

/**
 * The async iterable returned by `stream()`. Iterating yields chunks; once
 * the iteration finishes, callers can `await iter.finalize()` to get the
 * accumulated `LLMResult` (with token counts + cost) without re-counting
 * tokens themselves.
 */
export interface LLMStream extends AsyncIterable<LLMStreamChunk> {
  /**
   * Resolves after the stream is fully consumed. Returns the same shape as
   * `complete()` would have, including final usage and cost. Calling this
   * before iterating throws.
   */
  finalize(): Promise<LLMResult>;
}

export interface LLMProvider {
  name: "anthropic" | "openai";
  /** One-shot completion. Awaits the full response and returns it. */
  complete(messages: LLMMessage[], opts: LLMCallOptions): Promise<LLMResult>;
  /** Streaming completion. Returns immediately; consume via `for await`. */
  stream(messages: LLMMessage[], opts: LLMCallOptions): LLMStream;
  /**
   * (Optional) Embed a batch of texts. Used by Phase 4 (RAG) for grant
   * vector indexing. Anthropic does not currently expose a public embedding
   * endpoint so the AnthropicProvider leaves this undefined and the router
   * falls back to OpenAI for embeddings.
   */
  embed?(
    texts: string[],
    opts: { userId: string; model?: string }
  ): Promise<{
    vectors: number[][];
    inputTokens: number;
    costUsd: number;
    provider: "openai";
    model: string;
  }>;
}

/**
 * Error subclass thrown when a provider call fails. Captures the underlying
 * SDK error so debugging is easier in `usage_events.metadata`.
 */
export class LLMError extends Error {
  constructor(
    message: string,
    public provider: "anthropic" | "openai",
    public cause?: unknown
  ) {
    super(message);
    this.name = "LLMError";
  }
}

/**
 * Error thrown by `guard.canSpend` when a user has exceeded their daily
 * budget. Route handlers should map this to HTTP 429.
 */
export class DailyLimitExceededError extends Error {
  constructor(
    public userId: string,
    public limitUsd: number,
    public usedUsd: number
  ) {
    super(
      `Daily LLM cost limit reached for user ${userId}: used $${usedUsd.toFixed(
        4
      )} of $${limitUsd.toFixed(2)} cap.`
    );
    this.name = "DailyLimitExceededError";
  }
}
