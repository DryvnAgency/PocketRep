# Open Rex migration to DryvnAgency/OpenRex

`openrex-initial.bundle` is a git bundle (34 KB) containing a single commit
on `main` that mirrors what `DryvnAgency/OpenRex` should hold at the root.

**I cannot push directly** — this sandbox's MCP scope is
`DryvnAgency/PocketRep` only; probing the proxy for OpenRex returns
`repository not authorized`. Four commands from your machine finish the
migration.

## What's in the bundle (40 files)

- `backend/` — Next.js 14 dashboard + API routes, Gemini + Twilio + Supabase libs
- `backend/.env.local.example` — **your exact placeholder values**, ready to `cp`
- `backend/supabase/schema.sql` — dealers, customers, drafts, messages, appointment_signals
- `extension/` — Chrome MV3 source + prebuilt `open-rex-extension-v0.1.0.zip`
- `shared/` — types + Open Rex consultant-voice prompts
- `vercel.json` (root) — `buildCommand: cd backend && npm install && npm run build`, `outputDirectory: backend/.next`, framework nextjs. Works with Vercel Root Directory left at default.
- `README.md`, `.env.example`, `.gitignore`

## Run locally (4 commands)

```bash
# 1. Grab the bundle
curl -L -o ~/Downloads/openrex-initial.bundle \
  https://raw.githubusercontent.com/DryvnAgency/PocketRep/claude/add-handover-docs-fL4XU/migration/openrex-initial.bundle

# 2. Clone the empty OpenRex repo
git clone https://github.com/DryvnAgency/OpenRex.git && cd OpenRex

# 3. Pull the bundle into main and push
#    If OpenRex is empty (no commits), this is the right path:
git pull ~/Downloads/openrex-initial.bundle main --allow-unrelated-histories
git push -u origin main

# 4. Locally, copy the env.local.example to .env.local (gitignored)
cp backend/.env.local.example backend/.env.local
```

If `git pull` complains about conflicts because OpenRex has a placeholder
README/LICENSE, use the force path instead:

```bash
# Force the bundle's main as the new history
git fetch ~/Downloads/openrex-initial.bundle main:migrated
git checkout migrated
git branch -M main
git push -u --force origin main
```

## Vercel setup

Your env vars are already set. Two more things to verify:

1. **Root Directory** (Project Settings → General → Root Directory):
   - **Option A** (simpler): Leave at default. The committed `vercel.json`
     at repo root handles the monorepo via `cd backend && ...`.
   - **Option B**: Set Root Directory = `backend`. In that case Vercel
     ignores the root `vercel.json` and builds from `backend/` directly.
     Either works — don't do both or they'll fight.
2. **Redeploy** to pick up the new commit, then confirm:
   ```bash
   curl https://<deployment>.vercel.app/api/health
   ```
   Response should report `ok:true` with `env.supabase:true`, `env.gemini:true`.
   `twilio:false` is expected until 10DLC is approved and its env vars are filled.

## Supabase schema

Run once against the `fwvrauqdoevwmwwqlfav` project (or whatever project
you pointed `NEXT_PUBLIC_SUPABASE_URL` at):

1. Supabase SQL editor → paste `backend/supabase/schema.sql` → Run
2. Verify `customers`, `drafts`, `messages`, `dealers`,
   `appointment_signals` tables under `public`.

## Known limits with placeholder values

Placeholder `SUPABASE_SERVICE_ROLE_KEY=placeholder` and
`GEMINI_API_KEY=placeholder` let the build succeed but every API route
that calls Supabase or Gemini will 500 at runtime. `/api/health` still
reports `env.*:true` because it checks for non-empty env vars, not key
validity. Swap real keys in locally and in Vercel when you have them.

## Cleanup after verification

Once `DryvnAgency/OpenRex` is up and deploying:

1. Open a follow-up PR on DryvnAgency/PocketRep that removes `open-rex/`
   and `migration/` from this repo (keep `open-rex-docs/` as a pointer).
2. Redirect any internal links to the new repo.

The security-fix PR (#10) in PocketRep is independent of this migration.
