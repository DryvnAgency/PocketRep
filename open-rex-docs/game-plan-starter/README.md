# Game Plan starter kit

Drop-in artifacts for the new `DryvnAgency/<rex-game-plan>` repo.
These files live here in PocketRep until Section 9 (repo scaffold)
ports them into their final home.

## What's here today

```
game-plan-starter/
  README.md              # this file
  .env.example           # Section 9 env template (placeholder pattern)
  migrations/
    0001_init.sql        # Section 10 — full schema + RLS + triggers
```

## Target repo layout (Section 9 deliverable)

When the new repo exists, the scaffold should look like this:

```
<rex-game-plan>/
  apps/
    web/                       # Next.js 14 (app router) — manager UI
      app/
        (auth)/
        game-plans/
          new/page.tsx         # Section 13 — Game Plan builder
          [id]/page.tsx
        heat-sheet/page.tsx    # Section 16 stub → Section 21 real
        review/page.tsx        # Section 20 — approval queue
        api/
          ingest/contacts/route.ts   # Section 14
          stripe/webhook/route.ts    # Section 23
      components/
      lib/
        env.ts                 # paste-to-activate helper
        supabase/
          server.ts            # @supabase/ssr server client
          middleware.ts
        gemini/
          generate.ts          # Section 15
          classify.ts          # Section 19
    extension/                 # Rex Lens v1, scraper-only
      manifest.json
      content/
        vinsolutions.ts        # Section 12 — Advanced Search adapter
      background.ts
      popup/
  supabase/
    migrations/
      0001_init.sql            # copy from starter kit
    functions/
      _shared/env.ts           # Deno port of lib/env.ts
      generate-drafts/         # Section 15 worker
      scheduler/               # Section 16 + 17
      twilio-webhook/          # Section 18
      cadence-nudge/           # Section 21
      stripe-webhook/          # Section 23
  packages/
    shared/                    # zod schemas, message templates,
                               #   brand-voice prompt builder
  vercel.json                  # cron entries (scheduler, cadence)
  .env.example                 # copy from starter kit
  package.json                 # pnpm workspace
  pnpm-workspace.yaml
  turbo.json                   # optional
  README.md
```

## Section → file mapping

| Section | Files this section creates / edits |
|---|---|
| 9 | Whole tree above; `.env.example`; `lib/env.ts`; `_shared/env.ts` |
| 10 | `supabase/migrations/0001_init.sql` (copy of starter) |
| 11 | `lib/supabase/{server,middleware}.ts`; first-sign-in trigger |
| 12 | `apps/extension/*` |
| 13 | `apps/web/app/game-plans/new/page.tsx` |
| 14 | `apps/web/app/api/ingest/contacts/route.ts` |
| 15 | `supabase/functions/generate-drafts/`; `lib/gemini/generate.ts` |
| 16 | `supabase/functions/scheduler/` (mock-send branch); Heat Sheet stub |
| 17 | `supabase/functions/scheduler/` (real-send branch) |
| 18 | `supabase/functions/twilio-webhook/` |
| 19 | `lib/gemini/classify.ts`; guardrail middleware in scheduler |
| 20 | `apps/web/app/review/page.tsx` |
| 21 | `apps/web/app/heat-sheet/page.tsx`; `supabase/functions/cadence-nudge/` |
| 22 | Lead-assignment UI; archive page |
| 23 | `apps/web/app/api/stripe/webhook/route.ts`; checkout button |
| 24 | `apps/web/app/onboarding/`; Loom + PDF (out of repo) |
| 25 | Dry-run punch list; first-tenant cutover script |

## Conventions the new repo will inherit

- `process.env.X.includes('PLACEHOLDER')` ⇒ integration is gated and
  falls back to mock. Never crash on missing keys.
- Every server-side action that touches a tenant row writes to
  `audit_log` via service-role client.
- Every outbound message body ends with the dealership disclosure
  footer; the template builder enforces this — no path skips it.
- All Gemini outputs are zod-validated server-side before insert.

## How to use this folder right now

The schema migration is the highest-leverage piece — it's complete,
idempotent, and runnable. Once Section 4 lands a Supabase project,
copy `migrations/0001_init.sql` into the new repo's
`supabase/migrations/` directory and apply it. Every downstream
section's code is shaped against this schema.
