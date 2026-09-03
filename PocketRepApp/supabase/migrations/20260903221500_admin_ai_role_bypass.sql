-- Admin is an operational role, not a customer billing state.
-- Keep the AI preflight defense-in-depth aligned with the client/edge access gate:
-- admins may use PocketRep AI without a Stripe/trial entitlement, while reps keep
-- the existing subscription checks. Function remains service-role only.

create or replace function public.bump_ai_minute(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_minute timestamptz := date_trunc('minute', now());
  v_count integer;
  v_role text;
  v_subscription text;
  v_trial_ends timestamptz;
  v_entitlement text;
  v_pending_until timestamptz;
  v_allowed boolean := false;
begin
  select lower(coalesce(role, '')),
         lower(coalesce(subscription_status, '')),
         trial_ends_at,
         lower(coalesce(entitlement_status, '')),
         entitlement_pending_until
    into v_role, v_subscription, v_trial_ends, v_entitlement, v_pending_until
  from public.profiles
  where id = p_user_id;

  if not found then
    return 2147483647;
  end if;

  if v_role = 'admin' then
    v_allowed := true;
  elsif v_entitlement = 'pending' then
    v_allowed := v_pending_until is not null and v_pending_until > now();
  elsif v_entitlement = 'locked' then
    v_allowed := false;
  elsif v_subscription = 'active' or v_entitlement = 'active' then
    v_allowed := true;
  elsif v_subscription = 'trialing' or v_entitlement = 'trialing' then
    v_allowed := v_trial_ends is null or v_trial_ends > now();
  elsif v_subscription in ('canceled', 'cancelled', 'past_due', 'unpaid', 'incomplete_expired') then
    v_allowed := false;
  elsif v_trial_ends is not null and v_trial_ends > now() then
    v_allowed := true;
  end if;

  if not v_allowed then
    return 2147483647;
  end if;

  insert into public.ai_minute_usage (user_id, minute_start, request_count)
  values (p_user_id, v_minute, 1)
  on conflict (user_id, minute_start)
  do update set request_count = public.ai_minute_usage.request_count + 1
  returning request_count into v_count;

  delete from public.ai_minute_usage
  where user_id = p_user_id
    and minute_start < v_minute - interval '5 minutes';

  return v_count;
exception
  when others then
    return 2147483647;
end;
$function$;

revoke all on function public.bump_ai_minute(uuid) from public, anon, authenticated;
grant execute on function public.bump_ai_minute(uuid) to postgres, service_role;
