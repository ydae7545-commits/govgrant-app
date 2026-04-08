import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 현재 활성 약관/처리방침 버전 — terms/page.tsx, privacy/page.tsx 의 VERSION 상수와 일치해야 함.
// 약관 변경 시 이 상수만 올리면 모든 사용자가 다음 로그인 시 재동의 화면을 거친다.
const CURRENT_TERMS_VERSION = "1.0";
const CURRENT_PRIVACY_VERSION = "1.0";

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

  // ----- 약관 동의 강제 검사 -----
  // 사용자가 OAuth 로 들어왔지만 아직 약관/처리방침 동의를 안 했거나
  // 동의한 버전이 현재 버전과 다르면 /auth/consent 로 보낸다. 이렇게
  // 하면 약관 변경 시 모든 기존 사용자가 다음 로그인에서 자동 재동의
  // 한다.
  //
  // admin client 를 쓰는 이유: 우리가 방금 exchangeCodeForSession 으로
  // 세션을 만들었는데, 같은 request 안에서 cookie 가 아직 새 세션을
  // 반영하지 못했을 수 있어 server-side supabase client 의 auth.getUser()
  // 가 stale 결과를 반환할 가능성이 있음. 안전하게 admin client + JWT
  // 검증을 별도로 처리하는 대신, exchange 결과의 user.id 를 직접 사용.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    try {
      const admin = createAdminClient();
      const { data: row } = await admin
        .from("users")
        .select("terms_accepted_version, privacy_accepted_version")
        .eq("id", user.id)
        .maybeSingle();

      const needsConsent =
        !row ||
        row.terms_accepted_version !== CURRENT_TERMS_VERSION ||
        row.privacy_accepted_version !== CURRENT_PRIVACY_VERSION;

      if (needsConsent) {
        const consentUrl = new URL("/auth/consent", origin);
        consentUrl.searchParams.set("next", nextPath);
        return NextResponse.redirect(consentUrl);
      }
    } catch {
      // 동의 검사 실패는 치명적이지 않음 — 일단 통과시키고 다음 페이지에서
      // hydration 이 다시 검사할 수 있게 둠. 신규 가입자는 거의 NULL 이라
      // 빠르게 redirect 됨.
    }
  }

  // Success: redirect to the originally requested destination. We use the
  // `origin` from the incoming request so the same host is preserved (prod →
  // prod, preview → preview, local dev → local dev).
  return NextResponse.redirect(new URL(nextPath, origin));
}
