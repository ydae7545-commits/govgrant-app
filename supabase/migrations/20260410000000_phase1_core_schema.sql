-- ============================================================================
-- Phase 1 — Core schema (auth, profiles, organizations, memberships)
-- ============================================================================
-- This migration creates the minimum tables needed for Phase 1:
--   - users                    (extends auth.users with app-level profile)
--   - personal_profiles        (1:1 with users, for 개인 복지 매칭)
--   - organizations            (기업·연구소 등 소속 기관)
--   - org_memberships          (Phase 7 B2B 준비 — Phase 1에선 owner만 자동 생성)
--   - user_interests           (GrantCategory 관심 분야)
--   - saved_grants             (즐겨찾기)
--   - recent_views             (최근 본 과제 이력)
--
-- Also pre-creates tables used in later phases so the schema is forward-
-- compatible, but with no data insertions yet:
--   - grants                   (Phase 6에서 실데이터 수집)
--   - proposals                (Phase 3 사업계획서)
--   - proposal_versions        (Phase 3 버전 관리)
--   - usage_events             (Phase 2 LLM 사용량 미터링)
--   - notification_subscriptions (Phase 5)
--   - notifications            (Phase 5)
--   - subscriptions            (Phase 8 결제)
--
-- RLS policies are in the next migration (phase1_rls.sql) to keep this file
-- readable. Enable RLS first here so tables are immediately secure.
--
-- Conventions:
--   - All primary keys are UUIDs (gen_random_uuid()) except for join tables
--     where composite keys make more sense, or high-volume event tables
--     where bigserial is used.
--   - Timestamps always use timestamptz.
--   - `users.id` references auth.users.id with CASCADE delete so removing
--     the auth record cleans up all app data automatically.
--   - Domain check constraints are used for closed enum-like fields to
--     catch bad inserts early. These mirror the TypeScript string literal
--     unions in src/types/user.ts and src/types/grant.ts.
-- ============================================================================

create extension if not exists "pgcrypto";  -- for gen_random_uuid()

-- ----------------------------------------------------------------------------
-- Phase 1: core auth + profile tables
-- ----------------------------------------------------------------------------

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '사용자',
  email text,
  active_context_id text not null default 'personal',
  completed_onboarding boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.users is 'App-level user profile extending Supabase auth.users. One row per authenticated user.';
comment on column public.users.active_context_id is '"personal" | organizations.id (stored as text for flexibility)';

create table public.personal_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  birth_date date,
  region text,
  sub_region text,
  income_level text check (income_level in ('저소득', '중위소득', '일반')),
  employment_status text check (employment_status in ('재직', '구직', '학생', '기타')),
  household_type text check (household_type in ('1인', '신혼', '다자녀', '일반')),
  has_children boolean not null default false,
  is_disabled boolean not null default false,
  is_veteran boolean not null default false,
  updated_at timestamptz not null default now()
);
comment on table public.personal_profiles is '1:1 with users. Personal welfare matching fields (age, region, disability, etc.).';

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('sme', 'research', 'sole', 'public', 'nonprofit', 'other')),
  region text not null default '전국',
  business_age int,
  employee_count int,
  revenue numeric,
  industry text,
  tech_field text,
  research_field text,
  career_years int,
  has_research_institute boolean not null default false,
  has_research_department boolean not null default false,
  certifications text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index organizations_owner_idx on public.organizations (owner_user_id);
comment on table public.organizations is 'User-owned organizations. Phase 7 will extend to team-shared via org_memberships.';

create table public.org_memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin', 'editor', 'viewer')),
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (organization_id, user_id)
);
comment on table public.org_memberships is 'Phase 7 B2B prep. Phase 1 only inserts owner automatically via trigger.';

create table public.user_interests (
  user_id uuid not null references public.users(id) on delete cascade,
  category text not null,
  primary key (user_id, category)
);
comment on table public.user_interests is 'GrantCategory[]. Normalized from array to join table for indexing.';

create table public.saved_grants (
  user_id uuid not null references public.users(id) on delete cascade,
  grant_id text not null,
  saved_at timestamptz not null default now(),
  primary key (user_id, grant_id)
);
comment on column public.saved_grants.grant_id is 'Phase 1: mock id (string). Phase 6: will be migrated to grants.id UUID fk.';

create table public.recent_views (
  id bigserial primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  grant_id text not null,
  viewed_at timestamptz not null default now()
);
create index recent_views_user_viewed_idx on public.recent_views (user_id, viewed_at desc);

-- ----------------------------------------------------------------------------
-- Phase 4/6 forward prep (tables only, no RLS-enabled yet for grants)
-- ----------------------------------------------------------------------------

create table public.grants (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  title text not null,
  summary text,
  description text,
  organization_name text,
  source text,
  category text not null,
  target_types text[] not null default '{}',
  region text not null default '전국',
  amount_min bigint,
  amount_max bigint,
  application_start date,
  application_end date,
  eligibility jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}',
  url text,
  consortium jsonb,
  raw jsonb,
  fetched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index grants_category_idx on public.grants (category);
create index grants_application_end_idx on public.grants (application_end);
create index grants_tags_idx on public.grants using gin (tags);
comment on table public.grants is 'Phase 6에서 실데이터 적재 시작. Phase 1~5 동안은 src/data/mock-grants.ts 계속 사용.';

-- ----------------------------------------------------------------------------
-- Phase 3 forward prep (proposals)
-- ----------------------------------------------------------------------------

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  grant_id text,
  title text not null,
  status text not null default 'draft' check (status in ('draft', 'in_progress', 'completed', 'archived')),
  sections jsonb not null default '{}'::jsonb,
  version int not null default 1,
  llm_model text,
  cost_estimate_usd numeric(10, 4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index proposals_user_updated_idx on public.proposals (user_id, updated_at desc);

create table public.proposal_versions (
  id bigserial primary key,
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  version int not null,
  sections jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id)
);

-- ----------------------------------------------------------------------------
-- Phase 2 forward prep (LLM usage metering)
-- ----------------------------------------------------------------------------

create table public.usage_events (
  id bigserial primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null,
  provider text,
  model text,
  input_tokens int,
  output_tokens int,
  cost_usd numeric(10, 6) not null default 0,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index usage_events_user_created_idx on public.usage_events (user_id, created_at desc);
comment on table public.usage_events is 'Phase 2 LLM 사용량 미터링. Insert는 service_role 전용.';

-- ----------------------------------------------------------------------------
-- Phase 5 forward prep (notifications)
-- ----------------------------------------------------------------------------

create table public.notification_subscriptions (
  user_id uuid primary key references public.users(id) on delete cascade,
  email_enabled boolean not null default true,
  email_deadline_days int[] not null default '{7,3,1}',
  email_new_match boolean not null default true,
  kakao_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id bigserial primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null,
  grant_id text,
  payload jsonb,
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_created_idx on public.notifications (user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- Phase 8 forward prep (subscriptions)
-- ----------------------------------------------------------------------------

create table public.subscriptions (
  user_id uuid primary key references public.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro', 'business')),
  provider text,
  external_id text,
  status text,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- updated_at auto-touch trigger
-- ----------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_touch_updated_at before update on public.users
  for each row execute function public.touch_updated_at();
create trigger personal_profiles_touch_updated_at before update on public.personal_profiles
  for each row execute function public.touch_updated_at();
create trigger organizations_touch_updated_at before update on public.organizations
  for each row execute function public.touch_updated_at();
create trigger proposals_touch_updated_at before update on public.proposals
  for each row execute function public.touch_updated_at();
create trigger grants_touch_updated_at before update on public.grants
  for each row execute function public.touch_updated_at();
create trigger notification_subscriptions_touch_updated_at before update on public.notification_subscriptions
  for each row execute function public.touch_updated_at();
create trigger subscriptions_touch_updated_at before update on public.subscriptions
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- Auto-provision public.users row when auth.users is created (OAuth signup)
-- ----------------------------------------------------------------------------

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  display text;
begin
  -- Extract display name from OAuth metadata (Google / Kakao)
  display := coalesce(
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'nickname',
    split_part(coalesce(new.email, ''), '@', 1),
    '사용자'
  );

  insert into public.users (id, display_name, email)
  values (new.id, display, new.email)
  on conflict (id) do nothing;

  insert into public.personal_profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

comment on function public.handle_new_auth_user() is
  'Phase 1: auto-create public.users + personal_profiles on OAuth signup. Extracts display_name from OAuth metadata (Google: name, Kakao: nickname).';

-- ----------------------------------------------------------------------------
-- Auto-create owner membership when organization is created
-- ----------------------------------------------------------------------------

create or replace function public.handle_new_organization()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.org_memberships (organization_id, user_id, role, accepted_at)
  values (new.id, new.owner_user_id, 'owner', now())
  on conflict (organization_id, user_id) do nothing;
  return new;
end;
$$;

create trigger on_organization_created
  after insert on public.organizations
  for each row execute function public.handle_new_organization();
