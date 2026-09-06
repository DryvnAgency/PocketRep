-- Close the one remaining gap in outbound SMS history immutability.
--
-- 20260904003000_v1_immutable_contact_history.sql already locked the SMS
-- payload (user/contact/message/source/created_at/opened_at cannot change)
-- and removed DELETE entirely. It deliberately left `status`/`completed_at`
-- open, because the app's own lifecycle legitimately transitions a row once:
--   INSERT ... status: 'opened'                         (composer opened)
--   INSERT ... status: 'failed'|'no_phone'|'blocked_unsafe'|'simulated_sent'
--     (an attempt that never reached the native composer)
--   UPDATE 'opened' -> 'confirmed_sent'                  (markSmsSent)
--   UPDATE 'opened' -> 'not_sent'                         (markSmsNotSent)
--
-- Traced every writer of this table (lib/v2/smsActions.ts is the only one;
-- no edge function or admin path writes outbound_sms_actions): those four
-- lines above are the complete, exhaustive set of legitimate transitions.
-- Nothing in the app ever updates a row a second time, and nothing updates
-- a row whose status is not 'opened'. But the RLS UPDATE policy has no
-- state-machine constraint of its own -- a direct API call could flip
-- 'confirmed_sent' back to 'not_sent' and back again, with no record that it
-- happened. That is the literal thing "immutable outbound history" is
-- supposed to prevent.
--
-- 'sent' is included below even though no current code writes it: it is
-- already a legal value under outbound_sms_actions_status_check
-- (20260902180000_widen_sms_status_check_blocked_unsafe.sql) and must be
-- just as immutable as the other terminal values if an old row ever holds it.
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
