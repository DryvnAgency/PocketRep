# PocketRep — Session Handoff for Next Agent

**Last updated**: 2026-05-23, mid-session pause. Session ID `0116oAkXYRzeDSDyVow2Li5s`.

You are picking up an in-flight project. **Read this entire file before touching anything.** It captures the goal, the architecture, what's been shipped, what's blocked, and the exact next action.

---

## 1. Goal (in one sentence)

Port the standalone HTML design mockup at `design/PocketRep-Standalone.html` into the live `PocketRepApp` (Expo / React Native / TypeScript) so that the eventual `app.pocketrep.pro` is a real, Supabase-backed app that looks and behaves identically to the mock — without breaking the existing iOS/Android users or the static PWA currently serving at `pocketrep.pro/app`.

---

## 2. Repo layout

Single GitHub repo: **`DryvnAgency/PocketRep`** (your MCP github tools are scoped to it).

| Path | What it is |
|---|---|
| `Pocketrep/` | Marketing site (static HTML/CSS/JS). Served at `pocketrep.pro`. Currently the static mock lives at `Pocketrep/app/`. |
| `PocketRepApp/` | The Expo React Native app. iOS/Android via EAS; web via `npm run build:web`. **This is where the v2 port lives.** |
| `RexLens/` | Chrome extension source. Parallel track, currently has a build problem. |
| `design/` | `PocketRep-Standalone.html` (1.64 MB bundled mock) + `design/extracted/*.jsx` (17 modules I decoded from the bundler manifest — your reference for every screen) |
| `docs/` | `PORT_PLAN.md` (the master plan), `VERCEL_SETUP.md` (deployment config), `HANDOFF.md` (this file) |

---

## 3. Live surfaces (treat these as sacred — don't break them)

| Surface | Where | What it is |
|---|---|---|
| Marketing site | `pocketrep.pro` (root) | Static, untouched by v2 work. Hosted by Vercel project `pocket-rep`. |
| Current "app" | `pocketrep.pro/app` | Static design-mock HTML from PR #21. Hosted by `pocket-rep`. **Will be replaced at PR #38 cutover by the Expo Web build.** |
| Native users | iOS App Store + Play Store | Real users on the existing v1 PocketRepApp UI. EAS builds intentionally leave `EXPO_PUBLIC_NEW_UI` unset, so they never see v2 until cutover. |
| Edge functions | Supabase | `ai-proxy` (v25) is the Rex brain. Endpoint `https://fwvrauqdoevwmwwqlfav.supabase.co/functions/v1/ai-proxy/brain` (or `/gemini`, or no sub-path — all route to brain logic via `routeOf` fall-through). |

---

## 4. Vercel projects (3, two relevant)

| Project | Source root | Domain(s) | Build |
|---|---|---|---|
| **pocket-rep** | `Pocketrep/` | `pocketrep.pro`, `app.pocketrep.pro` | Static (marketing + static mock at `/app`) |
| **project-t90u1** | `PocketRepApp/` | auto-generated `*.vercel.app` previews only (no custom domain yet) | `npm run build:web` → Expo Web SPA in `dist/` |
| **his-palabra** | unrelated repo | n/a | **IGNORE EVERY RED CHECK FROM THIS PROJECT.** It's a different product subscribed to push events from this repo for legacy reasons. Fails on every PR. |

CI rule: **green = (`pocket-rep` success) AND (`project-t90u1` success)**. `his-palabra` is permanent noise.

---

## 5. Supabase project

**Project ID**: `fwvrauqdoevwmwwqlfav`
**URL**: `https://fwvrauqdoevwmwwqlfav.supabase.co`
**Status**: `ACTIVE_HEALTHY`

Existing profiles (4): `admin@pocketrep.app`, `ryanm@pocketrep.app`, `rexadmin@pocketrep.app`, `eddiep@pocketrep.pro`. After the Marcus seed migration each one has exactly 1 contact (Marcus Holloway) + 12 starter tags.

**Important quirks:**
- `contacts.user_id` FKs to `public.users` (which was empty before my seed); newer tables (`tags`, `pay_plans`, `deals`, `rex_messages`) FK to `public.profiles`. The seed function `seed_marcus_for_user(uuid)` self-heals by creating the `public.users` row from `auth.users.email` first.
- `heat_tier` column has a CHECK constraint allowing only `('red','orange','blue')` — mismatched with the mock's `('hot','warm','watch')`. **Don't touch this constraint** (destructive). v2 client computes tier from `heat_score` numeric (Marcus is 90 = renders as "hot").
- **Project has an IP allowlist** that blocks our sandbox's outgoing IP. Curl from sandbox = 403 "Host not in allowlist" on all endpoints. **Does NOT block real users.** Don't be fooled by this — function logs prove real traffic flows.

**Supabase MCP tools available** (project_id is always `fwvrauqdoevwmwwqlfav`):
- `list_tables`, `list_migrations`, `apply_migration`, `execute_sql`
- `get_edge_function`, `list_edge_functions`, `deploy_edge_function`
- `get_logs` (services: api, postgres, edge-function, auth, storage, realtime)
- `get_advisors` (type: security or performance)
- `get_project_url`, `get_publishable_keys`

---

## 6. The feature flag (how v2 stays gated)

`PocketRepApp/lib/featureFlags.ts` exports `shouldUseNewUi()`:
- **true** if `process.env.EXPO_PUBLIC_NEW_UI === '1'` (build-time, baked by Metro)
- **true** on web if URL has `?v=2`
- otherwise **false**

`PocketRepApp/app/_layout.tsx`'s top-level `RootLayout` checks this. If true → renders `<NewUiShell />` (v2). If false → renders `<V1RootLayout />` (the original auth/Stack/tabs).

**Auth gate is currently REMOVED on v1 too** (PR #26 scope addition). `V1RootLayout` no longer queries Supabase auth or redirects to `/(auth)`. The `(auth)/*` files still exist on disk but are unmounted from the router. Any drift to `/(auth)` gets bounced to `/(tabs)`. **Auth will be re-mounted in a dedicated PR before real users see this.**

---

## 7. Decisions locked in (do NOT re-litigate)

1. **Architecture: Path A** — Expo native rewrite. One codebase ships iOS + Android + web. NOT a separate Vite app. The mock's HTML/CSS/inline-styles get translated to RN's `View`/`Text`/`Pressable`/`StyleSheet`/Animated.
2. **Domain**: `app.pocketrep.pro` stays the canonical surface. Currently points at `pocket-rep` (static mock). At PR #38 cutover, transfer the domain to `project-t90u1`.
3. **Demo contact**: Marcus Holloway. Already seeded for the 4 existing profiles + will auto-seed on every new signup via the `handle_new_user` trigger extension.
4. **PR cadence**: autonomous merge. CI green (ignore his-palabra) + user eyeballs the preview URL = ship. Hold ONLY if (a) existing live surface breaks or (b) a destructive DB change is required.
5. **Rex Lens PRs**: never auto-merge. Always wait for user to confirm the build actually fixes the symptom.

---

## 8. PR train status (snapshot at handoff)

| GitHub PR # | Title | State | Notes |
|---:|---|---|---|
| 24 | docs: port plan | **MERGED** | Audit + 13-PR sequence. |
| 25 | v2 scaffold + feature flag | **MERGED** | `NewUiShell` placeholder behind `?v=2`. |
| 26 | Chrome (CustomNavBar/TabBar/HeyRex orb) + drop auth gate | **MERGED** | All v2 chrome ported. Auth gate removed. |
| 27 | DB: contacts/deals extensions + tags + pay_plans tables | **MERGED** | Purely additive migration applied via Supabase MCP. |
| 28 | **Rex Lens V25 zip rebuild** | **OPEN — HOLD** | User confirmed bundle is clean. The actual error is server-side (see §10). Don't merge until V25 is confirmed to work after the trigger fix. |
| 29 | DB: Marcus seed + 12 starter tags | **MERGED** | Backfilled 4 existing profiles. handle_new_user extended to seed on new signups. |
| **30** | **Heat Sheet wired** | **NEXT — BLOCKED** | See §10 + §11 |

The conceptual numbering in `PORT_PLAN.md` is off by 1 from GitHub from #28 onward (Rex Lens took #28). When in doubt go by GitHub.

---

## 9. v2 file structure (what's already built)

```
PocketRepApp/
├── lib/featureFlags.ts                # shouldUseNewUi()
├── components/
│   ├── NewUiShell.tsx                  # entry — renders AppShell
│   └── v2/
│       ├── tokens.ts                   # TIERS, stalenessColor
│       ├── atoms.tsx                   # Label, Pill, Avatar, StatNumber, SectionHead, HeatStripe + rgbaTint() helper
│       ├── CustomNavBar.tsx            # top bar: gold PR mark + POCKETREP wordmark + title/sub + search/bell
│       ├── TabBar.tsx                  # 4 tabs (Heat/Contacts/Metrics/You) + orb anchor
│       ├── HeyRexOrb.tsx               # 4 RN-Animated states (idle/listening/processing/saved)
│       └── AppShell.tsx                # composes nav + content + tabs; orb tap cycles for QA
├── app/_layout.tsx                     # RootLayout (v2 gate) + V1RootLayout (v1, auth-stripped)
├── constants/theme.ts                  # colors, radius, spacing, heatConfig — already matches mock
└── supabase/migrations/
    ├── 20260523_v2_schema_extensions.sql   # PR #27
    └── 20260523_v2_marcus_seed.sql          # PR #29
```

The 17 unpacked `.jsx` source modules from the mock live at `design/extracted/` — that's your reference for ports #30 onward.

---

## 10. ★ THE BLOCKER — Rex Lens "Failed to fetch" / "Database error querying schema" ★

User reports Rex Lens V25 still throws this error. They've personally verified the V25 bundle has the correct `SUPABASE_URL` and a valid 219-char anon JWT baked in, so it's NOT a build problem.

**I investigated. The actual root cause is not what the user initially suspected.**

### What I ruled out

1. **`/ai-proxy/gemini` route doesn't exist** — FALSE. The function's `routeOf()` returns `'root'` for anything not ending in `/brain`/`/stt`/`/tts`, and `'root'` falls through to brain logic. **Edge function logs show `/ai-proxy/gemini` returning 200 OK as recently as 30 min ago.** No path change needed.
2. **CORS blocks chrome-extension origins** — FALSE. Function explicitly sets `Access-Control-Allow-Origin: *` (wildcard). chrome-extension://* is allowed.
3. **My sandbox curl returns 403 "Host not in allowlist"** — RED HERRING. That's a Supabase project-level IP allowlist blocking our sandbox specifically. Real users hit it fine (logs prove). Irrelevant.

### What I found (from `get_logs` postgres)

```
ERROR: duplicate key value violates unique constraint "profiles_pkey"
timestamp: ~17:05 UTC, 2026-05-23  (~5 min after Marcus seed migration applied)
```

The pre-existing `handle_new_user()` trigger does `INSERT INTO profiles (id, ...)` with **no `ON CONFLICT` clause**. If anything tries to insert into `auth.users` with an id that already has a profile row (stale half-failed signup, etc.), the trigger fails. The trigger failure rolls back the `auth.users` insert and surfaces as **"Database error querying schema"** in the GoTrue auth client.

**This was a pre-existing latent bug** — NOT something I introduced. But my Marcus migration extended `handle_new_user` (added `PERFORM seed_marcus_for_user(new.id)`) without fixing the latent issue. Result: more likely to be hit.

### Additional security finding (from `get_advisors`)

Both `handle_new_user()` and `seed_marcus_for_user()` are `SECURITY DEFINER` and currently callable via `/rest/v1/rpc/...` by the anon role. Locking them down is housekeeping but should land alongside the fix.

### The proposed fix (NOT YET APPLIED — user is reviewing)

```sql
-- Fix 1: handle_new_user idempotency
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE _plan text;
BEGIN
  _plan := coalesce(new.raw_user_meta_data->>'plan', 'pro');
  IF _plan IN ('pro_bundle','elite_bundle') THEN _plan := 'elite';
  ELSIF _plan = 'rex_lens_standalone' THEN _plan := 'rex_lens';
  END IF;
  IF _plan NOT IN ('rex_lens','pro','elite') THEN _plan := 'pro'; END IF;

  INSERT INTO profiles (id, email, plan, trial_ends_at)
  VALUES (new.id, new.email, _plan, now() + interval '7 days')
  ON CONFLICT (id) DO NOTHING;     -- ★ the missing line

  PERFORM public.seed_marcus_for_user(new.id);
  RETURN new;
END;
$function$;

-- Fix 2: revoke anon RPC exposure
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_marcus_for_user(uuid) FROM anon, authenticated;
```

**Critical: do NOT apply this without explicit user go-ahead.** User explicitly said "report back before changing anything." When user confirms, apply via `apply_migration` MCP and verify with a test signup (or have user retry V25).

---

## 11. What's blocking PR #30 (Heat Sheet wired)

Two coupled problems:

1. **The trigger bug in §10.** PR #30's Vercel preview would surface the same auth instability if it hits the bug during QA.
2. **The v2 surface has no auth session** (PR #26 removed it). v2's Heat Sheet needs to read `contacts` from Supabase, but `contacts` has RLS `auth.uid() = user_id` — without a session, the SELECT returns zero rows.

**Three options for #2** (user hasn't picked):
- A. Anon-bypass policy on contacts (simplest, RLS-leaky in dev)
- B. Auto-sign-in to a fixed demo user on v2 app boot (cleaner, requires storing the demo credentials)
- C. Hard-code Marcus client-side as a dev seed (cheats the seed, but unblocks UI work)

Recommend option B with a hard-coded "demo user id" env var, since it keeps RLS intact and proves the Supabase wiring works end-to-end. But this is a real architectural call — surface it to the user before coding.

---

## 12. Autonomous-merge safety rails (NEVER skip these)

1. After every merge: smoke test that
   - `ai-proxy/brain` returns 200 (curl OR check edge function logs for recent 200s)
   - v1 surface still renders (the project-t90u1 preview URL with no `?v=2`)
   - The new screen this PR shipped renders without console errors
2. If ANY existing working surface (sign-in, contacts list, brain endpoint, marketing site) breaks → STOP, ping user, do not push more PRs.
3. If a fix requires a destructive DB call (DROP, ALTER constraint, DELETE, etc.) → STOP, ping user with the SQL, don't apply.
4. Vercel preview URLs are SSO-gated → use `get_access_to_vercel_url` MCP tool to make a mobile-friendly shareable URL for the user to QA.
5. Drop v1 and v2 share URLs in every PR comment so the user can eyeball both surfaces.
6. **Rex Lens PRs**: never autonomous-merge; always wait for user confirmation the build fixes the symptom.

---

## 13. Useful MCP tool reference

### Supabase (`mcp__0e04dfbb-...`)
- `apply_migration(project_id, name, query)` — DDL changes. Always idempotent: use `IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, `CREATE OR REPLACE`.
- `execute_sql(project_id, query)` — SELECTs and one-off statements.
- `get_logs(project_id, service)` — `postgres` for trigger errors; `edge-function` for ai-proxy traffic; `auth` for signup/signin issues.
- `get_advisors(project_id, type)` — runs the linter; check after every DDL change.
- `get_edge_function(project_id, function_slug)` — pulls source code.

### Vercel (`mcp__89f13b03-...`)
- `get_access_to_vercel_url(url)` — returns a `_vercel_share=...` URL that bypasses Vercel SSO for 23 hours. Critical for mobile QA.
- `web_fetch_vercel_url(url)` — server-side fetch that bypasses SSO (your only way to see Vercel-deployed HTML directly).

### GitHub (`mcp__github__`)
- `create_pull_request`, `merge_pull_request` (use `merge_method: "squash"`)
- `pull_request_read` (methods: `get_status`, `get_review_comments`)
- `subscribe_pr_activity` / `unsubscribe_pr_activity`
- `update_pull_request` (for revising PR title/body after scope additions)
- Scoped to `dryvnagency/pocketrep` only.

---

## 14. Conventions to keep using

- Branch names: `claude/pr<N>-<short-slug>` (e.g. `claude/pr30-heat-sheet-wired`)
- Commit format: `feat(web-v2):` / `db(v2):` / `docs:` etc.
- All commits end with `https://claude.ai/code/session_0116oAkXYRzeDSDyVow2Li5s`
- PR bodies include: scope summary, smoke rails table, preview URL placeholder, "Next: PR #N" footer
- New v2 components in `PocketRepApp/components/v2/`
- New v2 hooks in `PocketRepApp/lib/`
- Migrations at `PocketRepApp/supabase/migrations/<YYYYMMDD>_<name>.sql` AND applied via MCP `apply_migration`
- Use `rgbaTint(hex, alpha)` from `components/v2/atoms.tsx` to replace mock's CSS `color-mix()` (RN doesn't support it)
- Mock uses `cursor: pointer` and `onClick` — RN uses `<Pressable onPress>`. Mock uses CSS keyframes — RN uses `Animated` API.

---

## 15. Exact next action (when user gives you go-ahead)

1. **Apply the handle_new_user fix** in §10 via `apply_migration` (name: `v2_handle_new_user_fix`). Also commit the SQL file to a new branch `claude/handle-new-user-trigger-fix` and open as a hotfix PR. Verify by:
   - `get_logs` postgres → no more profiles_pkey errors
   - Test signup via Supabase auth (if you have a way) or have user retry V25 Rex Lens
2. **Once user confirms V25 works**, merge PR #28 (Rex Lens).
3. **Then decide the RLS-for-v2 strategy** (§11) with the user.
4. **Start PR #30 — Heat Sheet wired**:
   - Read `design/extracted/tab-heat.jsx` for the spec
   - Port to RN at `PocketRepApp/components/v2/HeatSheetTab.tsx`
   - Use the v2 atoms (`SectionHead`, `Pill`, `HeatStripe`) already built
   - Query contacts via Supabase JS client, compute tier from `heat_score`, group hot/warm/watch
   - Wire into `AppShell.tsx`'s `active === 'heat'` branch (currently shows placeholder)
   - Drop preview URLs in PR body, get user eyeball, merge.

---

## 16. Files to scan before doing anything substantive

| Why | Read |
|---|---|
| Master plan (your bible) | `docs/PORT_PLAN.md` |
| Vercel config + cutover plan | `docs/VERCEL_SETUP.md` |
| Heat Sheet spec | `design/extracted/tab-heat.jsx` (97 LOC) |
| Contact list spec | `design/extracted/tab-contacts.jsx` (558 LOC) |
| Contact detail spec | `design/extracted/contact-detail.jsx` (898 LOC) — biggest |
| Mock data shapes (sanity check seed) | `design/extracted/data.js` (142 LOC) |
| Existing tokens (already aligned to mock) | `PocketRepApp/constants/theme.ts` |
| Existing v2 atoms / chrome | `PocketRepApp/components/v2/*` |

---

## 17. Things NOT to do

- Don't recreate Vercel projects. `project-t90u1` is the deploy target. Don't make a new one.
- Don't touch the `heat_tier` CHECK constraint (destructive).
- Don't touch `contacts.user_id` → `public.users` FK (would need cascading rewrites).
- Don't push to `main` directly. PRs only.
- Don't merge Rex Lens PRs without user confirmation.
- Don't trust `his-palabra` CI status — always failing, unrelated.
- Don't paste the Supabase anon key into chat prose (it's been in tool outputs which is fine, but don't echo it).
- Don't try to fix v1 if it's broken. v1 is sunsetting; if its data looks empty, that's expected (RLS + no auth session).

---

## 18. Things that ARE safe to do without asking

- Open new PRs on `claude/pr<N>-*` branches
- Apply purely additive migrations (`ADD COLUMN`, `CREATE TABLE`, `CREATE OR REPLACE FUNCTION`)
- Merge PocketRep code PRs when CI green + user eyeballed preview
- Spawn Explore agents for codebase research
- Use `get_logs` aggressively when debugging
- Reorganize files within `components/v2/` if it helps clarity

---

## 19. Open user-facing questions (asked, not yet answered)

None currently outstanding. The trigger fix in §10 is the immediate next decision the user needs to make.

---

End of handoff. Good luck.
