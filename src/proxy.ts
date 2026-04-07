import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { publicEnv, featureFlags } from "@/lib/env";

/**
 * Next.js 16 Proxy (formerly "middleware").
 *
 * Runs before every matched request. Its primary job is to refresh the
 * Supabase auth session cookies so that server components and route handlers
 * downstream see a valid JWT. Without this, expired access tokens would
 * persist across requests and the user would appear logged out until they
 * manually re-authenticate.
 *
 * Per Next.js 16 guidance, authorization decisions should NOT live here —
 * they belong in Server Actions / Route Handlers / Server Components where
 * the rendered content is produced. This proxy only does:
 *   1. Refresh session cookies (getClaims triggers the refresh internally).
 *   2. Lightweight route gating for "obviously wrong" navigations
 *      (e.g. an unauthenticated visit to /mypage). The destination page
 *      still re-checks authorization before returning any data.
 *
 * When `NEXT_PUBLIC_USE_SUPABASE=false` this proxy becomes a no-op so the
 * existing localStorage-based UX keeps working.
 */

/** Routes that require an authenticated user. */
const PROTECTED_PREFIXES = ["/mypage", "/proposals", "/portfolio"];

/**
 * `/onboarding` is accessible only to signed-in users who haven't finished it
 * yet. We don't check the `completed_onboarding` flag in the proxy because it
 * would require a DB round-trip on every request — the onboarding page itself
 * handles the redirect for already-completed users.
 */
const AUTH_REQUIRED_FOR_ONBOARDING = true;

/** Routes that are public — no auth required, no session refresh redirects. */
const PUBLIC_PREFIXES = [
  "/",
  "/search",
  "/grants",
  "/chat",
  "/calendar",
  "/auth",
  "/api",
];

function isProtected(pathname: string): boolean {
  if (PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return true;
  }
  if (AUTH_REQUIRED_FOR_ONBOARDING && pathname.startsWith("/onboarding")) {
    return true;
  }
  return false;
}

export async function proxy(request: NextRequest) {
  // Short-circuit if Supabase auth is disabled. We still return a response so
  // the request continues through Next.js normally.
  if (!featureFlags.useSupabase) {
    return NextResponse.next({ request });
  }

  // Start a mutable response that we'll pass to createServerClient so the
  // library can append Set-Cookie headers for any refreshed tokens.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    publicEnv.SUPABASE_URL,
    publicEnv.SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Per Supabase SSR design.md: set cookies on BOTH the request
          // (so downstream handlers in the same invocation see fresh values)
          // AND the response (so the browser persists them).
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  // Trigger the session refresh. `getClaims` validates the JWT without
  // hitting the Auth server on every request (uses local JWKS cache). This
  // is the modern replacement for `getUser` in the middleware loop.
  //
  // If the refresh fails (expired refresh token, revoked session, network
  // error), `data` is null and we treat the request as unauthenticated.
  let isAuthenticated = false;
  try {
    const { data } = await supabase.auth.getClaims();
    isAuthenticated = data !== null && data.claims !== undefined;
  } catch {
    isAuthenticated = false;
  }

  const { pathname } = request.nextUrl;

  // Gate protected routes with a redirect to /auth/sign-in. The destination
  // page MUST still verify auth itself — this is a UX nudge, not a security
  // boundary.
  if (!isAuthenticated && isProtected(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/auth/sign-in";
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match every request path except:
     *   - _next/static (bundled assets)
     *   - _next/image (image optimizer)
     *   - favicon.ico, robots.txt, sitemap.xml
     *   - public files with an extension (.svg, .png, ...)
     *
     * We intentionally DO run on /api/* so Route Handlers get the refreshed
     * session cookies too.
     */
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

/**
 * NOTE: the above `PUBLIC_PREFIXES` constant is informational for future
 * contributors — the proxy currently only *gates* protected routes via
 * `isProtected()` and lets everything else through. We're keeping the list
 * around so the intent is clear and we can flip the policy to deny-by-default
 * later if the security posture needs to tighten.
 */
void PUBLIC_PREFIXES;
