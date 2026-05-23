-- v2 schema extensions for the design-mockup port (PR #27 in PORT_PLAN.md).
-- Purely additive: no column drops, no constraint changes, no data loss.
-- Applied via Supabase MCP apply_migration; mirrored here for git history.

-- ────────────────────────────────────────────────────────────────────────────
-- 1) contacts: columns the v2 UI mock reads/writes that don't already exist.
--    heat_tier intentionally NOT changed; v2 computes tier from heat_score
--    so we don't have to alter the existing ('red','orange','blue') check
--    constraint (which would be destructive — the user said "STOP if
--    destructive needed", so we route around it).
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS vehicle    text,
  ADD COLUMN IF NOT EXISTS trim       text,
  ADD COLUMN IF NOT EXISTS budget     text,
  ADD COLUMN IF NOT EXISTS trade_in   text,
  ADD COLUMN IF NOT EXISTS milestones jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS next_step  text,
  ADD COLUMN IF NOT EXISTS plan_label text,
  ADD COLUMN IF NOT EXISTS photo_url  text;

-- ────────────────────────────────────────────────────────────────────────────
-- 2) tags table — the universe of custom tags per rep (mock's STARTER_TAGS).
--    Follows the newer (profiles) FK pattern used by deals / rex_messages.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tags (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name       text NOT NULL,
  color      text NOT NULL DEFAULT '#d4a843',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tags_user_owns_select" ON public.tags;
DROP POLICY IF EXISTS "tags_user_owns_insert" ON public.tags;
DROP POLICY IF EXISTS "tags_user_owns_update" ON public.tags;
DROP POLICY IF EXISTS "tags_user_owns_delete" ON public.tags;

CREATE POLICY "tags_user_owns_select" ON public.tags FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "tags_user_owns_insert" ON public.tags FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tags_user_owns_update" ON public.tags FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tags_user_owns_delete" ON public.tags FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS tags_user_id_idx ON public.tags(user_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 3) pay_plans table — one row per user. Mock's DEFAULT_PAY_PLAN shape.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pay_plans (
  user_id           uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  front_pct         numeric NOT NULL DEFAULT 25,
  back_pct          numeric NOT NULL DEFAULT 5,
  flat_mini         numeric NOT NULL DEFAULT 200,
  base_salary       numeric NOT NULL DEFAULT 2000,
  spiff_per_unit    numeric NOT NULL DEFAULT 250,
  unit_bonus        numeric NOT NULL DEFAULT 400,
  unit_bonus_tiers  jsonb   NOT NULL DEFAULT '[{"units":10,"bonus":500},{"units":15,"bonus":1000},{"units":20,"bonus":1500}]'::jsonb,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pay_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pay_plans_user_owns_select" ON public.pay_plans;
DROP POLICY IF EXISTS "pay_plans_user_owns_insert" ON public.pay_plans;
DROP POLICY IF EXISTS "pay_plans_user_owns_update" ON public.pay_plans;
DROP POLICY IF EXISTS "pay_plans_user_owns_delete" ON public.pay_plans;

CREATE POLICY "pay_plans_user_owns_select" ON public.pay_plans FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "pay_plans_user_owns_insert" ON public.pay_plans FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "pay_plans_user_owns_update" ON public.pay_plans FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "pay_plans_user_owns_delete" ON public.pay_plans FOR DELETE USING (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 4) deals: columns the v2 deal-logger writes. `type` would shadow internal
--    aliases in PostgREST, so we use deal_type instead.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS stock      text,
  ADD COLUMN IF NOT EXISTS vehicle    text,
  ADD COLUMN IF NOT EXISTS deal_type  text CHECK (deal_type IS NULL OR deal_type = ANY (ARRAY['NEW','CPO','USED'])),
  ADD COLUMN IF NOT EXISTS funding    text CHECK (funding   IS NULL OR funding   = ANY (ARRAY['finance','lease','cash'])),
  ADD COLUMN IF NOT EXISTS split      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS split_with text;
