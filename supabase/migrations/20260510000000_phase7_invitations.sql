-- ============================================================================
-- Phase 7 — B2B 포트폴리오 초대 시스템
-- ============================================================================
-- Phase 1 이 forward-prep 으로 만들어둔 org_memberships 를 실제로 활용하는
-- 첫 번째 마이그레이션. owner 한 명이 다른 사람을 자기 조직에 초대해서
-- 같이 추천 공고를 관리할 수 있도록 한다.
--
-- 흐름:
--   1. owner 가 /portfolio/[orgId] 에서 "팀원 초대" → 이메일 입력
--   2. POST /api/orgs/[orgId]/invitations
--      - 서버가 unique token 생성, invitations row insert (admin client)
--      - Resend 로 초대 이메일 발송 (token 이 들어간 acceptUrl)
--   3. 받는 사람이 메일의 링크 클릭 → /invitations/[token]
--      - 로그인 안 되어 있으면 /auth/sign-in?next=...
--      - 로그인 되어 있으면 조직 정보 + "수락" 버튼
--   4. 수락 → POST /api/invitations/[token]/accept
--      - org_memberships(organization_id, user_id, role='editor', accepted_at=now()) insert
--      - invitations.accepted_at, accepted_by_user_id 업데이트
--      - /portfolio/[orgId] 로 이동
--
-- 이 마이그레이션은 추가로 한 가지 작은 변경을 한다:
--   - use-account hydration 이 organizations 를 owner_user_id 로 필터링하던
--     코드를 제거할 예정인데, 그 시점에 organizations RLS 가 이미 멤버십
--     기반으로 동작하므로 멤버 사용자도 자동으로 select 가능. 즉 RLS 변경
--     불필요.
-- ============================================================================

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invited_by_user_id uuid not null references public.users(id) on delete cascade,
  invited_email text not null,
  -- URL-safe random token. 클라이언트에 노출되는 유일한 식별자.
  -- 만료 7일 + accept 후 무효화로 보안 보장.
  token text not null unique,
  role text not null default 'editor' check (role in ('editor', 'viewer')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by_user_id uuid references public.users(id) on delete set null
);

create index invitations_org_idx on public.invitations (organization_id);
create index invitations_token_idx on public.invitations (token);
create index invitations_email_idx on public.invitations (invited_email);

comment on table public.invitations is 'Phase 7: B2B 조직 초대 토큰. service_role 만 read/write — 모든 흐름은 server-side API 에서 처리.';
comment on column public.invitations.token is 'URL-safe random (32 bytes base64url). 클라이언트가 /invitations/[token] 으로 접근.';
comment on column public.invitations.expires_at is '발송 후 7일. 만료 후엔 accept API 가 거부.';

-- ----------------------------------------------------------------------------
-- RLS: invitations 는 service_role 외에 접근 불가
-- ----------------------------------------------------------------------------
-- 모든 흐름이 server-side (POST /api/orgs/[id]/invitations, POST
-- /api/invitations/[token]/accept) 라서 클라이언트가 직접 select 할 일이
-- 없다. RLS enable + 정책 없음 = anon/authenticated 모두 차단.
-- service_role 키를 사용하는 createAdminClient 만 read/write 가능.

alter table public.invitations enable row level security;

-- ----------------------------------------------------------------------------
-- updated_at 트리거 불필요 — invitations 는 accepted_at 외에는 안 변함.
-- ----------------------------------------------------------------------------
