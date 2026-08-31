-- Admin SELECT policies for dashboard tables.
-- Pattern: admin (profiles.role = 'admin') can read all rows.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'daily_ai_usage_select_admin' AND tablename = 'daily_ai_usage') THEN
    CREATE POLICY daily_ai_usage_select_admin ON public.daily_ai_usage
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin')
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'monthly_ai_usage_select_admin' AND tablename = 'monthly_ai_usage') THEN
    CREATE POLICY monthly_ai_usage_select_admin ON public.monthly_ai_usage
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin')
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'referrals_select_admin' AND tablename = 'referrals') THEN
    CREATE POLICY referrals_select_admin ON public.referrals
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin')
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'referral_rewards_select_admin' AND tablename = 'referral_rewards') THEN
    CREATE POLICY referral_rewards_select_admin ON public.referral_rewards
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin')
      );
  END IF;
END $$;
