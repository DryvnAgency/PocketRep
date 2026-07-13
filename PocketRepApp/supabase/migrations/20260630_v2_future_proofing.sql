-- Future-proofing columns from the 2026-06 product spec ("free today, miserable
-- to retrofit into live RLS later"). COMMITTED — NOT APPLIED: the owner applies
-- this manually when ready; nothing in the app reads these columns yet, so the
-- app is fully functional with or without it.
--
--   profiles.role                 rep-vs-manager discriminator for OpenRex later
--   contacts.store_id             dealership/store join key for OpenRex later
--   contacts.payment_target_low   numeric monthly-payment target (low bound)
--   contacts.payment_target_high  numeric monthly-payment target (high bound)
--                                 (contacts.budget stays the free-text field)
--
-- Additive + idempotent: safe to run more than once, no data touched, no RLS
-- policy changes (owner-scoped policies already cover the new columns).

alter table public.profiles
  add column if not exists role text not null default 'rep';

alter table public.contacts
  add column if not exists store_id uuid,
  add column if not exists payment_target_low numeric,
  add column if not exists payment_target_high numeric;

comment on column public.profiles.role is
  'Rep-vs-manager discriminator (default ''rep''). Unused at launch; join key for team features.';
comment on column public.contacts.store_id is
  'Dealership/store the contact belongs to. Nullable, unused at launch; multi-store join key.';
comment on column public.contacts.payment_target_low is
  'Customer monthly-payment target, low bound (numeric). Free-text contacts.budget remains.';
comment on column public.contacts.payment_target_high is
  'Customer monthly-payment target, high bound (numeric).';
