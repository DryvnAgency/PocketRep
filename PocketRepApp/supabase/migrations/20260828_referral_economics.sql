-- Referral Economics & Growth Intelligence
-- Fixes admin_overview_stats field mismatches, adds per-model AI cost tracking,
-- and adds two new RPCs: admin_referral_economics + admin_ai_detail.
-- All functions are SECURITY DEFINER and check admin role internally.
-- No changes to referral business rules — read/aggregation only.

-- ── 1. Per-model AI cost tracking ───────────────────────────────────────────
-- daily_ai_usage was previously unique on (user_id, usage_date) only, so all
-- models for a user/day rolled into one row. Add a model column (backfilled
-- to 'unknown' for existing rows, and always non-null going forward so a
-- plain multi-column unique constraint — which PostgREST's upsert onConflict
-- needs — actually enforces uniqueness; NULL would not) and widen uniqueness
-- to (user_id, usage_date, model). The daily cap check keeps working
-- unchanged: it SUMs cost_cents across all rows for a user+date.

ALTER TABLE public.daily_ai_usage ADD COLUMN IF NOT EXISTS model text NOT NULL DEFAULT 'unknown';
ALTER TABLE public.daily_ai_usage ALTER COLUMN model DROP DEFAULT;

ALTER TABLE public.daily_ai_usage DROP CONSTRAINT IF EXISTS daily_ai_usage_user_id_usage_date_key;
ALTER TABLE public.daily_ai_usage ADD CONSTRAINT daily_ai_usage_user_date_model_key
  UNIQUE (user_id, usage_date, model);

-- Replace increment_daily_usage to accept a model, upserting on the new
-- (user_id, usage_date, model) key. p_model defaults to 'unknown' so any
-- caller that hasn't been updated yet still inserts a valid, unique row.
CREATE OR REPLACE FUNCTION public.increment_daily_usage(
  p_user_id uuid,
  p_date date,
  p_input_tokens int,
  p_output_tokens int,
  p_cost_cents numeric,
  p_model text DEFAULT 'unknown'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.daily_ai_usage (user_id, usage_date, model, input_tokens, output_tokens, cost_cents, request_count, updated_at)
  VALUES (p_user_id, p_date, COALESCE(NULLIF(p_model, ''), 'unknown'), p_input_tokens, p_output_tokens, p_cost_cents, 1, now())
  ON CONFLICT (user_id, usage_date, model)
  DO UPDATE SET
    input_tokens = public.daily_ai_usage.input_tokens + excluded.input_tokens,
    output_tokens = public.daily_ai_usage.output_tokens + excluded.output_tokens,
    cost_cents = public.daily_ai_usage.cost_cents + excluded.cost_cents,
    request_count = public.daily_ai_usage.request_count + 1,
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_daily_usage(uuid, date, int, int, numeric, text) TO service_role;

-- ── 2. Fix admin_overview_stats field-name mismatches ───────────────────────
-- Previously returned activeSubscribers/aiCostMtd which didn't match the TS
-- OverviewStats type (activeSubscriptions/totalAiCost), and was missing
-- totalContacts/totalDeals/totalAiRequests/newPaidThisMonth/referralCustomers.
-- totalAiCost is now ALL-TIME cost (the UI label already said "all time").
CREATE OR REPLACE FUNCTION public.admin_overview_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
  v_total_users bigint;
  v_active_subs bigint;
  v_trialing bigint;
  v_total_contacts bigint;
  v_total_deals bigint;
  v_today_signups bigint;
  v_week_signups bigint;
  v_new_paid_this_month bigint;
  v_ai_cost_total numeric;
  v_ai_requests_total bigint;
  v_total_referrals bigint;
  v_rewarded_referrals bigint;
  v_referral_customers bigint;
  v_open_tickets bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT count(*) INTO v_total_users FROM public.profiles WHERE role != 'admin';
  SELECT count(*) INTO v_active_subs FROM public.profiles WHERE subscription_status = 'active' AND role != 'admin';
  SELECT count(*) INTO v_trialing FROM public.profiles WHERE subscription_status = 'trialing' AND role != 'admin';
  SELECT count(*) INTO v_total_contacts FROM public.contacts WHERE NOT is_deleted;
  SELECT count(*) INTO v_total_deals FROM public.deals;
  SELECT count(*) INTO v_today_signups FROM public.profiles WHERE created_at::date = CURRENT_DATE AND role != 'admin';
  SELECT count(*) INTO v_week_signups FROM public.profiles WHERE created_at >= date_trunc('week', CURRENT_DATE) AND role != 'admin';
  -- "New paid this month" = referrals rewarded this month is too narrow; use
  -- referral_rewards issued_at as a proxy is wrong too. Best available signal
  -- without a subscription-history table: rewarded referrals this month plus
  -- profiles whose subscription_status is active and trial_ends_at fell this
  -- month (i.e. converted from trial). Approximate via referrals.paid_at.
  SELECT count(*) INTO v_new_paid_this_month FROM public.referrals
    WHERE paid_at IS NOT NULL AND paid_at >= date_trunc('month', CURRENT_DATE);
  SELECT COALESCE(sum(cost_cents), 0) INTO v_ai_cost_total FROM public.daily_ai_usage;
  SELECT COALESCE(sum(request_count), 0) INTO v_ai_requests_total FROM public.daily_ai_usage;
  SELECT count(*) INTO v_total_referrals FROM public.referrals;
  SELECT count(*) INTO v_rewarded_referrals FROM public.referrals WHERE status = 'rewarded';
  SELECT count(DISTINCT referred_user_id) INTO v_referral_customers FROM public.referrals WHERE referred_user_id IS NOT NULL;
  SELECT count(*) INTO v_open_tickets FROM public.support_tickets WHERE status = 'open';

  result := json_build_object(
    'totalUsers', v_total_users,
    'activeSubscriptions', v_active_subs,
    'trialingUsers', v_trialing,
    'totalContacts', v_total_contacts,
    'totalDeals', v_total_deals,
    'totalAiCost', v_ai_cost_total,
    'totalAiRequests', v_ai_requests_total,
    'todaySignups', v_today_signups,
    'weekSignups', v_week_signups,
    'newPaidThisMonth', v_new_paid_this_month,
    'totalReferrals', v_total_referrals,
    'rewardedReferrals', v_rewarded_referrals,
    'referralCustomers', v_referral_customers,
    'openTickets', v_open_tickets
  );
  RETURN result;
END;
$$;

-- ── 3. admin_referral_economics — funnel, credits, advocates, quality ───────
-- p_start/p_end (both nullable, inclusive) filter referrals.created_at for the
-- cohort/date-range selector. NULL/NULL = all time.
CREATE OR REPLACE FUNCTION public.admin_referral_economics(p_start date DEFAULT NULL, p_end date DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
  v_signups bigint;
  v_verified bigint;
  v_paid bigint;
  v_rewarded bigint;
  v_active bigint;
  v_credits_pending bigint;
  v_credits_applied bigint;
  v_credits_failed bigint;
  v_advocates json;
  v_top_advocates json;
  v_total_advocates bigint;
  v_pct_1 numeric;
  v_pct_2plus numeric;
  v_pct_5plus numeric;
  v_avg_referrals numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Funnel (scoped to the date range on referrals.created_at)
  SELECT count(*) INTO v_signups FROM public.referrals r
    WHERE (p_start IS NULL OR r.created_at::date >= p_start) AND (p_end IS NULL OR r.created_at::date <= p_end);
  SELECT count(*) INTO v_verified FROM public.referrals r
    WHERE r.status IN ('verified','qualified','rewarded')
    AND (p_start IS NULL OR r.created_at::date >= p_start) AND (p_end IS NULL OR r.created_at::date <= p_end);
  SELECT count(*) INTO v_paid FROM public.referrals r
    WHERE r.status IN ('qualified','rewarded')
    AND (p_start IS NULL OR r.created_at::date >= p_start) AND (p_end IS NULL OR r.created_at::date <= p_end);
  SELECT count(*) INTO v_rewarded FROM public.referrals r
    WHERE r.status = 'rewarded'
    AND (p_start IS NULL OR r.created_at::date >= p_start) AND (p_end IS NULL OR r.created_at::date <= p_end);
  SELECT count(*) INTO v_active FROM public.referrals r
    JOIN public.profiles p ON p.id = r.referred_user_id
    WHERE r.status = 'rewarded' AND p.subscription_status = 'active'
    AND (p_start IS NULL OR r.created_at::date >= p_start) AND (p_end IS NULL OR r.created_at::date <= p_end);

  -- Credit economics (referral_rewards is not date-scoped by referral cohort —
  -- these are current totals, since a reward can be issued after the range)
  SELECT count(*) INTO v_credits_pending FROM public.referral_rewards WHERE status = 'pending';
  SELECT count(*) INTO v_credits_applied FROM public.referral_rewards WHERE status = 'applied';
  SELECT count(*) INTO v_credits_failed FROM public.referral_rewards WHERE status = 'failed';

  -- Per-advocate stats (all time — cap monitoring needs lifetime totals
  -- regardless of range). MATERIALIZED so the join+group-by runs once even
  -- though it feeds six separate scalar subqueries below — a CTE is only
  -- visible within the single statement it's attached to, so both the full
  -- list and the top-10 slice must be computed here, not in a later
  -- statement (a plain SELECT ... FROM advocate_stats after this one would
  -- fail to resolve). json_build_object keys are set explicitly rather than
  -- via json_to_recordset, which case-folds an unquoted "userId" column to
  -- "userid" and would silently null every camelCase field on the way back.
  WITH advocate_stats AS MATERIALIZED (
    SELECT
      r.referrer_user_id AS user_id,
      p.full_name AS name,
      p.email AS email,
      count(*) AS referral_count,
      count(*) FILTER (WHERE r.status = 'rewarded') AS rewarded_count,
      COALESCE((
        SELECT count(*) FROM public.referral_rewards rr
        WHERE rr.recipient_user_id = r.referrer_user_id AND rr.status = 'applied'
      ), 0) AS lifetime_credits
    FROM public.referrals r
    JOIN public.profiles p ON p.id = r.referrer_user_id
    GROUP BY r.referrer_user_id, p.full_name, p.email
  )
  SELECT
    (SELECT json_agg(json_build_object(
       'userId', user_id, 'name', name, 'email', email,
       'referralCount', referral_count, 'rewardedCount', rewarded_count,
       'lifetimeCredits', lifetime_credits
     ) ORDER BY referral_count DESC) FROM advocate_stats),
    (SELECT count(*) FROM advocate_stats),
    (SELECT round(100.0 * count(*) FILTER (WHERE referral_count >= 1) / GREATEST(count(*), 1), 1) FROM advocate_stats),
    (SELECT round(100.0 * count(*) FILTER (WHERE referral_count >= 2) / GREATEST(count(*), 1), 1) FROM advocate_stats),
    (SELECT round(100.0 * count(*) FILTER (WHERE referral_count >= 5) / GREATEST(count(*), 1), 1) FROM advocate_stats),
    (SELECT round(AVG(referral_count), 2) FROM advocate_stats),
    (SELECT json_agg(json_build_object(
       'userId', user_id, 'name', name, 'email', email,
       'referralCount', referral_count, 'rewardedCount', rewarded_count,
       'lifetimeCredits', lifetime_credits
     ) ORDER BY referral_count DESC)
     FROM (SELECT * FROM advocate_stats ORDER BY referral_count DESC LIMIT 10) top10)
  INTO v_advocates, v_total_advocates, v_pct_1, v_pct_2plus, v_pct_5plus, v_avg_referrals, v_top_advocates;

  result := json_build_object(
    'funnel', json_build_object(
      'signups', v_signups, 'verified', v_verified, 'paid', v_paid,
      'rewarded', v_rewarded, 'active', v_active
    ),
    'credits', json_build_object(
      'pending', v_credits_pending, 'applied', v_credits_applied, 'failed', v_credits_failed,
      'totalIssued', v_credits_applied + v_credits_pending
    ),
    'advocates', COALESCE(v_advocates, '[]'::json),
    'topAdvocates', COALESCE(v_top_advocates, '[]'::json),
    'quality', json_build_object(
      'totalAdvocates', COALESCE(v_total_advocates, 0),
      'pctReferred1', COALESCE(v_pct_1, 0),
      'pctReferred2Plus', COALESCE(v_pct_2plus, 0),
      'pctReferred5Plus', COALESCE(v_pct_5plus, 0),
      'avgReferralsPerAdvocate', COALESCE(v_avg_referrals, 0)
    )
  );
  RETURN result;
END;
$$;

-- ── 4. admin_ai_detail — per-model breakdown + first-week safety ────────────
CREATE OR REPLACE FUNCTION public.admin_ai_detail(p_month text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
  v_by_model json;
  v_first_week json;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT json_agg(json_build_object(
    'model', COALESCE(model, 'unknown'),
    'totalCost', total_cost, 'totalRequests', total_requests,
    'totalInput', total_input, 'totalOutput', total_output
  ) ORDER BY total_cost DESC)
  INTO v_by_model
  FROM (
    SELECT model, sum(cost_cents) AS total_cost, sum(request_count) AS total_requests,
           sum(input_tokens) AS total_input, sum(output_tokens) AS total_output
    FROM public.daily_ai_usage
    WHERE (p_month IS NULL OR to_char(usage_date, 'YYYY-MM') = p_month)
    GROUP BY model
  ) grouped;

  -- Users created in the last 7 days, with their AI spend since signup.
  SELECT json_agg(json_build_object(
    'userId', p.id, 'email', p.email, 'fullName', p.full_name,
    'createdAt', p.created_at, 'costCents', COALESCE(u.cost_cents, 0), 'requestCount', COALESCE(u.request_count, 0)
  ) ORDER BY COALESCE(u.cost_cents, 0) DESC)
  INTO v_first_week
  FROM public.profiles p
  LEFT JOIN (
    SELECT user_id, sum(cost_cents) AS cost_cents, sum(request_count) AS request_count
    FROM public.daily_ai_usage
    GROUP BY user_id
  ) u ON u.user_id = p.id
  WHERE p.role != 'admin' AND p.created_at >= now() - interval '7 days';

  result := json_build_object(
    'byModel', COALESCE(v_by_model, '[]'::json),
    'firstWeekUsers', COALESCE(v_first_week, '[]'::json)
  );
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_overview_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_referral_economics(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ai_detail(text) TO authenticated;
