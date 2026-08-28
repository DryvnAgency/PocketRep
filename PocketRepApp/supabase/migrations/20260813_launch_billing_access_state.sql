ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'trialing';

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

  INSERT INTO profiles (id, email, plan, trial_ends_at, subscription_status)
  VALUES (new.id, new.email, _plan, now() + interval '7 days', 'trialing')
  ON CONFLICT (id) DO NOTHING;

  PERFORM public.seed_demo_contacts_for_user(new.id);
  RETURN new;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;
