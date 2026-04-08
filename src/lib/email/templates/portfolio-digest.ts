import "server-only";

import type { Grant } from "@/types/grant";
import { daysUntil, formatDate } from "@/lib/format";

/**
 * 포트폴리오 digest 이메일 템플릿.
 *
 * React Email 안 쓰는 이유: 템플릿이 1개뿐이고 interpolation만 하면 되는데
 * React Email은 의존성이 크고 빌드 시간 증가. 대신 순수 문자열 템플릿으로
 * 충분.
 *
 * 내부 스타일은 모두 inline — 이메일 클라이언트가 <style> 태그를 잘 처리
 * 못하는 경우가 많기 때문. 레이아웃은 <table>로 쓰는 게 Gmail/Outlook/
 * Apple Mail 호환성 최고지만, 우리 대상은 모던 클라이언트 위주라 <div>
 * flex + 인라인 스타일로 간단히 처리.
 */

export interface PortfolioDigestOrgBlock {
  orgId: string;
  orgName: string;
  urgentGrants: Grant[]; // D-7 이내 마감
  newRecommendations: Grant[]; // 최근 24시간 안에 추가된 추천
}

export interface PortfolioDigestArgs {
  recipientName: string;
  recipientEmail: string;
  appUrl: string;
  /** 해당 주간/일자 라벨 (e.g. "2026-04-08 일일 브리핑"). */
  dateLabel: string;
  /** 포트폴리오 조직 블록 목록 (빈 조직은 이미 caller에서 걸러냈어야 함). */
  orgBlocks: PortfolioDigestOrgBlock[];
}

const COLORS = {
  blue: "#2563eb",
  blueLight: "#dbeafe",
  red: "#dc2626",
  redLight: "#fee2e2",
  gray900: "#111827",
  gray700: "#374151",
  gray500: "#6b7280",
  gray300: "#d1d5db",
  gray100: "#f3f4f6",
  white: "#ffffff",
  border: "#e5e7eb",
};

/**
 * 메인 진입점. HTML + plain text 둘 다 반환.
 */
export function renderPortfolioDigest(args: PortfolioDigestArgs): {
  subject: string;
  html: string;
  text: string;
} {
  const totalUrgent = args.orgBlocks.reduce(
    (sum, b) => sum + b.urgentGrants.length,
    0
  );
  const totalNew = args.orgBlocks.reduce(
    (sum, b) => sum + b.newRecommendations.length,
    0
  );

  const subject =
    totalUrgent > 0
      ? `[지원금 찾기] ${args.recipientName}님, 마감 임박 ${totalUrgent}건 있어요`
      : `[지원금 찾기] ${args.recipientName}님, 오늘의 포트폴리오 추천 ${totalNew}건`;

  const html = buildHtml(args, totalUrgent, totalNew);
  const text = buildText(args, totalUrgent, totalNew);

  return { subject, html, text };
}

// ----------------------------------------------------------------------------
// HTML 빌더
// ----------------------------------------------------------------------------

function buildHtml(
  args: PortfolioDigestArgs,
  totalUrgent: number,
  totalNew: number
): string {
  const header = `
    <div style="background:${COLORS.blue};color:${COLORS.white};padding:24px 20px;text-align:center;">
      <div style="font-size:14px;opacity:0.9;margin-bottom:4px;">${escapeHtml(
        args.dateLabel
      )}</div>
      <div style="font-size:22px;font-weight:700;">포트폴리오 브리핑</div>
    </div>`;

  const summary = `
    <div style="padding:20px;background:${COLORS.gray100};border-bottom:1px solid ${COLORS.border};">
      <div style="font-size:14px;color:${COLORS.gray700};line-height:1.6;">
        안녕하세요 <strong>${escapeHtml(args.recipientName)}</strong>님,<br>
        관리 중인 ${args.orgBlocks.length}개 조직의 오늘 업데이트입니다.
      </div>
      <div style="display:flex;gap:12px;margin-top:16px;">
        ${summaryPill("마감 임박", totalUrgent, totalUrgent > 0 ? "red" : "gray")}
        ${summaryPill("오늘의 신규 추천", totalNew, "blue")}
      </div>
    </div>`;

  const orgSections = args.orgBlocks
    .map((block) => renderOrgBlock(block, args.appUrl))
    .join("\n");

  const footer = `
    <div style="padding:20px;text-align:center;font-size:12px;color:${COLORS.gray500};border-top:1px solid ${COLORS.border};">
      <div style="margin-bottom:8px;">
        <a href="${args.appUrl}/portfolio" style="color:${COLORS.blue};text-decoration:none;">포트폴리오 대시보드 열기</a>
      </div>
      <div>이 메일은 지원금 찾기 포트폴리오 알림입니다.</div>
      <div style="margin-top:4px;">
        받지 않으려면 <a href="${args.appUrl}/mypage" style="color:${COLORS.gray500};">마이페이지</a>에서 설정하세요.
      </div>
    </div>`;

  return `<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(args.dateLabel)} 포트폴리오 브리핑</title>
  </head>
  <body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <div style="max-width:640px;margin:0 auto;background:${COLORS.white};">
      ${header}
      ${summary}
      ${orgSections}
      ${footer}
    </div>
  </body>
</html>`;
}

function summaryPill(
  label: string,
  count: number,
  tone: "blue" | "red" | "gray"
): string {
  const bg =
    tone === "red"
      ? COLORS.redLight
      : tone === "blue"
      ? COLORS.blueLight
      : COLORS.gray100;
  const fg =
    tone === "red"
      ? COLORS.red
      : tone === "blue"
      ? COLORS.blue
      : COLORS.gray700;
  return `
    <div style="flex:1;background:${bg};border-radius:8px;padding:12px;text-align:center;">
      <div style="font-size:11px;color:${fg};opacity:0.85;">${escapeHtml(label)}</div>
      <div style="font-size:24px;font-weight:700;color:${fg};margin-top:2px;">${count}</div>
    </div>`;
}

function renderOrgBlock(
  block: PortfolioDigestOrgBlock,
  appUrl: string
): string {
  const urgent = block.urgentGrants.slice(0, 5);
  const fresh = block.newRecommendations.slice(0, 5);

  const urgentRows = urgent
    .map((g) => renderGrantRow(g, appUrl, "urgent"))
    .join("\n");
  const freshRows = fresh
    .map((g) => renderGrantRow(g, appUrl, "new"))
    .join("\n");

  return `
    <div style="padding:20px;border-bottom:1px solid ${COLORS.border};">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div style="font-size:16px;font-weight:700;color:${COLORS.gray900};">
          ${escapeHtml(block.orgName)}
        </div>
        <a href="${appUrl}/portfolio/${block.orgId}"
           style="font-size:12px;color:${COLORS.blue};text-decoration:none;">
          전체 보기 →
        </a>
      </div>
      ${
        urgent.length > 0
          ? `<div style="font-size:12px;font-weight:600;color:${COLORS.red};margin-bottom:6px;">⏰ 마감 임박 (${urgent.length})</div>${urgentRows}`
          : ""
      }
      ${
        fresh.length > 0
          ? `<div style="font-size:12px;font-weight:600;color:${COLORS.blue};margin:12px 0 6px;">✨ 신규 추천 (${fresh.length})</div>${freshRows}`
          : ""
      }
      ${
        urgent.length === 0 && fresh.length === 0
          ? `<div style="font-size:12px;color:${COLORS.gray500};">업데이트 없음</div>`
          : ""
      }
    </div>`;
}

function renderGrantRow(
  g: Grant,
  appUrl: string,
  tone: "urgent" | "new"
): string {
  const dLabel = deadlineLabel(g.applicationEnd);
  const dColor = tone === "urgent" ? COLORS.red : COLORS.gray500;

  return `
    <a href="${appUrl}/grants/${g.id}"
       style="display:block;padding:8px 10px;margin:4px 0;background:${COLORS.gray100};border-radius:6px;text-decoration:none;border-left:3px solid ${
         tone === "urgent" ? COLORS.red : COLORS.blue
       };">
      <div style="font-size:13px;color:${COLORS.gray900};font-weight:500;line-height:1.4;">
        ${escapeHtml(g.title.slice(0, 80))}
      </div>
      <div style="font-size:11px;color:${COLORS.gray500};margin-top:2px;">
        ${escapeHtml(g.organization || "")} · <span style="color:${dColor};">${dLabel}</span>
      </div>
    </a>`;
}

// ----------------------------------------------------------------------------
// Plain-text 빌더
// ----------------------------------------------------------------------------

function buildText(
  args: PortfolioDigestArgs,
  totalUrgent: number,
  totalNew: number
): string {
  const lines: string[] = [];
  lines.push(`[지원금 찾기] ${args.dateLabel} 포트폴리오 브리핑`);
  lines.push("");
  lines.push(`안녕하세요 ${args.recipientName}님,`);
  lines.push(
    `관리 중인 ${args.orgBlocks.length}개 조직의 오늘 업데이트입니다.`
  );
  lines.push("");
  lines.push(`- 마감 임박: ${totalUrgent}건`);
  lines.push(`- 신규 추천: ${totalNew}건`);
  lines.push("");

  for (const block of args.orgBlocks) {
    lines.push(`━━━ ${block.orgName} ━━━`);
    if (block.urgentGrants.length > 0) {
      lines.push(`마감 임박 (${block.urgentGrants.length}):`);
      for (const g of block.urgentGrants.slice(0, 5)) {
        lines.push(
          `  · ${g.title} — ${deadlineLabel(g.applicationEnd)} (${g.organization})`
        );
      }
    }
    if (block.newRecommendations.length > 0) {
      lines.push(`신규 추천 (${block.newRecommendations.length}):`);
      for (const g of block.newRecommendations.slice(0, 5)) {
        lines.push(`  · ${g.title} (${g.organization})`);
      }
    }
    lines.push("");
  }

  lines.push(`포트폴리오 전체 보기: ${args.appUrl}/portfolio`);
  lines.push("");
  lines.push("알림 해제: 마이페이지 > 알림 설정");

  return lines.join("\n");
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function deadlineLabel(end: string): string {
  if (!end) return "기간 미정";
  const d = daysUntil(end);
  if (d < 0) return "마감";
  if (d === 0) return "오늘 마감";
  if (d <= 7) return `D-${d}`;
  return formatDate(end);
}
