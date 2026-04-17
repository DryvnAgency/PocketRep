-- PocketRep May 31 Launch Tables

-- rex_conversations: replaces rex_messages for Gemini-powered chat history
create table if not exists public.rex_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  image_base64 text,
  quick_log_data jsonb,
  created_at timestamptz default now()
);
alter table public.rex_conversations enable row level security;
create policy "users own rex_conversations" on public.rex_conversations
  for all using (auth.uid() = user_id);

-- monthly_metrics: per-month commission tracking header
create table if not exists public.monthly_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  month_label text not null,
  total_commission numeric default 0,
  units_sold int default 0,
  closed_at timestamptz,
  created_at timestamptz default now()
);
alter table public.monthly_metrics enable row level security;
create policy "users own monthly_metrics" on public.monthly_metrics
  for all using (auth.uid() = user_id);

-- monthly_deals: individual deal records per month
create table if not exists public.monthly_deals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  month_id uuid references public.monthly_metrics(id) on delete cascade,
  customer_name text,
  vehicle text,
  commission numeric not null,
  notes text,
  created_at timestamptz default now()
);
alter table public.monthly_deals enable row level security;
create policy "users own monthly_deals" on public.monthly_deals
  for all using (auth.uid() = user_id);

-- contact_changelog: field-level audit log for contact edits
create table if not exists public.contact_changelog (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  field_name text not null,
  old_value text,
  new_value text,
  changed_at timestamptz default now()
);
alter table public.contact_changelog enable row level security;
create policy "users own contact_changelog" on public.contact_changelog
  for all using (auth.uid() = user_id);
