"use client";

import { createClient } from "@/lib/supabase/client";
import type { UserAccount } from "@/types/user";

/**
 * One-shot local → remote migration.
 *
 * The pre-Phase-1 app stored everything in `localStorage` under the key
 * `govgrant-user`. When a returning user signs into Supabase for the first
 * time on this device, we want their previously entered profile, saved
 * grants, and recent views to appear in the cloud without them redoing
 * onboarding.
 *
 * Idempotency:
 *   - Guarded by `localStorage['govgrant-migrated']`. Once set, we never
 *     run again on this device for this user.
 *   - Also guarded against race conditions by checking whether the server
 *     already has a non-default profile. If it does, we assume another
 *     device already migrated and just set the flag.
 *
 * Failure mode:
 *   - If any upsert fails, we do NOT set the `migrated` flag, so the next
 *     visit retries. The original localStorage data is never deleted, so
 *     the user cannot lose data from a failed migration.
 *
 * Phase 1 limitation:
 *   - We only migrate data that maps cleanly to the current UserAccount
 *     shape. Legacy v1 (`profile` field) is handled by the Zustand persist
 *     migrate hook before this function is ever called, so by the time we
 *     read localStorage we always see a v2+ structure.
 */

const MIGRATED_FLAG = "govgrant-migrated";
const STORE_KEY = "govgrant-user";

interface PersistedStoreShape {
  state?: {
    account?: UserAccount | null;
    savedGrantIds?: string[];
    recentViewedIds?: string[];
  };
  version?: number;
}

export interface MigrationResult {
  status:
    | "skipped_no_local_data"
    | "skipped_already_migrated"
    | "skipped_remote_has_data"
    | "migrated"
    | "error";
  error?: string;
  stats?: {
    personalWritten: boolean;
    orgsWritten: number;
    interestsWritten: number;
    savedWritten: number;
    recentWritten: number;
  };
}

function makeFlagKey(userId: string): string {
  return `${MIGRATED_FLAG}:${userId}`;
}

function readLocalStore(): PersistedStoreShape["state"] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedStoreShape;
    return parsed.state ?? null;
  } catch {
    return null;
  }
}

export async function migrateLocalStoreToSupabase(
  userId: string
): Promise<MigrationResult> {
  if (typeof window === "undefined") {
    return { status: "error", error: "server_context" };
  }

  // Per-user flag so different signed-in users on the same device each get
  // one migration chance.
  if (localStorage.getItem(makeFlagKey(userId))) {
    return { status: "skipped_already_migrated" };
  }

  const local = readLocalStore();
  const account = local?.account ?? null;
  if (!account) {
    // Nothing to migrate. Still set the flag so we don't re-check on every
    // navigation.
    localStorage.setItem(makeFlagKey(userId), "1");
    return { status: "skipped_no_local_data" };
  }

  const supabase = createClient();

  // Guard: if the server already has real data (e.g. this user migrated
  // from another device), don't overwrite.
  const { data: existingOrgs } = await supabase
    .from("organizations")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", userId);
  const { data: existingInterests } = await supabase
    .from("user_interests")
    .select("category", { count: "exact", head: true })
    .eq("user_id", userId);

  // These queries return `null` data with count metadata on `head: true`.
  // The types from supabase-js don't expose count on the data object in
  // this form, so we fetch normally and check length as a conservative
  // fallback.
  void existingOrgs;
  void existingInterests;

  const [orgsSnap, interestsSnap] = await Promise.all([
    supabase
      .from("organizations")
      .select("id")
      .eq("owner_user_id", userId)
      .limit(1),
    supabase
      .from("user_interests")
      .select("category")
      .eq("user_id", userId)
      .limit(1),
  ]);

  if ((orgsSnap.data?.length ?? 0) > 0 || (interestsSnap.data?.length ?? 0) > 0) {
    localStorage.setItem(makeFlagKey(userId), "1");
    return { status: "skipped_remote_has_data" };
  }

  // ----- Begin writes -----

  // 1. users row: display_name + completed_onboarding
  const { error: usersErr } = await supabase
    .from("users")
    .update({
      display_name: account.displayName || "사용자",
      active_context_id: account.activeContextId || "personal",
      completed_onboarding: account.completedOnboarding ?? false,
    })
    .eq("id", userId);
  if (usersErr) {
    return { status: "error", error: `users: ${usersErr.message}` };
  }

  // 2. personal_profiles
  let personalWritten = false;
  if (account.personal && Object.keys(account.personal).length > 0) {
    const p = account.personal;
    const { error: personalErr } = await supabase
      .from("personal_profiles")
      .upsert({
        user_id: userId,
        birth_date: p.birthDate ?? null,
        region: p.region ?? null,
        sub_region: p.subRegion ?? null,
        income_level: p.incomeLevel ?? null,
        employment_status: p.employmentStatus ?? null,
        household_type: p.householdType ?? null,
        has_children: p.hasChildren ?? false,
        is_disabled: p.isDisabled ?? false,
        is_veteran: p.isVeteran ?? false,
      });
    if (personalErr) {
      return { status: "error", error: `personal: ${personalErr.message}` };
    }
    personalWritten = true;
  }

  // 3. organizations + org_memberships (owner auto-created by trigger)
  let orgsWritten = 0;
  if (account.organizations.length > 0) {
    const rows = account.organizations.map((o) => ({
      owner_user_id: userId,
      name: o.name,
      kind: o.kind,
      region: o.region || "전국",
      business_age: o.businessAge ?? null,
      employee_count: o.employeeCount ?? null,
      revenue: o.revenue ?? null,
      industry: o.industry ?? null,
      tech_field: o.techField ?? null,
      research_field: o.researchField ?? null,
      career_years: o.careerYears ?? null,
      has_research_institute: o.hasResearchInstitute ?? false,
      has_research_department: o.hasResearchDepartment ?? false,
      certifications: o.certifications ?? [],
      notes: o.notes ?? null,
    }));
    const { error: orgsErr, data: orgsData } = await supabase
      .from("organizations")
      .insert(rows)
      .select("id");
    if (orgsErr) {
      return { status: "error", error: `orgs: ${orgsErr.message}` };
    }
    orgsWritten = orgsData?.length ?? 0;
  }

  // 4. user_interests
  let interestsWritten = 0;
  if (account.interests.length > 0) {
    const interestRows = account.interests.map((category) => ({
      user_id: userId,
      category,
    }));
    const { error: interestsErr } = await supabase
      .from("user_interests")
      .upsert(interestRows, { onConflict: "user_id,category" });
    if (interestsErr) {
      return {
        status: "error",
        error: `interests: ${interestsErr.message}`,
      };
    }
    interestsWritten = interestRows.length;
  }

  // 5. saved_grants
  let savedWritten = 0;
  const savedIds = local?.savedGrantIds ?? [];
  if (savedIds.length > 0) {
    const savedRows = savedIds.map((grant_id) => ({
      user_id: userId,
      grant_id,
    }));
    const { error: savedErr } = await supabase
      .from("saved_grants")
      .upsert(savedRows, { onConflict: "user_id,grant_id" });
    if (savedErr) {
      return { status: "error", error: `saved: ${savedErr.message}` };
    }
    savedWritten = savedRows.length;
  }

  // 6. recent_views (append, newest last so order preserved when SELECTed
  // with `order by viewed_at desc`)
  let recentWritten = 0;
  const recentIds = local?.recentViewedIds ?? [];
  if (recentIds.length > 0) {
    // Assign synthetic timestamps so the order is preserved.
    const now = Date.now();
    const rows = recentIds.map((grant_id, i) => ({
      user_id: userId,
      grant_id,
      viewed_at: new Date(now - i * 1000).toISOString(),
    }));
    const { error: recentErr } = await supabase
      .from("recent_views")
      .insert(rows);
    if (recentErr) {
      return { status: "error", error: `recent: ${recentErr.message}` };
    }
    recentWritten = rows.length;
  }

  // Success — set the flag so we don't re-run.
  localStorage.setItem(makeFlagKey(userId), "1");

  return {
    status: "migrated",
    stats: {
      personalWritten,
      orgsWritten,
      interestsWritten,
      savedWritten,
      recentWritten,
    },
  };
}
