-- Sequence library cleanup — archive redundant legacy default templates.
--
-- Verified live (production project fwvrauqdoevwmwwqlfav, read-only query,
-- 2026-09-04): public.sequences currently carries 7 pre-existing
-- is_template=true rows, seeded out-of-band at fixed UUIDs
-- (00000001-0000-0000-0000-00000000000N) with zero tracked migration
-- history anywhere in this repo — the same production-ahead-of-migrations
-- drift pattern already documented for sequences.sequence_type/is_archived
-- and the entire contact_sequences table.
--
-- Of those 7, four substantially duplicate a canonical V1 template's
-- audience/purpose/trigger (two also assert an unverified "new inventory"
-- fact to every enrolled contact, which the canonical replacements do not):
--
--   "New Sold Customer"          (8 steps, 1-90d)  -> superseded by "Sold Customer Ownership" (0-330d)
--   "Unsold Lead Re-engagement"  (5 steps, 0-30d)  -> superseded by "Unsold Long-Term Follow-Up" (0-90d);
--                                                      also fabricates "we just got new inventory in"
--   "Lease-End Upgrade"          (4 steps, 0-45d)  -> superseded by "Lease Maturity" (0-100d, {{lease_end}}-driven)
--   "Past-Customer Win-Back"     (3 steps, 0-180d) -> superseded by "Sold Customer Ownership" long-horizon nurture;
--                                                      also fabricates "we have some great new inventory"
--
-- The other 3 legacy templates are NOT touched — verified genuinely
-- distinct, no canonical equivalent:
--   "Birthday + Anniversary"        (industry='all' — the only cross-industry
--                                    template; personal-date triggered, not
--                                    covered by any canonical template)
--   "Service & Maintenance Reminder" (service-department follow-up — no
--                                     canonical template addresses this)
--   "Trade-Up Equity Check"          (equity-driven trade prospecting for any
--                                     current owner, not lease-timing-gated)
--
-- Verified live (same read-only pass) that zero contact_sequences rows of
-- any status reference the four archived template ids — no active
-- enrollment can be broken by this change. Archiving (is_archived = true)
-- is used instead of deletion: sequences/sequence_steps rows are preserved
-- for history, and the UPDATE is scoped to is_template = true so a
-- rep-owned custom sequence sharing a similar name is never touched even
-- hypothetically. The WHERE clause's own is_archived = false makes this
-- safe to run more than once.

UPDATE public.sequences
SET is_archived = true
WHERE is_template = true
  AND is_archived = false
  AND name IN (
    'New Sold Customer',
    'Unsold Lead Re-engagement',
    'Lease-End Upgrade',
    'Past-Customer Win-Back'
  );
