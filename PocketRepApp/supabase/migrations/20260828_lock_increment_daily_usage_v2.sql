-- Close a gap from 20260828_referral_economics.sql: the new 6-arg
-- increment_daily_usage overload never had EXECUTE revoked from
-- PUBLIC/anon/authenticated (only GRANT ... TO service_role was added),
-- so it inherited Postgres's default grant. Verified via
-- has_function_privilege() against the live database that anon and
-- authenticated could call it directly with an arbitrary p_user_id,
-- bypassing ai-proxy's auth/cap gate entirely. Matches the existing
-- lockdown pattern already used for bump_ai_minute and
-- increment_monthly_ai_usage.
REVOKE ALL ON FUNCTION public.increment_daily_usage(uuid, date, int, int, numeric, text) FROM PUBLIC, anon, authenticated;
