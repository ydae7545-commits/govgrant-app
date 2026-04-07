import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { featureFlags } from "@/lib/env";
import type {
  Proposal,
  ProposalSectionKey,
  ProposalSections,
} from "@/types/proposal";
import { SECTION_ORDER } from "@/types/proposal";

/**
 * /api/proposals/[id]
 *
 * GET    — fetch a single proposal by id (owner only via RLS).
 * PATCH  — partial update: title, status, sections, markEdited.
 *          Saving creates a snapshot row in `proposal_versions`.
 * DELETE — delete the proposal (cascade also removes its versions).
 *
 * Note: dynamic params are async in Next.js 16, so we await them.
 */

const PatchBodySchema = z.object({
  title: z.string().min(1).max(200).optional(),
  status: z
    .enum(["draft", "in_progress", "completed", "archived"])
    .optional(),
  /**
   * Partial sections object — only the section keys present here will be
   * updated. Each value replaces the entire ProposalSection.
   */
  sections: z
    .record(
      z.enum([
        "overview",
        "market",
        "model",
        "plan",
        "budget",
        "impact",
        "team",
      ] as const),
      z.object({
        content: z.string(),
        generatedAt: z.string(),
        model: z.string(),
        tokens: z.object({
          input: z.number().int().nonnegative(),
          output: z.number().int().nonnegative(),
        }),
        costUsd: z.number().nonnegative(),
        userEdited: z.boolean(),
      })
    )
    .optional(),
  /**
   * Convenience: list of section keys to mark `userEdited = true` after
   * the patch is applied. The editor uses this when the user types in a
   * section without supplying a full new content blob.
   */
  markEdited: z
    .array(
      z.enum([
        "overview",
        "market",
        "model",
        "plan",
        "budget",
        "impact",
        "team",
      ] as const)
    )
    .optional(),
});

function rowToProposal(row: Record<string, unknown>): Proposal {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    organizationId: (row.organization_id as string | null) ?? null,
    grantId: row.grant_id as string,
    title: row.title as string,
    status: row.status as Proposal["status"],
    sections: (row.sections as ProposalSections) ?? {},
    version: (row.version as number) ?? 1,
    llmModel: (row.llm_model as string | null) ?? null,
    costEstimateUsd: Number(row.cost_estimate_usd ?? 0),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function gateError(): NextResponse | null {
  if (!featureFlags.useProposalAi) {
    return NextResponse.json({ error: "feature_disabled" }, { status: 403 });
  }
  return null;
}

// ---- GET --------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const gate = gateError();
  if (gate) return gate;

  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("proposals")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "fetch_failed", message: error.message },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    proposal: rowToProposal(data as Record<string, unknown>),
  });
}

// ---- PATCH ------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const gate = gateError();
  if (gate) return gate;

  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_request", details: "Invalid JSON" },
      { status: 400 }
    );
  }
  const parsed = PatchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", details: parsed.error.format() },
      { status: 400 }
    );
  }

  // Fetch current proposal so we can merge sections + bump version
  const { data: existing, error: fetchErr } = await supabase
    .from("proposals")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr || !existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const currentSections =
    ((existing as { sections?: ProposalSections }).sections ?? {}) as ProposalSections;
  const merged: ProposalSections = { ...currentSections };

  if (parsed.data.sections) {
    for (const [key, value] of Object.entries(parsed.data.sections)) {
      if (value) {
        merged[key as ProposalSectionKey] = value;
      }
    }
  }
  if (parsed.data.markEdited) {
    for (const key of parsed.data.markEdited) {
      const cur = merged[key];
      if (cur) {
        merged[key] = {
          ...cur,
          userEdited: true,
          generatedAt: new Date().toISOString(),
        };
      }
    }
  }

  // Build update payload
  const update: Record<string, unknown> = {
    sections: merged,
    version: ((existing as { version?: number }).version ?? 1) + 1,
  };
  if (parsed.data.title !== undefined) update.title = parsed.data.title;
  if (parsed.data.status !== undefined) update.status = parsed.data.status;

  const { data: updated, error: updateErr } = await supabase
    .from("proposals")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (updateErr || !updated) {
    return NextResponse.json(
      { error: "update_failed", message: updateErr?.message ?? "unknown" },
      { status: 500 }
    );
  }

  // Snapshot to proposal_versions (best-effort, don't fail the request if
  // it errors).
  const newVersion = (update.version as number) ?? 1;
  void supabase
    .from("proposal_versions")
    .insert({
      proposal_id: id,
      version: newVersion,
      sections: merged,
      created_by: user.id,
    })
    .then(({ error: snapErr }) => {
      if (snapErr) {
        console.error("[govgrant-proposal:snapshot]", snapErr);
      }
    });

  // Touch SECTION_ORDER so the import isn't tree-shaken away — we use it
  // implicitly via section validation, but we also want it available for
  // future ordering enforcement.
  void SECTION_ORDER;

  return NextResponse.json({
    proposal: rowToProposal(updated as Record<string, unknown>),
  });
}

// ---- DELETE -----------------------------------------------------------------

export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const gate = gateError();
  if (gate) return gate;

  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { error } = await supabase.from("proposals").delete().eq("id", id);
  if (error) {
    return NextResponse.json(
      { error: "delete_failed", message: error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
