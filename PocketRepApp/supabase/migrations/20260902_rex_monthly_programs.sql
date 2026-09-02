-- Verified monthly dealership program context for Rex.
-- Reps update this conversationally through Rex; the model may use only the
-- rep-supplied facts for the matching month. One row per rep/month also tracks
-- whether the first-days prompt has already been shown.

create table if not exists public.rex_monthly_programs (
  user_id uuid not null references public.profiles(id) on delete cascade,
  month_start date not null,
  programs text not null default '',
  prompted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, month_start),
  constraint rex_monthly_programs_month_start_check
    check (month_start = date_trunc('month', month_start)::date),
  constraint rex_monthly_programs_programs_length_check
    check (char_length(programs) <= 6000)
);

alter table public.rex_monthly_programs enable row level security;

revoke all on table public.rex_monthly_programs from anon;
grant select, insert, update on table public.rex_monthly_programs to authenticated;

create policy "rex_monthly_programs_select_own"
  on public.rex_monthly_programs
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "rex_monthly_programs_insert_own"
  on public.rex_monthly_programs
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "rex_monthly_programs_update_own"
  on public.rex_monthly_programs
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
