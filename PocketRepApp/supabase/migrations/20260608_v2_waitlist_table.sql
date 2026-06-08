-- 20260608_v2_waitlist_table.sql
--
-- PocketRep Team waitlist: capture table for the marketing-site (pocketrep.pro)
-- "Join the waitlist" form. Anon/publishable role may INSERT only.
--
-- Applied via MCP. Idempotent.

create table if not exists public.waitlist (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text,
  phone       text,
  dealership  text,
  seats       integer,
  email       text,
  source      text
);

comment on table public.waitlist is 'PocketRep Team waitlist signups from the marketing site. Anon/publishable role may INSERT only (no select/update/delete).';

alter table public.waitlist enable row level security;

-- Insert-only for the anon/publishable role. No select/update/delete policy =>
-- denied by default under RLS, so the public key can add rows but never read them.
drop policy if exists "waitlist_anon_insert" on public.waitlist;
create policy "waitlist_anon_insert"
  on public.waitlist
  for insert
  to anon
  with check (true);
