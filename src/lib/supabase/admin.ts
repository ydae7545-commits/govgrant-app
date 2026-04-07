import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { getServiceRoleKey } from "@/lib/env.server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Admin (service_role) Supabase client.
 *
 * This client bypasses Row Level Security — it has full read/write access to
 * every table. Use only in trusted server contexts:
 *   - Supabase Edge Functions
 *   - API Route Handlers doing privileged operations (e.g. writing
 *     `usage_events`, managing `notifications`, grant ingestion).
 *   - Server Actions that must bypass RLS (e.g. the owner-auto-provisioning
 *     trigger is covered by `security definer` in SQL, so most app code
 *     should not need this client).
 *
 * DO NOT:
 *   - Import this from a client component. `import "server-only"` will fail
 *     the build, but double-check with `grep -r SERVICE_ROLE .next/static/`
 *     after each production build.
 *   - Use it to serve user data bypassing RLS unless you manually re-check
 *     ownership in code. The whole point of RLS is defense-in-depth.
 *
 * Usage:
 *   import { createAdminClient } from "@/lib/supabase/admin";
 *   const admin = createAdminClient();
 *   await admin.from("usage_events").insert({ ... });
 *
 * Note: this function creates a fresh client per call rather than caching one
 * at module scope. That keeps the service_role key usage explicit at each
 * call site and avoids accidental long-lived handles.
 */

export function createAdminClient(): SupabaseClient {
  return createSupabaseClient(publicEnv.SUPABASE_URL, getServiceRoleKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
