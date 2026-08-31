-- Phase 2 launch-gate hardening (#20, #23, #24 from the 2026-08-28 audit).
-- Verified live before writing this: zero duplicate profiles.email or
-- profiles.stripe_customer_id rows exist today, so both unique constraints
-- below apply cleanly. Admin dashboard code (lib/v2/adminData.ts and
-- lib/v2/admin/adminData.ts, both checked) never selects referrals.stripe_*
-- columns, so the column-level lockdown below does not affect it.

-- #20 — stripe-webhook and checkout-account key lookups on profiles.email /
-- profiles.stripe_customer_id, neither of which had a uniqueness guarantee.
-- A duplicate would have made .maybeSingle() throw (silently skipping a
-- subscription-status update while still 200-ing Stripe, no retry) or let
-- two rows race for the same Stripe customer.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unique ON public.profiles (email);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_stripe_customer_id_unique ON public.profiles (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- #23 — admin RPCs: set search_path (mutable search_path lint) on the 4 that
-- were missing it, and lock down grants to match the codebase's own
-- established pattern (REVOKE from PUBLIC/anon, explicit GRANT to
-- authenticated — the internal `role = 'admin'` check inside each function
-- is what actually gates non-admin authenticated callers; this closes the
-- fully-unauthenticated (anon) path that had no check backing it up at all).
ALTER FUNCTION public.admin_ai_summary(text) SET search_path = public;
ALTER FUNCTION public.admin_customer_detail(uuid) SET search_path = public;
ALTER FUNCTION public.admin_outreach_stats() SET search_path = public;
ALTER FUNCTION public.admin_product_usage() SET search_path = public;

REVOKE ALL ON FUNCTION public.admin_ai_detail(text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_ai_summary(text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_customer_detail(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_outreach_stats() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_overview_stats() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_product_usage() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_referral_economics(date, date) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_ai_detail(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ai_summary(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_customer_detail(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_outreach_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_overview_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_product_usage() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_referral_economics(date, date) TO authenticated;

-- protect_profile_billing_fields is a trigger function (fires on profiles
-- writes regardless of RPC grants) that should never be callable directly —
-- it was reachable by anon AND authenticated via /rest/v1/rpc/. Revoke
-- entirely; the trigger keeps firing normally.
REVOKE ALL ON FUNCTION public.protect_profile_billing_fields() FROM public, anon, authenticated;

-- #24 — referrals_referrer_read let a referrer SELECT the full row for any
-- referral where they're the referrer, including the REFERRED party's
-- stripe_customer_id / stripe_subscription_id / stripe_checkout_session_id —
-- a different tenant's billing identifiers. RLS is row-level, so the fix is a
-- column-level grant: revoke blanket SELECT from authenticated and grant back
-- only the columns a referrer legitimately needs. Admin (role='admin', via
-- referrals_select_admin) and service_role are untouched — column grants are
-- additive per role, and admin dashboard code never selects the stripe_*
-- columns (verified above), so this has no effect there.
REVOKE SELECT ON public.referrals FROM authenticated;
GRANT SELECT (
  id, referral_code, referrer_user_id, referred_user_id, referred_email,
  status, created_at, qualified_at, rewarded_at, paid_at
) ON public.referrals TO authenticated;
