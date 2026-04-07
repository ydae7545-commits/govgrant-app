import "server-only";

import OpenAI from "openai";
import { serverEnv } from "@/lib/env.server";
import { calculateCost } from "../cost";
import { recordUsage } from "../metering";
import {
  LLMError,
  type LLMCallOptions,
  type LLMMessage,
  type LLMProvider,
  type LLMResult,
  type LLMStream,
  type LLMStreamChunk,
} from "../types";

/**
 * OpenAI provider — implements LLMProvider against the `openai` SDK.
 *
 * Used for two purposes:
 *   1. Chat fallback when Anthropic is down or returns an error.
 *   2. Embeddings (Anthropic doesn't expose a public embedding API), so
 *      Phase 4 RAG always routes through this provider's `embed()`.
 *
 * Notes vs Anthropic:
 *   - OpenAI's chat API uses {role, content}[] directly with no separate
 *     system field, so we pass our LLMMessage[] through unchanged.
 *   - max_tokens is OPTIONAL — we default to 4096 to match Anthropic.
 *   - finish_reason values: "stop", "length", "tool_calls",
 *     "content_filter", "function_call". We map them to our shared set.
 *   - Streaming returns `usage` only on the LAST chunk when
 *     `stream_options: { include_usage: true }` is set, so we always opt
 *     in.
 */

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (client) return client;
  client = new OpenAI({
    apiKey: serverEnv().OPENAI_API_KEY,
  });
  return client;
}

function mapFinishReason(
  reason: string | null | undefined
): LLMResult["finishReason"] {
  switch (reason) {
    case "stop":
      return "stop";
    case "length":
      return "length";
    case "content_filter":
      return "content_filter";
    case "tool_calls":
    case "function_call":
      return "other";
    default:
      return reason ? "other" : "stop";
  }
}

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai" as const;

  async complete(
    messages: LLMMessage[],
    opts: LLMCallOptions
  ): Promise<LLMResult> {
    const model = opts.model ?? serverEnv().LLM_DEFAULT_MODEL_OPENAI;
    try {
      const response = await getClient().chat.completions.create({
        model,
        max_tokens: opts.maxTokens ?? 4096,
        temperature: opts.temperature ?? 0.7,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      });

      const choice = response.choices[0];
      const text = choice?.message?.content ?? "";
      const inputTokens = response.usage?.prompt_tokens ?? 0;
      const outputTokens = response.usage?.completion_tokens ?? 0;
      const costUsd = calculateCost("openai", model, inputTokens, outputTokens);

      const result: LLMResult = {
        text,
        inputTokens,
        outputTokens,
        costUsd,
        provider: "openai",
        model,
        finishReason: mapFinishReason(choice?.finish_reason),
      };

      void recordUsage({
        userId: opts.userId,
        kind: opts.kind,
        result,
        metadata: opts.metadata,
      });

      return result;
    } catch (err) {
      throw new LLMError(
        `OpenAI complete failed: ${err instanceof Error ? err.message : String(err)}`,
        "openai",
        err
      );
    }
  }

  stream(messages: LLMMessage[], opts: LLMCallOptions): LLMStream {
    const model = opts.model ?? serverEnv().LLM_DEFAULT_MODEL_OPENAI;

    let accumulatedText = "";
    let inputTokens = 0;
    let outputTokens = 0;
    let finishReason: LLMResult["finishReason"] = "stop";
    let finalized = false;
    let finalizeResolve: ((result: LLMResult) => void) | null = null;
    let finalizeReject: ((err: unknown) => void) | null = null;
    const finalizePromise = new Promise<LLMResult>((resolve, reject) => {
      finalizeResolve = resolve;
      finalizeReject = reject;
    });

    // We can't await the SDK call here because we need to return the
    // LLMStream synchronously. Instead, the iterator function awaits the
    // create() call inside its first iteration.
    const iterate = async function* (): AsyncIterableIterator<LLMStreamChunk> {
      try {
        const sdkStream = await getClient().chat.completions.create({
          model,
          max_tokens: opts.maxTokens ?? 4096,
          temperature: opts.temperature ?? 0.7,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          stream: true,
          stream_options: { include_usage: true },
        });

        for await (const chunk of sdkStream) {
          const choice = chunk.choices[0];
          const delta = choice?.delta?.content;
          if (delta) {
            accumulatedText += delta;
            yield { delta };
          }
          if (choice?.finish_reason) {
            finishReason = mapFinishReason(choice.finish_reason);
          }
          // Usage arrives on the final chunk when stream_options.include_usage
          if (chunk.usage) {
            inputTokens = chunk.usage.prompt_tokens ?? inputTokens;
            outputTokens = chunk.usage.completion_tokens ?? outputTokens;
          }
        }

        const costUsd = calculateCost(
          "openai",
          model,
          inputTokens,
          outputTokens
        );
        const result: LLMResult = {
          text: accumulatedText,
          inputTokens,
          outputTokens,
          costUsd,
          provider: "openai",
          model,
          finishReason,
        };
        finalized = true;
        finalizeResolve?.(result);
        void recordUsage({
          userId: opts.userId,
          kind: opts.kind,
          result,
          metadata: opts.metadata,
        });
      } catch (err) {
        const wrapped = new LLMError(
          `OpenAI stream failed: ${err instanceof Error ? err.message : String(err)}`,
          "openai",
          err
        );
        finalizeReject?.(wrapped);
        throw wrapped;
      }
    };

    const iterator = iterate();
    return {
      [Symbol.asyncIterator]() {
        return iterator;
      },
      async finalize() {
        if (!finalized) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          for await (const _ of iterator) {
            // discard remaining chunks
          }
        }
        return finalizePromise;
      },
    };
  }

  /**
   * OpenAI embedding endpoint. Used by Phase 4 (vector search).
   * Default model is `text-embedding-3-small` (1536 dimensions, very cheap).
   */
  async embed(
    texts: string[],
    opts: { userId: string; model?: string }
  ): Promise<{
    vectors: number[][];
    inputTokens: number;
    costUsd: number;
    provider: "openai";
    model: string;
  }> {
    const model = opts.model ?? "text-embedding-3-small";
    try {
      const response = await getClient().embeddings.create({
        model,
        input: texts,
      });
      const vectors = response.data.map((d) => d.embedding);
      const inputTokens = response.usage?.prompt_tokens ?? 0;
      const costUsd = calculateCost("openai", model, inputTokens, 0);

      // Record as a usage event (no output tokens for embeddings).
      void recordUsage({
        userId: opts.userId,
        kind: "embedding_query",
        result: {
          text: "",
          inputTokens,
          outputTokens: 0,
          costUsd,
          provider: "openai",
          model,
          finishReason: "stop",
        },
        metadata: { batchSize: texts.length },
      });

      return { vectors, inputTokens, costUsd, provider: "openai", model };
    } catch (err) {
      throw new LLMError(
        `OpenAI embed failed: ${err instanceof Error ? err.message : String(err)}`,
        "openai",
        err
      );
    }
  }
}
