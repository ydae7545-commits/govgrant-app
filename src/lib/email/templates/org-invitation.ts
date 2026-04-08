import "server-only";

/**
 * 조직 초대 이메일 템플릿 (Phase 7 B2B).
 *
 * portfolio-digest.ts 와 동일 패턴: 순수 문자열 템플릿 + inline style.
 * 받는 사람은 govgrant-app 사용자가 아닐 수도 있어서 (가입 전), 메일
 * 안내 카피가 "지원금 찾기 가입 후 자동으로 조직에 합류" 형태로 친절하게.
 *
 * acceptUrl 는 token 이 들어간 절대 URL. 받는 사람이 클릭하면
 * /invitations/[token] 로 이동하고, 거기서 로그인 후 수락 버튼을 누른다.
 */

export interface OrgInvitationArgs {
  recipientEmail: string;
  inviterName: string;
  orgName: string;
  /** 절대 URL — `${SITE_URL}/invitations/${token}` 형태 */
  acceptUrl: string;
  /** ISO 8601 — 만료 일자 표시용 */
  expiresAt: string;
  appUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateKo(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  } catch {
    return iso;
  }
}

export function renderOrgInvitation(args: OrgInvitationArgs): RenderedEmail {
  const inviter = escapeHtml(args.inviterName);
  const org = escapeHtml(args.orgName);
  const expires = formatDateKo(args.expiresAt);

  const subject = `${args.inviterName}님이 ${args.orgName} 포트폴리오에 초대했어요`;

  const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#1f2937;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="background:white;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
      <!-- 헤더 -->
      <div style="padding:24px 32px 0;">
        <div style="font-size:14px;color:#2563eb;font-weight:600;letter-spacing:-0.01em;">
          🏛 지원금 찾기
        </div>
      </div>

      <!-- 본문 -->
      <div style="padding:24px 32px 32px;">
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;line-height:1.4;color:#111827;">
          ${inviter}님이 회원님을<br />
          <span style="color:#2563eb;">${org}</span> 포트폴리오에<br />
          초대했어요
        </h1>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4b5563;">
          지원금 찾기는 정부지원금·R&D 과제·복지 서비스를 한 곳에서 검색하고
          포트폴리오 단위로 매칭 추천을 받는 서비스예요. 초대를 수락하면
          <strong>${org}</strong>의 추천 공고와 마감 임박 알림을 함께 받을 수
          있어요.
        </p>

        <div style="margin:0 0 24px;text-align:center;">
          <a href="${args.acceptUrl}"
             style="display:inline-block;padding:14px 32px;background:#2563eb;color:white;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;">
            초대 수락하기
          </a>
        </div>

        <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#6b7280;">
          또는 이 링크를 브라우저에 직접 입력하세요:
        </p>
        <p style="margin:0 0 24px;font-size:12px;line-height:1.4;color:#9ca3af;word-break:break-all;">
          ${args.acceptUrl}
        </p>

        <div style="margin:24px 0 0;padding:12px 16px;background:#f9fafb;border-radius:8px;font-size:12px;line-height:1.6;color:#6b7280;">
          <div style="margin-bottom:4px;">
            ⏰ <strong>${expires}</strong>까지 유효합니다
          </div>
          <div>
            🔒 이 초대는 <strong>${escapeHtml(args.recipientEmail)}</strong>
            전용입니다. 회원님이 받으신 게 아니라면 무시하세요.
          </div>
        </div>
      </div>
    </div>

    <div style="margin:24px 0 0;text-align:center;font-size:11px;color:#9ca3af;">
      <a href="${args.appUrl}" style="color:#9ca3af;text-decoration:underline;">
        지원금 찾기 홈
      </a>
    </div>
  </div>
</body>
</html>`;

  const text = `${args.inviterName}님이 회원님을 ${args.orgName} 포트폴리오에 초대했어요.

지원금 찾기는 정부지원금·R&D 과제·복지 서비스를 한 곳에서 검색하고
포트폴리오 단위로 매칭 추천을 받는 서비스예요. 초대를 수락하면
${args.orgName}의 추천 공고와 마감 임박 알림을 함께 받을 수 있어요.

▼ 초대 수락하기
${args.acceptUrl}

⏰ ${expires}까지 유효합니다
🔒 이 초대는 ${args.recipientEmail} 전용입니다.

지원금 찾기 — ${args.appUrl}`;

  return { subject, html, text };
}
