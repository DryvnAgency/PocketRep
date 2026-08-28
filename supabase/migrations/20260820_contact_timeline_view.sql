-- Unified activity timeline VIEW — unions interactions, contact_interactions,
-- and nurture_messages into one read-only stream per contact. No dual-writes,
-- no data duplication. security_invoker = true so RLS on the underlying tables
-- applies to callers of this view.

-- Index for efficient nurture_messages lookup by contact
CREATE INDEX IF NOT EXISTS idx_nurture_messages_contact_sent
  ON public.nurture_messages (contact_id, sent_at DESC)
  WHERE sent_at IS NOT NULL;

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
    'interaction'       AS source
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
    'sequence_step'     AS source
  FROM public.contact_interactions

  UNION ALL

  -- Blasts / nurture messages that were actually sent
  SELECT
    id,
    contact_id,
    COALESCE(kind, 'nurture') AS event_type,
    message_text        AS notes,
    NULL                AS outcome,
    sent_at             AS event_date,
    'nurture'           AS source
  FROM public.nurture_messages
  WHERE sent_at IS NOT NULL

  UNION ALL

  -- Inbound replies tracked on nurture messages
  SELECT
    id,
    contact_id,
    'reply'             AS event_type,
    reply_text          AS notes,
    reply_sentiment     AS outcome,
    sent_at             AS event_date,
    'reply'             AS source
  FROM public.nurture_messages
  WHERE reply_received = TRUE AND reply_text IS NOT NULL;

-- Grant SELECT to authenticated role so Supabase client can query it
GRANT SELECT ON public.contact_timeline TO authenticated;
