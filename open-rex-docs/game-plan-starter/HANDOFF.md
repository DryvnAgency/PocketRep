# OpenRex — Handoff to live

This directory is a complete Next.js 14 app + applied Supabase migrations,
staged in PocketRep because the GitHub MCP scope was locked to that repo.
Everything here is ready to copy into `DryvnAgency/OpenRex` and deploy on
Vercel under the existing `open-rex` project.

## What's already done

### Supabase — `OpenRex` project (`dhtzhftxrszfccpqivga`)

All migrations applied to the live remote project via MCP:

| Migration | Purpose |
|---|---|
| `0001_init_gameplan` | Dropped 5 legacy tables (all empty). Created the Game Plan schema (11 tables) with RLS, helper functions (`current_tenant_id`, `has_tenant_role`), enums, indexes, and `updated_at` triggers. |
| `0002_waitlist` | Public waitlist table for landing page signups. Anonymous insert allowed, reads service-role-only. |
| `0003_function_search_path` | Locked search_path on stable functions per Supabase linter. |

Snapshots of all three live in `migrations/` for replayability against any
fresh project (e.g. via `supabase db push`).

### Next.js 14 app — `apps/web/`

```
apps/web/
├── app/
│   ├── layout.tsx                       # fonts + root
│   ├── page.tsx                         # marketing landing
│   ├── globals.css                      # full design system, ported 1:1
│   ├── sign-in/{page.tsx, actions.ts}   # Supabase magic-link auth
│   ├── auth/callback/route.ts           # OAuth exchange handler
│   ├── api/waitlist/route.ts            # POST → public.waitlist
│   └── (app)/
│       ├── layout.tsx                   # auth-gated sidebar shell
│       ├── SignOutButton.tsx
│       ├── dashboard/page.tsx
│       ├── heat-sheet/page.tsx
│       ├── game-plans/new/page.tsx
│       ├── lens/page.tsx
│       ├── coach/page.tsx
│       ├── audit/page.tsx
│       ├── rep/page.tsx
│       └── game-plans/new/run.ts        # runGamePlan server action — REAL writes
├── components/{StatusPill, Waitlist}.tsx
├── lib/
│   ├── env.ts                           # paste-to-activate gate helper
│   ├── mock.ts                          # mocked entities, swap to Supabase reads later
│   ├── anthropic.ts                     # Sonnet wrapper + prompt cache + price-leak guard
│   └── supabase/{client, server}.ts     # SSR helpers
├── middleware.ts                        # session refresh + route guard
├── next.config.ts, tsconfig.json, package.json, .env.example
```

### What's real vs. mocked

| Surface | State |
|---|---|
| Landing page | **Real.** Posts to `/api/waitlist` → `public.waitlist` row. |
| Waitlist API | **Real.** Validates email, inserts via anon key + RLS. |
| Sign-in (magic link + password) | **Real.** `/sign-in` has two tabs. Magic link uses Supabase email OTP; password uses `signInWithPassword`. Requires Site URL + redirect URL configured in Supabase Auth (see "Before pushing"). One admin account is pre-seeded — see "Admin account" below. |
| Auth-gating on `/dashboard`, `/heat-sheet`, etc. | **Real.** Middleware redirects to `/sign-in` if no session. |
| **Game Plan Run** (`runGamePlan` server action) | **Real.** First click bootstraps tenant + membership, inserts `game_plans` + `campaign_runs` + `consent_events` + `audit_log` rows, then loops the first 6 customers calling `claude-sonnet-4-6` for unique per-customer outbound and writing real `messages` rows (status `sent_mock`). 6-customer cap is a v0 limit — full 142-pool generation belongs in a Supabase Edge Function or Inngest queue. |
| Dashboard, Heat Sheet, Lens, Coach, Audit, Rep (read paths) | **Mock data only.** Pulled from `lib/mock.ts`. Each is its own follow-up slice. |

### Pixel parity

`globals.css` is a 1:1 port of the design system in `OpenRex.html` from the
Claude Design bundle: same CSS custom properties (`--orx-*`, `--app-*`),
same class names, same media queries. Re-using the prototype's class names
means React JSX matches the prototype's structure with minimal change.

## Admin account (pre-seeded)

A single admin user is already seeded in the live OpenRex Supabase project
so you can sign in immediately without going through magic-link flow:

- **Email:** `openrexadmin@dryvnagency.com`
- **Password:** `Dryvnagency2026`
- **Tenant:** `Dryvn Agency` (created at seed time)
- **Role:** `owner` (full membership row in `public.memberships`)

How it was seeded (for reference, do not re-run):

- `auth.users` row created via direct insert with `crypt(password, gen_salt('bf'))` (Supabase's bcrypt scheme); `email_confirmed_at = now()` so no verification gate.
- `auth.identities` row attached with provider `email` and `email_verified: true`.
- `public.tenants` + `public.memberships` rows inserted, owner role.

Because the membership pre-exists, the first `runGamePlan` click for this
account skips the auto-bootstrap branch and writes straight into the
seeded tenant.

**Rotate this password after first sign-in.** It was chosen for handoff
convenience and lives in chat history / commit messages — change it from
the Supabase dashboard (Authentication → Users → ⋯ → Send password
recovery, or set a new password via service role) before sharing the
project broadly.

## Before pushing — three Supabase Auth settings

In the Supabase dashboard for the OpenRex project (`dhtzhftxrszfccpqivga`),
under **Authentication → URL Configuration**:

1. **Site URL** — set to the production domain you want sign-in emails to
   point at (probably `https://open-rex.vercel.app` until you set up a
   custom domain).
2. **Redirect URLs** — add these allow-list entries:
   - `https://open-rex.vercel.app/auth/callback`
   - `http://localhost:3000/auth/callback` (for local dev)
3. **Email Auth** — confirm "Enable email signups" + "Enable email confirmations"
   are configured the way you want. The magic link flow uses `signInWithOtp`
   which auto-creates the user if not present.

## Vercel env vars

In the existing `open-rex` Vercel project (`prj_daw6oKWODm90qWx8a1Dr57KO4nVm`)
under **Settings → Environment Variables**, add for **Production** and
**Preview**:

```
NEXT_PUBLIC_SUPABASE_URL              = https://dhtzhftxrszfccpqivga.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  = sb_publishable_oeWH4BK61fe9uEyB4r7-KA_rDlwS70M
NEXT_PUBLIC_SITE_URL                  = https://open-rex.vercel.app
SUPABASE_SERVICE_ROLE                 = (Supabase dashboard → Settings → API → service_role secret)
ANTHROPIC_API_KEY                     = (console.anthropic.com → API keys → starts sk-ant-)
```

The `live.*` gates in `lib/env.ts` short-circuit features whose secrets
aren't pasted yet:
- Without `SUPABASE_SERVICE_ROLE` or `ANTHROPIC_API_KEY`, `runGamePlan`
  refuses to run (returns a friendly error to the builder).
- Without `NEXT_PUBLIC_SUPABASE_*`, the waitlist form silently no-ops.

## Two-command push to DryvnAgency/OpenRex

The Claude session can't push to OpenRex (GitHub MCP scope is restricted
to `dryvnagency/pocketrep`). From your terminal:

```bash
# 1. Clone the (mostly empty) OpenRex repo somewhere local
git clone https://github.com/DryvnAgency/OpenRex.git ~/code/OpenRex
cd ~/code/OpenRex

# 2. Copy this whole staging tree in. The starter is the new repo root.
cp -R /path/to/PocketRep/open-rex-docs/game-plan-starter/. .

# 3. Move apps/web's files up to the repo root if you want a single-app
#    layout (recommended for Vercel auto-detection):
mv apps/web/* apps/web/.* . 2>/dev/null
rmdir apps/web apps

# 4. First commit
git add .
git commit -m "feat: OpenRex Next.js app + Supabase Game Plan schema"
git push origin main
```

Vercel's `open-rex` project is already configured to deploy from the
linked GitHub repo — the push should kick off a deployment. (If it's not
linked yet: in the Vercel project's Settings → Git, connect to
`DryvnAgency/OpenRex`, branch `main`, root directory `/`.)

## Local dev

```bash
cd apps/web
cp .env.example .env.local
# Edit .env.local — paste real SUPABASE_SERVICE_ROLE
pnpm install      # or npm install / yarn
pnpm dev
# → http://localhost:3000
```

Sign-in works locally because `signInWithMagicLink` uses the request's
`origin` header, so the redirect comes back to localhost.

## What's NOT done (Phase 1+ work, multi-week)

Read paths for the 6 inner surfaces still use `lib/mock.ts`. The Game
Plan **write** path is real (see `lib/anthropic.ts` +
`app/(app)/game-plans/new/run.ts`). Remaining slices:

1. **JWT tenant claim** — `runGamePlan` currently uses the service role
   to bypass RLS. Migrate to Supabase Auth Hook that injects `tenant_id`
   as a JWT custom claim, so the publishable key honors RLS for normal
   reads. Bootstrap on first sign-in.
2. **Heat Sheet read** — replace `lib/mock.ts` reads with a Supabase
   query against `conversations` + `messages` joined, scoped to
   `tenant_id`. Subscribe to realtime updates.
3. **Dashboard read** — replace KPI mocks with `count` aggregates over
   `messages` and `campaign_runs`.
4. **Audit Vault read** — already structured; just swap source from
   `lib/mock.ts` to `audit_log` table.
5. **Pool generation worker** — lift `runGamePlan`'s per-customer loop
   into a Supabase Edge Function or Inngest job, drop the 6-customer cap,
   batch through full 142-customer pools at the carrier TPS limit.
6. **Rex Lens ingest API** — `app/api/ingest/contacts/route.ts` for the
   Chrome extension to POST scraped CRM rows. Service-role insert.
7. **Twilio webhook** — `app/api/twilio/inbound/route.ts` that handles
   STOP/HELP/START + customer replies, fires hybrid autonomy classifier.
8. **Hybrid autonomy classifier** — small Sonnet call on inbound to flag
   `simple_yesno` / `timing` / `substantive`, gate auto-replies vs.
   manager approval queue per the design's hard rules.
9. **Real send path** — flip `messages.status` from `sent_mock` to a
   real Twilio Messaging Service call once 10DLC clears.
10. **Stripe checkout** — `app/api/stripe/webhook/route.ts` → activates
    tenant on subscription creation.

This roughly matches Phases 1–3 of `open-rex-docs/GAME_PLAN_SECTIONS.md`.

## Bookkeeping

- Live Supabase project: `OpenRex` — `dhtzhftxrszfccpqivga` (us-east-1)
- Live Vercel project: `open-rex` — `prj_daw6oKWODm90qWx8a1Dr57KO4nVm`
- GitHub repo: `https://github.com/DryvnAgency/OpenRex`
- Marketing domain currently: `open-rex.vercel.app`

Outstanding warning (deferred, not blocking): citext extension is in the
`public` schema. Moving it would cascade-drop the `email` columns on
`contacts` and `waitlist`. Acceptable for v0.
