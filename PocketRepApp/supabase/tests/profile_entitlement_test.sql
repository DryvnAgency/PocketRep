-- profile_entitlement_test.sql
--
-- Regression test for 20260814_lock_profile_billing_fields.sql.
-- A signed-in user must be able to edit ordinary profile data, but must NOT be
-- able to self-grant plan/unlimited/trial/Stripe state.
--
-- Run against a non-production/test database or inside a transaction and roll back.
-- Requires an existing profile and a privileged connection that can SET ROLE.

begin;

do $$
declare
  me uuid;
  original_name text;
  blocked boolean := false;
begin
  select id, full_name into me, original_name
  from public.profiles
  order by created_at
  limit 1;

  if me is null then
    raise notice 'SKIP profile_entitlement_test: no profiles exist';
    return;
  end if;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', me, 'role', 'authenticated')::text, true);

  -- Safe profile field must remain editable.
  update public.profiles
     set full_name = coalesce(original_name, '') || ' [security-test]'
   where id = me;

  -- Entitlement escalation must be rejected by the trigger.
  begin
    update public.profiles set unlimited = true where id = me;
  exception when others then
    blocked := true;
  end;

  if not blocked then
    raise exception 'SECURITY FAIL: authenticated user could set profiles.unlimited=true';
  end if;

  raise notice 'PROFILE ENTITLEMENT OK: safe update allowed, unlimited escalation blocked';
end $$;

rollback;
