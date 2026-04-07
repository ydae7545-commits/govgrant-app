"use client";

import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/**
 * Lightweight auth hook that wraps Supabase's `onAuthStateChange` so any
 * client component can reactively know about the current session/user
 * without prop drilling.
 *
 * Returns:
 *   - `loading`: true until we've fetched the initial session (prevents UI
 *     flicker between "signed out" and "signed in")
 *   - `session`: raw Supabase session (access/refresh tokens + expires_at)
 *   - `user`: the `auth.users` row for the current user (email, OAuth
 *     metadata). Note this is NOT the `public.users` profile row — use
 *     `useAccount` for that.
 *   - `signOut`: helper that calls `auth.signOut()` and clears local state
 *
 * Implementation note:
 *   We call `getSession` once for the initial fetch. Per Supabase docs,
 *   `getSession()` returns cookie-cached data without validation, which is
 *   fine for the client because authorization decisions happen on the
 *   server (API routes, RLS policies). For real authorization checks use
 *   the server client's `getClaims()` or `getUser()`.
 */

interface UseAuthResult {
  loading: boolean;
  session: Session | null;
  user: User | null;
  signOut: () => Promise<void>;
}

export function useAuth(): UseAuthResult {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    // Initial fetch.
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    // Reactive subscription. Fires on SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED,
    // USER_UPDATED, PASSWORD_RECOVERY.
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        if (!mounted) return;
        setSession(nextSession);
        setUser(nextSession?.user ?? null);
        setLoading(false);
      }
    );

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
  };

  return { loading, session, user, signOut };
}
