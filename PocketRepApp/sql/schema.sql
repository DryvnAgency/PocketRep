-- PocketRep Schema
-- Run this in Supabase → SQL Editor → New Query

-- ── PROFILES ─────────────────────────────────────────────────────────────────
create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  full_name    text not null default '',
  plan         text not null default 'pro' check (plan in ('pro','elite')),
  trial_ends_at timestamptz,
  stripe_customer_id text,
  created_at   timestamptz default now()
);

alter table profiles enable row level security;
create policy "Users manage own profile"
  on profiles for all using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, email, trial_ends_at)
  values (
    new.id,
    new.email,
    now() + interval '7 days'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ── CONTACTS ─────────────────────────────────────────────────────────────────
create table if not exists contacts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references profiles(id) on delete cascade,
  first_name       text not null,
  last_name        text not null default '',
  phone            text not null default '',
  email            text,
  notes            text,
  last_contact_date date,
  -- Vehicle
  purchase_date    date,
  vehicle_year     int,
  vehicle_make     text,
  vehicle_model    text,
  mileage          int,
  annual_mileage   int,
  lease_end_date   date,
  -- Heat Sheet
  heat_tier        text check (heat_tier in ('hot','warm','watch')),
  heat_score       int,
  heat_reason      text,
  -- Elite: location
  lat              float,
  lng              float,
  -- Elite: rapport vault
  rapport_notes    text,
  rapport_image_url text,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

alter table contacts enable row level security;
create policy "Users manage own contacts"
  on contacts for all using (auth.uid() = user_id);

create index if not exists contacts_user_heat on contacts(user_id, heat_score desc);

-- Auto-update updated_at
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists contacts_updated_at on contacts;
create trigger contacts_updated_at
  before update on contacts
  for each row execute procedure touch_updated_at();

-- ── DEALS ─────────────────────────────────────────────────────────────────────
create table if not exists deals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  contact_id   uuid references contacts(id) on delete set null,
  title        text not null,
  amount       numeric(10,2),
  front_gross  numeric(10,2),
  back_gross   numeric(10,2),
  closed_at    date,
  notes        text,
  created_at   timestamptz default now()
);

alter table deals enable row level security;
create policy "Users manage own deals"
  on deals for all using (auth.uid() = user_id);

-- ── REX MESSAGES ──────────────────────────────────────────────────────────────
create table if not exists rex_messages (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  contact_id   uuid references contacts(id) on delete set null,
  role         text not null check (role in ('user','assistant')),
  content      text not null,
  created_at   timestamptz default now()
);

alter table rex_messages enable row level security;
create policy "Users manage own rex_messages"
  on rex_messages for all using (auth.uid() = user_id);

create index if not exists rex_messages_user_contact on rex_messages(user_id, contact_id, created_at);

-- ── REX MEMORY (Elite only) ────────────────────────────────────────────────────
create table if not exists rex_memory (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null unique references profiles(id) on delete cascade,
  summary       text not null default '',
  message_count int not null default 0,
  updated_at    timestamptz default now()
);

alter table rex_memory enable row level security;

-- ── HEY REX: follow-up date on contacts ──────────────────────────────────────
-- Run this if you already applied the initial schema:
alter table contacts add column if not exists follow_up_date date;
create policy "Users manage own rex_memory"
  on rex_memory for all using (auth.uid() = user_id);
