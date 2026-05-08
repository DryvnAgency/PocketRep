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
│       └── rep/page.tsx
├── components/{StatusPill, Waitlist}.tsx
├── lib/
│   ├── env.ts                           # paste-to-activate gate helper
│   ├── mock.ts                          # mocked entities, swap to Supabase reads later
│   └── supabase/{client, server}.ts     # SSR helpers
├── middleware.ts                        # session refresh + route guard
├── next.config.ts, tsconfig.json, package.json, .env.example
```

### What's real vs. mocked

| Surface | State |
|---|---|
| Landing page | **Real.** Posts to `/api/waitlist` → `public.waitlist` row. |
| Waitlist API | **Real.** Validates email, inserts via anon key + RLS. |
| Sign-in (magic link) | **Real.** Supabase email OTP. Requires Site URL + redirect URL configured in Supabase Auth settings (see "Before pushing" below). |
| Auth-gating on `/dashboard`, `/heat-sheet`, etc. | **Real.** Middleware redirects to `/sign-in` if no session. |
| Dashboard, Heat Sheet, Game Plan Builder, Lens, Coach, Audit, Rep | **Mock data only.** Pulled from `lib/mock.ts`. Wire each surface to Supabase tables in Phase 1. |

### Pixel parity

`globals.css` is a 1:1 port of the design system in `OpenRex.html` from the
Claude Design bundle: same CSS custom properties (`--orx-*`, `--app-*`),
same class names, same media queries. Re-using the prototype's class names
means React JSX matches the prototype's structure with minimal change.

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
SUPABASE_SERVICE_ROLE                 = (paste from Supabase dashboard → Settings → API → service_role secret)
```

The `live.supabase` gate in `lib/env.ts` only flips on once both
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are
non-placeholder, so the app boots harmlessly without secrets — the
waitlist form silently no-ops in that mode.

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

## What's NOT done (Phase 1 work, multi-week)

The 6 app surfaces all read from `lib/mock.ts`. To take it from "real auth
+ real waitlist" to "real product":

1. **Tenancy bootstrap** — when a new user signs in for the first time,
   create a `tenants` row + `memberships` row, write `tenant_id` into the
   user's JWT custom claim. RLS policies are already keyed off this claim.
2. **Heat Sheet** — replace `lib/mock.ts` reads with `supabase.from('conversations')`
   + `messages` joined query, scoped to `tenant_id`.
3. **Game Plan run path** — server action that creates `game_plans` +
   `campaign_runs` + `campaign_contacts` rows, writes attestation to
   `audit_log` + `consent_events`.
4. **Rex Lens (Chrome extension)** — separate codebase. Posts scraped
   rows to `/api/ingest/contacts` (route doesn't exist yet — will need
   service-role insert).
5. **Twilio webhook** — `app/api/twilio/inbound/route.ts` that handles
   STOP/HELP/START + replies. Needs 10DLC + Messaging Service first.
6. **Gemini message generation** — server worker that reads pending
   `campaign_contacts`, calls Gemini per row, writes drafts to `messages`
   with `approval_state = 'queued'`.
7. **Hybrid autonomy classifier** — small Gemini call on inbound to flag
   `simple_yesno` / `timing` / `substantive`, gate auto-replies.
8. **Stripe checkout** — `app/api/stripe/webhook/route.ts` → activates
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
