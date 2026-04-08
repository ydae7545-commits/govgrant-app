import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { mockGrants } from "@/data/mock-grants";
import { dbRowToGrant, type GrantDbRow } from "@/lib/data-sources/msit";
import type { Grant } from "@/types/grant";

/**
 * Server-side grants reader.
 *
 * Phase 1~5: returns mock data from src/data/mock-grants.ts.
 * Phase 6:   returns rows from public.grants when the table has been
 *            populated AND `NEXT_PUBLIC_USE_REAL_GRANTS=true` is set.
 *
 * The fallback is intentional: while we're crawling and shaping real data,
 * we don't want the search page to suddenly become empty. As soon as the
 * Supabase table has rows AND the flag is on, reads switch over.
 *
 * IMPORTANT: callers should treat this as the *only* server-side source of
 * truth for grants. Direct imports of `mockGrants` in route handlers should
 * migrate here over time.
 */

const FLAG = process.env.NEXT_PUBLIC_USE_REAL_GRANTS === "true";

export interface GrantsSourceMeta {
  /** "mock" or "supabase" — useful for debugging the search page. */
  source: "mock" | "supabase";
  /** Total number of grants in the underlying source. */
  total: number;
}

/**
 * Read all grants the server can see right now.
 *
 * Returns mock data unless the feature flag is on AND the Supabase table
 * has at least one row. This means turning the flag on with an empty table
 * keeps mock as a safety net — you have to actually populate prod first.
 */
export async function listAllGrants(): Promise<{
  grants: Grant[];
  meta: GrantsSourceMeta;
}> {
  if (!FLAG) {
    return {
      grants: mockGrants,
      meta: { source: "mock", total: mockGrants.length },
    };
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("grants")
      .select("*")
      .order("application_end", { ascending: true, nullsFirst: false });

    if (error) {
      console.warn(
        "[grants:repository] supabase read failed, falling back to mock:",
        error.message
      );
      return {
        grants: mockGrants,
        meta: { source: "mock", total: mockGrants.length },
      };
    }

    const rows = (data ?? []) as Array<GrantDbRow & { id: string }>;
    if (rows.length === 0) {
      // Flag is on but table is empty — keep mock as a safety net.
      return {
        grants: mockGrants,
        meta: { source: "mock", total: mockGrants.length },
      };
    }

    const grants = rows.map(dbRowToGrant);
    return {
      grants,
      meta: { source: "supabase", total: grants.length },
    };
  } catch (err) {
    console.warn("[grants:repository] unexpected error:", err);
    return {
      grants: mockGrants,
      meta: { source: "mock", total: mockGrants.length },
    };
  }
}

/**
 * Find a grant by id. Mock ids are short strings like "g001"; Supabase ids
 * are uuids. Both are tried in that order so legacy bookmarks keep working.
 */
export async function findGrantById(id: string): Promise<Grant | null> {
  // Always check mock first — it's free and covers legacy short ids.
  const mockHit = mockGrants.find((g) => g.id === id);
  if (mockHit) return mockHit;

  if (!FLAG) return null;

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("grants")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;
    return dbRowToGrant(data as GrantDbRow & { id: string });
  } catch {
    return null;
  }
}

/**
 * Upsert a batch of normalized grant rows into Supabase. Used by the
 * sync-grants admin route. Returns counts so the caller can log progress.
 *
 * Conflict resolution: `external_id` is the natural key. Re-running the
 * sync overwrites stale rows in place; titles or dates that change in the
 * source are reflected on the next pass.
 */
export async function upsertGrantRows(rows: GrantDbRow[]): Promise<{
  inserted: number;
  errors: Array<{ external_id: string; message: string }>;
}> {
  if (rows.length === 0) {
    return { inserted: 0, errors: [] };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("grants")
    .upsert(rows, { onConflict: "external_id" })
    .select("id");

  if (error) {
    return {
      inserted: 0,
      errors: [{ external_id: "*", message: error.message }],
    };
  }

  return { inserted: data?.length ?? rows.length, errors: [] };
}
