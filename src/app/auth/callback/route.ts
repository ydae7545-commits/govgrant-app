import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth callback handler.
 *
 * Supabase's `signInWithOAuth` redirects the browser to the configured
 * redirect URL with a one-time authorization `code` in the query string. We
 * exchange that code for an actual session here, which triggers the Supabase
 * SSR cookies flow (Set-Cookie headers for access + refresh tokens), and
 * then redirect the user to the intended destination.
 *
 * Flow:
 *   1. Sign-in page calls `signInWithOAuth({ provider, options: { redirectTo } })`
 *   2. Supabase Auth sends browser to Google/Kakao
 *   3. Provider redirects back to Supabase `/auth/v1/callback`
 *   4. Supabase redirects to OUR `redirectTo` (this route) with `?code=...`
 *   5. This handler calls `exchangeCodeForSession(code)` to persist the session
 *   6. Redirect to `?next=` target (or /dashboard by default)
 *
 * Errors:
 *   - If no code → probably an OAuth denial. Redirect to sign-in with a flag.
 *   - If exchange fails → redirect to sign-in with an error message.
 */

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextPath = searchParams.get("next") || "/dashboard";
  // Supabase forwards provider errors as query params too.
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  if (error) {
    const errUrl = new URL("/auth/sign-in", origin);
    errUrl.searchParams.set("error", errorDescription || error);
    return NextResponse.redirect(errUrl);
  }

  if (!code) {
    const errUrl = new URL("/auth/sign-in", origin);
    errUrl.searchParams.set("error", "no_code");
    return NextResponse.redirect(errUrl);
  }

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    const errUrl = new URL("/auth/sign-in", origin);
    errUrl.searchParams.set("error", exchangeError.message);
    return NextResponse.redirect(errUrl);
  }

  // Success: redirect to the originally requested destination. We use the
  // `origin` from the incoming request so the same host is preserved (prod →
  // prod, preview → preview, local dev → local dev).
  return NextResponse.redirect(new URL(nextPath, origin));
}
