-- Referral privacy hardening.
-- The app's referral dashboard only needs the referrer's own referral rows.
-- Do not expose referral attribution metadata to the referred user through RLS.

DROP POLICY IF EXISTS referrals_self_read ON public.referrals;
CREATE POLICY referrals_referrer_read
  ON public.referrals
  FOR SELECT
  USING (referrer_user_id = (select auth.uid()));

DROP POLICY IF EXISTS referral_rewards_self_read ON public.referral_rewards;
CREATE POLICY referral_rewards_recipient_read
  ON public.referral_rewards
  FOR SELECT
  USING (recipient_user_id = (select auth.uid()));
