-- Event deduplication table for Stripe webhooks. Prevents redelivered events
-- from being processed twice. Service-role only (no RLS policies).

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id   text        PRIMARY KEY,
  event_type text        NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
-- No policies = service_role only (webhook uses service_role key)
