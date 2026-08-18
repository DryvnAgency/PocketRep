create table if not exists public.referral_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);

alter table public.referral_codes enable row level security;
drop policy if exists referral_codes_self_read on public.referral_codes;
create policy referral_codes_self_read on public.referral_codes for select using (user_id = auth.uid());

grant select on public.referral_codes to authenticated;

create or replace function public.ensure_my_referral_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_code text;
  new_code text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select code into existing_code from public.referral_codes where user_id = auth.uid();
  if existing_code is not null then return existing_code; end if;
  new_code := 'PR-' || upper(substr(replace(auth.uid()::text, '-', ''), 1, 10));
  insert into public.referral_codes(user_id, code) values (auth.uid(), new_code)
    on conflict (user_id) do update set code = excluded.code;
  return new_code;
end;
$$;

grant execute on function public.ensure_my_referral_code() to authenticated;
