-- ============================================================================
-- users 테이블에 약관 동의 캐시 컬럼 추가
-- ============================================================================
-- 20260512_user_terms_consent.sql 에서 audit-style user_consents 테이블을
-- 만들었지만, 매번 hydration 시 user_consents 를 join 해서 미동의자를
-- 검출하면 비싸다. 캐시 컬럼을 users 에 두어 callback 한 줄로 검사.
--
-- 의미:
--   - terms_accepted_version IS NULL → 약관 미동의 (callback 이 /auth/consent 로 강제)
--   - 값이 있지만 현재 약관 버전 ('1.0') 과 다름 → 재동의 필요
--   - 값이 일치 → 정상 진행
--
-- 동의 흐름:
--   1. 사용자 OAuth 로그인 → callback
--   2. callback 이 users.terms_accepted_version 검사
--   3. NULL or mismatch → /auth/consent?next=... 로 redirect
--   4. 사용자가 동의 → POST /api/account/consent
--   5. consent API 가 user_consents insert + users 캐시 업데이트
--   6. /auth/consent 가 next URL 로 router.push
--
-- 기존 사용자도 이 마이그레이션 적용 후엔 NULL 이 되므로 다음 로그인 시
-- 자동으로 동의 화면을 거친다 (= 약관 변경 시 재동의 강제 효과).
-- ============================================================================

alter table public.users
  add column if not exists terms_accepted_version text,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists privacy_accepted_version text,
  add column if not exists privacy_accepted_at timestamptz;

comment on column public.users.terms_accepted_version is
  '동의한 이용약관 버전 (terms/page.tsx 의 VERSION 상수). NULL 이면 미동의.';
comment on column public.users.privacy_accepted_version is
  '동의한 개인정보 처리방침 버전 (privacy/page.tsx 의 VERSION 상수).';
