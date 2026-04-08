import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/invitations/[token]/accept
 *
 * 로그인된 사용자가 token 으로 초대를 수락. 결과:
 *   - org_memberships(organization_id, user_id, role, accepted_at=now()) insert
 *   - invitations.accepted_at + accepted_by_user_id 업데이트 (token 무효화)
 *
 * 보안 고려:
 *   - 로그인 필수 (인증 안 된 사용자는 401)
 *   - invited_email 과 user.email 일치 검증 (다른 사람의 메일을 가로채서
 *     수락하는 걸 방지). 단 사용자가 OAuth 로 가입한 이메일이 초대 받은
 *     이메일과 다를 수 있으므로 — 이 경우엔 어쩔 수 없이 거부.
 *   - 만료 / 이미 수락 케이스는 다시 검증 (race condition 방지)
 *
 * 응답:
 *   200: { ok: true, organizationId } → 클라이언트가 /portfolio/[orgId] 로 이동
 *   401: 로그인 필요
 *   403: email_mismatch — 다른 이메일로 로그인
 *   404: not_found
 *   409: already_accepted
 *   410: expired
 */

export const runtime = "nodejs";

interface Params {
  params: Promise<{ token: string }>;
}

export async function POST(_request: NextRequest, { params }: Params) {
  const { token } = await params;

  // ----- 1. 로그인 검증 -----
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // ----- 2. invitation 검증 (admin client — RLS 우회) -----
  const admin = createAdminClient();
  const { data: invitation, error: fetchErr } = await admin
    .from("invitations")
    .select(
      "id, organization_id, invited_email, role, accepted_at, expires_at"
    )
    .eq("token", token)
    .maybeSingle();

  if (fetchErr || !invitation) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (invitation.accepted_at) {
    return NextResponse.json({ error: "already_accepted" }, { status: 409 });
  }
  if (new Date(invitation.expires_at as string).getTime() < Date.now()) {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }

  // ----- 3. Email 일치 검증 -----
  // OAuth 로 들어온 user.email 과 초대받은 이메일이 다르면 거부.
  // 이메일 미설정 (kakao 비즈 인증 미통과 등) 사용자는 일단 거부.
  const userEmail = user.email?.toLowerCase();
  const invitedEmail = (invitation.invited_email as string).toLowerCase();
  if (!userEmail) {
    return NextResponse.json(
      {
        error: "email_required",
        message: "OAuth 제공자로부터 이메일을 받지 못했습니다. 다른 방법으로 로그인해주세요.",
      },
      { status: 403 }
    );
  }
  if (userEmail !== invitedEmail) {
    return NextResponse.json(
      {
        error: "email_mismatch",
        message: `이 초대는 ${invitedEmail} 전용입니다. 해당 이메일로 로그인해주세요.`,
      },
      { status: 403 }
    );
  }

  // ----- 4. org_memberships insert (이미 있으면 업데이트) -----
  // upsert with conflict on (organization_id, user_id) PK.
  const { error: membershipErr } = await admin
    .from("org_memberships")
    .upsert(
      {
        organization_id: invitation.organization_id,
        user_id: user.id,
        role: invitation.role,
        accepted_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,user_id" }
    );
  if (membershipErr) {
    return NextResponse.json(
      {
        error: "membership_insert_failed",
        message: membershipErr.message,
      },
      { status: 500 }
    );
  }

  // ----- 5. invitation 무효화 (accepted_at 기록) -----
  const { error: updateErr } = await admin
    .from("invitations")
    .update({
      accepted_at: new Date().toISOString(),
      accepted_by_user_id: user.id,
    })
    .eq("id", invitation.id);
  if (updateErr) {
    // membership 은 이미 생성됐으므로 사용자 입장에서는 성공.
    // 단지 token 이 재사용 가능 상태로 남는데, accepted_at 검사는 실패해도
    // membership upsert 는 conflict 처리되므로 안전.
    console.warn(
      "[invitations:accept] failed to mark invitation accepted",
      updateErr.message
    );
  }

  return NextResponse.json({
    ok: true,
    organizationId: invitation.organization_id,
  });
}
