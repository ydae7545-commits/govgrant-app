import "server-only";

import type { ProposalSectionKey } from "@/types/proposal";
import { SECTION_LABELS } from "@/types/proposal";

/**
 * Build a follow-up prompt that asks the model to revise an existing
 * section. Used by the "regenerate this section" button in the editor.
 *
 * The system prompt + main user prompt (proposal-system, proposal-user)
 * still apply — this is appended as an additional user message that
 * provides the previous draft and the user's feedback.
 *
 * Modes:
 *   - "regenerate": throw away the previous draft and start fresh with
 *     the same instructions.
 *   - "refine": keep the previous draft as a baseline and apply the
 *     user's feedback to it. The model should preserve good parts and
 *     fix only what was asked.
 *   - "shorten" / "expand": meta-edits without specific feedback text.
 */

export type RefineMode = "regenerate" | "refine" | "shorten" | "expand";

export interface BuildRefinePromptInput {
  sectionKey: ProposalSectionKey;
  mode: RefineMode;
  /** The current Markdown content of the section. */
  previousContent: string;
  /** Free-text user feedback (only used in "refine" mode). */
  userFeedback?: string;
}

export function buildRefinePrompt(input: BuildRefinePromptInput): string {
  const sectionLabel = SECTION_LABELS[input.sectionKey];
  const lines: string[] = [];

  lines.push(`## 이전 작성본 (${sectionLabel})`);
  lines.push("```markdown");
  lines.push(input.previousContent);
  lines.push("```");
  lines.push("");

  switch (input.mode) {
    case "regenerate":
      lines.push("## 재작성 요청");
      lines.push(
        "위 작성본은 무시하고, 같은 섹션을 처음부터 새로 작성해주세요. 이전과는 다른 구조나 표현을 시도해보세요."
      );
      break;

    case "refine":
      lines.push("## 수정 요청");
      lines.push(
        "위 작성본을 기반으로 다음 피드백을 반영하여 수정해주세요. 좋은 부분은 그대로 두고, 지적된 부분만 고치세요."
      );
      lines.push("");
      lines.push("### 사용자 피드백");
      lines.push(input.userFeedback ?? "[피드백 없음]");
      break;

    case "shorten":
      lines.push("## 분량 축소 요청");
      lines.push(
        "위 작성본의 핵심 메시지는 그대로 유지하되, 분량을 약 60% 수준으로 줄여주세요. 평가위원이 빠르게 읽을 수 있도록 가장 중요한 정보만 남기세요."
      );
      break;

    case "expand":
      lines.push("## 분량 확장 요청");
      lines.push(
        "위 작성본을 약 1.5배 분량으로 확장해주세요. 추가하는 내용은 구체적인 수치, 사례, 단계별 설명이어야 하며, 추상적 형용사나 반복은 피하세요. 새로 만든 수치는 반드시 \\`[보완 필요]\\` 표시를 붙입니다."
      );
      break;
  }

  lines.push("");
  lines.push(
    `섹션 제목 \`## ${sectionLabel}\` 으로 시작하는 Markdown만 출력합니다.`
  );

  return lines.join("\n");
}
