-- Admin is an operational role, not a customer subscription.
-- Keep rep/customer entitlement states unchanged while allowing the admin profile
-- to be labeled explicitly as admin after the client role bypass is deployed.
alter table public.profiles drop constraint if exists profiles_entitlement_status_check;
alter table public.profiles add constraint profiles_entitlement_status_check
  check (entitlement_status = any (array[
    'pending'::text,
    'trialing'::text,
    'active'::text,
    'past_due'::text,
    'canceled'::text,
    'locked'::text,
    'admin'::text
  ]));
