-- PocketRep V1 canonical billing/referral/AI ledger hardening.
create table if not exists public.monthly_ai_usage (
  user_id uuid not null references public.profiles(id) on delete cascade,
  usage_month date not null,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cost_cents numeric not null default 0,
  request_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_month)
);
create index if not exists monthly_ai_usage_month_idx on public.monthly_ai_usage(user_id, usage_month);
alter table public.monthly_ai_usage enable row level security;
drop policy if exists monthly_ai_usage_select_own on public.monthly_ai_usage;
create policy monthly_ai_usage_select_own on public.monthly_ai_usage for select using (auth.uid()=user_id);
drop policy if exists monthly_ai_usage_service_role on public.monthly_ai_usage;
create policy monthly_ai_usage_service_role on public.monthly_ai_usage for all using (auth.role()='service_role') with check (auth.role()='service_role');
create or replace function public.increment_monthly_ai_usage(p_user_id uuid,p_month date,p_input_tokens bigint,p_output_tokens bigint,p_cost_cents numeric)
returns public.monthly_ai_usage language plpgsql security definer set search_path=public as $$
declare r public.monthly_ai_usage;
begin
 insert into public.monthly_ai_usage(user_id,usage_month,input_tokens,output_tokens,cost_cents,request_count,updated_at)
 values(p_user_id,date_trunc('month',p_month)::date,coalesce(p_input_tokens,0),coalesce(p_output_tokens,0),coalesce(p_cost_cents,0),1,now())
 on conflict(user_id,usage_month) do update set input_tokens=monthly_ai_usage.input_tokens+excluded.input_tokens,output_tokens=monthly_ai_usage.output_tokens+excluded.output_tokens,cost_cents=monthly_ai_usage.cost_cents+excluded.cost_cents,request_count=monthly_ai_usage.request_count+1,updated_at=now()
 returning * into r;
 return r;
end; $$;
revoke all on function public.increment_monthly_ai_usage(uuid,date,bigint,bigint,numeric) from public,anon,authenticated;
grant execute on function public.increment_monthly_ai_usage(uuid,date,bigint,bigint,numeric) to service_role;
alter table public.referrals add column if not exists stripe_subscription_id text;
alter table public.referrals add column if not exists verified_at timestamptz;
alter table public.referrals add column if not exists qualified_at timestamptz;
alter table public.referrals add column if not exists rewarded_at timestamptz;
alter table public.referral_rewards add column if not exists reward_type text not null default 'one_month_free';
alter table public.referral_rewards add column if not exists stripe_credit_id text;
alter table public.referral_rewards add column if not exists applied_at timestamptz;
create unique index if not exists referrals_referred_email_unique on public.referrals(lower(trim(referred_email))) where referred_email is not null and trim(referred_email)<>'';
create unique index if not exists referral_rewards_one_type on public.referral_rewards(referral_id,recipient_user_id,reward_type);
create index if not exists referrals_subscription_idx on public.referrals(stripe_subscription_id) where stripe_subscription_id is not null;
create index if not exists referrals_paid_at_idx on public.referrals(paid_at desc) where paid_at is not null;
create index if not exists referral_rewards_status_idx on public.referral_rewards(status,created_at desc);
