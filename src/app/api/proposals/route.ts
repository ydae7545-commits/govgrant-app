import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { mockGrants } from "@/data/mock-grants";
import { featureFlags } from "@/lib/env";
import type { Proposal } from "@/types/proposal";

/**
 * /api/proposals
 *
 * POST — create a new draft proposal for a given grant.
 *   Body: { grantId, title?, organizationId?, llmModel? }
 *   Returns: { proposal: Proposal }
 *
 * GET  — list the current user's proposals (newest first).
 *   Query: ?status=draft|in_progress|completed|archived (optional)
 *   Returns: { proposals: Proposal[] }
 *
 * Both endpoints require an authenticated Supabase session and are
 * gated behind the NEXT_PUBLIC_USE_PROPOSAL_AI feature flag.
 *
 * Phase 1 storage:
 *   - `grant_id` is stored as text in `public.proposals` so it can hold
 *     either a mock id (e.g. "g001") during Phase 1~5 or a real grants.id
 *     UUID after Phase 6.
 */

// ---- Helpers ----------------------------------------------------------------

const CreateBodySchema = z.object({
  grantId: z.string().min(1),
  title: z.string().min(1).max(200).optional(),
  organizationId: z.string().uuid().nullable().optional(),
  llmModel: z.string().min(1).optional(),
});

/**
 * Map a `public.proposals` row (snake_case) into the camelCase
 * `Proposal` shape consumed by the client.
 */
function rowToProposal(row: Record<string, unknown>): Proposal {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    organizationId: (row.organization_id as string | null) ?? null,
    grantId: row.grant_id as string,
    title: row.title as string,
    status: row.status as Proposal["status"],
    sections: (row.sections as Proposal["sections"]) ?? {},
    version: (row.version as number) ?? 1,
    llmModel: (row.llm_model as string | null) ?? null,
    costEstimateUsd: Number(row.cost_estimate_usd ?? 0),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function gateError(): NextResponse | null {
  if (!featureFlags.useProposalAi) {
    return NextResponse.json(
      { error: "feature_disabled" },
      { status: 403 }
    );
  }
  return null;
}

// ---- POST: create proposal --------------------------------------------------

export async function POST(request: NextRequest) {
  const gate = gateError();
  if (gate) return gate;

  // Auth
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_request", details: "Invalid JSON" },
      { status: 400 }
    );
  }
  const parsed = CreateBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", details: parsed.error.format() },
      { status: 400 }
    );
  }
  const { grantId, title, organizationId, llmModel } = parsed.data;

  // Resolve grant title (Phase 1~5: mock data only)
  // Phase 6 will replace this with a Supabase grants table query.
  const grant = mockGrants.find((g) => g.id === grantId);
  if (!grant) {
    return NextResponse.json(
      { error: "grant_not_found", grantId },
      { status: 404 }
    );
  }

  // If user passed an organizationId, verify it belongs to them. RLS would
  // block the eventual proposals insert anyway, but we want a clean 403
  // instead of a confusing FK violation.
  if (organizationId) {
    const { data: org } = await supabase
      .from("organizations")
      .select("id")
      .eq("id", organizationId)
      .eq("owner_user_id", user.id)
      .maybeSingle();
    if (!org) {
      return NextResponse.json(
        { error: "organization_not_found_or_forbidden" },
        { status: 403 }
      );
    }
  }

  const insertRow = {
    user_id: user.id,
    organization_id: organizationId ?? null,
    grant_id: grantId,
    title: title ?? grant.title,
    status: "draft" as const,
    sections: {},
    version: 1,
    llm_model: llmModel ?? null,
    cost_estimate_usd: 0,
  };

  const { data, error } = await supabase
    .from("proposals")
    .insert(insertRow)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "create_failed", message: error?.message ?? "unknown" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { proposal: rowToProposal(data as Record<string, unknown>) },
    { status: 201 }
  );
}

// ---- GET: list proposals ----------------------------------------------------

export async function GET(request: NextRequest) {
  const gate = gateError();
  if (gate) return gate;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  let query = supabase
    .from("proposals")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });
  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json(
      { error: "list_failed", message: error.message },
      { status: 500 }
    );
  }

  const proposals = (data ?? []).map((r) =>
    rowToProposal(r as Record<string, unknown>)
  );
  return NextResponse.json({ proposals });
}
