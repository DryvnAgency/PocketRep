-- launchSms() now re-checks contact safety (is_deleted/do_not_contact)
-- immediately before opening the SMS composer and records a blocked attempt
-- via recordSmsFailure({ status: 'blocked_unsafe' }). The status CHECK
-- constraint does not yet allow that value, which would silently fail
-- against the constraint exactly like the 'confirmed_sent' gap fixed in
-- 20260828_widen_sms_status_check.sql (masked by .catch(() => undefined)).
-- Widen the constraint to include 'blocked_unsafe'.
ALTER TABLE outbound_sms_actions DROP CONSTRAINT IF EXISTS outbound_sms_actions_status_check;
ALTER TABLE outbound_sms_actions ADD CONSTRAINT outbound_sms_actions_status_check
  CHECK (status = ANY (ARRAY['opened','sent','confirmed_sent','not_sent','failed','no_phone','simulated_sent','blocked_unsafe']));
