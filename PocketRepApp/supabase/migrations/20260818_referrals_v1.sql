-- PocketRep V1: Give a Month, Get a Month
-- Server-side referral attribution + immutable reward ledger.

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referral_code text not null,
  referrer_user_id uuid not null references auth.users(id) on delete cascade,
  referred_user_id uuid references auth.users(id) on delete set null,
  referred_email text,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text not null default 'pending' check (status in ('pending','verified','qualified','rewarded','ineligible','canceled')),
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  qualified_at timestamptz,
  rewarded_at timestamptz,
  constraint referrals_code_referrer_unique unique (referral_code, referrer_user_id)
);

create unique index if not exists referrals_referred_email_unique
  on public.referrals (lower(referred_email)) where referred_email is not null;
create unique index if not exists referrals_referred_user_unique
  on public.referrals (referred_user_id) where referred_user_id is not null;
create unique index if not exists referrals_stripe_customer_unique
  on public.referrals (stripe_customer_id) where stripe_customer_id is not null;
create unique index if not exists referrals_stripe_subscription_unique
  on public.referrals (stripe_subscription_id) where stripe_subscription_id is not null;

create table if not exists public.referral_rewards (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.referrals(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  reward_type text not null default 'one_month_free',
  stripe_credit_id text,
  status text not null default 'pending' check (status in ('pending','applied','failed')),
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

create unique index if not exists referral_rewards_once_per_recipient
  on public.referral_rewards (referral_id, recipient_user_id, reward_type);

alter table public.referrals enable row level security;
alter table public.referral_rewards enable row level security;

drop policy if exists referrals_self_read on public.referrals;
create policy referrals_self_read on public.referrals for select using (referrer_user_id = auth.uid() or referred_user_id = auth.uid());

drop policy if exists referral_rewards_self_read on public.referral_rewards;
create policy referral_rewards_self_read on public.referral_rewards for select using (recipient_user_id = auth.uid());

-- Deterministic referral code. Existing users receive a stable code based on user id.
create or replace function public.my_referral_code()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select 'PR-' || upper(substr(replace(auth.uid()::text, '-', ''), 1, 10));
$$;

grant execute on function public.my_referral_code() to authenticated;
