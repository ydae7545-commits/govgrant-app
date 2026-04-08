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
  const { error } = await admin.from("user_consents").insert([
    {
      user_id: user.id,
      kind: "terms",
      version: termsVersion,
      ip_address: ip,
      user_agent: userAgent,
    },
    {
      user_id: user.id,
      kind: "privacy",
      version: privacyVersion,
      ip_address: ip,
      user_agent: userAgent,
    },
  ]);

  if (error) {
    return NextResponse.json(
      { error: "insert_failed", message: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
