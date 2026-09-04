-- Issue #160, Lane 1: canonical V1/V2 sequence template library.
--
-- Schema notes (repo-vs-production drift, matching this repo's established
-- pattern elsewhere): sql/schema.sql's `sequences` table definition does not
-- list `sequence_type` or `is_archived`, and `contact_sequences` has no
-- tracked CREATE TABLE anywhere in this repo at all — yet lib/v2/useSequences.ts
-- and lib/messageQueue.ts both depend on all three today, so they must exist
-- live. The ADD COLUMN IF NOT EXISTS calls below are defensive reconciliation
-- (a no-op if already present); this migration does not attempt to guess a
-- full CREATE TABLE for contact_sequences, since its complete live definition
-- cannot be confirmed from tracked source.
--
-- Idempotency: every template below is inserted only if no is_template=true
-- sequence with that exact name already exists. Re-running this migration
-- is a no-op on a database that already has them. Nothing here ever touches
-- a sequence with is_template=false (user-created/custom) or an existing
-- contact_sequences enrollment row.

ALTER TABLE public.sequences ADD COLUMN IF NOT EXISTS sequence_type text DEFAULT 'custom';
ALTER TABLE public.sequences ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

-- New, previously-nonexistent column — safe to constrain immediately since
-- nothing lived here before this migration to violate the check.
ALTER TABLE public.sequence_steps ADD COLUMN IF NOT EXISTS requires_classification boolean NOT NULL DEFAULT false;

-- Scaffolding only: no code in this PR ever writes to this column. It gives
-- the future rep-facing classification UI (Sold / Still shopping / No
-- response — see Fresh Up - 14 Day's final step) a real place to land,
-- without this lane guessing or auto-setting a value. See PR description.
ALTER TABLE public.contact_sequences ADD COLUMN IF NOT EXISTS classification text;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'contact_sequences' AND constraint_name = 'contact_sequences_classification_check'
  ) THEN
    ALTER TABLE public.contact_sequences ADD CONSTRAINT contact_sequences_classification_check
      CHECK (classification IS NULL OR classification IN ('sold', 'still_shopping', 'no_response'));
  END IF;
END $$;

-- ── 1. Fresh Up - 14 Day ─────────────────────────────────────────────────────
DO $$
DECLARE v_seq_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sequences WHERE is_template = true AND name = 'Fresh Up - 14 Day') THEN
    INSERT INTO public.sequences (user_id, contact_id, name, description, industry, sequence_type, is_template, is_custom, is_archived, is_ai_generated)
    VALUES (NULL, NULL, 'Fresh Up - 14 Day', 'Daily contact for a new prospect''s first two weeks. Ends in a rep-driven classification, never an automatic guess.', 'auto', 'prospect', true, false, false, false)
    RETURNING id INTO v_seq_id;

    INSERT INTO public.sequence_steps (sequence_id, step_number, delay_days, channel, message_template, ai_personalize, requires_classification) VALUES
      (v_seq_id, 1, 0,  'text', 'hey {{first_name}}, thanks for reaching out about the {{vehicle}}. I can have some real options ready for you today, what time works to connect?', true, false),
      (v_seq_id, 2, 1,  'call', 'Quick call to {{first_name}}: confirm they saw your intro text, answer questions on the {{vehicle}}, and find out their timeline.', true, false),
      (v_seq_id, 3, 2,  'text', 'hey {{first_name}}, still holding a couple {{vehicle}} options for you. want me to send pictures and pricing?', true, false),
      (v_seq_id, 4, 3,  'text', 'hey {{first_name}}, picked up some new inventory on the {{vehicle}}. let me know if you want to swing by or if a video walkaround works better.', true, false),
      (v_seq_id, 5, 4,  'call', 'Check-in call with {{first_name}}: see if they have looked at other stores yet and what is holding them back from setting an appointment.', true, false),
      (v_seq_id, 6, 5,  'text', 'hey {{first_name}}, what is the best day this week to get you in for a quick test drive on the {{vehicle}}?', true, false),
      (v_seq_id, 7, 6,  'text', 'hey {{first_name}}, one week in, wanted to see where your head is at on the {{vehicle}}. still the top pick?', true, false),
      (v_seq_id, 8, 7,  'call', 'One-week call: ask {{first_name}} directly what is stopping them from moving forward and address it head on.', true, false),
      (v_seq_id, 9, 8,  'text', 'hey {{first_name}}, I can lock in today''s numbers on the {{vehicle}} if you want to move this week.', true, false),
      (v_seq_id, 10, 9, 'text', 'hey {{first_name}}, let me know if budget or trade value is the sticking point on the {{vehicle}}, happy to run the numbers a different way.', true, false),
      (v_seq_id, 11, 10,'call', 'Call {{first_name}} with a direct offer: get them in this week for a firm number on the {{vehicle}}.', true, false),
      (v_seq_id, 12, 11,'text', 'hey {{first_name}}, still here whenever you are ready to move on the {{vehicle}}.', true, false),
      (v_seq_id, 13, 12,'text', 'hey {{first_name}}, wrapping up my two week follow-up on the {{vehicle}}. one more day before I close out your file, let me know if you want to keep going.', true, false),
      (v_seq_id, 14, 13,'call', 'Day 14 wrap-up call with {{first_name}}. Find out where they landed: bought here, bought elsewhere, or gone quiet. Log the outcome on their card (Sold / Still shopping / No response) so the right follow-up starts next. Do not guess this from silence alone, ask.', true, true);
  END IF;
END $$;

-- ── 2. Unsold Long-Term Follow-Up ────────────────────────────────────────────
DO $$
DECLARE v_seq_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sequences WHERE is_template = true AND name = 'Unsold Long-Term Follow-Up') THEN
    INSERT INTO public.sequences (user_id, contact_id, name, description, industry, sequence_type, is_template, is_custom, is_archived, is_ai_generated)
    VALUES (NULL, NULL, 'Unsold Long-Term Follow-Up', 'Low-pressure, wide-spaced nurture for a prospect who did not buy yet but is still worth keeping warm over months.', 'auto', 'prospect', true, false, false, false)
    RETURNING id INTO v_seq_id;

    INSERT INTO public.sequence_steps (sequence_id, step_number, delay_days, channel, message_template, ai_personalize, requires_classification) VALUES
      (v_seq_id, 1, 0,  'text', 'hey {{first_name}}, no pressure, just wanted to leave the door open on the {{vehicle}} whenever the timing is better for you.', true, false),
      (v_seq_id, 2, 14, 'text', 'hey {{first_name}}, checking back in on the {{vehicle}}. anything change on your end?', true, false),
      (v_seq_id, 3, 30, 'call', '30-day check-in call with {{first_name}}: see if their situation changed and if the {{vehicle}} search is still active.', true, false),
      (v_seq_id, 4, 45, 'text', 'hey {{first_name}}, we have got new {{vehicle}} inventory in if you want a fresh look.', true, false),
      (v_seq_id, 5, 60, 'text', 'hey {{first_name}}, still thinking about a new ride? happy to run updated numbers whenever.', true, false),
      (v_seq_id, 6, 75, 'call', 'Longer-term pulse check with {{first_name}}: are they still in the market, or should this go dormant for now?', true, false),
      (v_seq_id, 7, 90, 'text', 'hey {{first_name}}, last check-in from me on the {{vehicle}} for now. reach out anytime, I am here when you are ready.', true, false);
  END IF;
END $$;

-- ── 3. Sold Customer Ownership ───────────────────────────────────────────────
DO $$
DECLARE v_seq_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sequences WHERE is_template = true AND name = 'Sold Customer Ownership') THEN
    INSERT INTO public.sequences (user_id, contact_id, name, description, industry, sequence_type, is_template, is_custom, is_archived, is_ai_generated)
    VALUES (NULL, NULL, 'Sold Customer Ownership', 'Ongoing relationship-maintenance cadence for the life of the ownership, separate from the first-week New Vehicle Delivery sequence.', 'auto', 'sold', true, false, false, false)
    RETURNING id INTO v_seq_id;

    INSERT INTO public.sequence_steps (sequence_id, step_number, delay_days, channel, message_template, ai_personalize, requires_classification) VALUES
      (v_seq_id, 1, 0,   'text', 'hey {{first_name}}, congrats again on the {{vehicle}}. I am your contact for anything you need going forward, do not hesitate to reach out.', true, false),
      (v_seq_id, 2, 30,  'text', 'hey {{first_name}}, one month in, how is the {{vehicle}} treating you?', true, false),
      (v_seq_id, 3, 90,  'call', '90-day ownership call with {{first_name}}: check satisfaction and remind them you are their go-to for service questions.', true, false),
      (v_seq_id, 4, 180, 'text', 'hey {{first_name}}, six months with the {{vehicle}}. let me know if you ever need anything, from service scheduling to trade questions.', true, false),
      (v_seq_id, 5, 330, 'text', 'hey {{first_name}}, coming up on a year with the {{vehicle}}. if you know anyone shopping, I would appreciate the introduction.', true, false);
  END IF;
END $$;

-- ── 4. New Vehicle Delivery ──────────────────────────────────────────────────
-- Exact touchpoints per issue #160: next-day check-in, +3d feature/help check,
-- ~2d later survey-readiness/service-recovery check, second-delivery
-- invitation, referral ask only after a positive moment. The service-recovery
-- step is explicitly a rep-facing brief that forbids mentioning a survey
-- score. The referral step's own wording is conditioned on the vehicle
-- "treating them right" rather than presuming a positive moment happened,
-- since this template cannot detect sentiment on its own.
DO $$
DECLARE v_seq_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sequences WHERE is_template = true AND name = 'New Vehicle Delivery') THEN
    INSERT INTO public.sequences (user_id, contact_id, name, description, industry, sequence_type, is_template, is_custom, is_archived, is_ai_generated)
    VALUES (NULL, NULL, 'New Vehicle Delivery', 'First two weeks after delivery: ownership check-in, feature help, a service-recovery moment before any survey, then a second-delivery and referral ask.', 'auto', 'sold', true, false, false, false)
    RETURNING id INTO v_seq_id;

    INSERT INTO public.sequence_steps (sequence_id, step_number, delay_days, channel, message_template, ai_personalize, requires_classification) VALUES
      (v_seq_id, 1, 1,  'text', 'hey {{first_name}}, how is the {{vehicle}} feeling one day in? anything you need help figuring out?', true, false),
      (v_seq_id, 2, 4,  'text', 'hey {{first_name}}, three days in, are you all set on the features? happy to walk through anything, bluetooth, the touchscreen, whatever is confusing.', true, false),
      (v_seq_id, 3, 6,  'call', 'Service-recovery check with {{first_name}}: ask directly if everything about their delivery was excellent. If anything was off, fix it now. Do not mention or reference a survey or a survey score at any point in this call.', true, false),
      (v_seq_id, 4, 10, 'text', 'hey {{first_name}}, if the {{vehicle}} has been treating you right, I would love to help you again down the road, or with a second vehicle for your household whenever the time is right.', true, false),
      (v_seq_id, 5, 14, 'text', 'hey {{first_name}}, glad things are going well with the {{vehicle}}. if you know anyone else car shopping, I would really appreciate the referral.', true, false);
  END IF;
END $$;

-- ── 5. Lease Maturity ────────────────────────────────────────────────────────
DO $$
DECLARE v_seq_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sequences WHERE is_template = true AND name = 'Lease Maturity') THEN
    INSERT INTO public.sequences (user_id, contact_id, name, description, industry, sequence_type, is_template, is_custom, is_archived, is_ai_generated)
    VALUES (NULL, NULL, 'Lease Maturity', 'Enroll once a lease has roughly 100-120 days left. Walks the customer from early notice to a booked lease-end appointment.', 'auto', 'sold', true, false, false, false)
    RETURNING id INTO v_seq_id;

    INSERT INTO public.sequence_steps (sequence_id, step_number, delay_days, channel, message_template, ai_personalize, requires_classification) VALUES
      (v_seq_id, 1, 0,   'text', 'hey {{first_name}}, your lease on the {{vehicle}} is coming up on {{lease_end}}. want to start looking at what is next early so you have got options?', true, false),
      (v_seq_id, 2, 21,  'text', 'hey {{first_name}}, quick reminder your lease wraps up {{lease_end}}. I can pull numbers on a new lease, a purchase, or something totally different, whatever you want.', true, false),
      (v_seq_id, 3, 45,  'call', 'Lease maturity call with {{first_name}}: walk through mileage and wear expectations and start narrowing down their next vehicle.', true, false),
      (v_seq_id, 4, 75,  'text', 'hey {{first_name}}, let us get your lease-end appointment on the books before {{lease_end}} sneaks up.', true, false),
      (v_seq_id, 5, 100, 'call', 'Final lease-end call with {{first_name}} before {{lease_end}}: lock in the appointment to turn in the {{vehicle}} and pick up the next one.', true, false);
  END IF;
END $$;

-- ── 6. Second Delivery ───────────────────────────────────────────────────────
-- A repeat/loyalty purchase from an existing customer, distinct from the
-- first-ever New Vehicle Delivery sequence above.
DO $$
DECLARE v_seq_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sequences WHERE is_template = true AND name = 'Second Delivery') THEN
    INSERT INTO public.sequences (user_id, contact_id, name, description, industry, sequence_type, is_template, is_custom, is_archived, is_ai_generated)
    VALUES (NULL, NULL, 'Second Delivery', 'For a repeat customer picking up an additional or replacement vehicle. Leads with loyalty, not a first-timer''s orientation.', 'auto', 'sold', true, false, false, false)
    RETURNING id INTO v_seq_id;

    INSERT INTO public.sequence_steps (sequence_id, step_number, delay_days, channel, message_template, ai_personalize, requires_classification) VALUES
      (v_seq_id, 1, 0,   'text', 'hey {{first_name}}, congrats on vehicle number two from me. excited to keep taking care of you and your family.', true, false),
      (v_seq_id, 2, 3,   'text', 'hey {{first_name}}, how are the {{vehicle}} and your other ride working out together? let me know if you need anything for either one.', true, false),
      (v_seq_id, 3, 30,  'call', '30-day loyalty check with {{first_name}}: thank them again for coming back and ask if there is anything they need on either vehicle.', true, false),
      (v_seq_id, 4, 120, 'text', 'hey {{first_name}}, always here for whatever is next, service, trade-in, or vehicle number three whenever that day comes.', true, false);
  END IF;
END $$;

-- ── 7. Holiday Check-In ──────────────────────────────────────────────────────
-- Deliberately short, generic, and non-promotional per issue #160: no
-- fabricated sale, discount, or urgency, and no specific-year/date wording
-- so this template does not go stale.
DO $$
DECLARE v_seq_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sequences WHERE is_template = true AND name = 'Holiday Check-In') THEN
    INSERT INTO public.sequences (user_id, contact_id, name, description, industry, sequence_type, is_template, is_custom, is_archived, is_ai_generated)
    VALUES (NULL, NULL, 'Holiday Check-In', 'A short, genuine holiday-season touchpoint for past customers and warm prospects. No promotions, no discounts, no fabricated urgency.', 'auto', 'custom', true, false, false, false)
    RETURNING id INTO v_seq_id;

    INSERT INTO public.sequence_steps (sequence_id, step_number, delay_days, channel, message_template, ai_personalize, requires_classification) VALUES
      (v_seq_id, 1, 0, 'text', 'hey {{first_name}}, hope you and your family have a great holiday season. always here if you need anything with the {{vehicle}}.', true, false),
      (v_seq_id, 2, 7, 'text', 'hey {{first_name}}, happy new year. let me know if a new year means a new vehicle is on your radar too.', true, false);
  END IF;
END $$;
