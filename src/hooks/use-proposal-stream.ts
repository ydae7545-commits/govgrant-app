"use client";

import { useCallback, useRef, useState } from "react";
import type {
  GenerateStreamEvent,
  ProposalSectionKey,
} from "@/types/proposal";

/**
 * SSE consumer for proposal generation streams.
 *
 * Two endpoints share the same event protocol:
 *   - POST /api/proposals/[id]/generate            (full draft)
 *   - POST /api/proposals/[id]/sections/[key]      (single section)
 *
 * The hook accumulates per-section delta text in `partials` so the editor
 * can render typing-style updates while the request is in flight, then
 * clears them once `section_done` lands.
 */

export interface ProposalStreamState {
  /** True while a request is in-flight. */
  streaming: boolean;
  /** Section currently receiving deltas, if any. */
  activeSection: ProposalSectionKey | null;
  /** Accumulated delta text per section while streaming. */
  partials: Partial<Record<ProposalSectionKey, string>>;
  /** Last error message, if the stream failed. */
  error: string | null;
  /** True after `all_done` fires successfully. */
  done: boolean;
}

const INITIAL: ProposalStreamState = {
  streaming: false,
  activeSection: null,
  partials: {},
  error: null,
  done: false,
};

export interface StartStreamArgs {
  /** Full URL to POST against. */
  url: string;
  /** Optional JSON body. */
  body?: unknown;
  /** Fired after each `section_done` so callers can refetch the proposal. */
  onSectionDone?: (key: ProposalSectionKey) => void;
  /** Fired after `all_done` (or after error) so callers can refetch. */
  onAllDone?: () => void;
}

export function useProposalStream() {
  const [state, setState] = useState<ProposalStreamState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setState(INITIAL);
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState((s) => ({ ...s, streaming: false }));
  }, []);

  const start = useCallback(async (args: StartStreamArgs) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({
      streaming: true,
      activeSection: null,
      partials: {},
      error: null,
      done: false,
    });

    try {
      const res = await fetch(args.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: args.body ? JSON.stringify(args.body) : undefined,
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        let message = `HTTP ${res.status}`;
        try {
          const errJson = await res.json();
          if (errJson?.error) message = String(errJson.error);
          if (errJson?.message) message = String(errJson.message);
        } catch {
          /* ignore */
        }
        throw new Error(message);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // Parse SSE: events are separated by blank lines, lines start with
      // `event:` and `data:`. We only care about data payloads here.
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let blankIdx: number;
        while ((blankIdx = buffer.indexOf("\n\n")) !== -1) {
          const rawEvent = buffer.slice(0, blankIdx);
          buffer = buffer.slice(blankIdx + 2);

          let dataLine = "";
          for (const line of rawEvent.split("\n")) {
            if (line.startsWith("data:")) {
              dataLine += line.slice(5).trim();
            }
          }
          if (!dataLine) continue;

          let payload: GenerateStreamEvent;
          try {
            payload = JSON.parse(dataLine) as GenerateStreamEvent;
          } catch {
            continue;
          }

          switch (payload.type) {
            case "section_start": {
              setState((s) => ({
                ...s,
                activeSection: payload.key,
                partials: { ...s.partials, [payload.key]: "" },
              }));
              break;
            }
            case "delta": {
              setState((s) => ({
                ...s,
                partials: {
                  ...s.partials,
                  [payload.key]: (s.partials[payload.key] ?? "") + payload.delta,
                },
              }));
              break;
            }
            case "section_done": {
              args.onSectionDone?.(payload.key);
              setState((s) => {
                const next = { ...s.partials };
                delete next[payload.key];
                return {
                  ...s,
                  partials: next,
                  activeSection: null,
                };
              });
              break;
            }
            case "all_done": {
              setState((s) => ({
                ...s,
                streaming: false,
                done: true,
                activeSection: null,
              }));
              args.onAllDone?.();
              break;
            }
            case "error": {
              setState((s) => ({
                ...s,
                streaming: false,
                error: payload.message,
                activeSection: null,
              }));
              args.onAllDone?.();
              break;
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        setState((s) => ({ ...s, streaming: false }));
        return;
      }
      setState((s) => ({
        ...s,
        streaming: false,
        error: err instanceof Error ? err.message : String(err),
      }));
      args.onAllDone?.();
    } finally {
      abortRef.current = null;
    }
  }, []);

  return { ...state, start, cancel, reset };
}
