-- P2 demo feature: "New contact -> Rex recap draft -> rep-sent follow-up sequence".
--
-- NOTE: NOT yet applied to the live project. The feature ships behind the
-- EXPO_PUBLIC_REX_FOLLOWUP flag (default off) AND is inert until this migration is
-- applied, so committing it ahead of apply is safe (mirrors the P2-A7 pattern:
-- ship code, owner activates). Additive + idempotent; no existing object is changed.
--
-- One row per contact tracks a 14-day, rep-sent follow-up campaign. The recap and
-- each day's message are Rex-AI drafts the rep reviews and sends from their own
-- messaging app — nothing here sends anything; this is state only.

create table if not exists public.rex_followups (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  contact_id    uuid not null references public.contacts(id) on delete cascade,
  status        text not null default 'draft'
                  check (status in ('draft','active','paused','stopped','completed')),
  total_days    int  not null default 14,
  current_day   int  not null default 0,          -- 0 = recap not yet sent; 1..total_days once active
  recap_draft   text,
  recap_sent_at timestamptz,
  -- per-day drafts + send log, e.g. [{ "day":1, "draft":"...", "sent_at":null, "skipped":false }]
  days          jsonb not null default '[]'::jsonb,
  started_at    timestamptz,                        -- when the recap was sent (day 0 -> day 1)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (contact_id)
);

create index if not exists idx_rex_followups_user on public.rex_followups(user_id, updated_at desc);

-- Owner-scoped RLS (same shape as rex_action_log / user_push_tokens). No grants are
-- altered; only the owning authenticated user can read/write their own rows, and
-- service_role bypasses RLS as usual.
alter table public.rex_followups enable row level security;
drop policy if exists "Users manage own followups" on public.rex_followups;
create policy "Users manage own followups" on public.rex_followups
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
