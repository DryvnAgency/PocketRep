-- Tighten support-chat privileges independently from row-level policies.
-- The original migration enabled correct own-row/admin RLS, but the tables
-- retained default ALL grants for anon/authenticated. Keep only the operations
-- used by the app and scope every policy to authenticated users.

revoke all on table public.support_tickets from anon, authenticated;
revoke all on table public.support_messages from anon, authenticated;

grant select, insert on table public.support_tickets to authenticated;
grant update (status, updated_at) on table public.support_tickets to authenticated;
grant select, insert on table public.support_messages to authenticated;

alter policy support_tickets_select_own on public.support_tickets to authenticated;
alter policy support_tickets_insert_own on public.support_tickets to authenticated;
alter policy support_tickets_update_own on public.support_tickets to authenticated;
alter policy support_tickets_select_admin on public.support_tickets to authenticated;
alter policy support_tickets_update_admin on public.support_tickets to authenticated;

alter policy support_messages_select_own on public.support_messages to authenticated;
alter policy support_messages_insert_own on public.support_messages to authenticated;
alter policy support_messages_select_admin on public.support_messages to authenticated;
alter policy support_messages_insert_admin on public.support_messages to authenticated;

-- Earlier admin policies on usage/referral tables also retained the default
-- PUBLIC role. They all call the same private helper, so scope them before
-- removing anonymous access to that helper.
alter policy daily_ai_usage_select_admin on public.daily_ai_usage to authenticated;
alter policy monthly_ai_usage_select_admin on public.monthly_ai_usage to authenticated;
alter policy referral_rewards_select_admin on public.referral_rewards to authenticated;
alter policy referrals_select_admin on public.referrals to authenticated;

-- No anonymous policy calls private.is_admin after the role changes above.
revoke execute on function private.is_admin() from anon;
revoke usage on schema private from anon;
