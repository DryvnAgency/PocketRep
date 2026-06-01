# RLS / per-user isolation audit — 2026-06-01

Audit of whether per-user data isolation is enforced **server-side** (Postgres
RLS) and does not depend on the client's `?user_id=eq.<uuid>` query filter.

**Method**

1. Supabase security advisors (`get_advisors type=security`).
2. Direct inspection of every policy in `pg_policies` (USING / WITH CHECK / role).
3. An **empirical forgery test**: simulate a signed-in user via
   `set local role authenticated` + `request.jwt.claims`, then query for another
   user's rows and count what comes back. Reproduced in
   `PocketRepApp/supabase/tests/rls_isolation_test.sql`.

**Headline:** RLS is enabled on all 27 public tables, and per-user isolation is
correctly enforced on the core data tables — a forged `user_id` returns **zero
rows**. Two real holes (`users`, `rex_usage`) and one functional deny-all
(`holiday_calendar`) are fixed by `20260601_v2_rls_isolation_fixes.sql`.

> ⚠️ **Repo/prod drift:** the two vulnerable policies and the `rex_usage` table
> are **not** present in `PocketRepApp/supabase/migrations/` — they were applied
> ad-hoc in the dashboard. The live DB is the source of truth here. The fix
> migration uses `drop policy if exists` so it is safe either way.

## Empirical evidence (simulated user `4aa6bd4d…`, read-only)

| Probe | Result | Verdict |
|---|---|---|
| `count(contacts where user_id = <other user>)` | `0` | ✅ isolated |
| `count(contacts)` (own) | `2` | ✅ visible |
| `count(deals where user_id = <other user>)` | `0` | ✅ isolated |
| `count(nurture_messages)` (3 rows exist, owned by others) | `0` | ✅ isolated |
| `count(users)` | **`7`** | ❌ **leak** (expected 1) |

## Per-table verdict (27 tables)

**Correctly isolated — `auth.uid() = user_id` (or owner join):**
`contacts`, `contact_milestones`, `contact_sequences`, `deals`,
`heat_sheet_log`, `interactions`, `mass_texts`, `nurture_messages`, `pay_plans`,
`profiles` (`auth.uid() = id`), `rex_action_log`, `rex_memory`, `rex_messages`,
`sequences`¹, `sequence_steps`¹, `tags`, `user_push_tokens`, `weekly_digests`,
`daily_ai_usage` (read-own).

¹ `sequences`/`sequence_steps` SELECT also allow `user_id IS NULL` rows — shared
global templates, intentional. Insert/update/delete remain owner-only.

**Fixed in this PR:**

| Table | Problem | Fix |
|---|---|---|
| `users` | `Allow public username to email lookup` — `SELECT` to `{anon,authenticated}` with `USING (true)` → every user's row (emails) world-readable. Login does **not** read this table (email derived client-side from username), so the policy is vestigial. | Drop it. `users_select_own` (`auth.uid() = id`) already covers self-read. |
| `rex_usage` | `Service role can manage usage` — `ALL` to `{public}` with `USING/CHECK (true)` → any user could read/modify everyone's usage counters. | Drop it. Service role bypasses RLS; `Users can read own usage` remains. |
| `holiday_calendar` | RLS enabled, **no policy** → deny-all. Client read in `nurtureEngine.ts:174` silently got 0 rows (broken holiday-aware nurture timing). Reference data, no `user_id`. | Add `SELECT` for `authenticated` (`USING (true)`). |

**RLS enabled, no policy → deny-all (secure, but verify intent):**
`appointment_signals`, `customers`, `dealers`, `drafts`, `messages`. All have 0
rows and no client references — they read as locked-down legacy/unused tables.
Recommendation: drop them, or add explicit policies if they are intended for use.
Left untouched here (adding policies to tables of unknown purpose risks *opening*
access).

## Remaining hardening (advisor WARNs — recommended follow-up PR, not launch-blocking)

- **`SECURITY DEFINER` functions executable by `anon`:** `seed_marcus_for_user(uuid)`,
  `increment_daily_usage(...)`, `increment_rex_usage(...)`, `rls_auto_enable()`,
  `handle_new_user()`, `handle_new_auth_user()`. An unauthenticated caller can
  invoke these via `/rest/v1/rpc/...` (e.g. seed/pollute arbitrary accounts,
  inflate usage). Fix: `REVOKE EXECUTE ... FROM anon` (and `authenticated` where
  not user-facing).
- **Mutable `search_path`** on `touch_updated_at`, `update_updated_at`,
  `calculate_heat_score`, `increment_rex_usage`, `increment_daily_usage`
  (`SECURITY DEFINER` privilege-escalation hardening): `SET search_path = ''`.
- **Public bucket `contact-photos` allows listing** — broad `SELECT` on
  `storage.objects` lets a client enumerate all files. Scope it to the owner's
  prefix.
- **Leaked-password protection disabled** (Supabase Auth setting) — enable
  HaveIBeenPwned check.

## How to apply / verify

```bash
# verify (read-only) — run against the DB; expects "RLS OK ..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f PocketRepApp/supabase/tests/rls_isolation_test.sql

# apply the fix (after review — NOT done automatically)
supabase db push      # or paste 20260601_v2_rls_isolation_fixes.sql into the SQL editor
```
