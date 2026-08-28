-- PocketRep: every NEW real signup gets 3 isolated demo customers.
-- Demo records are explicitly marked and are removed automatically when the
-- rep imports/adds their first real customer.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS contacts_user_demo_idx
  ON public.contacts(user_id, is_demo);

CREATE OR REPLACE FUNCTION public.seed_demo_contacts_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email text;
  _username text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.contacts WHERE user_id = p_user_id LIMIT 1) THEN
    RETURN;
  END IF;

  SELECT email INTO _email FROM auth.users WHERE id = p_user_id;
  IF _email IS NULL THEN RETURN; END IF;

  _username := split_part(_email, '@', 1) || '_' || right(p_user_id::text, 6);

  INSERT INTO public.users (id, username, email)
  VALUES (p_user_id, _username, _email)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.contacts (
    user_id, first_name, last_name, phone, email,
    vehicle, trim, budget, trade_in, notes, milestones, next_step,
    plan_label, heat_score, heat_reason, last_contact_date, follow_up_date,
    stage, tags, is_demo
  ) VALUES
  (p_user_id, 'Marcus', 'Holloway', '(312) 555-0184', 'marcus.demo@pocketrep.pro',
   '2026 BMW M3 Competition', 'Brooklyn Grey · xDrive', '82K', '2022 BMW M240i',
   'DEMO CUSTOMER — Hot example. Use this customer to learn the Heat Sheet and Rex workflow.',
   '[{"kind":"visit","t":"Visited showroom","d":"2d"},{"kind":"numbers","t":"Reviewed payment options","d":"1d"}]'::jsonb,
   'Lock trade-in number and follow up Thursday.', 'THIS WEEK', 90,
   'DEMO: recently active and needs a follow-up', CURRENT_DATE - 1, CURRENT_DATE + 1,
   'active', ARRAY['M Series','Repeat'], true),
  (p_user_id, 'Sarah', 'Thompson', '(312) 555-0185', 'sarah.demo@pocketrep.pro',
   '2024 Nissan Altima', 'SR', '34K', 'None',
   'DEMO CUSTOMER — Warm example. Use this customer to learn sequences and nurture.',
   '[{"kind":"sold","t":"Vehicle delivered","d":"30d"},{"kind":"followup","t":"No recent contact","d":"7d"}]'::jsonb,
   'Send a 30-day ownership check-in.', 'NURTURE', 65,
   'DEMO: past customer with no recent contact', CURRENT_DATE - 14, CURRENT_DATE + 3,
   'sold', ARRAY['Sedan','Loyalty'], true),
  (p_user_id, 'Mike', 'Rodriguez', '(312) 555-0186', 'mike.demo@pocketrep.pro',
   '2023 Nissan Titan', 'SV', '48K', '2020 Frontier',
   'DEMO CUSTOMER — Referral example. Use this customer to learn referral outreach.',
   '[{"kind":"sold","t":"Vehicle delivered","d":"90d"},{"kind":"referral","t":"No referral ask yet","d":"30d"}]'::jsonb,
   'Ask for a referral and check whether anyone in the family needs a vehicle.', 'REFERRAL', 45,
   'DEMO: past customer with referral opportunity', CURRENT_DATE - 30, CURRENT_DATE + 5,
   'sold', ARRAY['Truck','Family','Referral'], true);

  INSERT INTO public.tags (user_id, name, color) VALUES
    (p_user_id, 'SUV', '#42b883'), (p_user_id, 'EV', '#5a8fe8'),
    (p_user_id, 'Lease', '#a86bd1'), (p_user_id, 'Used', '#8a90a0'),
    (p_user_id, 'M Series', '#e05252'), (p_user_id, 'Coupe', '#e08c52'),
    (p_user_id, 'Sedan', '#d4a843'), (p_user_id, 'Cash', '#42b883'),
    (p_user_id, 'Loyalty', '#f0c060'), (p_user_id, 'Repeat', '#f0c060'),
    (p_user_id, 'Trade-in', '#a86bd1'), (p_user_id, 'Family', '#42b883'),
    (p_user_id, 'Referral', '#42b883'), (p_user_id, 'Truck', '#e08c52')
  ON CONFLICT (user_id, name) DO NOTHING;
END;
$$;

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

  PERFORM public.seed_demo_contacts_for_user(new.id);
  RETURN new;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.seed_demo_contacts_for_user(uuid) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.remove_demo_contacts_after_real_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.is_demo, false) = false THEN
    DELETE FROM public.contacts
    WHERE user_id = NEW.user_id AND is_demo = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contacts_remove_demo_after_real_insert ON public.contacts;
CREATE TRIGGER contacts_remove_demo_after_real_insert
AFTER INSERT ON public.contacts
FOR EACH ROW
EXECUTE FUNCTION public.remove_demo_contacts_after_real_insert();

REVOKE EXECUTE ON FUNCTION public.remove_demo_contacts_after_real_insert() FROM public, anon, authenticated;
