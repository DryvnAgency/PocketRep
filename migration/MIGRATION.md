# Open Rex migration to DryvnAgency/OpenRex

This directory holds a one-shot migration artifact: `openrex-initial.bundle`,
a git bundle (33 KB) containing the `open-rex/` subfolder from PocketRep,
restructured so its contents sit at the root of a fresh standalone repo.

It is a **single-commit initial scaffold**, not a history rewrite. Rationale
is recorded in the commit body pointing back to PocketRep PR #8.

## What's in the bundle

- 39 files, 2,203 insertions
- Root layout matches what `DryvnAgency/OpenRex` should hold:
  - `backend/` (Next.js 14 dashboard + API routes)
  - `extension/` (Chrome MV3, including the prebuilt v0.1.0 zip)
  - `shared/` (types + Open Rex consultant-voice prompts)
  - `.env.example`, `.gitignore`, `README.md`
  - `backend/.env.local.template` — fill in and copy to `backend/.env.local`

## Push from your machine

You need a local shell with access to github.com — I cannot push from this
sandbox (MCP scope is `DryvnAgency/PocketRep` only).

```bash
# 1. Download the bundle from GitHub
# Easiest path: open the PR branch on GitHub, navigate to
# migration/openrex-initial.bundle, click "Download raw file". Save as
# ~/Downloads/openrex-initial.bundle.

# 2. Clone the empty (or near-empty) target repo
git clone https://github.com/DryvnAgency/OpenRex.git
cd OpenRex

# 3. Pull the bundle commit onto main
git pull ~/Downloads/openrex-initial.bundle main
# If the target repo is entirely empty and has no main branch yet:
#   git bundle unbundle ~/Downloads/openrex-initial.bundle
#   git reset --hard <commit-sha-printed-by-unbundle>

# 4. Push to GitHub
git push -u origin main

# 5. Fill in backend/.env.local
cp backend/.env.local.template backend/.env.local
# Edit backend/.env.local:
#   - NEXT_PUBLIC_SUPABASE_ANON_KEY  (Supabase dashboard -> Project Settings -> API)
#   - SUPABASE_SERVICE_ROLE_KEY      (same page)
#   - GEMINI_API_KEY                 (https://aistudio.google.com/apikey)
# Leave Twilio blank until 10DLC A2P brand + campaign approved.

# 6. Local dev smoke test
cd backend
npm install
npm run dev
# Hit http://localhost:3000/api/health — confirms env wiring.
```

## Vercel setup

I cannot reach your Vercel account. Set these up in the Vercel dashboard
against the new `DryvnAgency/OpenRex` project:

1. **Project root**: `backend/` (Next.js lives there; not at the repo root).
   Vercel -> Project Settings -> Build & Development Settings -> Root Directory = `backend`.
2. **Environment variables** (Project Settings -> Environment Variables,
   scope: Production + Preview + Development):
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://fwvrauqdoevwmwwqlfav.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `<anon key>`
   - `SUPABASE_SERVICE_ROLE_KEY` = `<service_role key>`
   - `GEMINI_API_KEY` = `<gemini key>`
   - `GEMINI_MODEL` = `gemini-2.5-flash`
   - `DASHBOARD_AUTH_SECRET` = `<generate a strong random secret for prod>`
   - Twilio vars: leave blank until 10DLC approved, then fill.
   - `DEALER_ALERT_PHONE` = `<your phone in E.164>`
3. **Redeploy** to pick up the new env vars.
4. **Verify build**: Deployments tab -> latest deploy -> Build Logs shows
   green. Then hit `<deployment>.vercel.app/api/health` — response should
   report `ok:true` with `env.supabase=true`, `env.gemini=true`.

## Supabase setup (first time only)

If you haven't already run the schema against the PocketRep Supabase project
(or if Open Rex lives in its own project):

1. Supabase SQL editor -> paste contents of `backend/supabase/schema.sql` -> Run.
2. Confirm `customers`, `drafts`, `messages`, `dealers`, `appointment_signals`
   tables exist under `public`.

## What this migration does NOT touch

- The `open-rex/` folder stays in the PocketRep repo for now. Safe to
  delete in a follow-up PR once `DryvnAgency/OpenRex` is confirmed up
  and running. Don't delete it until that's confirmed.
- The security-fix PR (#10) in PocketRep is independent of this migration.

## Rolling this back

If the target repo is wrong or you want to start over:

```bash
cd OpenRex
git checkout --orphan fresh
git rm -rf .
git commit --allow-empty -m "reset"
git push origin fresh:main --force
```

Then start again from step 1.
