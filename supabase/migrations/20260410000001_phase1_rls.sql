-- ============================================================================
-- Phase 1 — Row Level Security policies
-- ============================================================================
-- Applied after core schema. Every table is RLS-enabled and has minimal
-- principle-of-least-privilege policies. Writes that bypass RLS are done via
-- service_role in trusted server contexts (Edge Functions, API routes with
-- `src/lib/supabase/admin.ts`).
--
-- Design:
--   - `users`, `personal_profiles`, `user_interests`, `saved_grants`,
--     `recent_views`, `proposals`, `notification_subscriptions`:
--       본인(user_id = auth.uid())만 full CRUD.
--
--   - `organizations`:
--       select: 멤버십이 있는 조직만 (Phase 1은 owner뿐, Phase 7에서 팀원 확장).
--       insert: 본인이 owner로만 삽입 가능.
--       update/delete: owner만 (org_memberships.role = 'owner').
--
--   - `org_memberships`:
--       select: 본인 레코드만 (어느 조직에 속해 있는지).
--       write: service_role 전용 (초대 로직은 서버 액션에서).
--
--   - `grants`:
--       모두 public read (앱 유저 누구나 과제 카탈로그 조회).
--       write는 service_role 전용 (Phase 6 수집 파이프라인).
--
--   - `usage_events`, `subscriptions`, `notifications`:
--       본인 select만. insert/update는 service_role.
--
-- 검증 방법:
--   Phase 1 완료 후 Supabase SQL Editor에서 anon key로 다른 유저의 행을 강제
--   조회해보고 빈 결과가 나오는지 확인 (docs/SETUP.md 트러블슈팅 참조).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enable RLS on every table
-- ----------------------------------------------------------------------------

alter table public.users enable row level security;
alter table public.personal_profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.org_memberships enable row level security;
alter table public.user_interests enable row level security;
alter table public.saved_grants enable row level security;
alter table public.recent_views enable row level security;
alter table public.grants enable row level security;
alter table public.proposals enable row level security;
alter table public.proposal_versions enable row level security;
alter table public.usage_events enable row level security;
alter table public.notification_subscriptions enable row level security;
alter table public.notifications enable row level security;
alter table public.subscriptions enable row level security;

-- ----------------------------------------------------------------------------
-- users: 본인만
-- ----------------------------------------------------------------------------

create policy "users_select_own"
  on public.users for select
  using (auth.uid() = id);

create policy "users_update_own"
  on public.users for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- insert는 handle_new_auth_user 트리거에서 security definer로 실행되므로
-- 별도 정책 불필요. 사용자가 임의 삽입하지 못하게 insert 정책은 만들지 않음.

-- ----------------------------------------------------------------------------
-- personal_profiles: 본인만
-- ----------------------------------------------------------------------------

create policy "personal_profiles_select_own"
  on public.personal_profiles for select
  using (auth.uid() = user_id);

create policy "personal_profiles_insert_own"
  on public.personal_profiles for insert
  with check (auth.uid() = user_id);

create policy "personal_profiles_update_own"
  on public.personal_profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- delete는 users 삭제 시 cascade로 처리되므로 별도 정책 불필요

-- ----------------------------------------------------------------------------
-- organizations: 멤버십 기반
-- ----------------------------------------------------------------------------

create policy "organizations_select_if_member"
  on public.organizations for select
  using (
    exists (
      select 1 from public.org_memberships m
      where m.organization_id = organizations.id
        and m.user_id = auth.uid()
    )
  );

create policy "organizations_insert_as_owner"
  on public.organizations for insert
  with check (owner_user_id = auth.uid());

create policy "organizations_update_if_owner"
  on public.organizations for update
  using (
    exists (
      select 1 from public.org_memberships m
      where m.organization_id = organizations.id
        and m.user_id = auth.uid()
        and m.role = 'owner'
    )
  )
  with check (
    exists (
      select 1 from public.org_memberships m
      where m.organization_id = organizations.id
        and m.user_id = auth.uid()
        and m.role = 'owner'
    )
  );

create policy "organizations_delete_if_owner"
  on public.organizations for delete
  using (
    exists (
      select 1 from public.org_memberships m
      where m.organization_id = organizations.id
        and m.user_id = auth.uid()
        and m.role = 'owner'
    )
  );

-- ----------------------------------------------------------------------------
-- org_memberships: 본인 레코드만 read. write는 service_role 전용.
-- ----------------------------------------------------------------------------

create policy "org_memberships_select_own"
  on public.org_memberships for select
  using (user_id = auth.uid());

-- insert/update/delete 정책 없음 → service_role 외에는 불가.
-- handle_new_organization 트리거는 security definer로 실행되어 RLS 우회.

-- ----------------------------------------------------------------------------
-- user_interests: 본인만
-- ----------------------------------------------------------------------------

create policy "user_interests_all_own"
  on public.user_interests for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- saved_grants: 본인만
-- ----------------------------------------------------------------------------

create policy "saved_grants_all_own"
  on public.saved_grants for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- recent_views: 본인만
-- ----------------------------------------------------------------------------

create policy "recent_views_all_own"
  on public.recent_views for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- grants: 모두 public read
-- ----------------------------------------------------------------------------

create policy "grants_public_select"
  on public.grants for select
  using (true);

-- write는 service_role 전용 (정책 없음)

-- ----------------------------------------------------------------------------
-- proposals: 본인만
-- ----------------------------------------------------------------------------

create policy "proposals_all_own"
  on public.proposals for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- proposal_versions: 본인 proposal 소유자만
-- ----------------------------------------------------------------------------

create policy "proposal_versions_select_if_owner"
  on public.proposal_versions for select
  using (
    exists (
      select 1 from public.proposals p
      where p.id = proposal_versions.proposal_id
        and p.user_id = auth.uid()
    )
  );

create policy "proposal_versions_insert_if_owner"
  on public.proposal_versions for insert
  with check (
    exists (
      select 1 from public.proposals p
      where p.id = proposal_versions.proposal_id
        and p.user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- usage_events: 본인 select만. insert는 service_role.
-- ----------------------------------------------------------------------------

create policy "usage_events_select_own"
  on public.usage_events for select
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- notification_subscriptions: 본인만
-- ----------------------------------------------------------------------------

create policy "notification_subscriptions_all_own"
  on public.notification_subscriptions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- notifications: 본인 select + update (read_at만). insert는 service_role.
-- ----------------------------------------------------------------------------

create policy "notifications_select_own"
  on public.notifications for select
  using (auth.uid() = user_id);

create policy "notifications_update_own"
  on public.notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- subscriptions: 본인 select만. write는 service_role (결제 webhook).
-- ----------------------------------------------------------------------------

create policy "subscriptions_select_own"
  on public.subscriptions for select
  using (auth.uid() = user_id);
