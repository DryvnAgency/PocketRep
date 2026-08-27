-- Owner Control Center: Admin RPC functions for server-side aggregation.
-- All functions are SECURITY DEFINER and check admin role internally.

-- Function 1: admin_overview_stats
-- Returns high-level platform metrics (users, subs, signups, AI cost, referrals, tickets).
CREATE OR REPLACE FUNCTION admin_overview_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
  v_total_users bigint;
  v_active_subs bigint;
  v_trialing bigint;
  v_today_signups bigint;
  v_week_signups bigint;
  v_ai_cost_mtd numeric;
  v_total_referrals bigint;
  v_rewarded_referrals bigint;
  v_open_tickets bigint;
BEGIN
  -- Admin check
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT count(*) INTO v_total_users FROM public.profiles WHERE role != 'admin';
  SELECT count(*) INTO v_active_subs FROM public.profiles WHERE subscription_status = 'active' AND role != 'admin';
  SELECT count(*) INTO v_trialing FROM public.profiles WHERE subscription_status = 'trialing' AND role != 'admin';
  SELECT count(*) INTO v_today_signups FROM public.profiles WHERE created_at::date = CURRENT_DATE AND role != 'admin';
  SELECT count(*) INTO v_week_signups FROM public.profiles WHERE created_at >= date_trunc('week', CURRENT_DATE) AND role != 'admin';
  SELECT COALESCE(sum(cost_cents), 0) INTO v_ai_cost_mtd FROM public.daily_ai_usage WHERE usage_date >= date_trunc('month', CURRENT_DATE)::date;
  SELECT count(*) INTO v_total_referrals FROM public.referrals;
  SELECT count(*) INTO v_rewarded_referrals FROM public.referrals WHERE status = 'rewarded';
  SELECT count(*) INTO v_open_tickets FROM public.support_tickets WHERE status = 'open';

  result := json_build_object(
    'totalUsers', v_total_users,
    'activeSubscribers', v_active_subs,
    'trialingUsers', v_trialing,
    'todaySignups', v_today_signups,
    'weekSignups', v_week_signups,
    'aiCostMtd', v_ai_cost_mtd,
    'totalReferrals', v_total_referrals,
    'rewardedReferrals', v_rewarded_referrals,
    'openTickets', v_open_tickets
  );
  RETURN result;
END;
$$;

-- Function 2: admin_ai_summary
-- Returns per-user AI usage breakdown, optionally filtered by month (YYYY-MM).
CREATE OR REPLACE FUNCTION admin_ai_summary(p_month text DEFAULT NULL)
RETURNS TABLE(user_id uuid, email text, full_name text, total_cost numeric, total_requests bigint, total_input bigint, total_output bigint)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Admin check
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    d.user_id,
    p.email,
    p.full_name,
    COALESCE(sum(d.cost_cents), 0::numeric) as total_cost,
    COALESCE(sum(d.request_count)::bigint, 0::bigint) as total_requests,
    COALESCE(sum(d.input_tokens)::bigint, 0::bigint) as total_input,
    COALESCE(sum(d.output_tokens)::bigint, 0::bigint) as total_output
  FROM public.daily_ai_usage d
  JOIN public.profiles p ON p.id = d.user_id
  WHERE (p_month IS NULL OR to_char(d.usage_date, 'YYYY-MM') = p_month)
  GROUP BY d.user_id, p.email, p.full_name
  ORDER BY total_cost DESC;
END;
$$;

-- Function 3: admin_customer_detail
-- Returns a single customer's full profile and usage summary.
CREATE OR REPLACE FUNCTION admin_customer_detail(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
  v_profile json;
  v_contact_count bigint;
  v_deal_count bigint;
  v_deal_gross numeric;
  v_sequence_count bigint;
  v_interaction_count bigint;
  v_nurture_sent bigint;
  v_sms_count bigint;
  v_ai_cost numeric;
  v_ai_requests bigint;
  v_open_tickets bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT row_to_json(sub) INTO v_profile FROM (
    SELECT p.id, p.email, p.full_name, p.plan, p.subscription_status, p.stripe_customer_id,
           p.trial_ends_at, p.created_at, p.role, u.last_active_at
    FROM public.profiles p
    LEFT JOIN public.users u ON u.id = p.id
    WHERE p.id = p_user_id
  ) sub;

  SELECT count(*) INTO v_contact_count FROM public.contacts WHERE user_id = p_user_id AND NOT is_deleted;
  SELECT count(*), COALESCE(sum(front_gross + back_gross), 0) INTO v_deal_count, v_deal_gross FROM public.deals WHERE user_id = p_user_id;
  SELECT count(*) INTO v_sequence_count FROM public.sequences WHERE user_id = p_user_id;
  SELECT count(*) INTO v_interaction_count FROM public.interactions WHERE user_id = p_user_id;
  SELECT count(*) INTO v_nurture_sent FROM public.nurture_messages WHERE user_id = p_user_id AND sent_at IS NOT NULL;
  SELECT count(*) INTO v_sms_count FROM public.outbound_sms_actions WHERE user_id = p_user_id;
  SELECT COALESCE(sum(cost_cents), 0), COALESCE(sum(request_count), 0) INTO v_ai_cost, v_ai_requests FROM public.daily_ai_usage WHERE user_id = p_user_id;
  SELECT count(*) INTO v_open_tickets FROM public.support_tickets WHERE user_id = p_user_id AND status = 'open';

  result := json_build_object(
    'profile', v_profile,
    'contactCount', v_contact_count,
    'dealCount', v_deal_count,
    'dealGross', v_deal_gross,
    'sequenceCount', v_sequence_count,
    'interactionCount', v_interaction_count,
    'nurtureSent', v_nurture_sent,
    'smsCount', v_sms_count,
    'aiCost', v_ai_cost,
    'aiRequests', v_ai_requests,
    'openTickets', v_open_tickets
  );
  RETURN result;
END;
$$;

-- Function 4: admin_outreach_stats
-- Returns platform-wide outreach metrics (SMS, sequences, nurtures, overdue followups).
CREATE OR REPLACE FUNCTION admin_outreach_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
  v_sms_total bigint;
  v_sms_confirmed bigint;
  v_seq_total bigint;
  v_seq_approved bigint;
  v_nurture_generated bigint;
  v_nurture_sent bigint;
  v_nurture_replied bigint;
  v_overdue_followups bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT count(*), count(*) FILTER (WHERE status = 'confirmed_sent') INTO v_sms_total, v_sms_confirmed FROM public.outbound_sms_actions;
  SELECT count(*), count(*) FILTER (WHERE draft_status = 'approved' OR draft_status = 'sent') INTO v_seq_total, v_seq_approved FROM public.sequences;
  SELECT count(*), count(*) FILTER (WHERE sent_at IS NOT NULL), count(*) FILTER (WHERE reply_received = true) INTO v_nurture_generated, v_nurture_sent, v_nurture_replied FROM public.nurture_messages;
  SELECT count(*) INTO v_overdue_followups FROM public.contacts WHERE next_followup_date < CURRENT_DATE AND NOT is_deleted AND NOT do_not_contact;

  result := json_build_object(
    'smsTotal', v_sms_total,
    'smsConfirmed', v_sms_confirmed,
    'sequencesTotal', v_seq_total,
    'sequencesApproved', v_seq_approved,
    'nurtureGenerated', v_nurture_generated,
    'nurtureSent', v_nurture_sent,
    'nurtureReplied', v_nurture_replied,
    'overdueFollowups', v_overdue_followups
  );
  RETURN result;
END;
$$;

-- Function 5: admin_product_usage
-- Returns platform-wide product usage metrics (contacts, deals, sequences, interactions, etc.).
CREATE OR REPLACE FUNCTION admin_product_usage()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
  v_total_contacts bigint;
  v_contacts_this_week bigint;
  v_contacts_this_month bigint;
  v_total_deals bigint;
  v_total_gross numeric;
  v_total_sequences bigint;
  v_total_nurtures bigint;
  v_total_rex_messages bigint;
  v_total_digests bigint;
  v_interactions_call bigint;
  v_interactions_text bigint;
  v_interactions_email bigint;
  v_interactions_note bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT count(*) INTO v_total_contacts FROM public.contacts WHERE NOT is_deleted;
  SELECT count(*) INTO v_contacts_this_week FROM public.contacts WHERE NOT is_deleted AND created_at >= date_trunc('week', CURRENT_DATE);
  SELECT count(*) INTO v_contacts_this_month FROM public.contacts WHERE NOT is_deleted AND created_at >= date_trunc('month', CURRENT_DATE);
  SELECT count(*), COALESCE(sum(front_gross + back_gross), 0) INTO v_total_deals, v_total_gross FROM public.deals;
  SELECT count(*) INTO v_total_sequences FROM public.sequences;
  SELECT count(*) INTO v_total_nurtures FROM public.nurture_messages;
  SELECT count(*) INTO v_total_rex_messages FROM public.rex_messages;
  SELECT count(*) INTO v_total_digests FROM public.weekly_digests;
  SELECT count(*) FILTER (WHERE type = 'call'), count(*) FILTER (WHERE type = 'text'), count(*) FILTER (WHERE type = 'email'), count(*) FILTER (WHERE type = 'note') INTO v_interactions_call, v_interactions_text, v_interactions_email, v_interactions_note FROM public.interactions;

  result := json_build_object(
    'totalContacts', v_total_contacts,
    'contactsThisWeek', v_contacts_this_week,
    'contactsThisMonth', v_contacts_this_month,
    'totalDeals', v_total_deals,
    'totalGross', v_total_gross,
    'totalSequences', v_total_sequences,
    'totalNurtures', v_total_nurtures,
    'totalRexMessages', v_total_rex_messages,
    'totalDigests', v_total_digests,
    'interactionsByType', json_build_object('call', v_interactions_call, 'text', v_interactions_text, 'email', v_interactions_email, 'note', v_interactions_note)
  );
  RETURN result;
END;
$$;
