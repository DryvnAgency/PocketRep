-- Two changes:
-- 1) Backfill profile + Marcus for any auth.users that the broken trigger
--    skipped (notably empr14@icloud.com and emponce14@gmail.com).
-- 2) Create demo@pocketrep.pro with a known password so the v2 web shell can
--    auto-sign-in and exercise RLS-protected reads of contacts/tags.

INSERT INTO public.profiles (id, email, plan, trial_ends_at)
SELECT u.id, u.email, 'pro', now() + interval '7 days'
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE rec record;
BEGIN
  FOR rec IN
    SELECT p.id FROM public.profiles p
    WHERE NOT EXISTS (SELECT 1 FROM public.contacts c WHERE c.user_id = p.id)
  LOOP
    PERFORM public.seed_marcus_for_user(rec.id);
  END LOOP;
END $$;

DO $$
DECLARE
  demo_uid uuid := 'd0000000-0000-0000-0000-000000000001';
  demo_email text := 'demo@pocketrep.pro';
  demo_pw text := 'PocketRepDemo2026!';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = demo_email) THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      demo_uid, 'authenticated', 'authenticated',
      demo_email, crypt(demo_pw, gen_salt('bf')),
      now(), now(), now(),
      jsonb_build_object('provider','email','providers',jsonb_build_array('email')),
      jsonb_build_object('plan','pro'),
      '', '', '', ''
    );

    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), demo_uid,
      jsonb_build_object('sub', demo_uid::text, 'email', demo_email),
      'email', demo_uid::text,
      now(), now(), now()
    );
  ELSE
    UPDATE auth.users
    SET encrypted_password = crypt(demo_pw, gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
    WHERE email = demo_email;
  END IF;

  INSERT INTO public.profiles (id, email, plan, trial_ends_at)
  VALUES (demo_uid, demo_email, 'pro', now() + interval '30 days')
  ON CONFLICT (id) DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM public.contacts WHERE user_id = demo_uid) THEN
    PERFORM public.seed_marcus_for_user(demo_uid);
  END IF;
END $$;
