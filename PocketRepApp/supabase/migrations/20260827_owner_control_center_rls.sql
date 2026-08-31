-- Owner Control Center: Admin SELECT policies for all OCC-readable tables.
-- Pattern: admin (profiles.role = 'admin') can read all rows.
-- Idempotent: uses IF NOT EXISTS checks.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contacts' AND policyname = 'contacts_select_admin') THEN
    CREATE POLICY "contacts_select_admin" ON public.contacts FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'deals' AND policyname = 'deals_select_admin') THEN
    CREATE POLICY "deals_select_admin" ON public.deals FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sequences' AND policyname = 'sequences_select_admin') THEN
    CREATE POLICY "sequences_select_admin" ON public.sequences FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sequence_steps' AND policyname = 'sequence_steps_select_admin') THEN
    CREATE POLICY "sequence_steps_select_admin" ON public.sequence_steps FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contact_sequences' AND policyname = 'contact_sequences_select_admin') THEN
    CREATE POLICY "contact_sequences_select_admin" ON public.contact_sequences FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_select_admin') THEN
    CREATE POLICY "profiles_select_admin" ON public.profiles FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'interactions' AND policyname = 'interactions_select_admin') THEN
    CREATE POLICY "interactions_select_admin" ON public.interactions FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contact_interactions' AND policyname = 'contact_interactions_select_admin') THEN
    CREATE POLICY "contact_interactions_select_admin" ON public.contact_interactions FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contact_milestones' AND policyname = 'contact_milestones_select_admin') THEN
    CREATE POLICY "contact_milestones_select_admin" ON public.contact_milestones FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'nurture_messages' AND policyname = 'nurture_messages_select_admin') THEN
    CREATE POLICY "nurture_messages_select_admin" ON public.nurture_messages FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'mass_texts' AND policyname = 'mass_texts_select_admin') THEN
    CREATE POLICY "mass_texts_select_admin" ON public.mass_texts FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'outbound_sms_actions' AND policyname = 'outbound_sms_actions_select_admin') THEN
    CREATE POLICY "outbound_sms_actions_select_admin" ON public.outbound_sms_actions FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'weekly_digests' AND policyname = 'weekly_digests_select_admin') THEN
    CREATE POLICY "weekly_digests_select_admin" ON public.weekly_digests FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rex_messages' AND policyname = 'rex_messages_select_admin') THEN
    CREATE POLICY "rex_messages_select_admin" ON public.rex_messages FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rex_action_log' AND policyname = 'rex_action_log_select_admin') THEN
    CREATE POLICY "rex_action_log_select_admin" ON public.rex_action_log FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rex_usage' AND policyname = 'rex_usage_select_admin') THEN
    CREATE POLICY "rex_usage_select_admin" ON public.rex_usage FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'heat_sheet_log' AND policyname = 'heat_sheet_log_select_admin') THEN
    CREATE POLICY "heat_sheet_log_select_admin" ON public.heat_sheet_log FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'reminders' AND policyname = 'reminders_select_admin') THEN
    CREATE POLICY "reminders_select_admin" ON public.reminders FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tags' AND policyname = 'tags_select_admin') THEN
    CREATE POLICY "tags_select_admin" ON public.tags FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pay_plans' AND policyname = 'pay_plans_select_admin') THEN
    CREATE POLICY "pay_plans_select_admin" ON public.pay_plans FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'users_select_admin') THEN
    CREATE POLICY "users_select_admin" ON public.users FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'entitlement_events' AND policyname = 'entitlement_events_select_admin') THEN
    CREATE POLICY "entitlement_events_select_admin" ON public.entitlement_events FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin'));
  END IF;
END $$;
