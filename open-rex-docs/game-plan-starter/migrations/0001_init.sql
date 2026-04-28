-- 0001_init.sql
-- OpenRex Game Plan campaign engine — initial schema.
-- Drop into the new repo at supabase/migrations/<ts>_init.sql when
-- Section 9 (repo scaffold) lands. Idempotent: re-runnable in dev.

begin;

-- =========================================================================
-- Extensions
-- =========================================================================
create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- =========================================================================
-- Enums
-- =========================================================================
do $$ begin
  create type membership_role as enum ('owner', 'manager', 'salesperson');
exception when duplicate_object then null; end $$;

do $$ begin
  create type consent_status as enum ('unknown', 'granted', 'revoked');
exception when duplicate_object then null; end $$;

do $$ begin
  create type send_mode as enum ('all_at_once', 'batch_15min', 'drip');
exception when duplicate_object then null; end $$;

do $$ begin
  create type campaign_run_status as enum (
    'pending', 'generating', 'ready', 'running', 'paused', 'completed', 'failed'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type campaign_contact_status as enum (
    'pending_draft', 'queued', 'sent_mock', 'sent', 'replied',
    'opted_out', 'failed', 'skipped_consent', 'skipped_quiet_hours',
    'skipped_dedup'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type message_direction as enum ('outbound', 'inbound');
exception when duplicate_object then null; end $$;

do $$ begin
  create type message_status as enum (
    'queued', 'sent_mock', 'sent', 'delivered', 'failed', 'received'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type message_sender as enum ('rex', 'manager', 'salesperson', 'customer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type approval_state as enum ('not_required', 'queued', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type autonomy_classification as enum ('simple_yesno', 'timing', 'substantive');
exception when duplicate_object then null; end $$;

do $$ begin
  create type conversation_temperature as enum ('cold', 'warm', 'hot');
exception when duplicate_object then null; end $$;

do $$ begin
  create type consent_event_kind as enum (
    'manager_attestation', 'inbound_stop', 'inbound_help', 'inbound_start',
    'manual_grant', 'manual_revoke'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type parser_event_kind as enum ('hit', 'miss', 'partial');
exception when duplicate_object then null; end $$;

-- =========================================================================
-- Helper: tenant_id from JWT
-- App writes tenant_id into the JWT custom claim on sign-in. RLS reads it.
-- =========================================================================
create or replace function public.current_tenant_id()
returns uuid
language sql stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id',
      ''
    ), ''
  )::uuid
$$;

create or replace function public.has_tenant_role(_tenant_id uuid, _roles membership_role[])
returns boolean
language sql stable
as $$
  select exists (
    select 1 from public.memberships
    where tenant_id = _tenant_id
      and user_id   = auth.uid()
      and role      = any(_roles)
  )
$$;

-- =========================================================================
-- Tables
-- =========================================================================

-- tenants ---------------------------------------------------------------
create table if not exists public.tenants (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  brand_voice  text,
  timezone     text not null default 'America/Los_Angeles',
  twilio_messaging_service_sid text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- memberships -----------------------------------------------------------
create table if not exists public.memberships (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  user_id    uuid not null references auth.users(id)     on delete cascade,
  role       membership_role not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);
create index if not exists memberships_user_idx on public.memberships(user_id);

-- contacts --------------------------------------------------------------
create table if not exists public.contacts (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants(id) on delete cascade,
  phone                text,                          -- E.164
  email                citext,
  first_name           text,
  last_name            text,
  vehicle_owned        text,
  vehicle_owned_since  date,
  last_sale_date       date,
  consent_status       consent_status not null default 'unknown',
  consent_updated_at   timestamptz,
  source               text,                          -- 'extension' | 'csv' | 'manual'
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create unique index if not exists contacts_tenant_phone_uq
  on public.contacts(tenant_id, phone) where phone is not null;
create index if not exists contacts_tenant_idx on public.contacts(tenant_id);

-- game_plans ------------------------------------------------------------
create table if not exists public.game_plans (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  name           text not null,
  target_filter  jsonb not null default '{}'::jsonb,   -- VinSolutions search criteria
  offer_copy     text not null,
  send_mode      send_mode not null default 'batch_15min',
  cadence        jsonb not null default '[]'::jsonb,   -- [{offset_hours, kind}]
  handoff_rule   text not null default 'queue_to_manager',
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  archived_at    timestamptz
);
create index if not exists game_plans_tenant_idx on public.game_plans(tenant_id);

-- campaign_runs ---------------------------------------------------------
create table if not exists public.campaign_runs (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id)    on delete cascade,
  game_plan_id  uuid not null references public.game_plans(id) on delete cascade,
  status        campaign_run_status not null default 'pending',
  pool_size     integer not null default 0,
  consent_attestation_by uuid references auth.users(id),
  consent_attestation_at timestamptz,
  started_at    timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists campaign_runs_plan_idx on public.campaign_runs(game_plan_id);

-- campaign_contacts -----------------------------------------------------
create table if not exists public.campaign_contacts (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id)        on delete cascade,
  campaign_run_id   uuid not null references public.campaign_runs(id)  on delete cascade,
  contact_id        uuid not null references public.contacts(id)       on delete cascade,
  status            campaign_contact_status not null default 'pending_draft',
  scheduled_at      timestamptz,
  sent_at           timestamptz,
  last_inbound_at   timestamptz,
  auto_reply_count  integer not null default 0,
  unique (campaign_run_id, contact_id)
);
create index if not exists campaign_contacts_run_status_idx
  on public.campaign_contacts(campaign_run_id, status);

-- messages --------------------------------------------------------------
create table if not exists public.messages (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id)            on delete cascade,
  campaign_contact_id   uuid references public.campaign_contacts(id)           on delete cascade,
  contact_id            uuid not null references public.contacts(id)           on delete cascade,
  direction             message_direction not null,
  body                  text not null,
  twilio_sid            text,
  status                message_status not null default 'queued',
  sent_by               message_sender not null,
  approval_state        approval_state not null default 'not_required',
  approved_by           uuid references auth.users(id),
  classifier_label      autonomy_classification,
  created_at            timestamptz not null default now(),
  sent_at               timestamptz
);
create index if not exists messages_contact_time_idx
  on public.messages(contact_id, created_at desc);
create index if not exists messages_approval_idx
  on public.messages(tenant_id, approval_state)
  where approval_state = 'queued';

-- conversations (Heat Sheet) -------------------------------------------
create table if not exists public.conversations (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id)  on delete cascade,
  contact_id      uuid not null unique references public.contacts(id) on delete cascade,
  assigned_to     uuid references auth.users(id),
  temperature     conversation_temperature not null default 'cold',
  last_message_at timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists conversations_tenant_recent_idx
  on public.conversations(tenant_id, last_message_at desc);
create index if not exists conversations_assigned_idx
  on public.conversations(assigned_to);

-- consent_events --------------------------------------------------------
create table if not exists public.consent_events (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id)  on delete cascade,
  contact_id  uuid not null references public.contacts(id) on delete cascade,
  event       consent_event_kind not null,
  source      text,                  -- 'twilio_webhook' | 'manager_ui' | 'attestation'
  occurred_at timestamptz not null default now(),
  payload     jsonb not null default '{}'::jsonb
);
create index if not exists consent_events_contact_idx
  on public.consent_events(contact_id, occurred_at desc);

-- parser_events --------------------------------------------------------
create table if not exists public.parser_events (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  selector_version  text not null,
  kind              parser_event_kind not null,
  hit_rate          numeric,
  payload_summary   jsonb not null default '{}'::jsonb,
  occurred_at       timestamptz not null default now()
);
create index if not exists parser_events_tenant_time_idx
  on public.parser_events(tenant_id, occurred_at desc);

-- audit_log -------------------------------------------------------------
create table if not exists public.audit_log (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  actor        uuid references auth.users(id),
  action       text not null,
  target_type  text,
  target_id    uuid,
  payload      jsonb not null default '{}'::jsonb,
  occurred_at  timestamptz not null default now()
);
create index if not exists audit_log_tenant_time_idx
  on public.audit_log(tenant_id, occurred_at desc);

-- =========================================================================
-- Row-Level Security
-- =========================================================================

alter table public.tenants            enable row level security;
alter table public.memberships        enable row level security;
alter table public.contacts           enable row level security;
alter table public.game_plans         enable row level security;
alter table public.campaign_runs      enable row level security;
alter table public.campaign_contacts  enable row level security;
alter table public.messages           enable row level security;
alter table public.conversations      enable row level security;
alter table public.consent_events     enable row level security;
alter table public.parser_events      enable row level security;
alter table public.audit_log          enable row level security;

-- tenants: readable by any member; writable by owner.
drop policy if exists tenants_select on public.tenants;
create policy tenants_select on public.tenants for select
  using (id = public.current_tenant_id());

drop policy if exists tenants_update_owner on public.tenants;
create policy tenants_update_owner on public.tenants for update
  using (public.has_tenant_role(id, array['owner']::membership_role[]));

-- memberships: a user can see their own memberships; owners can manage.
drop policy if exists memberships_select_own on public.memberships;
create policy memberships_select_own on public.memberships for select
  using (user_id = auth.uid()
         or public.has_tenant_role(tenant_id, array['owner','manager']::membership_role[]));

drop policy if exists memberships_write_owner on public.memberships;
create policy memberships_write_owner on public.memberships for all
  using (public.has_tenant_role(tenant_id, array['owner']::membership_role[]))
  with check (public.has_tenant_role(tenant_id, array['owner']::membership_role[]));

-- Generic per-tenant select policy factory pattern (applied per table)
-- contacts
drop policy if exists contacts_tenant_select on public.contacts;
create policy contacts_tenant_select on public.contacts for select
  using (tenant_id = public.current_tenant_id());
drop policy if exists contacts_tenant_write on public.contacts;
create policy contacts_tenant_write on public.contacts for all
  using (tenant_id = public.current_tenant_id()
         and public.has_tenant_role(tenant_id, array['owner','manager']::membership_role[]))
  with check (tenant_id = public.current_tenant_id());

-- game_plans (manager+)
drop policy if exists game_plans_select on public.game_plans;
create policy game_plans_select on public.game_plans for select
  using (tenant_id = public.current_tenant_id());
drop policy if exists game_plans_write on public.game_plans;
create policy game_plans_write on public.game_plans for all
  using (public.has_tenant_role(tenant_id, array['owner','manager']::membership_role[]))
  with check (public.has_tenant_role(tenant_id, array['owner','manager']::membership_role[]));

-- campaign_runs (manager+)
drop policy if exists campaign_runs_select on public.campaign_runs;
create policy campaign_runs_select on public.campaign_runs for select
  using (tenant_id = public.current_tenant_id());
drop policy if exists campaign_runs_write on public.campaign_runs;
create policy campaign_runs_write on public.campaign_runs for all
  using (public.has_tenant_role(tenant_id, array['owner','manager']::membership_role[]))
  with check (public.has_tenant_role(tenant_id, array['owner','manager']::membership_role[]));

-- campaign_contacts (read tenant-wide; writes via service role on send path)
drop policy if exists campaign_contacts_select on public.campaign_contacts;
create policy campaign_contacts_select on public.campaign_contacts for select
  using (tenant_id = public.current_tenant_id());

-- messages
--   select: any tenant member
--   insert by salesperson: only when conversation is assigned to them
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select
  using (tenant_id = public.current_tenant_id());

drop policy if exists messages_insert_manager on public.messages;
create policy messages_insert_manager on public.messages for insert
  with check (
    public.has_tenant_role(tenant_id, array['owner','manager']::membership_role[])
  );

drop policy if exists messages_insert_salesperson on public.messages;
create policy messages_insert_salesperson on public.messages for insert
  with check (
    sent_by = 'salesperson'
    and exists (
      select 1 from public.conversations c
      where c.contact_id  = messages.contact_id
        and c.assigned_to = auth.uid()
        and c.tenant_id   = messages.tenant_id
    )
  );

-- conversations
drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations for select
  using (
    tenant_id = public.current_tenant_id()
    and (
      public.has_tenant_role(tenant_id, array['owner','manager']::membership_role[])
      or assigned_to = auth.uid()
    )
  );
drop policy if exists conversations_write_manager on public.conversations;
create policy conversations_write_manager on public.conversations for all
  using (public.has_tenant_role(tenant_id, array['owner','manager']::membership_role[]))
  with check (public.has_tenant_role(tenant_id, array['owner','manager']::membership_role[]));

-- consent_events: read manager+; writes via service role only
drop policy if exists consent_events_select on public.consent_events;
create policy consent_events_select on public.consent_events for select
  using (public.has_tenant_role(tenant_id, array['owner','manager']::membership_role[]));

-- parser_events: read manager+
drop policy if exists parser_events_select on public.parser_events;
create policy parser_events_select on public.parser_events for select
  using (public.has_tenant_role(tenant_id, array['owner','manager']::membership_role[]));

-- audit_log: read manager+, no client writes
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select
  using (public.has_tenant_role(tenant_id, array['owner','manager']::membership_role[]));

-- =========================================================================
-- Triggers
-- =========================================================================

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_tenants_touch on public.tenants;
create trigger trg_tenants_touch
  before update on public.tenants
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_contacts_touch on public.contacts;
create trigger trg_contacts_touch
  before update on public.contacts
  for each row execute function public.touch_updated_at();

commit;
