-- ============================================================================
-- 사용자 약관 동의 추적 (한국 개인정보보호법 + 정보통신망법 권장)
-- ============================================================================
-- 회원 가입 시점에 동의한 약관 ・ 처리방침의 버전과 시점 ・ IP 를 기록.
-- 분쟁 발생 시 "이 사용자가 언제 어떤 버전에 동의했는지" 입증 가능.
--
-- 구조 결정:
--   - users 테이블에 컬럼을 추가하지 않고 별도 audit-style 테이블 user_consents
--     를 둠. 사용자가 약관 버전 변경 후 재동의하면 row 가 누적되어 history
--     가 자연스럽게 보존됨.
--   - users 테이블에는 "최신 동의 시각" 만 캐시 (reading 편의용).
--
-- 사용:
--   - sign-in OAuth callback 이후 첫 진입 시 약관 동의 화면 → 동의 클릭
--     → POST /api/account/consent → 이 테이블에 row insert
--   - 해당 사용자가 마이페이지에서 동의 이력을 확인 (선택, follow-up)
-- ============================================================================

create table public.user_consents (
  id bigserial primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  -- 동의 종류 ('terms' = 이용약관, 'privacy' = 개인정보 처리방침)
  kind text not null check (kind in ('terms', 'privacy')),
  -- 동의한 약관의 버전 (예: '1.0', '1.1' — terms/privacy 페이지의 VERSION 상수)
  version text not null,
  -- 동의 시각 (UTC)
  agreed_at timestamptz not null default now(),
  -- 동의 시점의 IP (개인정보보호법 권장). x-forwarded-for 첫 IP.
  ip_address text,
  -- 동의 시점의 User-Agent (브라우저 ・ 디바이스 식별)
  user_agent text
);

create index user_consents_user_idx on public.user_consents (user_id, agreed_at desc);

comment on table public.user_consents is '사용자 약관/개인정보 처리방침 동의 이력. 분쟁 시 입증용. row 가 누적되어 모든 동의 시점 보존.';
comment on column public.user_consents.version is '동의 시점의 약관 버전 — 약관 페이지의 VERSION 상수와 일치.';

-- ----------------------------------------------------------------------------
-- RLS: 본인 이력만 select. write 는 service_role 전용.
-- ----------------------------------------------------------------------------

alter table public.user_consents enable row level security;

create policy "user_consents_select_own"
  on public.user_consents for select
  using (user_id = auth.uid());

-- insert/update/delete 정책 없음 → service_role 만 가능 (admin client).
-- POST /api/account/consent 가 cookie session 으로 사용자 검증 후 admin
-- client 로 insert 한다.
