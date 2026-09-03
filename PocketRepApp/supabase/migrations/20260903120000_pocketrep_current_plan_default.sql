-- Batch 3 hostile-audit remediation: the current PocketRep product writes
-- profiles.plan = 'pocketrep' for every real paying customer (see
-- supabase/functions/checkout-account/index.ts and stripe-webhook/index.ts),
-- but this column's CHECK constraint (sql/schema.sql) and the
-- handle_new_user() trigger only ever recognized the old 3-tier
-- 'rex_lens'/'pro'/'elite' model. Net effect: handle_new_user() silently
-- forced every new signup's initial row to plan='pro' (since 'pocketrep'
-- failed its allowlist and was coerced back to 'pro'), relying entirely on
-- checkout-account's follow-up UPDATE to fix it back to 'pocketrep' — and if
-- that UPDATE fails (checkout-account/index.ts:224-227 does check its
-- error and surfaces a 500, but does not retry or roll back the already-
-- inserted auth.users/profiles rows), the account is permanently stranded
-- on the legacy plan='pro' default with a trigger-assigned trial_ends_at
-- instead of the real Stripe-derived one.
--
-- This migration widens both to recognize 'pocketrep' as a first-class
-- current plan while preserving every historical value already documented
-- as a legacy plan/alias — no existing row's plan value is changed, and old
-- plan strings remain valid (they are simply no longer selectable as a
-- default for a NEW signup). Stripe subscription/entitlement status
-- (lib/v2/accessGate.ts) remains the sole billing authority; this migration
-- does not change that.
--
-- NOT applied by this PR. Added for review only, per the Batch 3 request
-- ("If a migration is required, add it to the PR but do not deploy the
-- migration and do not merge").

-- Widen the plan CHECK constraint. The constraint itself is defined inline
-- in sql/schema.sql (a hand-run "run this in SQL Editor" setup doc, not a
-- tracked migration) as an unnamed column check, which Postgres would name
-- profiles_plan_check by its own default <table>_<column>_check
-- convention — the name assumed below. No migration in this directory ever
-- altered it, so its exact live name/definition cannot be confirmed from
-- source alone; please verify against the live schema before applying.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'profiles' AND constraint_name = 'profiles_plan_check'
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_plan_check;
  END IF;
END $$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_plan_check
  CHECK (plan IN ('pocketrep', 'rex_lens', 'pro', 'elite'));

-- Belt-and-suspenders: handle_new_user() below always supplies an explicit
-- plan on INSERT, so this default is not exercised by that path today, but
-- keeping the column default in sync avoids a future bare INSERT silently
-- landing on the retired 'pro' default.
ALTER TABLE public.profiles ALTER COLUMN plan SET DEFAULT 'pocketrep';

-- Redefine handle_new_user() to recognize 'pocketrep' and default new,
-- unrecognized, or absent plan metadata to 'pocketrep' instead of the
-- legacy 'pro'. Legacy bundle/standalone aliases are still mapped for
-- backward compatibility, matching every prior definition of this trigger
-- (body otherwise unchanged from
-- 20260813_new_user_demo_onboarding.sql's version, demo-seeding included).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _plan text;
BEGIN
  _plan := coalesce(new.raw_user_meta_data->>'plan', 'pocketrep');
  IF _plan IN ('pro_bundle','elite_bundle') THEN _plan := 'elite';
  ELSIF _plan = 'rex_lens_standalone' THEN _plan := 'rex_lens';
  END IF;
  IF _plan NOT IN ('rex_lens','pro','elite','pocketrep') THEN _plan := 'pocketrep'; END IF;

  INSERT INTO profiles (id, email, plan, trial_ends_at)
  VALUES (new.id, new.email, _plan, now() + interval '7 days')
  ON CONFLICT (id) DO NOTHING;

  PERFORM public.seed_demo_customers_for_user(new.id);
  RETURN new;
END;
$function$;
