-- Keep the authenticated column grant aligned with the admin referrals query.
-- RLS still controls which referral rows each authenticated caller may read.
GRANT SELECT (verified_at) ON public.referrals TO authenticated;
