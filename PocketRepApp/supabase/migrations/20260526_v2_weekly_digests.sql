-- Weekly digest table. One row per rep per ISO week with the rolled-up
-- stats + Rex's narrative. Generated client-side on demand for now (see
-- lib/v2/weeklyDigest.ts); a future Edge Function will populate it on
-- Monday mornings via cron.

CREATE TABLE IF NOT EXISTS public.weekly_digests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  units numeric not null default 0,
  commission numeric not null default 0,
  gross numeric not null default 0,
  contacts_added int not null default 0,
  contacts_touched int not null default 0,
  summary text not null default '',
  highlights text not null default '',
  generated_at timestamptz not null default now(),
  unique (user_id, week_start)
);

ALTER TABLE public.weekly_digests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "weekly_digests own rows" ON public.weekly_digests;
CREATE POLICY "weekly_digests own rows" ON public.weekly_digests
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
