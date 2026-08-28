-- PocketRep V1: Referral system column hardening + unified timeline.
-- Adds missing columns that the stripe-webhook and checkout-account
-- edge functions reference but the base migrations omitted.

-- 1. referrals: paid_at + stripe_checkout_session_id
--    Used by stripe-webhook checkout.session.completed handler.
ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text;

-- 2. referral_rewards: reward_months + issued_at
--    Used by the reward() function in stripe-webhook.
ALTER TABLE public.referral_rewards
  ADD COLUMN IF NOT EXISTS reward_months integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS issued_at timestamptz;

-- 3. Unified contact_timeline — merges all interaction sources.
--    Previous migrations defined partial views; this is the definitive one.
--    security_invoker = true so RLS on underlying tables applies.
CREATE OR REPLACE VIEW public.contact_timeline
WITH (security_invoker = true)
AS
  -- Manual interactions (call / text / email / note)
  SELECT
    id,
    contact_id,
    type                AS event_type,
    notes,
    outcome,
    interaction_date    AS event_date,
    'interaction'::text AS source
  FROM public.interactions

  UNION ALL

  -- Sequence step sends
  SELECT
    id,
    contact_id,
    channel             AS event_type,
    message             AS notes,
    NULL                AS outcome,
    sent_at             AS event_date,
    'sequence_step'::text AS source
  FROM public.contact_interactions

  UNION ALL

  -- Blasts / nurture messages (sent or opened)
  SELECT
    id,
    contact_id,
    COALESCE(kind, trigger_type, 'nurture') AS event_type,
    message_text        AS notes,
    sms_status          AS outcome,
    COALESCE(sent_at, opened_at, created_at) AS event_date,
    'nurture'::text     AS source
  FROM public.nurture_messages
  WHERE sent_at IS NOT NULL OR opened_at IS NOT NULL

  UNION ALL

  -- Inbound replies tracked on nurture messages
  SELECT
    md5(id::text || ':reply')::uuid,
    contact_id,
    'reply'::text       AS event_type,
    reply_text          AS notes,
    reply_sentiment     AS outcome,
    COALESCE(reply_received_at, created_at) AS event_date,
    'reply'::text       AS source
  FROM public.nurture_messages
  WHERE reply_received = TRUE AND reply_text IS NOT NULL

  UNION ALL

  -- Native SMS action tracking (opened, sent, not_sent, failed, etc.)
  SELECT
    id,
    contact_id,
    'text'::text        AS event_type,
    message_body        AS notes,
    status              AS outcome,
    created_at          AS event_date,
    'sms_action'::text  AS source
  FROM public.outbound_sms_actions;

GRANT SELECT ON public.contact_timeline TO authenticated;
