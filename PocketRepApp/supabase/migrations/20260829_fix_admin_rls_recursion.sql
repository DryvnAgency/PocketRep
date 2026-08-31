-- Fix recursive admin RLS predicates.
--
-- Admin policies previously queried public.profiles from inside RLS predicates,
-- including the policy on public.profiles itself. Under an authenticated request
-- this can raise "infinite recursion detected in policy for relation profiles"
-- and poison otherwise valid tenant-scoped reads.
--
-- Keep the existing policy surface and semantics, but move the role lookup into
-- a non-exposed SECURITY DEFINER helper. The helper returns only a boolean and
-- never exposes profile data.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
  );
$$;

revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to anon, authenticated;

-- SELECT policies: preserve the existing policy names/roles/commands and only
-- replace their recursive USING expression.
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('contact_interactions', 'contact_interactions_select_admin'),
      ('contact_milestones', 'contact_milestones_select_admin'),
      ('contact_sequences', 'contact_sequences_select_admin'),
      ('contacts', 'contacts_select_admin'),
      ('daily_ai_usage', 'daily_ai_usage_select_admin'),
      ('deals', 'deals_select_admin'),
      ('entitlement_events', 'entitlement_events_select_admin'),
      ('heat_sheet_log', 'heat_sheet_log_select_admin'),
      ('interactions', 'interactions_select_admin'),
      ('mass_texts', 'mass_texts_select_admin'),
      ('monthly_ai_usage', 'monthly_ai_usage_select_admin'),
      ('nurture_messages', 'nurture_messages_select_admin'),
      ('outbound_sms_actions', 'outbound_sms_actions_select_admin'),
      ('pay_plans', 'pay_plans_select_admin'),
      ('profiles', 'profiles_select_admin'),
      ('referral_rewards', 'referral_rewards_select_admin'),
      ('referrals', 'referrals_select_admin'),
      ('reminders', 'reminders_select_admin'),
      ('rex_action_log', 'rex_action_log_select_admin'),
      ('rex_messages', 'rex_messages_select_admin'),
      ('rex_usage', 'rex_usage_select_admin'),
      ('sequence_steps', 'sequence_steps_select_admin'),
      ('sequences', 'sequences_select_admin'),
      ('support_messages', 'support_messages_select_admin'),
      ('support_tickets', 'support_tickets_select_admin'),
      ('tags', 'tags_select_admin'),
      ('users', 'users_select_admin'),
      ('weekly_digests', 'weekly_digests_select_admin')
    ) as v(table_name, policy_name)
  loop
    if exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = r.table_name
        and policyname = r.policy_name
    ) then
      execute format(
        'alter policy %I on public.%I using (private.is_admin())',
        r.policy_name,
        r.table_name
      );
    end if;
  end loop;
end
$$;

-- Preserve support-message semantics: only an admin may insert an admin-authored
-- support message.
alter policy support_messages_insert_admin
  on public.support_messages
  with check (sender_role = 'admin' and private.is_admin());

-- Preserve support-ticket admin update semantics without a recursive profile read.
alter policy support_tickets_update_admin
  on public.support_tickets
  using (private.is_admin());
