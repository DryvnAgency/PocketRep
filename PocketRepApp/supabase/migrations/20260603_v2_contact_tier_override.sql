-- 20260603_v2_contact_tier_override.sql
--
-- Manual heat-tier override for the v2 contact card. When set, the app uses this
-- value instead of the heat_score-derived tier (hot / warm / cold). Null = auto.
--
-- Already applied to prod (2026-06-03) via MCP apply_migration — additive and
-- nullable, so it's safe to re-run (add column if not exists).

alter table public.contacts
  add column if not exists tier_override text
  check (tier_override is null or tier_override in ('hot','warm','cold'));

comment on column public.contacts.tier_override is
  'Rep-set heat tier that overrides the heat_score-derived tier in the v2 UI. Null = auto.';
