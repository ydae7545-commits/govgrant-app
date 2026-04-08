import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/client";
import { renderOrgInvitation } from "@/lib/email/templates/org-invitation";

/**
 * POST /api/orgs/[orgId]/invitations
 *
 * Phase 7 B2B: 조직 owner 가 다른 사용자를 자기 조직에 초대.
 *
 * 흐름:
 *   1. cookies → 현재 로그인 사용자 확인 (server-side supabase client)
 *   2. org_memberships 에서 user 가 owner 인지 검증 (RLS select 정책 활용)
 *   3. invitations 테이블에 token + 이메일 + 만료 7일 row insert (admin client)
 *   4. Resend 로 초대 메일 발송
 *   5. { id, token, acceptUrl } 반환
 *
 * 주의: invitations 테이블 RLS 가 service_role 만 허용하므로 모든
 * insert 는 createAdminClient 사용. 단, 사용자 검증은 createServerSupabase
 * (cookie 기반 user session) 로 먼저 해야 anon 이 임의 insert 못 함.
 *
 * Body: { email: string, role?: "editor" | "viewer" }
 */

export const runtime = "nodejs";

interface Params {
  params: Promise<{ orgId: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { orgId } = await params;

  // ----- 1. Auth: 현재 로그인 사용자 -----
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // ----- 2. Body 검증 -----
  let body: { email?: string; role?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const email = body.email?.trim().toLowerCase();
  const role = body.role === "viewer" ? "viewer" : "editor";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  // ----- 3. Owner 권한 검증 -----
  // org_memberships RLS 가 user_id = auth.uid() 인 row 만 select 허용하므로
  // 본인의 멤버십만 조회됨. role='owner' 인 row 가 있어야 초대 가능.
  const { data: membership } = await supabase
    .from("org_memberships")
    .select("role")
    .eq("organization_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership || membership.role !== "owner") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // 조직 정보 (이름) 도 가져옴 — 이메일 카피용
  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .maybeSingle();
  if (!org) {
    return NextResponse.json({ error: "org_not_found" }, { status: 404 });
  }

  // ----- 4. 초대자 표시 이름 가져오기 -----
  const { data: inviterRow } = await supabase
    .from("users")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  const inviterName = (inviterRow?.display_name as string) || "팀 운영자";

  // ----- 5. Token 생성 + invitations insert -----
  // 32 bytes base64url = 43 chars. URL-safe.
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  const admin = createAdminClient();
  const { data: invitation, error: insertError } = await admin
    .from("invitations")
    .insert({
      organization_id: orgId,
      invited_by_user_id: user.id,
      invited_email: email,
      token,
      role,
      expires_at: expiresAt,
    })
    .select("id, token, expires_at")
    .single();

  if (insertError || !invitation) {
    return NextResponse.json(
      {
        error: "insert_failed",
        message: insertError?.message ?? "unknown",
      },
      { status: 500 }
    );
  }

  // ----- 6. 이메일 발송 -----
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const acceptUrl = `${appUrl}/invitations/${token}`;
  const rendered = renderOrgInvitation({
    recipientEmail: email,
    inviterName,
    orgName: org.name as string,
    acceptUrl,
    expiresAt,
    appUrl,
  });

  const sendResult = await sendEmail({
    to: email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });

  // 이메일 발송 실패해도 invitation row 는 유지 — 운영자가 acceptUrl 을
  // 직접 복사해서 받는 사람에게 전달할 수 있게.
  return NextResponse.json({
    ok: true,
    invitationId: invitation.id,
    acceptUrl,
    expiresAt: invitation.expires_at,
    emailSent: sendResult.ok,
    emailReason: sendResult.ok ? undefined : sendResult.reason,
  });
}
