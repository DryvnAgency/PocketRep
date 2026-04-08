-- PocketRep Schema
-- Run this in Supabase → SQL Editor → New Query

-- ── PROFILES ─────────────────────────────────────────────────────────────────
create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  full_name    text not null default '',
  plan         text not null default 'pro' check (plan in ('pro','elite','pro_bundle','rex_lens_standalone','elite_bundle')),
  industry     text not null default 'auto',
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
declare
  _plan text;
begin
  _plan := coalesce(new.raw_user_meta_data->>'plan', 'pro');
  -- Validate plan value
  if _plan not in ('pro', 'elite', 'pro_bundle', 'rex_lens_standalone', 'elite_bundle') then
    _plan := 'pro';
  end if;

  insert into profiles (id, email, plan, trial_ends_at)
  values (
    new.id,
    new.email,
    _plan,
    case when _plan in ('pro_bundle', 'rex_lens_standalone', 'elite_bundle') then null
         else now() + interval '7 days'
    end
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

-- ── INDUSTRY: rep's industry on profiles ─────────────────────────────────────
alter table profiles add column if not exists industry text not null default 'auto';

-- ── HEY REX: follow-up date on contacts ──────────────────────────────────────
-- Run this if you already applied the initial schema:
alter table contacts add column if not exists follow_up_date date;
alter table contacts add column if not exists personal_events jsonb default '[]'::jsonb;
alter table contacts add column if not exists buying_urgency text check (buying_urgency in ('low','medium','high'));
create policy "Users manage own rex_memory"
  on rex_memory for all using (auth.uid() = user_id);

-- ── STAGE: contact pipeline stage ─────────────────────────────────────────────
alter table contacts add column if not exists stage text check (stage in ('prospect','active','sold','dormant','lost')) default 'prospect';

-- ── SEQUENCES ─────────────────────────────────────────────────────────────────
create table if not exists sequences (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references profiles(id) on delete cascade,
  contact_id       uuid references contacts(id) on delete set null,
  name             text not null,
  description      text,
  industry         text not null default 'auto',
  is_template      boolean not null default false,
  is_custom        boolean not null default false,
  is_ai_generated  boolean not null default false,
  created_at       timestamptz default now()
);

alter table sequences enable row level security;
drop policy if exists "Users manage own sequences" on sequences;
create policy "Users manage own sequences"
  on sequences for all using (auth.uid() = user_id or user_id is null);

create table if not exists sequence_steps (
  id               uuid primary key default gen_random_uuid(),
  sequence_id      uuid not null references sequences(id) on delete cascade,
  step_number      int not null,
  delay_days       int not null default 0,
  channel          text not null check (channel in ('text','call','email')),
  message_template text not null default '',
  ai_personalize   boolean not null default false
);

alter table sequence_steps enable row level security;
drop policy if exists "Users manage own sequence_steps" on sequence_steps;
create policy "Users manage own sequence_steps"
  on sequence_steps for all using (
    auth.uid() = (select user_id from sequences where id = sequence_id) or
    (select user_id from sequences where id = sequence_id) is null
  );

-- ── SEQUENCE STEP SENT TRACKING ───────────────────────────────────────────────
alter table sequence_steps add column if not exists sent_at timestamptz;

-- ── CONTACT INTERACTIONS (done log) ──────────────────────────────────────────
create table if not exists contact_interactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  contact_id   uuid references contacts(id) on delete set null,
  contact_name text,
  sequence_id  uuid references sequences(id) on delete set null,
  step_number  int,
  channel      text check (channel in ('text','call','email')),
  message      text,
  sent_at      timestamptz default now()
);

alter table contact_interactions enable row level security;
drop policy if exists "Users manage own interactions" on contact_interactions;
create policy "Users manage own interactions"
  on contact_interactions for all using (auth.uid() = user_id);

create index if not exists interactions_user_date
  on contact_interactions(user_id, sent_at desc);

-- ── DAILY AI USAGE (Rex Lens cost tracking) ──────────────────────────────────
create table if not exists daily_ai_usage (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  usage_date    date not null default current_date,
  input_tokens  int not null default 0,
  output_tokens int not null default 0,
  cost_cents    numeric(8,2) not null default 0,
  request_count int not null default 0,
  updated_at    timestamptz default now(),
  unique(user_id, usage_date)
);

alter table daily_ai_usage enable row level security;
create policy "Users read own usage"
  on daily_ai_usage for select using (auth.uid() = user_id);

-- Atomic increment function (called by ai-proxy edge function)
create or replace function increment_daily_usage(
  p_user_id uuid,
  p_date date,
  p_input_tokens int,
  p_output_tokens int,
  p_cost_cents numeric
)
returns void language plpgsql security definer as $$
begin
  insert into daily_ai_usage (user_id, usage_date, input_tokens, output_tokens, cost_cents, request_count)
  values (p_user_id, p_date, p_input_tokens, p_output_tokens, p_cost_cents, 1)
  on conflict (user_id, usage_date) do update set
    input_tokens  = daily_ai_usage.input_tokens + excluded.input_tokens,
    output_tokens = daily_ai_usage.output_tokens + excluded.output_tokens,
    cost_cents    = daily_ai_usage.cost_cents + excluded.cost_cents,
    request_count = daily_ai_usage.request_count + 1,
    updated_at    = now();
end;
$$;
