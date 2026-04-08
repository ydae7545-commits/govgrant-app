import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/invitations/[token]
 *
 * 토큰 검증 + 조직 정보 반환. /invitations/[token]/page.tsx 가 SSR 또는
 * client fetch 로 호출. 인증 불필요 — token 자체가 인증 수단이고, 만료
 * + accepted 검사로 리플레이 방지.
 *
 * 응답:
 *   200: { ok: true, organization: {id, name}, inviterName, expiresAt }
 *   404: { ok: false, reason: "not_found" }
 *   410: { ok: false, reason: "expired" }
 *   409: { ok: false, reason: "already_accepted" }
 */

export const runtime = "nodejs";

interface Params {
  params: Promise<{ token: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { token } = await params;

  const admin = createAdminClient();
  const { data: invitation, error } = await admin
    .from("invitations")
    .select(
      "id, organization_id, invited_by_user_id, invited_email, expires_at, accepted_at, role"
    )
    .eq("token", token)
    .maybeSingle();

  if (error || !invitation) {
    return NextResponse.json(
      { ok: false, reason: "not_found" },
      { status: 404 }
    );
  }

  if (invitation.accepted_at) {
    return NextResponse.json(
      { ok: false, reason: "already_accepted" },
      { status: 409 }
    );
  }

  if (new Date(invitation.expires_at as string).getTime() < Date.now()) {
    return NextResponse.json(
      { ok: false, reason: "expired" },
      { status: 410 }
    );
  }

  // 조직 정보 + 초대자 정보 (이름만)
  const [orgRes, inviterRes] = await Promise.all([
    admin
      .from("organizations")
      .select("id, name, kind, region")
      .eq("id", invitation.organization_id)
      .maybeSingle(),
    admin
      .from("users")
      .select("display_name")
      .eq("id", invitation.invited_by_user_id)
      .maybeSingle(),
  ]);

  if (!orgRes.data) {
    // 조직이 삭제됐는데 invitation 만 남아 있는 케이스 (cascade 가 처리해야
    // 정상이지만 안전망).
    return NextResponse.json(
      { ok: false, reason: "org_deleted" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ok: true,
    organization: orgRes.data,
    inviterName: (inviterRes.data?.display_name as string) ?? "팀 운영자",
    invitedEmail: invitation.invited_email,
    expiresAt: invitation.expires_at,
    role: invitation.role,
  });
}
