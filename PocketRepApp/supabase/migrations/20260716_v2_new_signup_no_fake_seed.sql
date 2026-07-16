-- P0-1 (real sign-in): stop seeding a fabricated "Marcus" demo contact into
-- every NEW real sign-up's book. handle_new_user() currently calls
-- seed_marcus_for_user(new.id) unconditionally on every auth.users insert —
-- harmless for the shared demo account (already seeded once, long ago), but
-- wrong for a real rep: the very first thing they'd see in their real book is
-- a fake customer. Same "never fabricate data for a user" rule as the P0-4
-- fake-data sweep, just at signup time instead of in the UI.
--
-- COMMITTED — NOT APPLIED: the owner applies this (same convention as every
-- other migration this session). Additive/idempotent (CREATE OR REPLACE, no
-- grants/RLS/DML touched) — identical function body minus the one PERFORM
-- line, so it's safe to run any number of times and changes nothing else
-- about account provisioning (profiles row + 7-day trial still happen exactly
-- as before).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _plan text;
BEGIN
  _plan := coalesce(new.raw_user_meta_data->>'plan', 'pro');
  IF _plan IN ('pro_bundle','elite_bundle') THEN _plan := 'elite';
  ELSIF _plan = 'rex_lens_standalone' THEN _plan := 'rex_lens';
  END IF;
  IF _plan NOT IN ('rex_lens','pro','elite') THEN _plan := 'pro'; END IF;

  INSERT INTO profiles (id, email, plan, trial_ends_at)
  VALUES (new.id, new.email, _plan, now() + interval '7 days')
  ON CONFLICT (id) DO NOTHING;

  -- seed_marcus_for_user(new.id) removed — see header. A new real sign-up now
  -- starts with a genuinely empty book, same as any other honest empty state
  -- in the app.
  RETURN new;
END;
$function$;
