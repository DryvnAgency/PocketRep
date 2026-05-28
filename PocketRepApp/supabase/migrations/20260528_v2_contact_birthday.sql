-- Birthday field on contacts.
-- Surfaced as an editable field in the v2 contact card. Stored as a plain
-- date (YYYY-MM-DD). Idempotent so it can be re-applied safely.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS birthday date;
