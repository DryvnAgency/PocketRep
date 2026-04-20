-- Open Rex Supabase schema. Run in SQL editor of a NEW Supabase project
-- (do not reuse the Rex Lens / PocketRep project). Everything lives in public.

create extension if not exists pgcrypto;

create table if not exists dealers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  crm_platform text,
  created_at timestamptz not null default now()
);

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  dealer_id text not null,
  platform text not null,
  external_id text not null,
  first_name text not null default '',
  last_name text not null default '',
  phone text,
  email text,
  vehicle text,
  last_contacted_at text,
  status text,
  source text,
  raw_context text,
  scraped_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (dealer_id, external_id)
);

create index if not exists customers_phone_idx on customers(phone);
create index if not exists customers_last_contact_idx on customers(last_contacted_at);

create table if not exists drafts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  body text not null,
  status text not null default 'pending' check (status in ('pending','approved','sent','rejected','failed')),
  is_appointment_signal boolean not null default false,
  generated_at timestamptz not null default now(),
  approved_at timestamptz,
  sent_at timestamptz,
  twilio_sid text
);

create index if not exists drafts_status_idx on drafts(status);
create index if not exists drafts_customer_idx on drafts(customer_id);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  direction text not null check (direction in ('outbound','inbound')),
  body text not null,
  twilio_sid text,
  created_at timestamptz not null default now()
);

create index if not exists messages_customer_idx on messages(customer_id);
create index if not exists messages_created_idx on messages(created_at);

create table if not exists appointment_signals (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  triggered_by_message_id uuid references messages(id),
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz
);

alter table dealers enable row level security;
alter table customers enable row level security;
alter table drafts enable row level security;
alter table messages enable row level security;
alter table appointment_signals enable row level security;

-- Service role bypasses RLS. Dashboard auth uses DASHBOARD_AUTH_SECRET bearer
-- today; swap to Supabase Auth + proper policies post-MVP.

-- ─── Migration: rich profile fields + draft angle (run once on existing DB) ───
alter table customers add column if not exists notes text;
alter table customers add column if not exists interaction_history text;
alter table customers add column if not exists trade_in_vehicle text;
alter table customers add column if not exists purchased_vehicle text;
alter table customers add column if not exists purchase_date text;
alter table customers add column if not exists last_contact_date text;

alter table drafts add column if not exists angle text;
