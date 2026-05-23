# Vercel project setup — v2 UI rollout

The new design-mockup port (PORT_PLAN.md, PRs #25–#38) ships through the
existing `project-t90u1` Vercel project, which already builds the Expo Web
output from `PocketRepApp/` on every commit.

No new Vercel project is needed.

## Current Vercel projects (for context)

| Project | Source | Domain | Build |
|---|---|---|---|
| `pocket-rep` | `Pocketrep/` (root) | `pocketrep.pro`, `app.pocketrep.pro` | Static (marketing site + static design mock at `/app`) |
| `project-t90u1` | `PocketRepApp/` | auto-generated `*.vercel.app` preview | `npm run build:web` → `dist/` (Expo Web SPA) |
| `his-palabra` | (unrelated project in the monorepo) | n/a | Unrelated; pre-existing failure ignored |

## Enable the v2 UI on `project-t90u1`

On every PR, `project-t90u1` deploys an Expo Web preview. To make those
previews show the v2 design-port:

**Option A — env var (default-on, recommended once we want all previews to show v2):**

1. Open the `project-t90u1` Vercel project → Settings → Environment Variables.
2. Add: `EXPO_PUBLIC_NEW_UI` = `1` (Production + Preview).
3. Trigger a redeploy (next push does it automatically).

Once set, every PR preview URL shows the v2 UI, every QA pass is against the
new build.

**Option B — runtime query param (default-off, ad-hoc):**

Append `?v=2` to any preview URL. Works without setting the env var. Useful
if you want some previews on v1 and some on v2 in parallel.

The flag flow is implemented in `PocketRepApp/lib/featureFlags.ts`.

## Native (EAS) builds — leave the env var UNSET

iOS/Android builds via EAS should NOT carry `EXPO_PUBLIC_NEW_UI=1` until the
cutover PR (#38). Production app users on the App Store / Play Store will
keep seeing the existing v1 UI through every v2 PR. EAS env vars are
configured in `eas.json` / EAS dashboard, separate from Vercel.

## Cutover plan (PR #38)

When v2 parity is reached:

1. **Set the EAS env vars** so the next native build ships v2 to App Store /
   Play Store users:
   ```
   eas env:create --scope project --variable EXPO_PUBLIC_NEW_UI --value 1 --environment production --environment preview
   ```
2. **Transfer the `app.pocketrep.pro` domain** from `pocket-rep` to
   `project-t90u1` in Vercel:
   - `pocket-rep` project → Settings → Domains → remove `app.pocketrep.pro`
   - `project-t90u1` project → Settings → Domains → add `app.pocketrep.pro`
3. **Static mock cleanup**: delete `Pocketrep/app/index.html` and friends
   from the marketing site repo (the design reference stays in `design/` at
   the repo root for historical reference).
4. **EAS submit** a new native build to TestFlight / internal track. Roll
   out gradually if comfort requires.

## Smoke checks after each v2 PR

Per safety-rail (b/c) in the autonomous-merge mandate:

```
# 1. Brain endpoint still 200
curl -s -X POST https://app.pocketrep.pro/api/brain ...   # (or via the
                                                          # Supabase edge URL
                                                          # — same handler)

# 2. v1 sign-in still works
# Open https://app.pocketrep.pro/ → log in → see Heat Sheet (v1)

# 3. v2 preview renders without console errors
# Open the project-t90u1 preview URL (?v=2 if env var not set) → see the
# new screen shipped in this PR.
```

If any of these fail, halt the next PR and report.
