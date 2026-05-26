-- Hotfix: handle_new_user() was missing ON CONFLICT, causing pre-existing
-- profile rows to crash the trigger and surface to GoTrue as
-- "Database error querying schema" (the Rex Lens V25 signup blocker).
-- Also locks down SECURITY DEFINER RPC exposure on anon/authenticated.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  PERFORM public.seed_marcus_for_user(new.id);
  RETURN new;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_marcus_for_user(uuid) FROM anon, authenticated;
