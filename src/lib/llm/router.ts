import "server-only";

import { serverEnv } from "@/lib/env.server";
import { AnthropicProvider } from "./providers/anthropic";
import { OpenAIProvider } from "./providers/openai";
import type { LLMProvider } from "./types";

/**
 * Provider router.
 *
 * - `getLLM(preferred?)` returns the configured provider, or the default
 *   from `LLM_DEFAULT_PROVIDER` env var. If the requested provider has no
 *   API key configured, falls through to the fallback provider, then to
 *   any working one.
 *
 * - `getEmbeddingProvider()` always returns OpenAI (Anthropic doesn't
 *   expose a public embedding endpoint), with an explicit error when the
 *   OpenAI key is missing.
 *
 * - `withFallback(preferred, fn)` runs `fn` against the preferred provider
 *   and on `LLMError` retries with the fallback provider. Use this for
 *   user-facing endpoints where reliability matters more than which
 *   model handles the request.
 *
 * Provider instances are cached at module scope so we don't pay the
 * SDK constructor cost on every call.
 */

let anthropicInstance: AnthropicProvider | null = null;
let openaiInstance: OpenAIProvider | null = null;

function getAnthropic(): AnthropicProvider {
  if (anthropicInstance) return anthropicInstance;
  anthropicInstance = new AnthropicProvider();
  return anthropicInstance;
}

function getOpenAI(): OpenAIProvider {
  if (openaiInstance) return openaiInstance;
  openaiInstance = new OpenAIProvider();
  return openaiInstance;
}

function hasAnthropicKey(): boolean {
  return !!process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.length > 0;
}

function hasOpenAIKey(): boolean {
  return !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.length > 0;
}

/**
 * Returns the LLM provider that should handle a given call.
 *
 * Resolution order:
 *   1. `preferred` argument if its key is configured
 *   2. `LLM_DEFAULT_PROVIDER` env var if its key is configured
 *   3. `LLM_FALLBACK_PROVIDER` env var if its key is configured
 *   4. Any provider that has a key
 *   5. Throw if neither has a key
 */
export function getLLM(preferred?: "anthropic" | "openai"): LLMProvider {
  const env = serverEnv();
  const candidates: Array<"anthropic" | "openai"> = [];
  if (preferred) candidates.push(preferred);
  candidates.push(env.LLM_DEFAULT_PROVIDER);
  candidates.push(env.LLM_FALLBACK_PROVIDER);
  // Final safety net — try whichever has a key
  candidates.push("anthropic", "openai");

  for (const c of candidates) {
    if (c === "anthropic" && hasAnthropicKey()) return getAnthropic();
    if (c === "openai" && hasOpenAIKey()) return getOpenAI();
  }
  throw new Error(
    "No LLM provider has an API key configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY."
  );
}

/**
 * Always returns the OpenAI provider for embeddings since Anthropic does
 * not expose a public embedding endpoint.
 */
export function getEmbeddingProvider(): OpenAIProvider {
  if (!hasOpenAIKey()) {
    throw new Error(
      "OPENAI_API_KEY is required for embeddings (Anthropic does not yet expose an embedding API)."
    );
  }
  return getOpenAI();
}

/**
 * Run an LLM operation with automatic fallback. If the preferred provider
 * throws an LLMError (network failure, rate limit, etc.), the same
 * operation is retried against the fallback provider.
 *
 * The caller's `fn` receives the chosen provider so it can call
 * `provider.complete(...)` or `provider.stream(...)` directly.
 *
 * Use cases:
 *   - User-facing chat where ANY answer is better than no answer
 *   - Background jobs that should never silently fail
 *
 * Don't use it when:
 *   - The fallback model would produce wildly different output quality
 *     (e.g. proposal generation should retry with the same provider, not
 *     fall back to gpt-4o-mini and degrade silently)
 */
export async function withFallback<T>(
  preferred: "anthropic" | "openai" | undefined,
  fn: (provider: LLMProvider) => Promise<T>
): Promise<T> {
  const env = serverEnv();
  const primary = preferred ?? env.LLM_DEFAULT_PROVIDER;
  const fallback = env.LLM_FALLBACK_PROVIDER;
  try {
    return await fn(getLLM(primary));
  } catch (err) {
    if (primary === fallback) throw err;
    console.warn(
      `[govgrant-llm:router] primary ${primary} failed, retrying with ${fallback}`,
      err
    );
    return fn(getLLM(fallback));
  }
}
