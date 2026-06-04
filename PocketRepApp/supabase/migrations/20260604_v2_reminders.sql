-- 20260604_v2_reminders.sql
--
-- Rex-created reminders (NEW 3). The rep says "remind me to call Lalo at 4 about
-- Pathfinders"; Rex parses the time to a concrete due_at and (after confirm)
-- writes a row here. Reminders surface in the Heat Sheet notifications bell and
-- carry over to the next day if not marked done (handled client-side on load).
--
-- Owner-scoped via RLS (same pattern as interactions/nurture_messages).
-- NOT auto-applied — apply via MCP / `supabase db push` after review.

create table if not exists public.reminders (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  contact_id  uuid references public.contacts(id) on delete set null,
  title       text not null,
  body        text,
  due_at      timestamptz not null,
  status      text not null default 'pending' check (status in ('pending','done')),
  rolled_count integer not null default 0,
  source      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.reminders enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='reminders' and policyname='reminders_select_own') then
    create policy reminders_select_own on public.reminders for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='reminders' and policyname='reminders_insert_own') then
    create policy reminders_insert_own on public.reminders for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='reminders' and policyname='reminders_update_own') then
    create policy reminders_update_own on public.reminders for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='reminders' and policyname='reminders_delete_own') then
    create policy reminders_delete_own on public.reminders for delete using (auth.uid() = user_id);
  end if;
end $$;

create index if not exists reminders_user_status_due_idx
  on public.reminders (user_id, status, due_at);

comment on table public.reminders is
  'Rex-created reminders. Surface in the notifications bell; carry over to next day if not marked done.';
