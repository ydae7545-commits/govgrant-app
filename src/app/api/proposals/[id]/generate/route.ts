import { type NextRequest } from "next/server";
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
import { featureFlags } from "@/lib/env";
import {
  SECTION_ORDER,
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
 * POST /api/proposals/[id]/generate
 *
 * Streams the generation of all 7 proposal sections sequentially as
 * Server-Sent Events. The client subscribes via fetch + ReadableStream
 * and renders deltas in real time.
 *
 * Why sequential, not parallel?
 *   - Anthropic rate limits per minute are tighter than OpenAI's. Going
 *     sequential keeps us safely under burst limits.
 *   - Each section can run ~5-10 seconds, so 7 sections = ~45-70 seconds
 *     total. Acceptable for a one-shot generation.
 *   - Future optimization: parallelize once we hit higher rate limit tiers.
 *
 * Event format (SSE):
 *   - `event: section_start \n data: {key, label}`
 *   - `event: delta        \n data: {key, delta}`
 *   - `event: section_done \n data: {key, tokens, costUsd}`
 *   - `event: all_done     \n data: {totalCostUsd, version}`
 *   - `event: error        \n data: {key?, message}`
 *
 * The route only generates sections that are MISSING or NOT user-edited.
 * To force regeneration of a user-edited section, call the per-section
 * endpoint at /api/proposals/[id]/sections/[key].
 */

function sse(event: string, data: GenerateStreamEvent | unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function loadAccount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<{
  account: UserAccount;
  personalProfile: PersonalProfile;
} | null> {
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
  const personalProfile: PersonalProfile = {
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
  const account: UserAccount = {
    id: userId,
    displayName: (usersRow.display_name as string) || "사용자",
    email: (usersRow.email as string | null) ?? undefined,
    personal: personalProfile,
    organizations: [], // not needed for proposal context
    interests,
    activeContextId: (usersRow.active_context_id as string) || "personal",
    createdAt: (usersRow.created_at as string) || new Date().toISOString(),
    completedOnboarding: (usersRow.completed_onboarding as boolean) ?? false,
    // 사업계획서 생성 컨텍스트에서는 사용 안 함. 안전 기본값.
    emailNotificationsEnabled: false,
  };

  return { account, personalProfile };
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
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!featureFlags.useProposalAi) {
    return new Response(JSON.stringify({ error: "feature_disabled" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  const { id: proposalId } = await ctx.params;
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

  // Daily cost guard. Estimate $0.50 per full proposal (7 sections × ~$0.07).
  try {
    await canSpend({ userId: user.id, estimateUsd: 0.5 });
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
  const existingSections = ((proposalRow.sections as ProposalSections) ?? {}) as ProposalSections;
  const grantId = proposalRow.grant_id as string;
  const organizationId = proposalRow.organization_id as string | null;

  // Phase 6+: mock id 또는 Supabase UUID 둘 다 지원
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

  // Load applicant context
  const accountData = await loadAccount(supabase, user.id);
  if (!accountData) {
    return new Response(JSON.stringify({ error: "account_not_found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }
  const { account } = accountData;

  let organization: Organization | undefined;
  if (organizationId) {
    const org = await loadOrganization(supabase, organizationId);
    if (org) organization = org;
  }

  // Determine which sections to generate (skip user-edited ones)
  const sectionsToGenerate: ProposalSectionKey[] = SECTION_ORDER.filter(
    (key) => {
      const cur = existingSections[key];
      if (!cur) return true; // missing → generate
      if (!cur.userEdited) return true; // not user-edited → regenerate OK
      return false; // user-edited → preserve
    }
  );

  if (sectionsToGenerate.length === 0) {
    return new Response(
      JSON.stringify({ error: "all_sections_user_edited" }),
      {
        status: 400,
        headers: { "content-type": "application/json" },
      }
    );
  }

  const llm = getLLM();
  const adminClient = createAdminClient();

  // Build a ReadableStream that emits SSE events while we generate
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const updatedSections: ProposalSections = { ...existingSections };
      let totalCost = 0;

      const send = (event: string, data: GenerateStreamEvent | unknown) => {
        controller.enqueue(encoder.encode(sse(event, data)));
      };

      try {
        for (const key of sectionsToGenerate) {
          send("section_start", {
            type: "section_start",
            key,
            label: SECTION_LABELS[key],
          } satisfies GenerateStreamEvent);

          const userPrompt = buildProposalUserPrompt({
            grant,
            account,
            organization,
            sectionKey: key,
          });

          const messages: LLMMessage[] = [
            { role: "system", content: PROPOSAL_SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ];

          const llmStream = llm.stream(messages, {
            userId: user.id,
            kind: "proposal_section",
            metadata: { proposalId, sectionKey: key },
            maxTokens: 2048,
            temperature: 0.7,
          });

          // Forward delta chunks to the SSE consumer
          for await (const chunk of llmStream) {
            send("delta", {
              type: "delta",
              key,
              delta: chunk.delta,
            } satisfies GenerateStreamEvent);
          }
          const result = await llmStream.finalize();

          const newSection: ProposalSection = {
            content: result.text,
            generatedAt: new Date().toISOString(),
            model: result.model,
            tokens: {
              input: result.inputTokens,
              output: result.outputTokens,
            },
            costUsd: result.costUsd,
            userEdited: false,
          };
          updatedSections[key] = newSection;
          totalCost += result.costUsd;

          // Persist incrementally so the user doesn't lose progress on
          // a network interruption mid-stream. Use admin client to bypass
          // RLS-based update count check (the user owns the row anyway).
          const { error: persistErr } = await adminClient
            .from("proposals")
            .update({
              sections: updatedSections,
              cost_estimate_usd:
                Number(proposalRow.cost_estimate_usd ?? 0) + totalCost,
              llm_model: result.model,
              status: "in_progress",
            })
            .eq("id", proposalId);
          if (persistErr) {
            console.error("[govgrant-proposal:persist]", persistErr);
          }

          send("section_done", {
            type: "section_done",
            key,
            tokens: { input: result.inputTokens, output: result.outputTokens },
            costUsd: result.costUsd,
          } satisfies GenerateStreamEvent);
        }

        // Final version bump + snapshot
        const newVersion = ((proposalRow.version as number) ?? 1) + 1;
        await adminClient
          .from("proposals")
          .update({ version: newVersion })
          .eq("id", proposalId);
        await adminClient.from("proposal_versions").insert({
          proposal_id: proposalId,
          version: newVersion,
          sections: updatedSections,
          created_by: user.id,
        });

        send("all_done", {
          type: "all_done",
          totalCostUsd: totalCost,
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
      // Hint to proxies/CDNs not to buffer the stream.
      "x-accel-buffering": "no",
    },
  });
}
