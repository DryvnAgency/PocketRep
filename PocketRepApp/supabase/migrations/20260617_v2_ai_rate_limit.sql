-- 20260617_v2_ai_rate_limit.sql
-- P2-A2: per-minute AI request throttle for ai-proxy (abuse / cost-runaway rail).
--
-- ai-proxy (service_role) calls bump_ai_minute() once per inbound request; the
-- edge function compares the returned count to its per-minute limit (AI_RATE_PER_MIN,
-- default 30) and returns 429 above it. Additive + idempotent. Does NOT alter any
-- existing function's grants.

create table if not exists public.ai_minute_usage (
  user_id       uuid        not null,
  minute_start  timestamptz not null,
  request_count integer     not null default 0,
  primary key (user_id, minute_start)
);

-- Only service_role (which bypasses RLS) ever reads/writes this table. RLS on with
-- no policies => anon/authenticated get no direct access.
alter table public.ai_minute_usage enable row level security;

create or replace function public.bump_ai_minute(p_user_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_minute timestamptz := date_trunc('minute', now());
  v_count  integer;
begin
  insert into public.ai_minute_usage (user_id, minute_start, request_count)
  values (p_user_id, v_minute, 1)
  on conflict (user_id, minute_start)
  do update set request_count = public.ai_minute_usage.request_count + 1
  returning request_count into v_count;

  -- Self-clean this user's stale buckets (a handful of rows) so the table stays tiny.
  delete from public.ai_minute_usage
  where user_id = p_user_id
    and minute_start < v_minute - interval '5 minutes';

  return v_count;
end;
$$;

-- Grants: revoke PUBLIC and (re)assert service_role. Supabase still grants EXECUTE
-- to anon/authenticated by default-privilege, but that is harmless here: bump_ai_minute
-- is SECURITY INVOKER, so a non-service_role caller's write hits the empty-policy RLS
-- wall on ai_minute_usage and is denied ("new row violates row-level security policy").
-- Only service_role (BYPASSRLS, used by ai-proxy) can actually increment. We intentionally
-- do NOT touch anon/authenticated EXECUTE on any existing function.
revoke all on function public.bump_ai_minute(uuid) from public;
grant execute on function public.bump_ai_minute(uuid) to service_role;
