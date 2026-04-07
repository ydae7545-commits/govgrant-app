import "server-only";

import Anthropic from "@anthropic-ai/sdk";
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
 * Anthropic Claude provider — implements LLMProvider against
 * `@anthropic-ai/sdk`.
 *
 * Notes on Claude's API quirks vs the abstract interface:
 *   - Claude separates `system` from `messages`. The shared LLMMessage
 *     allows a `system` role anywhere in the array, so we partition it
 *     out and concatenate any system messages into a single `system`
 *     prompt before sending.
 *   - `max_tokens` is REQUIRED by Claude (unlike OpenAI). We default to
 *     4096 if the caller didn't specify.
 *   - Streaming uses `client.messages.stream()` which returns a typed
 *     event stream. We bridge that into our `LLMStream` shape.
 *   - Claude does not (yet) expose a public embedding endpoint. The
 *     `embed` method is intentionally undefined; the router falls back
 *     to OpenAI for embeddings.
 */

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (client) return client;
  client = new Anthropic({
    apiKey: serverEnv().ANTHROPIC_API_KEY,
  });
  return client;
}

/**
 * Split shared LLMMessage[] into Claude's expected shape:
 *   - `system`: concatenated text from any role:"system" messages
 *   - `messages`: only user/assistant alternation
 */
function partitionMessages(messages: LLMMessage[]): {
  system: string | undefined;
  conversation: Array<{ role: "user" | "assistant"; content: string }>;
} {
  const sysParts: string[] = [];
  const conversation: Array<{ role: "user" | "assistant"; content: string }> =
    [];
  for (const m of messages) {
    if (m.role === "system") {
      sysParts.push(m.content);
    } else {
      conversation.push({ role: m.role, content: m.content });
    }
  }
  return {
    system: sysParts.length > 0 ? sysParts.join("\n\n") : undefined,
    conversation,
  };
}

/**
 * Map Claude's stop_reason vocabulary to our shared LLMResult.finishReason.
 */
function mapFinishReason(
  reason: string | null | undefined
): LLMResult["finishReason"] {
  switch (reason) {
    case "end_turn":
      return "stop";
    case "max_tokens":
      return "length";
    case "stop_sequence":
      return "stop";
    case "refusal":
      return "content_filter";
    default:
      return reason ? "other" : "stop";
  }
}

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic" as const;

  async complete(
    messages: LLMMessage[],
    opts: LLMCallOptions
  ): Promise<LLMResult> {
    const model = opts.model ?? serverEnv().LLM_DEFAULT_MODEL_ANTHROPIC;
    const { system, conversation } = partitionMessages(messages);
    try {
      const response = await getClient().messages.create({
        model,
        max_tokens: opts.maxTokens ?? 4096,
        temperature: opts.temperature ?? 0.7,
        system,
        messages: conversation,
      });

      // Concatenate text blocks. Claude responses can technically include
      // tool_use / thinking blocks, but for chat/proposal text generation
      // we expect only `text` blocks.
      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");

      const inputTokens = response.usage.input_tokens;
      const outputTokens = response.usage.output_tokens;
      const costUsd = calculateCost(
        "anthropic",
        model,
        inputTokens,
        outputTokens
      );

      const result: LLMResult = {
        text,
        inputTokens,
        outputTokens,
        costUsd,
        provider: "anthropic",
        model,
        finishReason: mapFinishReason(response.stop_reason),
      };

      // Fire-and-forget metering. Don't await — we don't want a slow
      // Supabase write to add latency to the user's response.
      void recordUsage({
        userId: opts.userId,
        kind: opts.kind,
        result,
        metadata: opts.metadata,
      });

      return result;
    } catch (err) {
      throw new LLMError(
        `Anthropic complete failed: ${err instanceof Error ? err.message : String(err)}`,
        "anthropic",
        err
      );
    }
  }

  stream(messages: LLMMessage[], opts: LLMCallOptions): LLMStream {
    const model = opts.model ?? serverEnv().LLM_DEFAULT_MODEL_ANTHROPIC;
    const { system, conversation } = partitionMessages(messages);

    // We need to expose `finalize()` separately from the iterator. The
    // pattern: open the SDK stream once, fan-out chunks via an internal
    // generator, accumulate text + final usage, then resolve the
    // finalize() promise after the for-await loop ends.
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

    const sdkStream = getClient().messages.stream({
      model,
      max_tokens: opts.maxTokens ?? 4096,
      temperature: opts.temperature ?? 0.7,
      system,
      messages: conversation,
    });

    async function* iterate(): AsyncIterableIterator<LLMStreamChunk> {
      try {
        for await (const event of sdkStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            const delta = event.delta.text;
            accumulatedText += delta;
            yield { delta };
          } else if (event.type === "message_delta") {
            // Claude sends running output token counts here. The full
            // input_tokens count arrives in `message_start`.
            outputTokens = event.usage?.output_tokens ?? outputTokens;
            finishReason = mapFinishReason(event.delta.stop_reason);
          } else if (event.type === "message_start") {
            inputTokens = event.message.usage.input_tokens;
          }
        }
        // Stream complete. Compute cost and resolve the finalize promise.
        const costUsd = calculateCost(
          "anthropic",
          model,
          inputTokens,
          outputTokens
        );
        const result: LLMResult = {
          text: accumulatedText,
          inputTokens,
          outputTokens,
          costUsd,
          provider: "anthropic",
          model,
          finishReason,
        };
        finalized = true;
        finalizeResolve?.(result);
        // Fire-and-forget metering after the stream finishes.
        void recordUsage({
          userId: opts.userId,
          kind: opts.kind,
          result,
          metadata: opts.metadata,
        });
      } catch (err) {
        const wrapped = new LLMError(
          `Anthropic stream failed: ${err instanceof Error ? err.message : String(err)}`,
          "anthropic",
          err
        );
        finalizeReject?.(wrapped);
        throw wrapped;
      }
    }

    const iterator = iterate();
    return {
      [Symbol.asyncIterator]() {
        return iterator;
      },
      async finalize() {
        if (!finalized) {
          // Drain any unconsumed chunks so the stream completes naturally
          // and the accumulator captures everything. This handles the case
          // where the caller wants only the final result without iterating.
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          for await (const _ of iterator) {
            // discard
          }
        }
        return finalizePromise;
      },
    };
  }

  // Anthropic does not expose a public embedding API. Leaving `embed`
  // undefined signals to the router that it should fall back to OpenAI.
}
