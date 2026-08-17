-- 20260816_stripe_checkout_provisions.sql
-- Idempotency + anti-reuse ledger for the paid-signup Thank You flow.
-- The `checkout-account` Edge Function (service role) records each Stripe Checkout
-- Session it has provisioned an account for, keyed by session_id, so refreshing
-- the Thank You page (or replaying a session) never creates a duplicate user,
-- profile, Stripe link, or demo contacts. One session => one account.
--
-- Service-role only: RLS is enabled with NO policies, so anon/authenticated
-- clients can neither read nor write it (the service role bypasses RLS). This
-- table never holds a secret, but the browser has no business touching it.

begin;

create table if not exists public.stripe_checkout_provisions (
  session_id          text primary key,
  user_id             uuid references auth.users(id) on delete set null,
  email               text,
  stripe_customer_id  text,
  created_at          timestamptz not null default now()
);

alter table public.stripe_checkout_provisions enable row level security;

-- Belt-and-suspenders alongside the no-policy RLS: strip any table privileges
-- from the browser-facing roles.
revoke all on public.stripe_checkout_provisions from anon, authenticated;

commit;
