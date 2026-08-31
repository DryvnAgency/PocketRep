-- Internal support chat: reps can message PocketRep admin for billing,
-- login, or app issues. Admin (profiles.role = 'admin') sees all tickets.
-- Pushover notification fires via the support-notify edge function.

-- Safety net: ensure profiles.role exists (idempotent). The canonical source
-- is 20260630_v2_future_proofing.sql but it may not have been applied yet.
alter table public.profiles
  add column if not exists role text not null default 'rep';

-- ── Tables ───────────────────────────────────────────────────────────────────

create table if not exists public.support_tickets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  subject     text not null,
  status      text not null default 'open' check (status in ('open','resolved')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.support_messages (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.support_tickets(id) on delete cascade,
  sender_role text not null check (sender_role in ('rep','admin','system')),
  content     text not null,
  created_at  timestamptz not null default now()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

create index if not exists support_tickets_user_status_idx
  on public.support_tickets (user_id, status, updated_at desc);

create index if not exists support_messages_ticket_idx
  on public.support_messages (ticket_id, created_at asc);

-- ── updated_at trigger ───────────────────────────────────────────────────────

create or replace function public.touch_support_ticket_updated()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.support_tickets
    set updated_at = now()
    where id = new.ticket_id;
  return new;
end;
$$;

revoke execute on function public.touch_support_ticket_updated() from public, anon, authenticated;

drop trigger if exists support_messages_touch_ticket on public.support_messages;
create trigger support_messages_touch_ticket
  after insert on public.support_messages
  for each row
  execute function public.touch_support_ticket_updated();

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;

-- Rep policies: own tickets only
drop policy if exists support_tickets_select_own on public.support_tickets;
create policy support_tickets_select_own on public.support_tickets
  for select using ((select auth.uid()) = user_id);

drop policy if exists support_tickets_insert_own on public.support_tickets;
create policy support_tickets_insert_own on public.support_tickets
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists support_tickets_update_own on public.support_tickets;
create policy support_tickets_update_own on public.support_tickets
  for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Admin policies: see + update all tickets
drop policy if exists support_tickets_select_admin on public.support_tickets;
create policy support_tickets_select_admin on public.support_tickets
  for select using (
    exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin')
  );

drop policy if exists support_tickets_update_admin on public.support_tickets;
create policy support_tickets_update_admin on public.support_tickets
  for update using (
    exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin')
  );

-- Rep message policies: own tickets only (via join)
drop policy if exists support_messages_select_own on public.support_messages;
create policy support_messages_select_own on public.support_messages
  for select using (
    exists (select 1 from public.support_tickets where id = ticket_id and user_id = (select auth.uid()))
  );

drop policy if exists support_messages_insert_own on public.support_messages;
create policy support_messages_insert_own on public.support_messages
  for insert with check (
    sender_role = 'rep' and
    exists (select 1 from public.support_tickets where id = ticket_id and user_id = (select auth.uid()))
  );

-- Admin message policies: see + send on all tickets
drop policy if exists support_messages_select_admin on public.support_messages;
create policy support_messages_select_admin on public.support_messages
  for select using (
    exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin')
  );

drop policy if exists support_messages_insert_admin on public.support_messages;
create policy support_messages_insert_admin on public.support_messages
  for insert with check (
    sender_role = 'admin' and
    exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin')
  );

-- Admin can read all profiles (needed for ticket list join to show rep names)
drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin on public.profiles
  for select using (
    exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
  );
