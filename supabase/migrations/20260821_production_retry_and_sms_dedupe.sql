-- PocketRep production hardening:
-- 1) Make Stripe webhook deduplication retry-safe when processing fails.
-- 2) Prevent the native-SMS blast flow from creating a duplicate outbound action
--    when the blast history row is also recorded.

-- Stripe events already recorded by the original migration are treated as
-- completed. New events begin in processing state and are only marked processed
-- after the handler finishes successfully.
ALTER TABLE public.stripe_webhook_events
  ALTER COLUMN processed_at DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'processed',
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;

ALTER TABLE public.stripe_webhook_events
  DROP CONSTRAINT IF EXISTS stripe_webhook_events_status_check;

ALTER TABLE public.stripe_webhook_events
  ADD CONSTRAINT stripe_webhook_events_status_check
  CHECK (status IN ('processing', 'processed', 'failed'));

CREATE INDEX IF NOT EXISTS stripe_webhook_events_processing_idx
  ON public.stripe_webhook_events(processing_started_at)
  WHERE status = 'processing';

-- The blast workflow can create an outbound action when the native composer is
-- launched and then record blast history. If the history path attempts to
-- create the same blast action again, keep the first authoritative row.
CREATE OR REPLACE FUNCTION public.prevent_duplicate_blast_sms_action()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.source = 'blast'
     AND EXISTS (
       SELECT 1
       FROM public.outbound_sms_actions AS existing
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
FOR EACH ROW
EXECUTE FUNCTION public.prevent_duplicate_blast_sms_action();

REVOKE ALL ON FUNCTION public.prevent_duplicate_blast_sms_action() FROM PUBLIC, anon, authenticated;
