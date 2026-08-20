-- PocketRep production schema alignment, verified against the live database.
-- This migration mirrors the production_takeover_schema_alignment_v2 migration
-- applied to the live PocketRep Supabase project.

CREATE TABLE IF NOT EXISTS public.contact_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  contact_name text,
  sequence_id uuid REFERENCES public.sequences(id) ON DELETE SET NULL,
  step_number int,
  channel text CHECK (channel IN ('text','call','email')),
  message text,
  sent_at timestamptz DEFAULT now()
);
ALTER TABLE public.contact_interactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own interactions" ON public.contact_interactions;
CREATE POLICY "Users manage own interactions"
  ON public.contact_interactions FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
CREATE INDEX IF NOT EXISTS interactions_user_date
  ON public.contact_interactions(user_id, sent_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_unique
  ON public.profiles(referral_code)
  WHERE referral_code IS NOT NULL;
UPDATE public.profiles
SET referral_code = 'PR-' || upper(substr(replace(id::text, '-', ''), 1, 10))
WHERE referral_code IS NULL;
CREATE OR REPLACE FUNCTION public.ensure_my_referral_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE existing_code text; new_code text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT referral_code INTO existing_code FROM public.profiles WHERE id = auth.uid();
  IF existing_code IS NOT NULL THEN RETURN existing_code; END IF;
  new_code := 'PR-' || upper(substr(replace(auth.uid()::text, '-', ''), 1, 10));
  UPDATE public.profiles SET referral_code = new_code WHERE id = auth.uid();
  RETURN new_code;
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_my_referral_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_my_referral_code() TO authenticated;

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS referrals_self_read ON public.referrals;
DROP POLICY IF EXISTS referrals_referrer_read ON public.referrals;
CREATE POLICY referrals_referrer_read ON public.referrals
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = referrer_user_id);
DROP POLICY IF EXISTS referral_rewards_self_read ON public.referral_rewards;
DROP POLICY IF EXISTS referral_rewards_recipient_read ON public.referral_rewards;
CREATE POLICY referral_rewards_recipient_read ON public.referral_rewards
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = recipient_user_id);

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  processed_at timestamptz,
  status text NOT NULL DEFAULT 'processed',
  processing_started_at timestamptz,
  CONSTRAINT stripe_webhook_events_status_check CHECK (status IN ('processing','processed','failed'))
);
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS stripe_webhook_events_processing_idx
  ON public.stripe_webhook_events(processing_started_at)
  WHERE status = 'processing';

CREATE OR REPLACE VIEW public.contact_timeline
WITH (security_invoker = true)
AS
  SELECT i.id, i.contact_id, i.type AS event_type, i.notes, i.outcome,
         i.interaction_date AS event_date, 'interaction'::text AS source
  FROM public.interactions i
  UNION ALL
  SELECT ci.id, ci.contact_id, ci.channel AS event_type, ci.message AS notes,
         NULL::text AS outcome, ci.sent_at AS event_date, 'sequence_step'::text AS source
  FROM public.contact_interactions ci
  UNION ALL
  SELECT nm.id, nm.contact_id, COALESCE(nm.kind, nm.trigger_type, 'nurture') AS event_type,
         nm.message_text AS notes, nm.sms_status AS outcome,
         COALESCE(nm.sent_at, nm.opened_at, nm.created_at) AS event_date, 'nurture'::text AS source
  FROM public.nurture_messages nm
  WHERE (nm.sent_at IS NOT NULL OR nm.opened_at IS NOT NULL)
    AND NOT (
      nm.trigger_type = 'blast' AND EXISTS (
        SELECT 1 FROM public.outbound_sms_actions osa
        WHERE osa.user_id = nm.user_id
          AND osa.contact_id = nm.contact_id
          AND osa.message_body = nm.message_text
          AND osa.source = 'blast'
          AND osa.created_at >= COALESCE(nm.opened_at, nm.created_at) - interval '2 minutes'
          AND osa.created_at <= COALESCE(nm.opened_at, nm.created_at) + interval '2 minutes'
      )
    )
  UNION ALL
  SELECT md5(nm.id::text || ':reply')::uuid, nm.contact_id, 'reply'::text,
         nm.reply_text, nm.reply_sentiment,
         COALESCE(nm.reply_received_at, nm.created_at), 'reply'::text
  FROM public.nurture_messages nm
  WHERE nm.reply_received = TRUE AND nm.reply_text IS NOT NULL
  UNION ALL
  SELECT osa.id, osa.contact_id, 'text'::text, osa.message_body, osa.status,
         osa.created_at, 'sms_action'::text
  FROM public.outbound_sms_actions osa;
GRANT SELECT ON public.contact_timeline TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_duplicate_blast_sms_action()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.source = 'blast' AND EXISTS (
    SELECT 1 FROM public.outbound_sms_actions existing
    WHERE existing.user_id = NEW.user_id
      AND existing.contact_id = NEW.contact_id
      AND existing.message_body = NEW.message_body
      AND existing.source = 'blast'
      AND existing.created_at >= now() - interval '2 minutes'
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS prevent_duplicate_blast_sms_action ON public.outbound_sms_actions;
CREATE TRIGGER prevent_duplicate_blast_sms_action
BEFORE INSERT ON public.outbound_sms_actions
FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_blast_sms_action();
REVOKE ALL ON FUNCTION public.prevent_duplicate_blast_sms_action() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS contacts_remove_demo_after_real_insert ON public.contacts;
DROP TRIGGER IF EXISTS trg_remove_demo_customers_after_real_import ON public.contacts;
DROP FUNCTION IF EXISTS public.remove_demo_contacts_after_real_insert();
DROP FUNCTION IF EXISTS public.remove_demo_customers_after_real_import();
