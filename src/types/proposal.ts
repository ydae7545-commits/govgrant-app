/**
 * Proposal (사업계획서) data model — Phase 3.
 *
 * A "proposal" is an AI-assisted business plan draft that a user creates
 * for a specific government grant. The actual content is stored as 7
 * standardized sections, each independently regenerable, editable, and
 * versionable.
 *
 * Storage: maps 1:1 to `public.proposals` and `public.proposal_versions`
 * (created in supabase/migrations/20260410000000_phase1_core_schema.sql).
 *
 * Field naming follows the rest of the app: TypeScript uses camelCase,
 * Postgres uses snake_case. The conversion happens at the API route
 * boundary, similar to how UserAccount maps to public.users.
 */

/**
 * The seven canonical sections of a Korean government grant business plan.
 * Order matters — this is the order they appear in the editor and the
 * generated DOCX/Markdown export.
 */
export type ProposalSectionKey =
  | "overview"   // 사업 개요 — 누가, 무엇을, 왜, 핵심 가치 한 줄 요약
  | "market"     // 시장 분석 — TAM/SAM/SOM, 경쟁사, 페르소나
  | "model"      // 사업 모델·기술 차별성 — 수익 구조, 핵심 기술
  | "plan"       // 추진 계획 — 마일스톤, 일정, 단계별 산출물
  | "budget"     // 예산 계획 — 인건비/장비비/외주/간접비
  | "impact"     // 기대 효과 — 매출, 고용, 사회적 가치
  | "team";      // 팀 구성·수행 역량 — 핵심 인력, 보유 기술

/** Display order in the editor and export. */
export const SECTION_ORDER: readonly ProposalSectionKey[] = [
  "overview",
  "market",
  "model",
  "plan",
  "budget",
  "impact",
  "team",
] as const;

/** Korean labels rendered in the UI. */
export const SECTION_LABELS: Record<ProposalSectionKey, string> = {
  overview: "사업 개요",
  market: "시장 분석",
  model: "사업 모델·기술 차별성",
  plan: "추진 계획",
  budget: "예산 계획",
  impact: "기대 효과",
  team: "팀 구성·수행 역량",
};

/** Short hint shown above each section in the editor. */
export const SECTION_HINTS: Record<ProposalSectionKey, string> = {
  overview: "문제 정의 → 해결책 → 핵심 가치 → 과제 부합성",
  market: "시장 규모(TAM/SAM/SOM), 경쟁사 분석, 타겟 고객",
  model: "수익 모델, 핵심 기술 차별성, 진입 장벽",
  plan: "단계별 마일스톤, 일정, 핵심 산출물",
  budget: "인건비·장비비·외주용역비·간접비 구분",
  impact: "정량 성과(매출/고용/특허), 사회적 가치",
  team: "대표자·핵심 인력 역량, 보유 기술·인증",
};

/**
 * One section's content + provenance.
 *
 * `userEdited` flips to true once the user manually edits a section. The
 * editor uses this to warn before overwriting on regeneration.
 */
export interface ProposalSection {
  /** Markdown body of this section. */
  content: string;
  /** ISO timestamp of the last write (LLM generation OR user edit). */
  generatedAt: string;
  /** Model name that produced this version, e.g. "claude-sonnet-4-5". */
  model: string;
  /** Token usage for this single section generation. */
  tokens: { input: number; output: number };
  /** Estimated USD cost for this section generation. */
  costUsd: number;
  /** True if the user has manually edited this section after generation. */
  userEdited: boolean;
}

/** Storage shape: only filled sections are present. */
export type ProposalSections = Partial<Record<ProposalSectionKey, ProposalSection>>;

export type ProposalStatus =
  | "draft"        // 빈 상태 또는 일부만 생성됨
  | "in_progress"  // 사용자가 편집 중
  | "completed"    // 사용자가 완료 표시
  | "archived";    // 사용자가 보관 처리

export interface Proposal {
  id: string;                      // uuid (Postgres)
  userId: string;                  // 소유자 (RLS: auth.uid())
  organizationId: string | null;   // 어느 조직 컨텍스트로 작성하는지 (개인이면 null)
  grantId: string;                 // 연결된 과제 id (Phase 6 전엔 mock id)
  title: string;                   // 사용자가 보는 제목 (기본은 grant.title)
  status: ProposalStatus;
  sections: ProposalSections;
  /** Monotonically increasing version. Bumped on every save snapshot. */
  version: number;
  /** Default LLM model used when generating new sections. */
  llmModel: string | null;
  /** Cumulative dollar cost across all generations for this proposal. */
  costEstimateUsd: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * One snapshot in `proposal_versions`. Created when the user explicitly
 * saves or requests a version checkpoint. Lets us roll back regenerations.
 */
export interface ProposalVersion {
  id: number;             // bigserial
  proposalId: string;
  version: number;
  sections: ProposalSections;
  createdAt: string;
  createdBy: string | null; // user id (matches users.id)
}

// ----------------------------------------------------------------------------
// API request/response shapes
// ----------------------------------------------------------------------------

/** POST /api/proposals — create a new draft proposal. */
export interface CreateProposalRequest {
  grantId: string;
  /** Optional override; defaults to grant.title fetched server-side. */
  title?: string;
  /** Which organization context this proposal belongs to (omit for personal). */
  organizationId?: string;
  /** Override default model. */
  llmModel?: string;
}

/** PATCH /api/proposals/[id] — partial update from the editor. */
export interface UpdateProposalRequest {
  title?: string;
  status?: ProposalStatus;
  /**
   * Replace specific sections. The client sends only what changed; server
   * merges into existing sections JSONB.
   */
  sections?: ProposalSections;
  /** When the user manually edited a section, mark it userEdited=true. */
  markEdited?: ProposalSectionKey[];
}

/** Server-Sent Events emitted by /api/proposals/[id]/generate. */
export type GenerateStreamEvent =
  | {
      type: "section_start";
      key: ProposalSectionKey;
      label: string;
    }
  | {
      type: "delta";
      key: ProposalSectionKey;
      delta: string;
    }
  | {
      type: "section_done";
      key: ProposalSectionKey;
      tokens: { input: number; output: number };
      costUsd: number;
    }
  | {
      type: "all_done";
      totalCostUsd: number;
      version: number;
    }
  | {
      type: "error";
      key?: ProposalSectionKey;
      message: string;
    };
