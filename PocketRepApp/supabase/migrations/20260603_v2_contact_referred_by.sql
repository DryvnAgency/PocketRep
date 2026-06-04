-- 20260603_v2_contact_referred_by.sql
--
-- "Referred by" on contacts. Two parts:
--   • referred_by_contact_id — FK to the referring contact, so the referrer and
--     the referred contact are linked both ways (reverse lookup gives a contact's
--     referrals). ON DELETE SET NULL so deleting the referrer doesn't cascade.
--   • referred_by_name — free-text fallback for when the referrer isn't in the
--     book (the rep just types a name). Also kept as a denormalized display label.
--
-- Additive + nullable + idempotent, so it's safe to (re-)run.

alter table public.contacts
  add column if not exists referred_by_contact_id uuid
  references public.contacts(id) on delete set null;

alter table public.contacts
  add column if not exists referred_by_name text;

-- Reverse lookup: "who did this contact refer?" filters on referred_by_contact_id.
create index if not exists contacts_referred_by_contact_id_idx
  on public.contacts (referred_by_contact_id);

comment on column public.contacts.referred_by_contact_id is
  'FK to the contact who referred this one (referrer <-> referred link). Null if unknown or referrer not in the book.';
comment on column public.contacts.referred_by_name is
  'Free-text name of who referred this contact; used when the referrer is not a saved contact, and as a display label.';
