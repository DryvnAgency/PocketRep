-- Enforce the 24-month lifetime referral reward cap atomically.
--
-- Edge functions previously checked applied rewards and then inserted a pending
-- reward in separate requests. Concurrent qualifying referrals could both see
-- the same remaining capacity and reserve beyond the owner-approved cap.
-- This RPC serializes reservations per recipient and counts pending reservations
-- as consumed capacity until they are applied or fail.

create or replace function public.reserve_referral_reward(
  p_referral_id uuid,
  p_recipient_user_id uuid,
  p_cap_months integer default 24
)
returns table (
  allowed boolean,
  reward_id uuid,
  reward_status text,
  reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.referral_rewards%rowtype;
  v_reserved_months integer := 0;
  v_reward_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden';
  end if;

  if p_referral_id is null or p_recipient_user_id is null then
    raise exception 'missing referral or recipient';
  end if;

  if p_cap_months is null or p_cap_months < 1 then
    raise exception 'invalid referral cap';
  end if;

  -- One transaction at a time may reserve referral credit for a recipient.
  perform pg_advisory_xact_lock(hashtextextended(p_recipient_user_id::text, 0));

  select *
    into v_existing
    from public.referral_rewards
   where referral_id = p_referral_id
     and recipient_user_id = p_recipient_user_id
     and reward_type = 'one_month_free'
   for update;

  if v_existing.id is not null and v_existing.status = 'applied' then
    return query select true, v_existing.id, v_existing.status, 'already_applied'::text;
    return;
  end if;

  -- A pending row is an existing reservation. Because all new reservations go
  -- through this serialized RPC after this migration, it already owns capacity.
  if v_existing.id is not null and v_existing.status = 'pending' then
    return query select true, v_existing.id, v_existing.status, 'already_reserved'::text;
    return;
  end if;

  select coalesce(sum(reward_months), 0)::integer
    into v_reserved_months
    from public.referral_rewards
   where recipient_user_id = p_recipient_user_id
     and status in ('pending', 'applied');

  if v_reserved_months >= p_cap_months then
    return query select false, v_existing.id, v_existing.status, 'cap_reached'::text;
    return;
  end if;

  if v_existing.id is not null then
    update public.referral_rewards
       set status = 'pending'
     where id = v_existing.id
     returning id into v_reward_id;
  else
    insert into public.referral_rewards (
      referral_id,
      recipient_user_id,
      reward_months,
      reward_type,
      status
    ) values (
      p_referral_id,
      p_recipient_user_id,
      1,
      'one_month_free',
      'pending'
    )
    returning id into v_reward_id;
  end if;

  return query select true, v_reward_id, 'pending'::text, 'reserved'::text;
end;
$$;

revoke all on function public.reserve_referral_reward(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.reserve_referral_reward(uuid, uuid, integer) to service_role;
