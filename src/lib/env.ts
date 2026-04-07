/**
 * Type-safe environment variable access.
 *
 * Public vars (NEXT_PUBLIC_*) are safe to read from both client and server.
 * Server-only vars are exposed through `serverEnv()` which is guarded by
 * `import "server-only"` to fail the build if accidentally imported from a
 * client module.
 *
 * Usage:
 *   // Anywhere (client or server):
 *   import { publicEnv, featureFlags } from "@/lib/env";
 *   const url = publicEnv.SUPABASE_URL;
 *
 *   // Server only (API routes, Server Components, Server Actions):
 *   import { serverEnv } from "@/lib/env.server";
 *   const key = serverEnv().ANTHROPIC_API_KEY;
 *
 * We intentionally split server-only env into env.server.ts so that importing
 * `@/lib/env` from a client component is always safe.
 */

function required(key: string, value: string | undefined): string {
  if (!value || value.length === 0) {
    // Don't throw at module load time — some variables may be legitimately
    // missing during build (e.g. Phase 5+ placeholders before they're needed).
    // Callers that need a strict value should check themselves.
    return "";
  }
  return value;
}

/**
 * Variables prefixed with NEXT_PUBLIC_ are inlined into the client bundle by
 * Next.js at build time, so they're accessible from anywhere.
 */
export const publicEnv = {
  SUPABASE_URL: required(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL
  ),
  SUPABASE_ANON_KEY: required(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ),
  APP_URL:
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  APP_ENV: (process.env.NEXT_PUBLIC_APP_ENV ||
    "development") as "production" | "preview" | "development",
} as const;

/**
 * Feature flags. Each defaults to `false` so newly added flags don't
 * accidentally activate untested code paths.
 */
export const featureFlags = {
  useSupabase: process.env.NEXT_PUBLIC_USE_SUPABASE === "true",
  useLlmChat: process.env.NEXT_PUBLIC_USE_LLM_CHAT === "true",
  useProposalAi: process.env.NEXT_PUBLIC_USE_PROPOSAL_AI === "true",
  useVectorSearch: process.env.NEXT_PUBLIC_USE_VECTOR_SEARCH === "true",
} as const;

/**
 * Guard: `true` if the Supabase URL/key are both non-empty. Feature code can
 * use this to fall back to the legacy Zustand localStorage path when Supabase
 * isn't configured yet (e.g. during Phase 0 when flags are off).
 */
export function hasSupabaseConfig(): boolean {
  return (
    publicEnv.SUPABASE_URL.length > 0 && publicEnv.SUPABASE_ANON_KEY.length > 0
  );
}
