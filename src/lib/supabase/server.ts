import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client for Server Components, Route Handlers, and
 * Server Actions.
 *
 * Key Next.js 16 differences vs older Next.js versions:
 *   - `cookies()` is async — we `await` it.
 *   - Server Components cannot set cookies during render; the `setAll` hook
 *     swallows those errors with a try/catch. Cookie mutation in a Server
 *     Component is a code smell anyway — do it in a Server Action or Route
 *     Handler instead.
 *
 * The `@supabase/ssr` library uses the deprecated-style signature where we
 * pass an object with `cookies.getAll` and `cookies.setAll`. This is the
 * documented pattern as of `@supabase/ssr@0.10`.
 *
 * Usage:
 *   // Server Component
 *   import { createClient } from "@/lib/supabase/server";
 *   export default async function Page() {
 *     const supabase = await createClient();
 *     const { data: { user } } = await supabase.auth.getUser();
 *     ...
 *   }
 */

export async function createClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return createServerClient(
    publicEnv.SUPABASE_URL,
    publicEnv.SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component — mutation is not allowed here.
            // The middleware (proxy.ts) handles session refresh cookies, so
            // this silent failure is safe for read-only components.
          }
        },
      },
    }
  );
}
