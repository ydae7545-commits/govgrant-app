"use client";

import { useCallback, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useUserStore } from "@/store/user-store";
import { featureFlags } from "@/lib/env";
import { migrateLocalStoreToSupabase } from "@/lib/migration/local-to-supabase";
import type { UserAccount, Organization } from "@/types/user";
import type { GrantCategory } from "@/types/grant";

/**
 * Hydrates the Zustand user store from Supabase when the auth state changes.
 *
 * Flow:
 *   1. useAuth tells us the current Supabase session.
 *   2. When a user signs in for the first time on this device, we pull
 *      `public.users`, `personal_profiles`, `organizations`, `user_interests`,
 *      `saved_grants`, `recent_views` and stitch them into the existing
 *      `UserAccount` shape used by every component in the app.
 *   3. The store is updated via `setAccountFromSupabase`, which triggers a
 *      re-render of ContextSwitcher / Header / Dashboard / etc.
 *   4. On sign-out we clear the store.
 *
 * When `NEXT_PUBLIC_USE_SUPABASE=false` this hook is a no-op so the existing
 * localStorage-only flow keeps working during Phase 1 incremental rollout.
 *
 * NOTE: this hook does NOT handle writes back to Supabase — that's the job
 * of the individual store actions (to be wired up later in Phase 1). Right
 * now it only reads, so the store has two sources of truth during transition.
 * We rely on optimistic updates + background sync (added next).
 */

export function useAccountHydration() {
  const { user, loading: authLoading } = useAuth();
  const setAccount = useUserStore((s) => s.setAccountFromSupabase);
  const clearAccount = useUserStore((s) => s.clearAccount);
  const currentAccountId = useUserStore((s) => s.account?.id ?? null);

  // Keep a ref so async fetches can see the latest user id when they settle,
  // avoiding stale-closure writes.
  const latestUserIdRef = useRef<string | null>(null);
  latestUserIdRef.current = user?.id ?? null;

  const hydrateFromServer = useCallback(async (userId: string) => {
    const supabase = createClient();

    // Parallel fetch — each query is RLS-protected to the current user.
    const [usersRes, personalRes, orgsRes, interestsRes, savedRes, viewsRes] =
      await Promise.all([
        supabase.from("users").select("*").eq("id", userId).maybeSingle(),
        supabase
          .from("personal_profiles")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("organizations")
          .select("*")
          .eq("owner_user_id", userId)
          .order("created_at", { ascending: true }),
        supabase.from("user_interests").select("category").eq("user_id", userId),
        supabase
          .from("saved_grants")
          .select("grant_id, saved_at")
          .eq("user_id", userId)
          .order("saved_at", { ascending: false }),
        supabase
          .from("recent_views")
          .select("grant_id, viewed_at")
          .eq("user_id", userId)
          .order("viewed_at", { ascending: false })
          .limit(20),
      ]);

    // Bail out if the user changed while we were fetching.
    if (latestUserIdRef.current !== userId) return;

    const usersRow = usersRes.data;
    if (!usersRow) {
      // No profile row yet — the handle_new_auth_user trigger should have
      // created one at signup time. Fall back to a minimal skeleton.
      setAccount(null);
      return;
    }

    const organizations: Organization[] = (orgsRes.data ?? []).map((o) => ({
      id: o.id as string,
      name: o.name as string,
      kind: o.kind as Organization["kind"],
      region: (o.region as string) ?? "전국",
      businessAge: o.business_age ?? undefined,
      employeeCount: o.employee_count ?? undefined,
      revenue: o.revenue ?? undefined,
      industry: o.industry ?? undefined,
      techField: o.tech_field ?? undefined,
      researchField: o.research_field ?? undefined,
      careerYears: o.career_years ?? undefined,
      hasResearchInstitute: o.has_research_institute ?? false,
      hasResearchDepartment: o.has_research_department ?? false,
      certifications: o.certifications ?? [],
      notes: o.notes ?? undefined,
    }));

    const interests: GrantCategory[] =
      (interestsRes.data ?? []).map((i) => i.category as GrantCategory) ?? [];

    const personal = personalRes.data
      ? {
          birthDate: (personalRes.data.birth_date as string | null) ?? undefined,
          region: (personalRes.data.region as string | null) ?? undefined,
          subRegion:
            (personalRes.data.sub_region as string | null) ?? undefined,
          incomeLevel:
            (personalRes.data.income_level as
              | "저소득"
              | "중위소득"
              | "일반"
              | null) ?? undefined,
          employmentStatus:
            (personalRes.data.employment_status as
              | "재직"
              | "구직"
              | "학생"
              | "기타"
              | null) ?? undefined,
          householdType:
            (personalRes.data.household_type as
              | "1인"
              | "신혼"
              | "다자녀"
              | "일반"
              | null) ?? undefined,
          hasChildren: personalRes.data.has_children ?? false,
          isDisabled: personalRes.data.is_disabled ?? false,
          isVeteran: personalRes.data.is_veteran ?? false,
        }
      : {};

    const account: UserAccount = {
      id: usersRow.id as string,
      displayName: (usersRow.display_name as string) || "사용자",
      email: (usersRow.email as string | null) ?? undefined,
      personal,
      organizations,
      interests,
      activeContextId:
        (usersRow.active_context_id as string) || "personal",
      createdAt:
        (usersRow.created_at as string | null) ?? new Date().toISOString(),
      completedOnboarding: usersRow.completed_onboarding ?? false,
    };

    const savedGrantIds = (savedRes.data ?? []).map(
      (r) => r.grant_id as string
    );
    const recentViewedIds = (viewsRes.data ?? []).map(
      (r) => r.grant_id as string
    );

    setAccount({ account, savedGrantIds, recentViewedIds });
  }, [setAccount]);

  useEffect(() => {
    if (!featureFlags.useSupabase) return;
    if (authLoading) return;

    if (user) {
      // Signed in: hydrate if we haven't already (or if the user changed).
      if (currentAccountId !== user.id) {
        // Run migration BEFORE hydration so the hydration reads the freshly
        // uploaded rows. Migration is idempotent and bails out quickly if it
        // has already run on this device for this user.
        void migrateLocalStoreToSupabase(user.id).finally(() => {
          // Always hydrate, even if migration was skipped or failed — the
          // user may have data on the server from another device.
          if (latestUserIdRef.current === user.id) {
            void hydrateFromServer(user.id);
          }
        });
      }
    } else if (currentAccountId) {
      // Signed out but store still has data → clear.
      clearAccount();
    }
  }, [user, authLoading, currentAccountId, hydrateFromServer, clearAccount]);
}
