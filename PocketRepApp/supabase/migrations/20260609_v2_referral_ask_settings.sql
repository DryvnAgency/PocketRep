-- 20260609_v2_referral_ask_settings.sql
--
-- Referral Asks (ITEM 2) — per-rep delay setting.
--
-- How many days after a deal is logged before the post-sale referral ask is
-- drafted. The Profile screen edits this (1-14, default 3) and mirrors it here
-- (same localStorage-cache + profiles-mirror pattern as onboarding_complete), so
-- the value survives across devices and is readable server-side.
--
-- There is no rep_settings table; profiles is the canonical per-rep settings
-- store (it already holds plan / unlimited / onboarding_complete), so the column
-- lives here. The on/off toggle is a per-device client preference (rep-settings /
-- AsyncStorage) and is intentionally not persisted server-side: a logged deal
-- only creates a referral-ask reminder when the toggle is on, so the reminder's
-- existence is the durable opt-in signal the scheduler acts on.
--
-- Additive + idempotent — safe to (re-)run.

alter table public.profiles
  add column if not exists referral_ask_delay_days integer not null default 3;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_referral_ask_delay_days_check'
  ) then
    alter table public.profiles
      add constraint profiles_referral_ask_delay_days_check
      check (referral_ask_delay_days between 1 and 14);
  end if;
end $$;

comment on column public.profiles.referral_ask_delay_days is
  'Days after a logged deal before a referral-ask draft is queued (1-14, default 3). Mirrored from the client rep-settings.';
