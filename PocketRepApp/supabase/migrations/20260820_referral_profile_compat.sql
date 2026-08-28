-- Referral compatibility: checkout-account resolves referrers through profiles.referral_code.
-- Keep that lookup backed by the canonical referral_codes ledger.

alter table public.profiles
  add column if not exists referral_code text;

create unique index if not exists profiles_referral_code_unique
  on public.profiles(referral_code)
  where referral_code is not null;

update public.profiles p
set referral_code = rc.code
from public.referral_codes rc
where rc.user_id = p.id
  and p.referral_code is null;

create or replace function public.sync_profile_referral_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set referral_code = new.code
  where id = new.user_id
    and (referral_code is null or referral_code = new.code);
  return new;
end;
$$;

drop trigger if exists referral_codes_sync_profile on public.referral_codes;
create trigger referral_codes_sync_profile
after insert or update of code on public.referral_codes
for each row execute function public.sync_profile_referral_code();

revoke all on function public.sync_profile_referral_code() from public, anon, authenticated;
