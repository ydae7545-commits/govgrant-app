import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Sign-out endpoint.
 *
 * We expose this as a POST Route Handler so calling it from a `<form>` or a
 * client-side `fetch("/auth/sign-out", { method: "POST" })` both work.
 * Calling `supabase.auth.signOut()` server-side triggers Supabase SSR to
 * clear all session cookies via `Set-Cookie: Max-Age=0`.
 *
 * We respond with a 303 redirect to the home page so the browser follows it
 * immediately. Using 303 (See Other) instead of 302 ensures the redirect
 * uses GET regardless of the original method.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const { origin } = new URL(request.url);
  return NextResponse.redirect(new URL("/", origin), { status: 303 });
}
