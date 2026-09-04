-- Align the interaction enums with the actions PocketRep already records.
-- Production's legacy checks reject current call outcomes (answered/no-answer/
-- wrong-number) and the new Rex game_plan event type, which makes the timeline
-- silently lose valid history. Keep the type controlled while widening the
-- legitimate V1 vocabulary.
alter table public.interactions drop constraint if exists interactions_type_check;
alter table public.interactions
  add constraint interactions_type_check
  check (type in ('call','text','email','visit','note','game_plan'));

alter table public.interactions drop constraint if exists interactions_outcome_check;
alter table public.interactions
  add constraint interactions_outcome_check
  check (
    outcome is null or outcome in (
      'connected','voicemail','no_answer','replied','no_reply','deal_closed',
      'answered','no-answer','wrong-number','confirmed_sent','completed','not_sent'
    )
  );

-- V1 contact-card history is append-only.
-- Current editable contact fields may evolve, but historical timeline facts may not be rewritten.

-- Owners can read and append their own history, but cannot UPDATE or DELETE it.
-- Use RLS rather than a DELETE trigger so account-level FK cascades and service-
-- role retention/deletion workflows still work correctly.
drop policy if exists interactions_all_own on public.interactions;
drop policy if exists interactions_select_own on public.interactions;
drop policy if exists interactions_insert_own on public.interactions;
create policy interactions_select_own on public.interactions
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy interactions_insert_own on public.interactions
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- SMS actions legitimately transition status after the rep returns from the
-- native Messages app, but the original customer/message/source/timestamps
-- that describe what PocketRep opened must remain immutable.
create or replace function public.guard_outbound_sms_history_payload()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.user_id is distinct from old.user_id
     or new.contact_id is distinct from old.contact_id
     or new.message_body is distinct from old.message_body
     or new.source is distinct from old.source
     or new.created_at is distinct from old.created_at
     or new.opened_at is distinct from old.opened_at then
    raise exception 'outbound SMS history payload is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists outbound_sms_history_payload_guard on public.outbound_sms_actions;
create trigger outbound_sms_history_payload_guard
before update on public.outbound_sms_actions
for each row execute function public.guard_outbound_sms_history_payload();

-- Split the legacy ALL policy: owners may SELECT/INSERT/UPDATE their rows,
-- but there is deliberately no DELETE policy. The UPDATE trigger above limits
-- owner updates to status/completed_at while preserving the original payload.
drop policy if exists outbound_sms_actions_all_own on public.outbound_sms_actions;
drop policy if exists outbound_sms_actions_select_own on public.outbound_sms_actions;
drop policy if exists outbound_sms_actions_insert_own on public.outbound_sms_actions;
drop policy if exists outbound_sms_actions_update_own on public.outbound_sms_actions;
create policy outbound_sms_actions_select_own on public.outbound_sms_actions
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy outbound_sms_actions_insert_own on public.outbound_sms_actions
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy outbound_sms_actions_update_own on public.outbound_sms_actions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Clean up the obsolete hard-delete trigger/function if an earlier preview of
-- this migration was ever applied outside production.
drop trigger if exists outbound_sms_history_delete_guard on public.outbound_sms_actions;
drop function if exists public.block_outbound_sms_history_delete();
