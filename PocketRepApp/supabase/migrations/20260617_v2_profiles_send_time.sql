-- 20260617_v2_profiles_send_time.sql
-- P2-A3 (data + setting): per-rep timezone + daily send hour, so the nurture
-- scheduler can (once wired) deliver each rep's outreach at their local send hour
-- instead of one global UTC time. Additive + idempotent.
--
-- NOTE: the scheduler consuming these (local-time gating) is a deferred follow-up
-- (MASTER_PLAN P2-A7) coupled to the gated cron-cadence change + reconciling the
-- nurture-scheduler git/deploy drift. This migration only adds the columns.

alter table public.profiles add column if not exists timezone text;
alter table public.profiles add column if not exists send_hour smallint not null default 8;

-- Range guard (0-23). Guarded so the migration is safely re-runnable.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_send_hour_range') then
    alter table public.profiles
      add constraint profiles_send_hour_range check (send_hour between 0 and 23);
  end if;
end $$;
