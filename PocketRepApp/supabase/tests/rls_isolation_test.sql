-- rls_isolation_test.sql
--
-- Proves that ROW-LEVEL SECURITY — not the client's `?user_id=eq.<uuid>` filter
-- — is what stops one user from reading another's rows. It simulates a signed-in
-- user via request.jwt.claims, then issues a FORGED query for a different user's
-- rows and asserts it returns zero.
--
-- Run (read-only; it writes nothing and reverts its session settings):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_isolation_test.sql
-- or paste into the Supabase SQL editor. Requires an admin/owner connection that
-- is a member of the `authenticated` role (the default postgres connection is).
--
-- Expected: NOTICE "RLS OK ...". A RAISE EXCEPTION means an isolation failure.
--
-- NOTE: the public.users assertion FAILS until 20260601_v2_rls_isolation_fixes
-- is applied (the world-read policy is still live), which is the point — it
-- guards that fix. The contacts/deals assertions pass today.

do $$
declare
  me        uuid;
  other     uuid;
  n_forged  bigint;
  n_own     bigint;
  n_deals   bigint;
  n_users   bigint;
begin
  -- Pick two distinct users that own contacts (done as the privileged invoker,
  -- before we drop into the authenticated role below).
  select user_id into me
    from public.contacts group by user_id order by count(*) desc limit 1;
  select user_id into other
    from public.contacts where user_id <> me group by user_id order by count(*) desc limit 1;

  if me is null or other is null then
    raise notice 'SKIP rls_isolation_test: need two distinct users with contacts';
    return;
  end if;

  -- Become that signed-in user for the rest of this transaction.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
                     json_build_object('sub', me, 'role', 'authenticated')::text, true);

  -- 1) Forged filter for ANOTHER user's contacts must return zero rows.
  select count(*) into n_forged from public.contacts where user_id = other;
  if n_forged <> 0 then
    raise exception 'RLS FAIL: forged user_id exposed % contact row(s) (expected 0)', n_forged;
  end if;

  -- 2) Forged filter for another user's deals must return zero rows.
  select count(*) into n_deals from public.deals where user_id = other;
  if n_deals <> 0 then
    raise exception 'RLS FAIL: forged user_id exposed % deal row(s) (expected 0)', n_deals;
  end if;

  -- 3) The user can still see their OWN rows (policy not over-tight).
  select count(*) into n_own from public.contacts;
  if n_own = 0 then
    raise exception 'RLS FAIL: signed-in user sees none of their own contacts';
  end if;

  -- 4) public.users must be self-only (guards the world-read leak fix).
  select count(*) into n_users from public.users;
  if n_users > 1 then
    raise exception
      'RLS FAIL: public.users exposed % rows to one user (expected 1) — apply 20260601_v2_rls_isolation_fixes',
      n_users;
  end if;

  raise notice 'RLS OK: forged_contacts=%, forged_deals=%, own_contacts=%, users_visible=%',
    n_forged, n_deals, n_own, n_users;
end $$;
