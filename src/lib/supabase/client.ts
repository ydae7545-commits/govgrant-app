"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client.
 *
 * Used in client components, hooks, and any `"use client"` module. Reads the
 * session from cookies via `document.cookie` (handled internally by
 * `@supabase/ssr`) so the same session that the server sees is available to
 * the client automatically.
 *
 * We cache the instance at module scope so repeated calls return the same
 * client — this matters for the auth state change listener to survive across
 * Fast Refresh in development and across re-renders in production.
 */

let browserClient: SupabaseClient | null = null;

export function createClient(): SupabaseClient {
  if (browserClient) return browserClient;
  browserClient = createBrowserClient(
    publicEnv.SUPABASE_URL,
    publicEnv.SUPABASE_ANON_KEY
  );
  return browserClient;
}
