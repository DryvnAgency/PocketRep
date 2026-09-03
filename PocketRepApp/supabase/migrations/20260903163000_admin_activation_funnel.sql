-- First-250 launch activation funnel.
-- Derived entirely from PocketRep's existing first-party records; no third-party
-- analytics SDK and no customer-facing behavior changes.

create or replace function public.admin_activation_funnel()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_result jsonb;
begin
  if not exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  ) then
    raise exception 'forbidden';
  end if;

  with reps as (
    select
      p.id,
      p.email,
      p.full_name,
      p.created_at,
      p.onboarding_complete,
      u.last_active_at
    from public.profiles p
    left join public.users u on u.id = p.id
    where coalesce(p.role, 'rep') <> 'admin'
  ), milestones as (
    select
      r.*,
      exists (
        select 1 from public.contacts c
        where c.user_id = r.id
          and coalesce(c.is_demo, false) = false
          and coalesce(c.is_deleted, false) = false
      ) as has_real_contact,
      exists (
        select 1 from public.rex_messages rm
        where rm.user_id = r.id and rm.role = 'user'
      ) as has_rex_turn,
      (
        exists (
          select 1
          from public.interactions i
          join public.contacts c on c.id = i.contact_id
          where i.user_id = r.id
            and i.type in ('call','text','email')
            and coalesce(c.is_demo, false) = false
        )
        or exists (
          select 1
          from public.contact_interactions ci
          join public.contacts c on c.id = ci.contact_id
          where ci.user_id = r.id
            and ci.sent_at is not null
            and coalesce(c.is_demo, false) = false
        )
      ) as has_customer_action,
      exists (
        select 1
        from public.contact_sequences cs
        join public.contacts c on c.id = cs.contact_id
        where cs.user_id = r.id
          and coalesce(c.is_demo, false) = false
      ) as has_sequence,
      exists (
        select 1
        from public.deals d
        left join public.contacts c on c.id = d.contact_id
        where d.user_id = r.id
          and (d.contact_id is null or coalesce(c.is_demo, false) = false)
      ) as has_deal,
      (r.last_active_at is not null and r.last_active_at >= r.created_at + interval '24 hours') as returned_24h,
      (r.last_active_at is not null and r.last_active_at >= r.created_at + interval '6 days') as returned_7d,
      exists (
        select 1 from public.referrals rf
        where rf.referrer_user_id = r.id
      ) as has_referral_conversion
    from reps r
  ), summary as (
    select
      count(*)::int as signed_up,
      count(*) filter (where onboarding_complete)::int as onboarded,
      count(*) filter (where has_real_contact)::int as real_contact,
      count(*) filter (where has_rex_turn)::int as rex,
      count(*) filter (where has_customer_action)::int as customer_action,
      count(*) filter (where has_sequence)::int as sequence,
      count(*) filter (where has_deal)::int as deal,
      count(*) filter (where returned_24h)::int as returned_24h,
      count(*) filter (where returned_7d)::int as returned_7d,
      count(*) filter (where has_referral_conversion)::int as referral_conversion
    from milestones
  )
  select jsonb_build_object(
    'summary', (select to_jsonb(summary) from summary),
    'users', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select
          id as user_id,
          email,
          full_name,
          created_at,
          onboarding_complete,
          has_real_contact,
          has_rex_turn,
          has_customer_action,
          has_sequence,
          has_deal,
          returned_24h,
          returned_7d,
          has_referral_conversion
        from milestones
        order by created_at desc
        limit 250
      ) x
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.admin_activation_funnel() from public;
revoke all on function public.admin_activation_funnel() from anon;
revoke all on function public.admin_activation_funnel() from authenticated;
grant execute on function public.admin_activation_funnel() to authenticated;
