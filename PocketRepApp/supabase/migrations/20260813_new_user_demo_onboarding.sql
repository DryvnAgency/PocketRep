-- PocketRep launch: every new real account gets exactly 3 isolated demo customers.
-- Demo records are clearly flagged, safe from real messaging, and automatically
-- removed when the user adds their first real customer.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS contacts_user_demo_idx
  ON public.contacts(user_id, is_demo);

CREATE OR REPLACE FUNCTION public.seed_demo_customers_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Never seed if the user already has real contacts or already has demos.
  IF EXISTS (
    SELECT 1 FROM public.contacts
    WHERE user_id = p_user_id AND coalesce(is_demo, false) = false
    LIMIT 1
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.contacts
    WHERE user_id = p_user_id AND is_demo = true
    LIMIT 1
  ) THEN
    RETURN;
  END IF;

  -- contacts.user_id historically references public.users, so make sure
  -- the corresponding row exists before inserting the demo records.
  INSERT INTO public.users (id, username, email)
  SELECT au.id,
         split_part(coalesce(au.email, 'rep'), '@', 1) || '_' || right(au.id::text, 6),
         au.email
  FROM auth.users au
  WHERE au.id = p_user_id
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.contacts (
    user_id, first_name, last_name, phone, vehicle, trim, budget, trade_in,
    notes, milestones, next_step, plan_label, heat_score,
    last_contact_date, follow_up_date, stage, tags, is_demo
  ) VALUES
  (
    p_user_id, 'Marcus', 'Holloway', '(312) 555-0184', '''26 M3 Competition',
    'Brooklyn Grey · xDrive', '82K', '''22 M240i',
    'DEMO CUSTOMER — hot example. Use this record to learn the Heat Sheet → Rex → follow-up workflow.',
    '[{"kind":"visit","t":"Demo customer walkthrough","d":"2d"},{"kind":"numbers","t":"Demo payment conversation","d":"1d"}]'::jsonb,
    'Ask Rex to draft a natural follow-up for Marcus.',
    'THIS WEEK', 90, CURRENT_DATE - 1, CURRENT_DATE + 2, 'active',
    ARRAY['M Series','Repeat'], true
  ),
  (
    p_user_id, 'Sarah', 'Thompson', '(312) 555-0185', '''25 X5 xDrive40i',
    'Alpine White · Premium', '74K', 'None',
    'DEMO CUSTOMER — warm example. Use this record to learn how PocketRep keeps a customer in nurture.',
    '[{"kind":"visit","t":"Demo customer walkthrough","d":"8d"},{"kind":"follow-up","t":"Demo follow-up due","d":"3d"}]'::jsonb,
    'Review the conversation, then place Sarah into a nurture sequence.',
    'THIS MONTH', 65, CURRENT_DATE - 5, CURRENT_DATE + 5, 'active',
    ARRAY['SUV','Lease'], true
  ),
  (
    p_user_id, 'Mike', 'Rodriguez', '(312) 555-0186', '''24 Silverado 1500',
    'LT Trail Boss', '58K', '''20 Silverado',
    'DEMO CUSTOMER — referral example. Use this record to learn how PocketRep surfaces referral opportunities.',
    '[{"kind":"sale","t":"Demo sale completed","d":"90d"},{"kind":"referral","t":"Demo referral opportunity","d":"14d"}]'::jsonb,
    'Ask Rex for a referral check-in that does not sound salesy.',
    'REFERRAL', 45, CURRENT_DATE - 14, CURRENT_DATE + 7, 'active',
    ARRAY['Repeat','Trade-in'], true
  );
END;
$$;

-- Called only by the trusted auth trigger. Browser users cannot execute this RPC.
REVOKE ALL ON FUNCTION public.seed_demo_customers_for_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seed_demo_customers_for_user(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.seed_demo_customers_for_user(uuid) FROM authenticated;

CREATE OR REPLACE FUNCTION public.remove_demo_customers_after_real_import()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF coalesce(NEW.is_demo, false) = false THEN
    DELETE FROM public.contacts
    WHERE user_id = NEW.user_id
      AND is_demo = true;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_demo_customers_after_real_import() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_demo_customers_after_real_import() FROM anon;
REVOKE ALL ON FUNCTION public.remove_demo_customers_after_real_import() FROM authenticated;

DROP TRIGGER IF EXISTS trg_remove_demo_customers_after_real_import ON public.contacts;
CREATE TRIGGER trg_remove_demo_customers_after_real_import
AFTER INSERT ON public.contacts
FOR EACH ROW
EXECUTE FUNCTION public.remove_demo_customers_after_real_import();

-- Restore honest account provisioning from the no-fake-seed migration, but
-- replace the empty-book behavior with the 3-customer guided demo experience.
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

  PERFORM public.seed_demo_customers_for_user(new.id);
  RETURN new;
END;
$function$;

-- Existing real users are not touched. If an existing account is genuinely
-- empty, give it the same 3-customer onboarding experience.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.id
    FROM public.profiles p
    WHERE NOT EXISTS (
      SELECT 1 FROM public.contacts c
      WHERE c.user_id = p.id AND coalesce(c.is_demo, false) = false
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.contacts c
      WHERE c.user_id = p.id AND c.is_demo = true
    )
  LOOP
    PERFORM public.seed_demo_customers_for_user(r.id);
  END LOOP;
END $$;
