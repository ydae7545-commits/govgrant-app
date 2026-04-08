"use client";

import { createClient } from "@/lib/supabase/client";
import { featureFlags } from "@/lib/env";
import type { PersonalProfile, Organization } from "@/types/user";
import type { GrantCategory } from "@/types/grant";

/**
 * Fire-and-forget Supabase sync helpers called from Zustand store actions.
 *
 * The store keeps local state updates synchronous (optimistic UI) and then
 * schedules a background push to Supabase via these helpers. We intentionally
 * do NOT await the push inside store actions so the UI stays snappy — any
 * failure is logged to the console and will retry on the next page navigation
 * via the account hydration hook re-reading from the server.
 *
 * All helpers:
 *   - Short-circuit when `featureFlags.useSupabase === false` so the legacy
 *     localStorage-only path is a no-op.
 *   - Log errors via `console.error` with a `[govgrant-sync]` prefix so dev
 *     tools surface them without crashing the page.
 *   - Use `userId` from the store's current account, which equals the
 *     Supabase auth.uid() once the user is signed in via OAuth (the
 *     useAccountHydration hook replaces the random local id with the real
 *     one at sign-in time).
 *
 * Field naming:
 *   TypeScript domain uses camelCase (`birthDate`, `techField`), Postgres
 *   columns use snake_case (`birth_date`, `tech_field`). Each helper does
 *   the translation at the boundary so neither side needs to know about the
 *   other.
 */

function enabled(): boolean {
  return featureFlags.useSupabase;
}

function logError(scope: string, err: unknown): void {
  // Keep the error shape stable in the console so we can search for it.
  if (typeof console !== "undefined") {
    console.error(`[govgrant-sync:${scope}]`, err);
  }
}

/**
 * Wrap an async call in a fire-and-forget pattern with scoped error logging.
 * Returns void so callers can't accidentally await it.
 */
function detach(scope: string, fn: () => Promise<unknown>): void {
  fn().catch((err) => logError(scope, err));
}

// ----------------------------------------------------------------------------
// users row
// ----------------------------------------------------------------------------

export function syncUpdateDisplayName(userId: string, displayName: string): void {
  if (!enabled()) return;
  detach("displayName", async () => {
    const supabase = createClient();
    const { error } = await supabase
      .from("users")
      .update({ display_name: displayName })
      .eq("id", userId);
    if (error) throw error;
  });
}

export function syncCompleteOnboarding(userId: string): void {
  if (!enabled()) return;
  detach("completeOnboarding", async () => {
    const supabase = createClient();
    const { error } = await supabase
      .from("users")
      .update({ completed_onboarding: true })
      .eq("id", userId);
    if (error) throw error;
  });
}

export function syncSetActiveContext(
  userId: string,
  activeContextId: string
): void {
  if (!enabled()) return;
  detach("activeContext", async () => {
    const supabase = createClient();
    const { error } = await supabase
      .from("users")
      .update({ active_context_id: activeContextId })
      .eq("id", userId);
    if (error) throw error;
  });
}

// ----------------------------------------------------------------------------
// personal_profiles
// ----------------------------------------------------------------------------

/**
 * Translate a Partial<PersonalProfile> (camelCase) into a snake_case object
 * suitable for upserting into `personal_profiles`. Undefined keys are dropped
 * so we don't accidentally overwrite server values with `null` when the caller
 * only meant to update one field.
 */
function mapPersonalToRow(
  updates: Partial<PersonalProfile>
): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (updates.birthDate !== undefined) row.birth_date = updates.birthDate || null;
  if (updates.region !== undefined) row.region = updates.region || null;
  if (updates.subRegion !== undefined) row.sub_region = updates.subRegion || null;
  if (updates.incomeLevel !== undefined)
    row.income_level = updates.incomeLevel || null;
  if (updates.employmentStatus !== undefined)
    row.employment_status = updates.employmentStatus || null;
  if (updates.householdType !== undefined)
    row.household_type = updates.householdType || null;
  if (updates.hasChildren !== undefined) row.has_children = !!updates.hasChildren;
  if (updates.isDisabled !== undefined) row.is_disabled = !!updates.isDisabled;
  if (updates.isVeteran !== undefined) row.is_veteran = !!updates.isVeteran;
  // `age` is deprecated; never sync the fallback field.
  return row;
}

export function syncUpdatePersonal(
  userId: string,
  updates: Partial<PersonalProfile>
): void {
  if (!enabled()) return;
  const row = mapPersonalToRow(updates);
  if (Object.keys(row).length === 0) return; // nothing to sync
  detach("updatePersonal", async () => {
    const supabase = createClient();
    // upsert with user_id as the conflict target. The personal_profiles row
    // should already exist (created by handle_new_auth_user trigger), so this
    // behaves like an update in practice.
    const { error } = await supabase
      .from("personal_profiles")
      .upsert({ user_id: userId, ...row }, { onConflict: "user_id" });
    if (error) throw error;
  });
}

// ----------------------------------------------------------------------------
// user_interests
// ----------------------------------------------------------------------------

/**
 * Replace the full set of interests. We DELETE-then-INSERT so the server
 * state matches the client exactly. This is simpler than diffing and the
 * list is small (< 20 categories).
 */
export function syncSetInterests(
  userId: string,
  interests: GrantCategory[]
): void {
  if (!enabled()) return;
  detach("setInterests", async () => {
    const supabase = createClient();
    const { error: delError } = await supabase
      .from("user_interests")
      .delete()
      .eq("user_id", userId);
    if (delError) throw delError;
    if (interests.length === 0) return;
    const rows = interests.map((category) => ({ user_id: userId, category }));
    const { error: insError } = await supabase
      .from("user_interests")
      .insert(rows);
    if (insError) throw insError;
  });
}

// ----------------------------------------------------------------------------
// organizations
// ----------------------------------------------------------------------------

function mapOrganizationToRow(
  updates: Partial<Organization>
): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (updates.name !== undefined) row.name = updates.name;
  if (updates.kind !== undefined) row.kind = updates.kind;
  if (updates.region !== undefined) row.region = updates.region;
  if (updates.businessAge !== undefined)
    row.business_age = updates.businessAge ?? null;
  if (updates.employeeCount !== undefined)
    row.employee_count = updates.employeeCount ?? null;
  if (updates.revenue !== undefined) row.revenue = updates.revenue ?? null;
  if (updates.industry !== undefined) row.industry = updates.industry ?? null;
  if (updates.techField !== undefined) row.tech_field = updates.techField ?? null;
  if (updates.researchField !== undefined)
    row.research_field = updates.researchField ?? null;
  if (updates.careerYears !== undefined)
    row.career_years = updates.careerYears ?? null;
  if (updates.hasResearchInstitute !== undefined)
    row.has_research_institute = !!updates.hasResearchInstitute;
  if (updates.hasResearchDepartment !== undefined)
    row.has_research_department = !!updates.hasResearchDepartment;
  if (updates.certifications !== undefined)
    row.certifications = updates.certifications ?? [];
  if (updates.notes !== undefined) row.notes = updates.notes ?? null;
  return row;
}

export function syncAddOrganization(
  userId: string,
  id: string,
  org: Omit<Organization, "id">
): void {
  if (!enabled()) return;
  detach("addOrganization", async () => {
    const supabase = createClient();
    const row = {
      id, // client-generated UUID; matches gen_random_uuid() type
      owner_user_id: userId,
      ...mapOrganizationToRow(org),
    };
    const { error } = await supabase.from("organizations").insert(row);
    if (error) throw error;
    // The handle_new_organization trigger auto-creates org_memberships(owner).
  });
}

export function syncUpdateOrganization(
  id: string,
  updates: Partial<Organization>
): void {
  if (!enabled()) return;
  const row = mapOrganizationToRow(updates);
  if (Object.keys(row).length === 0) return;
  detach("updateOrganization", async () => {
    const supabase = createClient();
    const { error } = await supabase
      .from("organizations")
      .update(row)
      .eq("id", id);
    if (error) throw error;
  });
}

export function syncRemoveOrganization(id: string): void {
  if (!enabled()) return;
  detach("removeOrganization", async () => {
    const supabase = createClient();
    const { error } = await supabase.from("organizations").delete().eq("id", id);
    if (error) throw error;
    // org_memberships / saved rows cascade automatically.
  });
}

// ----------------------------------------------------------------------------
// saved_grants
// ----------------------------------------------------------------------------

export function syncSaveGrant(userId: string, grantId: string): void {
  if (!enabled()) return;
  detach("saveGrant", async () => {
    const supabase = createClient();
    const { error } = await supabase
      .from("saved_grants")
      .upsert(
        { user_id: userId, grant_id: grantId },
        { onConflict: "user_id,grant_id" }
      );
    if (error) throw error;
  });
}

export function syncUnsaveGrant(userId: string, grantId: string): void {
  if (!enabled()) return;
  detach("unsaveGrant", async () => {
    const supabase = createClient();
    const { error } = await supabase
      .from("saved_grants")
      .delete()
      .eq("user_id", userId)
      .eq("grant_id", grantId);
    if (error) throw error;
  });
}

// ----------------------------------------------------------------------------
// recent_views
// ----------------------------------------------------------------------------

/**
 * Insert a new recent view. The local store caps the list at 20 entries; the
 * server accumulates indefinitely but is always fetched with LIMIT 20 on
 * hydration, so stale rows are harmless. If this becomes an issue we'll add a
 * periodic cleanup job in Phase 5 or 6.
 */
export function syncAddRecentViewed(userId: string, grantId: string): void {
  if (!enabled()) return;
  detach("addRecentViewed", async () => {
    const supabase = createClient();
    const { error } = await supabase
      .from("recent_views")
      .insert({ user_id: userId, grant_id: grantId });
    if (error) throw error;
  });
}

// ----------------------------------------------------------------------------
// notification_subscriptions (Phase 5)
// ----------------------------------------------------------------------------

/**
 * Phase 5: 사용자의 이메일 알림 수신 동의를 토글한다.
 * notification_subscriptions 행은 handle_new_auth_user 트리거가 가입 시
 * 자동 생성하므로 보통 update 만으로 충분하지만, 트리거 도입 이전에
 * 가입한 사용자나 수동 삽입 케이스를 대비해 upsert 로 처리한다.
 */
export function syncUpdateEmailNotifications(
  userId: string,
  enabled_: boolean
): void {
  if (!enabled()) return;
  detach("emailNotifications", async () => {
    const supabase = createClient();
    const { error } = await supabase
      .from("notification_subscriptions")
      .upsert(
        { user_id: userId, email_enabled: enabled_ },
        { onConflict: "user_id" }
      );
    if (error) throw error;
  });
}

/**
 * Phase 5 (확장): 알림 임계값 배열 동기화. UI 가 setEmailDeadlineDays
 * 호출하면 백그라운드로 notification_subscriptions.email_deadline_days
 * upsert. send-digest cron 이 다음 발송 시 즉시 반영한다.
 */
export function syncUpdateEmailDeadlineDays(
  userId: string,
  days: number[]
): void {
  if (!enabled()) return;
  detach("emailDeadlineDays", async () => {
    const supabase = createClient();
    const { error } = await supabase
      .from("notification_subscriptions")
      .upsert(
        { user_id: userId, email_deadline_days: days },
        { onConflict: "user_id" }
      );
    if (error) throw error;
  });
}
