-- Add entitlement grace-period columns to profiles.
-- The access gate (accessGate.ts) already reads these; this migration creates the
-- backing columns so the checkout-account edge function can set a 30-minute pending
-- window when subscription status is momentarily uncertain.

begin;

alter table public.profiles
  add column if not exists entitlement_status text,
  add column if not exists entitlement_pending_until timestamptz;

comment on column public.profiles.entitlement_status is
  'pending | active | locked — set by checkout-account for grace period, cleared by webhook on successful payment';
comment on column public.profiles.entitlement_pending_until is
  'When entitlement_status = pending, access is allowed until this timestamp, then locked';

commit;
