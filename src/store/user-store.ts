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
import {
  syncUpdateDisplayName,
  syncCompleteOnboarding,
  syncSetActiveContext,
  syncUpdatePersonal,
  syncSetInterests,
  syncAddOrganization,
  syncUpdateOrganization,
  syncRemoveOrganization,
  syncSaveGrant,
  syncUnsaveGrant,
  syncAddRecentViewed,
  syncUpdateEmailNotifications,
  syncUpdateEmailDeadlineDays,
} from "@/store/supabase-sync";

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

  // Notification preferences (Phase 5)
  setEmailNotificationsEnabled: (enabled: boolean) => void;
  setEmailDeadlineDays: (days: number[]) => void;

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
          // 이미 로그인 되어 있으면 이름만 업데이트. Supabase 모드에서는
          // OAuth가 이미 auth.users 행을 만들었고 displayName이 있으니
          // 사용자가 이름을 수동으로 바꿀 때만 이 경로를 탄다.
          set({ account: { ...existing, displayName } });
          syncUpdateDisplayName(existing.id, displayName);
          return;
        }
        // 신규 로컬 계정 생성 (Supabase 모드에서는 이 경로 대신
        // setAccountFromSupabase가 사용됨).
        const newAccount: UserAccount = {
          id: genId(),
          displayName: displayName || "사용자",
          personal: {},
          organizations: [],
          interests: [],
          activeContextId: "personal",
          createdAt: new Date().toISOString(),
          completedOnboarding: false,
          emailNotificationsEnabled: false, // Phase 5 — explicit opt-in
          emailDeadlineDays: [7, 3, 1],
        };
        set({ account: newAccount });
      },

      signOut: () =>
        set({ account: null, savedGrantIds: [], recentViewedIds: [] }),

      isSignedIn: () => get().account !== null,

      updatePersonal: (updates) =>
        set((state) => {
          if (!state.account) return state;
          // Fire-and-forget sync. 실패해도 UI는 이미 업데이트됨, 다음 로그인 시
          // 서버에서 재하이드레이션 되므로 결과는 최종적으로 수렴.
          syncUpdatePersonal(state.account.id, updates);
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
          syncSetInterests(state.account.id, interests);
          return { account: { ...state.account, interests } };
        }),

      completeOnboarding: () =>
        set((state) => {
          if (!state.account) return state;
          syncCompleteOnboarding(state.account.id);
          return { account: { ...state.account, completedOnboarding: true } };
        }),

      // Phase 5: 이메일 알림 수신 동의 토글. 변경 시 Supabase
      // notification_subscriptions 테이블도 upsert.
      setEmailNotificationsEnabled: (enabled) =>
        set((state) => {
          if (!state.account) return state;
          syncUpdateEmailNotifications(state.account.id, enabled);
          return {
            account: { ...state.account, emailNotificationsEnabled: enabled },
          };
        }),

      // Phase 5 (확장): 알림 임계값 [7,3,1] 다중 선택. 빈 배열 입력 시
      // 자동으로 [7] 로 보정 (적어도 한 임계값은 있어야 의미 있음).
      setEmailDeadlineDays: (days) =>
        set((state) => {
          if (!state.account) return state;
          const normalized = days.length === 0 ? [7] : days;
          syncUpdateEmailDeadlineDays(state.account.id, normalized);
          return {
            account: { ...state.account, emailDeadlineDays: normalized },
          };
        }),

      addOrganization: (org) => {
        const id = genId();
        set((state) => {
          if (!state.account) return state;
          syncAddOrganization(state.account.id, id, org);
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
          syncUpdateOrganization(id, updates);
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
          syncRemoveOrganization(id);
          // activeContext fallback 도 서버에 반영
          if (activeFallback !== state.account.activeContextId) {
            syncSetActiveContext(state.account.id, activeFallback);
          }
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
          syncSetActiveContext(state.account.id, id);
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
        set((state) => {
          const alreadySaved = state.savedGrantIds.includes(grantId);
          // Sync는 로그인된 경우에만. account가 null이면 익명 세션이므로
          // 로컬에만 저장 (Supabase RLS가 어차피 거부).
          if (state.account && state.account.id) {
            if (alreadySaved) {
              syncUnsaveGrant(state.account.id, grantId);
            } else {
              syncSaveGrant(state.account.id, grantId);
            }
          }
          return {
            savedGrantIds: alreadySaved
              ? state.savedGrantIds.filter((id) => id !== grantId)
              : [...state.savedGrantIds, grantId],
          };
        }),

      isGrantSaved: (grantId) => get().savedGrantIds.includes(grantId),

      addRecentViewed: (grantId) =>
        set((state) => {
          if (state.account && state.account.id) {
            syncAddRecentViewed(state.account.id, grantId);
          }
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
      version: 4,
      // v1 → v2 (account) → v3 (emailNotificationsEnabled) → v4 (emailDeadlineDays)
      migrate: (persisted: unknown, version: number) => {
        // v4 이상이면 그대로 사용
        if (version >= 4) return persisted as UserState;

        // v3 → v4: 기존 account 에 emailDeadlineDays 주입
        if (version === 3) {
          const current = persisted as UserState;
          if (current.account) {
            return {
              ...current,
              account: {
                ...current.account,
                emailDeadlineDays:
                  current.account.emailDeadlineDays ?? [7, 3, 1],
              },
            } as UserState;
          }
          return current;
        }

        // v2 → v4: 기존 account 에 emailNotificationsEnabled + emailDeadlineDays 둘 다 주입
        if (version === 2) {
          const current = persisted as UserState;
          if (current.account) {
            return {
              ...current,
              account: {
                ...current.account,
                emailNotificationsEnabled:
                  current.account.emailNotificationsEnabled ?? false,
                emailDeadlineDays:
                  current.account.emailDeadlineDays ?? [7, 3, 1],
              },
            } as UserState;
          }
          return current;
        }

        // v1 이하 → v2 마이그레이션 (account 구조 생성)
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
          emailNotificationsEnabled: false, // Phase 5 — explicit opt-in
          emailDeadlineDays: [7, 3, 1],
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
