"use client";

import { useAccountHydration } from "@/hooks/use-account";

/**
 * Client-only provider that mounts the account hydration hook once per
 * session. Placed in the root layout so every page gets a refreshed store
 * as soon as the user's Supabase session is available.
 *
 * This component renders nothing — it's purely for the side effects in
 * `useAccountHydration` (fetching `public.users` / `personal_profiles` / etc.
 * and writing them into Zustand, plus running the one-shot localStorage →
 * Supabase migration on first sign-in).
 *
 * When `NEXT_PUBLIC_USE_SUPABASE=false` the hook is a no-op, so including
 * this provider is free during Phase 0 / early Phase 1.
 */
export function AuthHydrationProvider() {
  useAccountHydration();
  return null;
}
