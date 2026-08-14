-- 20260814_lock_profile_billing_fields.sql
-- Launch security hardening: authenticated users must never be able to self-grant
-- plan, unlimited AI access, trial time, or Stripe state through profiles.
-- Billing state is authoritative from the server/Stripe webhook.

begin;

drop policy if exists "Users manage own profile" on public.profiles;

create policy "Users read own profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

create policy "Users update safe profile fields"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Column-level defense: PostgREST/authenticated clients cannot request updates
-- to billing/entitlement columns at all. Server-side service_role remains able
-- to update them for Stripe lifecycle events.
revoke update (plan, unlimited, trial_ends_at, stripe_customer_id)
  on public.profiles from authenticated;

-- Defense in depth: even if privileges/policies are changed later, authenticated
-- callers still cannot mutate server-controlled billing/entitlement columns.
create or replace function public.protect_profile_billing_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'authenticated' then
    if new.plan is distinct from old.plan
       or new.unlimited is distinct from old.unlimited
       or new.trial_ends_at is distinct from old.trial_ends_at
       or new.stripe_customer_id is distinct from old.stripe_customer_id then
      raise exception 'Billing and entitlement fields are server managed';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_billing_fields on public.profiles;
create trigger protect_profile_billing_fields
  before update on public.profiles
  for each row
  execute function public.protect_profile_billing_fields();

commit;
