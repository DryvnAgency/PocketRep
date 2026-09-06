-- V1 launch hardening: once an outbound_sms_actions row reaches a terminal
-- status, its status must never change again.
--
-- 20260904003000_v1_immutable_contact_history.sql already locked this
-- table's payload columns (user_id/contact_id/message_body/source/
-- created_at/opened_at) but deliberately left status/completed_at open so
-- the rep's return-from-Messages confirmation could legitimately resolve
-- an 'opened' row to 'confirmed_sent' or 'not_sent'. This migration closes
-- the remaining gap: once a row is no longer 'opened' (i.e. it already
-- resolved to a terminal status -- confirmed_sent, not_sent, failed,
-- no_phone, blocked_unsafe, simulated_sent, or the legacy 'sent' value),
-- no further status change is allowed, from any writer.
--
-- The app's sole writer (lib/v2/smsActions.ts) only ever performs two
-- UPDATE transitions, both starting from 'opened': opened -> confirmed_sent
-- and opened -> not_sent. Every other status is set once, at INSERT time.
-- Same-value "updates" (e.g. touching completed_at again) remain allowed.

create or replace function public.guard_outbound_sms_terminal_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status is distinct from 'opened' and new.status is distinct from old.status then
    raise exception 'outbound SMS status is immutable once terminal (was %, attempted %)', old.status, new.status;
  end if;
  return new;
end;
$$;

drop trigger if exists outbound_sms_terminal_status_guard on public.outbound_sms_actions;
create trigger outbound_sms_terminal_status_guard
before update on public.outbound_sms_actions
for each row execute function public.guard_outbound_sms_terminal_status();
