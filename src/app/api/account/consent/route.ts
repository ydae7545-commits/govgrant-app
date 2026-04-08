import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/account/consent
 *
 * 사용자가 sign-in 직후 약관 동의 화면에서 "동의" 클릭 시 호출.
 * user_consents 테이블에 두 row (terms + privacy) 를 insert 한다.
 *
 * Body: { termsVersion: string, privacyVersion: string }
 *
 * 이 route 는 cookie session 으로 인증된 사용자만 받는다. 동의 자체는
 * 사용자 액션이라 admin client 사용 (RLS 가 write 를 service_role 만 허용).
 *
 * IP / User-Agent 도 함께 기록 (개인정보보호법 권장).
 */

export const runtime = "nodejs";

interface Body {
  termsVersion?: string;
  privacyVersion?: string;
}

export async function POST(request: NextRequest) {
  // 인증 검증
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const termsVersion = body.termsVersion?.trim();
  const privacyVersion = body.privacyVersion?.trim();
  if (!termsVersion || !privacyVersion) {
    return NextResponse.json(
      { error: "missing_versions" },
      { status: 400 }
    );
  }

  // IP 추출 — Vercel 은 x-forwarded-for 의 첫 IP 가 클라이언트 실제 IP.
  const xff = request.headers.get("x-forwarded-for") ?? "";
  const ip = xff.split(",")[0]?.trim() || null;
  const userAgent = request.headers.get("user-agent") ?? null;

  const admin = createAdminClient();
  const now = new Date().toISOString();

  // 1. Audit log insert (분쟁 입증용 — 모든 동의 시점 보존)
  const { error: insertError } = await admin.from("user_consents").insert([
    {
      user_id: user.id,
      kind: "terms",
      version: termsVersion,
      agreed_at: now,
      ip_address: ip,
      user_agent: userAgent,
    },
    {
      user_id: user.id,
      kind: "privacy",
      version: privacyVersion,
      agreed_at: now,
      ip_address: ip,
      user_agent: userAgent,
    },
  ]);

  if (insertError) {
    return NextResponse.json(
      { error: "insert_failed", message: insertError.message },
      { status: 500 }
    );
  }

  // 2. users 테이블 캐시 업데이트 (callback 빠른 검사용)
  const { error: updateError } = await admin
    .from("users")
    .update({
      terms_accepted_version: termsVersion,
      terms_accepted_at: now,
      privacy_accepted_version: privacyVersion,
      privacy_accepted_at: now,
    })
    .eq("id", user.id);

  if (updateError) {
    // 캐시 업데이트 실패는 치명적이지 않음 — audit log 는 이미 들어갔고
    // hydration 이 다음 번에 다시 검사할 수 있음. 단 로그는 남김.
    console.warn(
      "[consent] users cache update failed",
      updateError.message
    );
  }

  return NextResponse.json({ ok: true });
}
