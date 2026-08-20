-- PocketRep: make native-SMS blast history authoritative.
-- launchSms creates the outbound_sms_actions row before recordSentBlast adds the
-- nurture/blast record. This trigger links the already-confirmed SMS action to
-- source=blast without creating a second outbound action.

CREATE OR REPLACE FUNCTION public.link_blast_sms_action()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.trigger_type = 'blast' AND NEW.contact_id IS NOT NULL AND NEW.message_text IS NOT NULL THEN
    UPDATE public.outbound_sms_actions
       SET source = 'blast'
     WHERE id = (
       SELECT osa.id
       FROM public.outbound_sms_actions AS osa
       WHERE osa.user_id = NEW.user_id
         AND osa.contact_id = NEW.contact_id
         AND osa.message_body = NEW.message_text
         AND osa.source = 'manual'
         AND osa.created_at >= COALESCE(NEW.opened_at, NEW.created_at) - interval '2 minutes'
         AND osa.created_at <= COALESCE(NEW.opened_at, NEW.created_at) + interval '2 minutes'
       ORDER BY osa.created_at DESC
       LIMIT 1
     );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS nurture_messages_link_blast_sms_action ON public.nurture_messages;
CREATE TRIGGER nurture_messages_link_blast_sms_action
AFTER INSERT ON public.nurture_messages
FOR EACH ROW
EXECUTE FUNCTION public.link_blast_sms_action();

-- Rebuild the unified timeline so a real blast SMS is represented by the
-- authoritative outbound_sms_actions row (which contains the actual native
-- SMS status: opened, sent, not_sent, failed, or no_phone), rather than a
-- duplicate nurture row. Demo blasts still appear through nurture_messages
-- because no outbound SMS action is created for simulated sends.
CREATE OR REPLACE VIEW public.contact_timeline
WITH (security_invoker = true)
AS
  SELECT
    id,
    contact_id,
    type AS event_type,
    notes,
    outcome,
    interaction_date AS event_date,
    'interaction'::text AS source
  FROM public.interactions

  UNION ALL

  SELECT
    id,
    contact_id,
    channel AS event_type,
    message AS notes,
    NULL AS outcome,
    sent_at AS event_date,
    'sequence_step'::text AS source
  FROM public.contact_interactions

  UNION ALL

  SELECT
    nm.id,
    nm.contact_id,
    COALESCE(nm.kind, nm.trigger_type, 'nurture') AS event_type,
    nm.message_text AS notes,
    nm.sms_status AS outcome,
    COALESCE(nm.sent_at, nm.opened_at, nm.created_at) AS event_date,
    'nurture'::text AS source
  FROM public.nurture_messages AS nm
  WHERE (nm.sent_at IS NOT NULL OR nm.opened_at IS NOT NULL)
    AND NOT (
      nm.trigger_type = 'blast'
      AND EXISTS (
        SELECT 1
        FROM public.outbound_sms_actions AS osa
        WHERE osa.user_id = nm.user_id
          AND osa.contact_id = nm.contact_id
          AND osa.message_body = nm.message_text
          AND osa.source = 'blast'
          AND osa.created_at >= COALESCE(nm.opened_at, nm.created_at) - interval '2 minutes'
          AND osa.created_at <= COALESCE(nm.opened_at, nm.created_at) + interval '2 minutes'
      )
    )

  UNION ALL

  SELECT
    md5(nm.id::text || ':reply')::uuid,
    nm.contact_id,
    'reply'::text AS event_type,
    nm.reply_text AS notes,
    nm.reply_sentiment AS outcome,
    COALESCE(nm.reply_received_at, nm.created_at) AS event_date,
    'reply'::text AS source
  FROM public.nurture_messages AS nm
  WHERE nm.reply_received = TRUE AND nm.reply_text IS NOT NULL

  UNION ALL

  SELECT
    osa.id,
    osa.contact_id,
    'text'::text AS event_type,
    osa.message_body AS notes,
    osa.status AS outcome,
    osa.created_at AS event_date,
    'sms_action'::text AS source
  FROM public.outbound_sms_actions AS osa;

GRANT SELECT ON public.contact_timeline TO authenticated;
