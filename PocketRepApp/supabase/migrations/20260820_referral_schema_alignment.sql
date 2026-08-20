-- PocketRep referral schema alignment.
-- The referral webhook writes these fields/statuses; keep the database contract
-- explicit and idempotent so checkout/payment events cannot fail on schema drift.

alter table public.referrals
  add column if not exists paid_at timestamptz,
  add column if not exists stripe_checkout_session_id text;

create unique index if not exists referrals_checkout_session_unique
  on public.referrals(stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

-- checkout.session.completed records the paid state before the first invoice
-- event. Preserve the original terminal states while allowing that transition.
alter table public.referrals drop constraint if exists referrals_status_check;
alter table public.referrals
  add constraint referrals_status_check
  check (status in ('pending','verified','paid','qualified','rewarded','ineligible','canceled'));

alter table public.referral_rewards
  add column if not exists reward_months integer not null default 1,
  add column if not exists issued_at timestamptz;

alter table public.referral_rewards
  add constraint referral_rewards_reward_months_positive
  check (reward_months > 0);

create index if not exists referrals_paid_at_idx
  on public.referrals(paid_at desc)
  where paid_at is not null;

-- Service-role webhook access is intentionally controlled by RLS: there are
-- no broad authenticated write policies on referral ledgers.
