-- 20260609_v2_nurture_kind.sql
--
-- Referral Asks (ITEM 2). Adds a `kind` discriminator to nurture_messages so a
-- queued draft can be tagged by what produced it. Existing nurtures leave it
-- null; the post-sale referral ask sets kind='referral_ask'.
--
-- We deliberately do NOT reuse trigger_type for this: trigger_type already
-- carries the nurture trigger ('holiday' | 'quarterly_check_in' | 'custom') and
-- is NOT NULL, whereas kind is an orthogonal, nullable sub-type. (referral_ask
-- rows set BOTH: trigger_type='referral_ask' to satisfy NOT NULL, kind for the
-- canonical filter.)
--
-- Additive + nullable + idempotent — safe to (re-)run.

alter table public.nurture_messages
  add column if not exists kind text;

comment on column public.nurture_messages.kind is
  'Optional sub-type of the queued draft (e.g. ''referral_ask''). Null for generic nurtures.';
