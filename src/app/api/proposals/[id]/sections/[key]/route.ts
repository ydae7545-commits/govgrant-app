import { type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findGrantById } from "@/lib/grants/repository";
import {
  getLLM,
  canSpend,
  DailyLimitExceededError,
  LLMError,
  type LLMMessage,
} from "@/lib/llm";
import { PROPOSAL_SYSTEM_PROMPT } from "@/lib/llm/prompts/proposal-system";
import { buildProposalUserPrompt } from "@/lib/llm/prompts/proposal-user";
import { buildRefinePrompt } from "@/lib/llm/prompts/proposal-refine";
import { featureFlags } from "@/lib/env";
import {
  SECTION_LABELS,
  type GenerateStreamEvent,
  type ProposalSection,
  type ProposalSectionKey,
  type ProposalSections,
} from "@/types/proposal";
import type {
  UserAccount,
  Organization,
  PersonalProfile,
} from "@/types/user";
import type { GrantCategory } from "@/types/grant";

/**
 * POST /api/proposals/[id]/sections/[key]
 *
 * Regenerate or refine a single section. Body controls the mode:
 *   { mode: "regenerate" }                — fresh draft, ignore previous
 *   { mode: "refine", feedback: "..." }   — apply user feedback to current
 *   { mode: "shorten" }                   — ~60% of current length
 *   { mode: "expand"  }                   — ~150% of current length
 *
 * Returns SSE stream identical to /generate but only emits events for the
 * single requested section.
 *
 * Important: this endpoint OVERRIDES `userEdited` flag because the user
 * is explicitly asking to regenerate. If they wanted to keep their edit,
 * they wouldn't be calling this.
 */

const VALID_KEYS = [
  "overview",
  "market",
  "model",
  "plan",
  "budget",
  "impact",
  "team",
] as const satisfies readonly ProposalSectionKey[];

const BodySchema = z.object({
  mode: z.enum(["regenerate", "refine", "shorten", "expand"]),
  feedback: z.string().optional(),
});

function sse(event: string, data: GenerateStreamEvent | unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// Reuse the loaders from generate/route.ts via duplication. Phase 4 will
// extract these into a shared helper module.

async function loadAccount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<UserAccount | null> {
  const [usersRes, personalRes, interestsRes] = await Promise.all([
    supabase.from("users").select("*").eq("id", userId).maybeSingle(),
    supabase
      .from("personal_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("user_interests").select("category").eq("user_id", userId),
  ]);
  if (!usersRes.data) return null;

  const personalRow = (personalRes.data ?? {}) as Record<string, unknown>;
  const personal: PersonalProfile = {
    birthDate: (personalRow.birth_date as string | null) ?? undefined,
    region: (personalRow.region as string | null) ?? undefined,
    subRegion: (personalRow.sub_region as string | null) ?? undefined,
    incomeLevel:
      (personalRow.income_level as PersonalProfile["incomeLevel"]) ?? undefined,
    employmentStatus:
      (personalRow.employment_status as PersonalProfile["employmentStatus"]) ??
      undefined,
    householdType:
      (personalRow.household_type as PersonalProfile["householdType"]) ??
      undefined,
    hasChildren: (personalRow.has_children as boolean) ?? false,
    isDisabled: (personalRow.is_disabled as boolean) ?? false,
    isVeteran: (personalRow.is_veteran as boolean) ?? false,
  };
  const interests = (interestsRes.data ?? []).map(
    (i) => i.category as GrantCategory
  );
  const usersRow = usersRes.data as Record<string, unknown>;
  return {
    id: userId,
    displayName: (usersRow.display_name as string) || "사용자",
    email: (usersRow.email as string | null) ?? undefined,
    personal,
    organizations: [],
    interests,
    activeContextId: (usersRow.active_context_id as string) || "personal",
    createdAt: (usersRow.created_at as string) || new Date().toISOString(),
    completedOnboarding: (usersRow.completed_onboarding as boolean) ?? false,
    // 섹션 재생성 컨텍스트에서는 사용 안 함. 안전 기본값.
    emailNotificationsEnabled: false,
  };
}

async function loadOrganization(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string
): Promise<Organization | null> {
  const { data } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", organizationId)
    .maybeSingle();
  if (!data) return null;
  const o = data as Record<string, unknown>;
  return {
    id: o.id as string,
    name: o.name as string,
    kind: o.kind as Organization["kind"],
    region: (o.region as string) ?? "전국",
    businessAge: (o.business_age as number | null) ?? undefined,
    employeeCount: (o.employee_count as number | null) ?? undefined,
    revenue: (o.revenue as number | null) ?? undefined,
    industry: (o.industry as string | null) ?? undefined,
    techField: (o.tech_field as string | null) ?? undefined,
    researchField: (o.research_field as string | null) ?? undefined,
    careerYears: (o.career_years as number | null) ?? undefined,
    hasResearchInstitute: (o.has_research_institute as boolean) ?? false,
    hasResearchDepartment: (o.has_research_department as boolean) ?? false,
    certifications: (o.certifications as string[]) ?? [],
    notes: (o.notes as string | null) ?? undefined,
  };
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; key: string }> }
) {
  if (!featureFlags.useProposalAi) {
    return new Response(JSON.stringify({ error: "feature_disabled" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  const { id: proposalId, key: rawKey } = await ctx.params;
  if (!VALID_KEYS.includes(rawKey as (typeof VALID_KEYS)[number])) {
    return new Response(
      JSON.stringify({ error: "invalid_section_key", key: rawKey }),
      {
        status: 400,
        headers: { "content-type": "application/json" },
      }
    );
  }
  const sectionKey = rawKey as ProposalSectionKey;

  // Auth
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "invalid_request", details: "Invalid JSON" }),
      {
        status: 400,
        headers: { "content-type": "application/json" },
      }
    );
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: "invalid_request",
        details: parsed.error.format(),
      }),
      {
        status: 400,
        headers: { "content-type": "application/json" },
      }
    );
  }
  const { mode, feedback } = parsed.data;

  // Daily cost guard. Single section ≈ $0.07.
  try {
    await canSpend({ userId: user.id, estimateUsd: 0.1 });
  } catch (err) {
    if (err instanceof DailyLimitExceededError) {
      return new Response(
        JSON.stringify({
          error: "daily_limit_reached",
          limit: err.limitUsd,
          used: err.usedUsd,
        }),
        {
          status: 429,
          headers: { "content-type": "application/json" },
        }
      );
    }
    throw err;
  }

  // Load proposal
  const { data: proposalRow } = await supabase
    .from("proposals")
    .select("*")
    .eq("id", proposalId)
    .maybeSingle();
  if (!proposalRow) {
    return new Response(JSON.stringify({ error: "not_found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const existingSections = ((proposalRow.sections as ProposalSections) ??
    {}) as ProposalSections;
  const previous = existingSections[sectionKey];

  // For refine/shorten/expand modes we need a previous draft.
  if ((mode === "refine" || mode === "shorten" || mode === "expand") && !previous) {
    return new Response(
      JSON.stringify({
        error: "no_previous_content",
        message: "Cannot refine/shorten/expand a section that hasn't been generated yet.",
      }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  // Phase 6+: mock id 또는 Supabase UUID 둘 다 지원
  const grantId = proposalRow.grant_id as string;
  const grant = await findGrantById(grantId);
  if (!grant) {
    return new Response(
      JSON.stringify({ error: "grant_not_found", grantId }),
      {
        status: 404,
        headers: { "content-type": "application/json" },
      }
    );
  }

  // Load applicant
  const account = await loadAccount(supabase, user.id);
  if (!account) {
    return new Response(JSON.stringify({ error: "account_not_found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  let organization: Organization | undefined;
  const orgId = proposalRow.organization_id as string | null;
  if (orgId) {
    const org = await loadOrganization(supabase, orgId);
    if (org) organization = org;
  }

  // Build the LLM message stack
  const baseUserPrompt = buildProposalUserPrompt({
    grant,
    account,
    organization,
    sectionKey,
  });

  const messages: LLMMessage[] = [
    { role: "system", content: PROPOSAL_SYSTEM_PROMPT },
    { role: "user", content: baseUserPrompt },
  ];

  // For non-regenerate modes, append a follow-up turn that shows the
  // previous draft and the requested edit.
  if (mode !== "regenerate" && previous) {
    messages.push({
      role: "assistant",
      content: previous.content,
    });
    messages.push({
      role: "user",
      content: buildRefinePrompt({
        sectionKey,
        mode,
        previousContent: previous.content,
        userFeedback: feedback,
      }),
    });
  }

  const llm = getLLM();
  const adminClient = createAdminClient();

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: GenerateStreamEvent | unknown) => {
        controller.enqueue(encoder.encode(sse(event, data)));
      };

      try {
        send("section_start", {
          type: "section_start",
          key: sectionKey,
          label: SECTION_LABELS[sectionKey],
        } satisfies GenerateStreamEvent);

        const llmStream = llm.stream(messages, {
          userId: user.id,
          kind: mode === "regenerate" ? "proposal_section" : "proposal_refine",
          metadata: { proposalId, sectionKey, mode, feedback },
          maxTokens: 2048,
          temperature: 0.7,
        });

        for await (const chunk of llmStream) {
          send("delta", {
            type: "delta",
            key: sectionKey,
            delta: chunk.delta,
          } satisfies GenerateStreamEvent);
        }
        const result = await llmStream.finalize();

        const newSection: ProposalSection = {
          content: result.text,
          generatedAt: new Date().toISOString(),
          model: result.model,
          tokens: { input: result.inputTokens, output: result.outputTokens },
          costUsd: result.costUsd,
          userEdited: false, // explicit regenerate clears the flag
        };

        const updatedSections: ProposalSections = {
          ...existingSections,
          [sectionKey]: newSection,
        };
        const newVersion = ((proposalRow.version as number) ?? 1) + 1;
        const newCumulativeCost =
          Number(proposalRow.cost_estimate_usd ?? 0) + result.costUsd;

        const { error: persistErr } = await adminClient
          .from("proposals")
          .update({
            sections: updatedSections,
            cost_estimate_usd: newCumulativeCost,
            llm_model: result.model,
            version: newVersion,
            status: "in_progress",
          })
          .eq("id", proposalId);
        if (persistErr) {
          console.error("[govgrant-proposal:section:persist]", persistErr);
        }

        // Snapshot
        await adminClient.from("proposal_versions").insert({
          proposal_id: proposalId,
          version: newVersion,
          sections: updatedSections,
          created_by: user.id,
        });

        send("section_done", {
          type: "section_done",
          key: sectionKey,
          tokens: { input: result.inputTokens, output: result.outputTokens },
          costUsd: result.costUsd,
        } satisfies GenerateStreamEvent);
        send("all_done", {
          type: "all_done",
          totalCostUsd: result.costUsd,
          version: newVersion,
        } satisfies GenerateStreamEvent);
        controller.close();
      } catch (err) {
        const message =
          err instanceof LLMError
            ? `LLM error (${err.provider}): ${err.message}`
            : err instanceof Error
              ? err.message
              : String(err);
        send("error", {
          type: "error",
          key: sectionKey,
          message,
        } satisfies GenerateStreamEvent);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
