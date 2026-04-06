"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserProfile } from "@/types/user";

interface UserState {
  profile: UserProfile | null;
  savedGrantIds: string[];
  recentViewedIds: string[];
  setProfile: (profile: UserProfile) => void;
  updateProfile: (updates: Partial<UserProfile>) => void;
  clearProfile: () => void;
  toggleSaveGrant: (grantId: string) => void;
  isGrantSaved: (grantId: string) => boolean;
  addRecentViewed: (grantId: string) => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      profile: null,
      savedGrantIds: [],
      recentViewedIds: [],

      setProfile: (profile) => set({ profile }),

      updateProfile: (updates) =>
        set((state) => ({
          profile: state.profile ? { ...state.profile, ...updates } : null,
        })),

      clearProfile: () =>
        set({ profile: null, savedGrantIds: [], recentViewedIds: [] }),

      toggleSaveGrant: (grantId) =>
        set((state) => ({
          savedGrantIds: state.savedGrantIds.includes(grantId)
            ? state.savedGrantIds.filter((id) => id !== grantId)
            : [...state.savedGrantIds, grantId],
        })),

      isGrantSaved: (grantId) => get().savedGrantIds.includes(grantId),

      addRecentViewed: (grantId) =>
        set((state) => {
          const filtered = state.recentViewedIds.filter(
            (id) => id !== grantId
          );
          return { recentViewedIds: [grantId, ...filtered].slice(0, 20) };
        }),
    }),
    { name: "govgrant-user" }
  )
);
