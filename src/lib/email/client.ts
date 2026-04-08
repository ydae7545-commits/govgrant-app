import "server-only";

import { Resend } from "resend";

/**
 * Phase C-C: Resend 이메일 클라이언트.
 *
 * 이 모듈은 RESEND_API_KEY env가 설정되지 않았을 때 silently no-op으로
 * 동작한다 — 개발/CI 환경에서 Resend 계정 없이도 빌드가 깨지지 않게.
 * 실제 운영에서 키가 없으면 send()가 {ok:false, reason:"no_api_key"}를
 * 반환하므로 호출자가 이를 로그로 추적할 수 있다.
 */

let client: Resend | null = null;
let clientLoaded = false;

function getClient(): Resend | null {
  if (clientLoaded) return client;
  clientLoaded = true;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.length === 0) {
    return null;
  }
  client = new Resend(apiKey);
  return client;
}

export interface SendEmailArgs {
  to: string | string[];
  subject: string;
  html: string;
  /**
   * Plain-text version. Resend auto-generates it from HTML when omitted, but
   * a hand-written one is better for accessibility + spam scores.
   */
  text?: string;
  /**
   * Sender address. Defaults to onboarding@resend.dev (Resend's shared
   * sandbox sender, works without custom domain verification). Once we
   * register govgrant.co.kr or similar, pass `noreply@govgrant.co.kr`.
   */
  from?: string;
  /** Optional reply-to address. */
  replyTo?: string;
}

export interface SendEmailResult {
  ok: boolean;
  id?: string;
  reason?:
    | "no_api_key"
    | "resend_error"
    | "missing_to"
    | "missing_subject"
    | "missing_body";
  error?: string;
}

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  if (!args.to || (Array.isArray(args.to) && args.to.length === 0)) {
    return { ok: false, reason: "missing_to" };
  }
  if (!args.subject) return { ok: false, reason: "missing_subject" };
  if (!args.html && !args.text) return { ok: false, reason: "missing_body" };

  const resend = getClient();
  if (!resend) {
    return {
      ok: false,
      reason: "no_api_key",
      error:
        "RESEND_API_KEY is not configured on the server. Set it in Vercel env.",
    };
  }

  try {
    const response = await resend.emails.send({
      // Use Resend's shared sandbox sender until we have our own verified
      // domain. All major providers accept it for transactional sends.
      from: args.from ?? "지원금 찾기 <onboarding@resend.dev>",
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
      replyTo: args.replyTo,
    });

    if (response.error) {
      return {
        ok: false,
        reason: "resend_error",
        error: response.error.message ?? String(response.error),
      };
    }

    return { ok: true, id: response.data?.id };
  } catch (err) {
    return {
      ok: false,
      reason: "resend_error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
