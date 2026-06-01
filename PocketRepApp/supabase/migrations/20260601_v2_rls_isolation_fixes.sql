-- 20260601_v2_rls_isolation_fixes.sql
--
-- Closes the per-user isolation holes found in the 2026-06-01 security audit
-- (see docs/SECURITY_RLS_AUDIT.md). The source of truth for these policies was
-- the LIVE database: they were applied ad-hoc in the Supabase dashboard and are
-- not otherwise tracked in this migrations folder, so this file uses
-- `drop policy if exists` and is safe to run regardless of repo/prod drift.
--
-- Verified by supabase/tests/rls_isolation_test.sql.
--
-- NOT auto-applied. After review, apply with `supabase db push` (or paste into
-- the SQL editor). Nothing in CI runs this.

begin;

-- 1) public.users was world-readable -------------------------------------------
-- A SELECT policy `Allow public username to email lookup` granted {anon,
-- authenticated} read with USING (true), exposing EVERY user row (emails
-- included) to anyone. Login does not read this table — the client derives
-- `<username>@pocketrep.pro` and calls signInWithPassword directly — so the
-- policy is vestigial. Legitimate self-reads stay covered by the existing
-- `users_select_own` policy (auth.uid() = id).
drop policy if exists "Allow public username to email lookup" on public.users;

-- 2) public.rex_usage was public read/write ------------------------------------
-- An ALL policy `Service role can manage usage` was bound to {public} with
-- USING (true) / WITH CHECK (true), so any user could read or modify everyone's
-- usage counters (e.g. reset their own to bypass AI limits). The service role
-- bypasses RLS and the SECURITY DEFINER increment_rex_usage() runs as owner, so
-- legitimate server-side writes are unaffected. Per-user reads stay covered by
-- `Users can read own usage` (auth.uid() = user_id).
drop policy if exists "Service role can manage usage" on public.rex_usage;

-- 3) public.holiday_calendar was deny-all (functional bug) ----------------------
-- RLS was enabled with NO policy, so the client read in nurtureEngine.ts
-- silently returned zero rows and holiday-aware nurture timing never fired. It
-- is shared reference data (no user_id), so allow read for signed-in users.
-- Writes remain restricted to the service role (no write policy).
drop policy if exists "holiday_calendar readable by authenticated" on public.holiday_calendar;
create policy "holiday_calendar readable by authenticated"
  on public.holiday_calendar
  for select
  to authenticated
  using (true);

commit;
