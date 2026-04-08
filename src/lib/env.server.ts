import "server-only";

/**
 * Server-only environment variables.
 *
 * This module imports `server-only`, which makes the build fail if any
 * client component tries to import it. That gives us a compile-time guard
 * against accidentally leaking API keys to the browser bundle.
 *
 * Usage:
 *   import { serverEnv } from "@/lib/env.server";
 *   const env = serverEnv();
 *   const key = env.ANTHROPIC_API_KEY;
 *
 * Call `serverEnv()` inside request handlers / server functions, not at
 * module load time, so the process can boot even if a variable is missing
 * (you'll get a helpful error when the feature actually tries to run).
 */

export interface ServerEnv {
  SUPABASE_SERVICE_ROLE_KEY: string;
  ANTHROPIC_API_KEY: string;
  OPENAI_API_KEY: string;
  LLM_DEFAULT_PROVIDER: "anthropic" | "openai";
  LLM_FALLBACK_PROVIDER: "anthropic" | "openai";
  LLM_DEFAULT_MODEL_ANTHROPIC: string;
  LLM_DEFAULT_MODEL_OPENAI: string;
  LLM_MAX_DAILY_COST_USD_PER_USER: number;
  /** data.go.kr serviceKey for Phase 6 grant ingestion (MSIT, gov24, NTS …). Optional until Phase 6 ships. */
  DATA_GO_KR_SERVICE_KEY: string | null;
  /** bizinfo.go.kr crtfcKey for the 기업마당 지원사업정보 API (separate from data.go.kr). */
  BIZINFO_API_KEY: string | null;
  /** Bearer token gate for /api/admin/sync-grants. Optional until Phase 6 ships. */
  ADMIN_SYNC_TOKEN: string | null;
  /** Resend API key for transactional emails (portfolio digest, etc). */
  RESEND_API_KEY: string | null;
}

class MissingEnvError extends Error {
  constructor(key: string) {
    super(
      `Missing required server environment variable: ${key}. ` +
        `Set it in Vercel Environment Variables or .env.local. See docs/ENV.md for details.`
    );
    this.name = "MissingEnvError";
  }
}

export function serverEnv(): ServerEnv {
  const mustGet = (key: string): string => {
    const v = process.env[key];
    if (!v || v.length === 0) throw new MissingEnvError(key);
    return v;
  };
  const optional = (key: string, fallback: string): string =>
    process.env[key] && process.env[key]!.length > 0
      ? process.env[key]!
      : fallback;

  const provider = (key: string, fallback: "anthropic" | "openai") => {
    const v = process.env[key];
    if (v === "anthropic" || v === "openai") return v;
    return fallback;
  };

  const parsedMaxCost = (() => {
    const raw = process.env.LLM_MAX_DAILY_COST_USD_PER_USER;
    if (!raw) return 2.0;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 2.0;
  })();

  const optionalNullable = (key: string): string | null => {
    const v = process.env[key];
    return v && v.length > 0 ? v : null;
  };

  return {
    SUPABASE_SERVICE_ROLE_KEY: mustGet("SUPABASE_SERVICE_ROLE_KEY"),
    ANTHROPIC_API_KEY: mustGet("ANTHROPIC_API_KEY"),
    OPENAI_API_KEY: mustGet("OPENAI_API_KEY"),
    LLM_DEFAULT_PROVIDER: provider("LLM_DEFAULT_PROVIDER", "anthropic"),
    LLM_FALLBACK_PROVIDER: provider("LLM_FALLBACK_PROVIDER", "openai"),
    LLM_DEFAULT_MODEL_ANTHROPIC: optional(
      "LLM_DEFAULT_MODEL_ANTHROPIC",
      "claude-sonnet-4-5"
    ),
    LLM_DEFAULT_MODEL_OPENAI: optional(
      "LLM_DEFAULT_MODEL_OPENAI",
      "gpt-4o-mini"
    ),
    LLM_MAX_DAILY_COST_USD_PER_USER: parsedMaxCost,
    DATA_GO_KR_SERVICE_KEY: optionalNullable("DATA_GO_KR_SERVICE_KEY"),
    BIZINFO_API_KEY: optionalNullable("BIZINFO_API_KEY"),
    ADMIN_SYNC_TOKEN: optionalNullable("ADMIN_SYNC_TOKEN"),
    RESEND_API_KEY: optionalNullable("RESEND_API_KEY"),
  };
}

/**
 * Lighter version for cases where we only need the Supabase service role key
 * (e.g. the admin client). Doesn't throw on LLM key absence.
 */
export function getServiceRoleKey(): string {
  const v = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!v || v.length === 0) throw new MissingEnvError("SUPABASE_SERVICE_ROLE_KEY");
  return v;
}
