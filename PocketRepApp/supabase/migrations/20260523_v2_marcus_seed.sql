-- v2 PR #29: Marcus Holloway demo seed + 12 starter tags on signup.
-- Idempotent (safe to run twice). Backfills the 4 existing profiles too so we
-- can verify via SELECT before wiring the UI in PR #30.
--
-- Non-destructive design:
--  - Doesn't drop or alter the existing contacts.user_id → public.users FK
--    (destructive). Instead, the seed function self-heals by ensuring a
--    matching public.users row exists before inserting the contact.
--  - Existing handle_new_user trigger is extended (CREATE OR REPLACE), not
--    replaced — keeps the original profile-insert + plan-mapping logic
--    intact, just adds the seed call at the end.

-- ────────────────────────────────────────────────────────────────────────────
-- Seed function: inserts one Marcus contact + 12 starter tags for a given
-- user_id. Skips if the user already has any contacts (prevents double-seed
-- when a rep adds their own contacts and later re-runs the trigger).
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.seed_marcus_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email    text;
  _username text;
BEGIN
  -- Don't double-seed: if the user already has any contacts, leave alone.
  IF EXISTS (SELECT 1 FROM public.contacts WHERE user_id = p_user_id LIMIT 1) THEN
    RETURN;
  END IF;

  -- Need an email from auth.users for the public.users row.
  SELECT email INTO _email FROM auth.users WHERE id = p_user_id;
  IF _email IS NULL THEN RETURN; END IF;

  _username := split_part(_email, '@', 1) || '_' || right(p_user_id::text, 6);

  -- Ensure public.users row exists (contacts.user_id FK target).
  INSERT INTO public.users (id, username, email)
  VALUES (p_user_id, _username, _email)
  ON CONFLICT (id) DO NOTHING;

  -- Marcus Holloway — CONTACTS[0] from design/extracted/data.js.
  -- heat_score=90 → renders as "hot" in the v2 client-side tier mapping
  -- (we avoid touching the existing heat_tier check constraint).
  INSERT INTO public.contacts (
    user_id, first_name, last_name, phone,
    vehicle, trim, budget, trade_in,
    notes, milestones, next_step, plan_label, heat_score,
    last_contact_date, follow_up_date, stage, tags
  ) VALUES (
    p_user_id,
    'Marcus', 'Holloway',
    '(312) 555-0184',
    $v$'26 M3 Competition$v$,
    'Brooklyn Grey · xDrive',
    '82K',
    $v$'22 M240i$v$,
    $notes$Wife is on board. Wants Brooklyn Grey specifically — won't budge on color. Open to extending term to 60 if MSRP holds. Mentioned trade-in dependency twice; lock that number before they walk.$notes$,
    $milestones$[
      {"kind":"visit","t":"Showed Brooklyn Grey, walked Frozen Black","d":"4d"},
      {"kind":"numbers","t":"Went over payment scenarios at 60mo","d":"3d"},
      {"kind":"docs","t":"Sent payment comparison PDF","d":"3d"},
      {"kind":"test-drive","t":"Test drive scheduled · Saturday 11:00","d":"1d"}
    ]$milestones$::jsonb,
    $next$Lock trade-in number on the '22 M240i before Saturday — he'll walk without it. Have appraisal team pre-quote.$next$,
    'THIS WEEK',
    90,
    CURRENT_DATE - 1,
    CURRENT_DATE + 3,
    'active',
    ARRAY['M Series', 'Repeat']
  );

  -- 12 starter tags — STARTER_TAGS from design/extracted/data.js.
  INSERT INTO public.tags (user_id, name, color) VALUES
    (p_user_id, 'SUV',      '#42b883'),
    (p_user_id, 'EV',       '#5a8fe8'),
    (p_user_id, 'Lease',    '#a86bd1'),
    (p_user_id, 'Used',     '#8a90a0'),
    (p_user_id, 'M Series', '#e05252'),
    (p_user_id, 'Coupe',    '#e08c52'),
    (p_user_id, 'Sedan',    '#d4a843'),
    (p_user_id, 'Cash',     '#42b883'),
    (p_user_id, 'Loyalty',  '#f0c060'),
    (p_user_id, 'Repeat',   '#f0c060'),
    (p_user_id, 'Trade-in', '#a86bd1'),
    (p_user_id, 'Family',   '#42b883')
  ON CONFLICT (user_id, name) DO NOTHING;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Extend handle_new_user to call the seed function after creating the
-- profile. All original logic preserved verbatim — just the PERFORM at the
-- end is new.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE _plan text;
BEGIN
  _plan := coalesce(new.raw_user_meta_data->>'plan', 'pro');
  IF _plan IN ('pro_bundle', 'elite_bundle') THEN
    _plan := 'elite';
  ELSIF _plan = 'rex_lens_standalone' THEN
    _plan := 'rex_lens';
  END IF;
  IF _plan NOT IN ('rex_lens', 'pro', 'elite') THEN
    _plan := 'pro';
  END IF;

  INSERT INTO profiles (id, email, plan, trial_ends_at)
  VALUES (new.id, new.email, _plan, now() + interval '7 days');

  -- v2 (PR #29): seed Marcus + starter tags so new reps see a populated
  -- demo. Idempotent — safe if it's somehow called twice.
  PERFORM public.seed_marcus_for_user(new.id);

  RETURN new;
END;
$function$;

-- ────────────────────────────────────────────────────────────────────────────
-- Backfill: seed every existing profile so we can verify via SELECT before
-- wiring the v2 Heat Sheet in PR #30.
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE _row record;
BEGIN
  FOR _row IN SELECT id FROM public.profiles LOOP
    PERFORM public.seed_marcus_for_user(_row.id);
  END LOOP;
END $$;
