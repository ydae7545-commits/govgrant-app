-- ============================================================================
-- Phase 5 — Email notification opt-in (explicit consent)
-- ============================================================================
-- Phase 1 scaffolded notification_subscriptions with email_enabled default
-- true. That was a placeholder assumption; Korean 개인정보보호법 guidance and
-- user trust both point toward explicit opt-in. This migration:
--
--   1. Flips the default on notification_subscriptions.email_enabled to FALSE
--      so every new row is opt-out by default. Existing rows are untouched
--      (prod is effectively empty — this project is pre-launch).
--
--   2. Extends handle_new_auth_user() to also auto-create a
--      notification_subscriptions row (email_enabled = false). Without this
--      trigger change, new signups would have NO row at all and both the UI
--      (read) and send-digest (filter) paths would have to treat "no row" as
--      "opt-out" — doable but fragile. Auto-insert is simpler and lets us
--      rely on a single source of truth.
--
-- Follow-up work after this migration:
--   - Update /api/admin/send-digest to inner-join this table and only keep
--     users with email_enabled = true.
--   - Add a toggle to /mypage that upserts the user's row.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Default flip
-- ----------------------------------------------------------------------------

alter table public.notification_subscriptions
  alter column email_enabled set default false;

comment on column public.notification_subscriptions.email_enabled is
  'Phase 5: explicit opt-in. default false — users must toggle ON in /mypage';

-- ----------------------------------------------------------------------------
-- 2. Auto-create notification_subscriptions row on signup
-- ----------------------------------------------------------------------------
--
-- We drop-and-recreate the existing handle_new_auth_user() function with the
-- extra insert appended. Keeping the body inline (instead of splitting into
-- two triggers) means the row creation happens in the same transaction as
-- users + personal_profiles — either all three succeed or none do.

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

  -- Phase 5: create a disabled notification subscription so the /mypage
  -- toggle has a row to update from day one. email_enabled defaults to
  -- false per the column default flip above.
  insert into public.notification_subscriptions (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_auth_user() is
  'Phase 1 + 5: auto-create public.users + personal_profiles + notification_subscriptions on OAuth signup. Subscriptions default to email_enabled=false (opt-in required).';
