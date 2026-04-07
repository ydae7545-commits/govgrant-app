import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { featureFlags } from "@/lib/env";

/**
 * GET /api/proposals/[id]/versions
 *
 * List historical snapshots of a proposal. RLS already restricts visibility
 * to the proposal owner via the parent `proposals` row.
 */

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!featureFlags.useProposalAi) {
    return NextResponse.json({ error: "feature_disabled" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Confirm ownership through proposals (RLS protects this).
  const { data: proposal } = await supabase
    .from("proposals")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!proposal) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("proposal_versions")
    .select("id, version, sections, created_at")
    .eq("proposal_id", id)
    .order("version", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json(
      { error: "fetch_failed", message: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    versions: (data ?? []).map((row) => ({
      id: row.id,
      version: row.version,
      sections: row.sections,
      createdAt: row.created_at,
    })),
  });
}
