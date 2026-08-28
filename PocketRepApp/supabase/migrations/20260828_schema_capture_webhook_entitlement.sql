-- Phase 3 schema reconciliation (#16, #33 from the 2026-08-28 audit).
--
-- stripe_webhook_events and entitlement_events both exist live, with real
-- data flowing through them (stripe-webhook / checkout-account write to
-- both), but neither ever had a CREATE TABLE captured in any migration —
-- the same "created ad hoc, outside migration history" pattern that
-- produced a real leak once before (the contact-photos bucket). A clean
-- database rebuilt from this repo's migrations would be missing both
-- tables entirely.
--
-- This is a non-destructive capture: CREATE TABLE IF NOT EXISTS against the
-- verified live structure (columns, types, defaults, constraints all
-- confirmed via information_schema and pg_constraint before writing this).
-- Applying it to production is a safe no-op — both tables already exist
-- exactly this way. No RLS policies are added here: entitlement_events'
-- existing admin SELECT policy (added in an earlier migration) and
-- stripe_webhook_events' intentional zero-policy (service_role-only —
-- stripe-webhook is the only caller; the INFO-level "RLS enabled no policy"
-- advisory is a false positive for this table, not a gap) are both left
-- exactly as they are live.

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'processed' CHECK (status = ANY (ARRAY['processing', 'processed', 'failed'])),
  processing_started_at timestamptz,
  processed_at timestamptz
);
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.entitlement_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  event_type text NOT NULL,
  source text NOT NULL,
  stripe_customer_id text,
  stripe_subscription_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.entitlement_events ENABLE ROW LEVEL SECURITY;
