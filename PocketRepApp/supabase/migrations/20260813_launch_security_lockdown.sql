-- PocketRep launch security lockdown
-- Applied to production Supabase project fwvrauqdoevwmwwqlfav on 2026-08-13.
-- Keep SECURITY DEFINER helpers private; they are invoked by triggers/server-side code,
-- not directly by browser clients.

revoke execute on function public.handle_new_auth_user() from public;
revoke execute on function public.handle_new_auth_user() from anon, authenticated;
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.increment_daily_usage(uuid, date, integer, integer, numeric) from public;
revoke execute on function public.increment_daily_usage(uuid, date, integer, integer, numeric) from anon, authenticated;
revoke execute on function public.increment_rex_usage(uuid, integer) from public;
revoke execute on function public.increment_rex_usage(uuid, integer) from anon, authenticated;
revoke execute on function public.notify_waitlist_signup() from public;
revoke execute on function public.notify_waitlist_signup() from anon, authenticated;
revoke execute on function public.rls_auto_enable() from public;
revoke execute on function public.rls_auto_enable() from anon, authenticated;
revoke execute on function public.seed_marcus_for_user(uuid) from public;
revoke execute on function public.seed_marcus_for_user(uuid) from anon, authenticated;

-- Pin search_path for SECURITY DEFINER / trigger helpers flagged by Supabase.
alter function public.touch_updated_at() set search_path = public;
alter function public.increment_rex_usage(uuid, integer) set search_path = public;
alter function public.increment_daily_usage(uuid, date, integer, integer, numeric) set search_path = public;
alter function public.update_updated_at() set search_path = public;
alter function public.calculate_heat_score(contacts) set search_path = public;
