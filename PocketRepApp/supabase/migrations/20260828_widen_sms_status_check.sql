-- The outbound_sms_actions status CHECK constraint allows 'sent' but
-- smsLauncher.ts markSmsSent() writes 'confirmed_sent', which silently
-- fails against the constraint (masked by .catch(() => undefined)).
-- Widen the constraint to include 'confirmed_sent'.
ALTER TABLE outbound_sms_actions DROP CONSTRAINT IF EXISTS outbound_sms_actions_status_check;
ALTER TABLE outbound_sms_actions ADD CONSTRAINT outbound_sms_actions_status_check
  CHECK (status = ANY (ARRAY['opened','sent','confirmed_sent','not_sent','failed','no_phone','simulated_sent']));
