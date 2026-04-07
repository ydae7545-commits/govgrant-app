"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  UserAccount,
  PersonalProfile,
  Organization,
  ContextId,
  MatchContext,
} from "@/types/user";
import type { GrantCategory } from "@/types/grant";

interface UserState {
  account: UserAccount | null;
  savedGrantIds: string[];
  recentViewedIds: string[];

  // Auth-ish
  signIn: (displayName: string) => void;
  signOut: () => void;
  isSignedIn: () => boolean;

  // Profile
  updatePersonal: (updates: Partial<PersonalProfile>) => void;
  setInterests: (interests: GrantCategory[]) => void;
  completeOnboarding: () => void;

  // Organizations
  addOrganization: (org: Omit<Organization, "id">) => string;
  updateOrganization: (id: string, updates: Partial<Organization>) => void;
  removeOrganization: (id: string) => void;

  // Context
  setActiveContext: (id: ContextId) => void;
  getActiveContext: () => MatchContext | null;

  // Saved grants & history
  toggleSaveGrant: (grantId: string) => void;
  isGrantSaved: (grantId: string) => boolean;
  addRecentViewed: (grantId: string) => void;

  // Phase 1 — Supabase hydration
  // Replaces the entire store state from a Supabase fetch result. Called
  // by the useAccountHydration hook after a successful sign-in or session
  // refresh. Passing `null` clears the account but keeps saved/recent
  // arrays so the user sees them again if they sign back in.
  setAccountFromSupabase: (
    data:
      | {
          account: UserAccount;
          savedGrantIds: string[];
          recentViewedIds: string[];
        }
      | null
  ) => void;
  // Clear everything (used by sign-out handler on the client side).
  clearAccount: () => void;
}

function genId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      account: null,
      savedGrantIds: [],
      recentViewedIds: [],

      signIn: (displayName) => {
        const existing = get().account;
        if (existing) {
          // 이미 로그인 되어 있으면 이름만 업데이트
          set({ account: { ...existing, displayName } });
          return;
        }
        const newAccount: UserAccount = {
          id: genId(),
          displayName: displayName || "사용자",
          personal: {},
          organizations: [],
          interests: [],
          activeContextId: "personal",
          createdAt: new Date().toISOString(),
          completedOnboarding: false,
        };
        set({ account: newAccount });
      },

      signOut: () =>
        set({ account: null, savedGrantIds: [], recentViewedIds: [] }),

      isSignedIn: () => get().account !== null,

      updatePersonal: (updates) =>
        set((state) => {
          if (!state.account) return state;
          return {
            account: {
              ...state.account,
              personal: { ...state.account.personal, ...updates },
            },
          };
        }),

      setInterests: (interests) =>
        set((state) => {
          if (!state.account) return state;
          return { account: { ...state.account, interests } };
        }),

      completeOnboarding: () =>
        set((state) => {
          if (!state.account) return state;
          return { account: { ...state.account, completedOnboarding: true } };
        }),

      addOrganization: (org) => {
        const id = genId();
        set((state) => {
          if (!state.account) return state;
          return {
            account: {
              ...state.account,
              organizations: [...state.account.organizations, { ...org, id }],
            },
          };
        });
        return id;
      },

      updateOrganization: (id, updates) =>
        set((state) => {
          if (!state.account) return state;
          return {
            account: {
              ...state.account,
              organizations: state.account.organizations.map((o) =>
                o.id === id ? { ...o, ...updates } : o
              ),
            },
          };
        }),

      removeOrganization: (id) =>
        set((state) => {
          if (!state.account) return state;
          const remaining = state.account.organizations.filter(
            (o) => o.id !== id
          );
          const activeFallback: ContextId =
            state.account.activeContextId === id
              ? "personal"
              : state.account.activeContextId;
          return {
            account: {
              ...state.account,
              organizations: remaining,
              activeContextId: activeFallback,
            },
          };
        }),

      setActiveContext: (id) =>
        set((state) => {
          if (!state.account) return state;
          // 유효성 검사: personal 이거나 실제 존재하는 org
          const valid =
            id === "personal" ||
            state.account.organizations.some((o) => o.id === id);
          if (!valid) return state;
          return { account: { ...state.account, activeContextId: id } };
        }),

      getActiveContext: () => {
        const { account } = get();
        if (!account) return null;
        if (account.activeContextId === "personal") {
          return {
            kind: "personal",
            profile: account.personal,
            interests: account.interests,
          };
        }
        const org = account.organizations.find(
          (o) => o.id === account.activeContextId
        );
        if (!org) {
          return {
            kind: "personal",
            profile: account.personal,
            interests: account.interests,
          };
        }
        return { kind: "org", org, interests: account.interests };
      },

      toggleSaveGrant: (grantId) =>
        set((state) => ({
          savedGrantIds: state.savedGrantIds.includes(grantId)
            ? state.savedGrantIds.filter((id) => id !== grantId)
            : [...state.savedGrantIds, grantId],
        })),

      isGrantSaved: (grantId) => get().savedGrantIds.includes(grantId),

      addRecentViewed: (grantId) =>
        set((state) => {
          const filtered = state.recentViewedIds.filter((id) => id !== grantId);
          return { recentViewedIds: [grantId, ...filtered].slice(0, 20) };
        }),

      // Phase 1: bulk replace state with a Supabase fetch result. Keeps the
      // store shape identical to the local-only path so no downstream
      // component needs to care whether the source is localStorage or
      // Postgres.
      setAccountFromSupabase: (data) =>
        set(() => {
          if (data === null) {
            return { account: null };
          }
          return {
            account: data.account,
            savedGrantIds: data.savedGrantIds,
            recentViewedIds: data.recentViewedIds,
          };
        }),

      clearAccount: () =>
        set({ account: null, savedGrantIds: [], recentViewedIds: [] }),
    }),
    {
      name: "govgrant-user",
      version: 2,
      // v1 (구 profile 필드) → v2 (account) 마이그레이션
      migrate: (persisted: unknown, version: number) => {
        if (version >= 2) return persisted as UserState;
        const prev = (persisted ?? {}) as {
          profile?: {
            type?: "individual" | "sme" | "research";
            name?: string;
            interests?: GrantCategory[];
            completedOnboarding?: boolean;
            individual?: PersonalProfile & {
              age?: number;
              region?: string;
            };
            sme?: {
              businessAge?: number;
              industry?: string;
              employeeCount?: number;
              revenue?: number;
              region?: string;
              techField?: string;
            };
            research?: {
              affiliation?: string;
              researchField?: string;
              careerYears?: number;
              region?: string;
            };
          };
          savedGrantIds?: string[];
          recentViewedIds?: string[];
        };
        if (!prev.profile) {
          return {
            account: null,
            savedGrantIds: prev.savedGrantIds ?? [],
            recentViewedIds: prev.recentViewedIds ?? [],
          } as unknown as UserState;
        }
        const p = prev.profile;
        const organizations: Organization[] = [];
        if (p.type === "sme" && p.sme) {
          organizations.push({
            id: genId(),
            name: p.name || "내 사업장",
            kind: "sme",
            region: p.sme.region || "전국",
            businessAge: p.sme.businessAge,
            industry: p.sme.industry,
            employeeCount: p.sme.employeeCount,
            revenue: p.sme.revenue,
            techField: p.sme.techField,
          });
        } else if (p.type === "research" && p.research) {
          organizations.push({
            id: genId(),
            name: p.research.affiliation || "내 연구실",
            kind: "research",
            region: p.research.region || "전국",
            researchField: p.research.researchField,
            careerYears: p.research.careerYears,
          });
        }
        const account: UserAccount = {
          id: genId(),
          displayName: p.name || "사용자",
          personal: p.individual ?? {},
          organizations,
          interests: p.interests ?? [],
          activeContextId:
            p.type === "individual"
              ? "personal"
              : organizations[0]?.id ?? "personal",
          createdAt: new Date().toISOString(),
          completedOnboarding: !!p.completedOnboarding,
        };
        return {
          account,
          savedGrantIds: prev.savedGrantIds ?? [],
          recentViewedIds: prev.recentViewedIds ?? [],
        } as unknown as UserState;
      },
    }
  )
);
