-- 0002_waitlist.sql
-- Public waitlist table for marketing landing page signups.
-- Anonymous inserts allowed (server-side rate limit recommended).
-- Reads/updates/deletes restricted to service role.

create extension if not exists "citext";

create table if not exists public.waitlist (
  id           uuid primary key default gen_random_uuid(),
  email        citext not null,
  dealership   text,
  source       text not null default 'landing',
  user_agent   text,
  referrer     text,
  ip_hash      text,
  created_at   timestamptz not null default now(),
  unique (email)
);
create index if not exists waitlist_created_idx on public.waitlist(created_at desc);

alter table public.waitlist enable row level security;

drop policy if exists waitlist_insert_public on public.waitlist;
create policy waitlist_insert_public on public.waitlist for insert
  to anon, authenticated
  with check (
    char_length(email) between 3 and 320
    and email like '%@%.%'
  );
