-- 20260612_v2_db_hygiene.sql
--
-- DB hygiene (production-readiness audit P1-7). Three parts, all derived from
-- live introspection of fwvrauqdoevwmwwqlfav (pg_policies / pg_indexes /
-- pg_constraint) — nothing here is guessed:
--
--   1. Drop the duplicate ALL policy on contacts. "Users manage own contacts"
--      and "contacts_all_own" are both ALL / (auth.uid() = user_id); keep the
--      latter (explicit WITH CHECK + matches the *_all_own naming convention).
--   2. Drop the duplicate (user_id, heat_score) index on contacts. Both
--      contacts_user_heat and contacts_heat_score_idx cover exactly that pair;
--      keep contacts_heat_score_idx.
--   3. Cover the hot unindexed foreign keys (the live v2 ones the advisor flags;
--      the two appointment_signals FKs are a dead legacy table and are skipped).
--   4. Wrap auth.uid() as (select auth.uid()) in every RLS policy that uses it,
--      so Postgres evaluates it once per query (initplan) instead of per row.
--      This is SEMANTICALLY IDENTICAL — same uid, same owner-scoped isolation —
--      purely a performance fix. ALTER-only + guarded, so it's idempotent and
--      fail-safe (a bad expression errors without dropping the policy).
--
-- Does NOT touch: SECURITY DEFINER function grants, the cron, Stripe/billing, or
-- any auth flow. holiday_calendar / waitlist policies use `true` and are left as-is.
--
-- Additive/idempotent — safe to (re-)run.

-- 1. Duplicate contacts policy ------------------------------------------------
drop policy if exists "Users manage own contacts" on public.contacts;

-- 2. Duplicate contacts index -------------------------------------------------
drop index if exists public.contacts_user_heat;

-- 3. Hot unindexed foreign keys -----------------------------------------------
create index if not exists deals_contact_id_idx              on public.deals (contact_id);
create index if not exists deals_user_id_idx                 on public.deals (user_id);
create index if not exists reminders_contact_id_idx          on public.reminders (contact_id);
create index if not exists rex_messages_contact_id_idx       on public.rex_messages (contact_id);
create index if not exists sequence_steps_contact_id_idx     on public.sequence_steps (contact_id);
create index if not exists contact_sequences_sequence_id_idx on public.contact_sequences (sequence_id);

-- 4. (select auth.uid()) rewrite ---------------------------------------------
-- Each ALTER is guarded so the migration is re-runnable; ALTER preserves cmd,
-- roles, and permissive — only USING / WITH CHECK change, and only to wrap the
-- exact same expression. WITH CHECK is set only where it was already explicit;
-- policies that left it implicit keep defaulting to the (new) USING expression.
do $$
begin
  if exists (select 1 from pg_policies where schemaname='public' and tablename='contact_milestones' and policyname='Users see own milestones') then
    alter policy "Users see own milestones" on public.contact_milestones using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='contact_sequences' and policyname='contact_sequences_all_own') then
    alter policy contact_sequences_all_own on public.contact_sequences using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='contacts' and policyname='contacts_all_own') then
    alter policy contacts_all_own on public.contacts using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='daily_ai_usage' and policyname='Users read own usage') then
    alter policy "Users read own usage" on public.daily_ai_usage using ((select auth.uid()) = user_id);
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='deals' and policyname='Users manage own deals') then
    alter policy "Users manage own deals" on public.deals using ((select auth.uid()) = user_id);
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='heat_sheet_log' and policyname='heat_sheet_log_all_own') then
    alter policy heat_sheet_log_all_own on public.heat_sheet_log using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='interactions' and policyname='interactions_all_own') then
    alter policy interactions_all_own on public.interactions using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='mass_texts' and policyname='mass_texts_all_own') then
    alter policy mass_texts_all_own on public.mass_texts using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='nurture_messages' and policyname='Users see own nurture history') then
    alter policy "Users see own nurture history" on public.nurture_messages using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='pay_plans' and policyname='pay_plans_user_owns_delete') then
    alter policy pay_plans_user_owns_delete on public.pay_plans using ((select auth.uid()) = user_id);
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='pay_plans' and policyname='pay_plans_user_owns_insert') then
    alter policy pay_plans_user_owns_insert on public.pay_plans with check ((select auth.uid()) = user_id);
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='pay_plans' and policyname='pay_plans_user_owns_select') then
    alter policy pay_plans_user_owns_select on public.pay_plans using ((select auth.uid()) = user_id);
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='pay_plans' and policyname='pay_plans_user_owns_update') then
    alter policy pay_plans_user_owns_update on public.pay_plans using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='Users manage own profile') then
    alter policy "Users manage own profile" on public.profiles using ((select auth.uid()) = id);
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='reminders' and policyname='reminders_delete_own') then
    alter policy reminders_delete_own on public.reminders using ((select auth.uid()) = user_id);
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='reminders' and policyname='reminders_insert_own') then
    alter policy reminders_insert_own on public.reminders with check ((select auth.uid()) = user_id);
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='reminders' and policyname='reminders_select_own') then
    alter policy reminders_select_own on public.reminders using ((select auth.uid()) = user_id);
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='reminders' and policyname='reminders_update_own') then
    alter policy reminders_update_own on public.reminders using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='rex_action_log' and policyname='Users see own action log') then
    alter policy "Users see own action log" on public.rex_action_log using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='rex_memory' and policyname='Users manage own rex_memory') then
    alter policy "Users manage own rex_memory" on public.rex_memory using ((select auth.uid()) = user_id);
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='rex_messages' and policyname='Users manage own rex_messages') then
    alter policy "Users manage own rex_messages" on public.rex_messages using ((select auth.uid()) = user_id);
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='rex_usage' and policyname='Users can read own usage') then
    alter policy "Users can read own usage" on public.rex_usage using ((select auth.uid()) = user_id);
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='sequence_steps' and policyname='steps_manage') then
    alter policy steps_manage on public.sequence_steps
      using (exists (select 1 from sequences s where ((s.id = sequence_steps.sequence_id) and (s.user_id = (select auth.uid())))))
      with check (exists (select 1 from sequences s where ((s.id = sequence_steps.sequence_id) and (s.user_id = (select auth.uid())))));
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='sequence_steps' and policyname='steps_select') then
    alter policy steps_select on public.sequence_steps
      using (exists (select 1 from sequences s where ((s.id = sequence_steps.sequence_id) and ((s.user_id = (select auth.uid())) or (s.user_id is null)))));
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='sequences' and policyname='sequences_delete') then
    alter policy sequences_delete on public.sequences using ((select auth.uid()) = user_id);
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='sequences' and policyname='sequences_insert') then
    alter policy sequences_insert on public.sequences with check ((select auth.uid()) = user_id);
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='sequences' and policyname='sequences_select') then
    alter policy sequences_select on public.sequences using (((select auth.uid()) = user_id) or (user_id is null));
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='sequences' and policyname='sequences_update') then
    alter policy sequences_update on public.sequences using ((select auth.uid()) = user_id);
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='tags' and policyname='tags_user_owns_delete') then
    alter policy tags_user_owns_delete on public.tags using ((select auth.uid()) = user_id);
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='tags' and policyname='tags_user_owns_insert') then
    alter policy tags_user_owns_insert on public.tags with check ((select auth.uid()) = user_id);
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='tags' and policyname='tags_user_owns_select') then
    alter policy tags_user_owns_select on public.tags using ((select auth.uid()) = user_id);
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='tags' and policyname='tags_user_owns_update') then
    alter policy tags_user_owns_update on public.tags using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='user_push_tokens' and policyname='Users manage own push tokens') then
    alter policy "Users manage own push tokens" on public.user_push_tokens using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='users' and policyname='users_insert_own') then
    alter policy users_insert_own on public.users with check ((select auth.uid()) = id);
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='users' and policyname='users_select_own') then
    alter policy users_select_own on public.users using ((select auth.uid()) = id);
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='users' and policyname='users_update_own') then
    alter policy users_update_own on public.users using ((select auth.uid()) = id);
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='weekly_digests' and policyname='weekly_digests own rows') then
    alter policy "weekly_digests own rows" on public.weekly_digests using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
  end if;
end $$;
