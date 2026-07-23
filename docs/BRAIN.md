# PocketRep — BRAIN 🧠 (everything core, one page)

> Single-screen mental model of PocketRep: what it is, how it's built, where things
> live, how it ships, and the traps. For *what to do next* see `MASTER_PLAN.md`; for
> *how the code works A→Z* see `HANDOFF.md`; for Rex detail see `openrex_handoff.md`.
> Last refreshed: 2026-06-29.

---

## 1. What it is
- A **pocket CRM + AI assistant ("Rex") for car sales reps** — a pocket-sized VinSolutions competitor. Contacts/"book", heat scoring, deal logging, nurture sequences, and a voice/aware AI that takes actions on the book.
- **Owner:** Eduardo (empr14@icloud.com). **Web:** `app.pocketrep.pro`.
- The core is **real and working**; it is **not launchable yet** — 5 blockers (web auth, anon-executable RPCs, open cron, fake data [fixed], billing loop). See `MASTER_PLAN.md` §TL;DR.

## 2. Stack
| Layer | Tech |
|---|---|
| App | Expo SDK ~51 · React Native 0.74.5 · React 18.2 · expo-router ~3.5 · TypeScript ~5.3 |
| Targets | **Web** (react-native-web ~0.19) **and native** iOS/Android — one codebase |
| Backend | **Supabase** — Postgres + owner-scoped RLS · Deno Edge Functions · pg_cron. Project ref `fwvrauqdoevwmwwqlfav` |
| AI | **OpenRouter**, reached only through the `ai-proxy` edge function (`BRAIN_MODELS`) |
| Hosting | **Vercel** (web: auto-deploys `main` + PR previews) · **EAS** (native builds) |
| Lint/types | ESLint 8.57 (`eslint-config-expo`) · `tsc --noEmit`. **No TS test runner.** |

## 3. Repo layout
```
PocketRepApp/                  ← the Expo app (all app-side code)
  app/                         ← expo-router routes
    _layout.tsx                ← picks v1 vs v2 via shouldUseNewUi()
    (tabs)/                    ← LEGACY v1 screens (contacts.tsx, …)
  components/v2/               ← the LIVE v2 UI (AppShell orchestrates)
  lib/v2/                      ← v2 logic + hooks (Rex, nurture, contacts, …)
  lib/featureFlags.ts          ← v1/v2 gate  ⚠️ GATED / off-limits
  constants/theme.ts           ← colors / spacing / radius
  supabase/functions/          ← Deno edge functions
  supabase/migrations/         ← SQL migrations
  scripts/*.mjs                ← node mirror tests (eslint-ignored)
  eas.json · app.json · vercel.json · package.json
docs/                          ← MASTER_PLAN.md · HANDOFF.md · openrex_handoff.md · BRAIN.md
eval/                          ← Promptfoo Rex eval scaffold (OUT of app CI scope)
.github/workflows/ci.yml       ← the CI gate
```

## 4. The two UIs ⚠️ (most common confusion)
- `app/_layout.tsx` → `shouldUseNewUi()` (from **`lib/featureFlags.ts`**, reads `EXPO_PUBLIC_NEW_UI=1` or web `?v=2`) → renders **`NewUiShell` → `components/v2/AppShell`** (the **live v2 UI**), else the legacy v1 `app/(tabs)` stack.
- **v2 is the real product.** v1 `(tabs)/*` is legacy, only reachable with the gate off.
- **Two unrelated "feature flag" files — don't mix them up:**
  - `lib/featureFlags.ts` = the **GATED** v1/v2 switch (off-limits to edit).
  - `lib/v2/rexFeatureFlags.ts` = **additive** `EXPO_PUBLIC_*` feature flags (safe, default off).

## 5. Rex — the AI assistant (the heart)
Pipeline:
```
useHeyRex (wake/listen)
  → rexInterpret  (builds prompt: BOOK STATE + screen context + rexMemory; wraps
                   untrusted CRM text via promptSafety.frameUntrusted)
  → aiProxy.callBrain / callBrainStream  → ai-proxy /brain → OpenRouter
  → parseAction   (fenced JSON → RexAction union; validates/normalizes)
  → client guards (never-guess disambiguation → clarify; chain allow-list)
  → executeAction → HeyRexSheet (confirm UI) → DB write → logRexAction
```
- **RexAction types:** `add_contact, update_notes, delete_contact, log_deal, schedule_followup, retier_contact, create_reminder, batch_action, show_contact, filter_contacts, book_summary, call_next, clarify, chain, say`.
- **Rex Lens** = camera/vision path (`fmtContact`, prompt-injection-hardened in P2-A2).
- **Key files:** `lib/v2/rexActions.ts` (core), `useHeyRex.ts`, `aiProxy.ts`, `components/v2/HeyRexSheet.tsx`, `rexMemory.ts`, `promptSafety.ts`.
- **Rex chat (gold orb):** `components/v2/RexCoach.tsx` + `lib/v2/coachBrain.ts` (persona + playbooks + `buildCoachMessages`) + `lib/v2/coachThread.ts` (durable thread). Behind `EXPO_PUBLIC_REX_CHAT` the persona is the spec "closer" (`buildRexSystemPrompt(rep)` — COACH default, LENS on pasted worklists, BLAST on mass-text asks, strict formatting, never-send boundary), replies **stream** via `callBrainStream`, and turns persist to `rex_messages` via `recordRexTurn` (one shared Rex memory with the voice path; today's thread reloads on open). Flag off → legacy floor-coach prompt, one-shot `callBrain`, localStorage-only day log (`coachLog.ts`).

## 6. Edge functions (`supabase/functions/`)
| Fn | Role | Notes |
|---|---|---|
| **ai-proxy** | the ONE AI gateway (brain / rexlens / streaming / `/stt` 501 stub) | `verify_jwt=false` (self-auths). `authAndPlan()` = auth → per-minute throttle (`bump_ai_minute`, fails **open**) → daily cost cap (`daily_ai_usage`). ~v32. |
| **nurture-scheduler** | pg_cron daily nurture + referral asks + push | `verify_jwt=false`, **`CRON_SECRET` unset = P0-3 blocker**. TZ-aware mode behind `SCHEDULER_HOURLY` (P2-A7, not deployed). |
| stripe-webhook | billing | ⚠️ **GATED** (prod-only, owner-owned). |
| **inventory-search** | Vehicle Finder: fetch + parse a dealership site's public inventory | `verify_jwt`-style (self-auths like send-push). **COMMITTED, NOT DEPLOYED.** SSRF-guarded user-URL fetch (the first in the repo); stateless, no DB, no secrets. Parse cascade JSON-LD→embedded-JSON→HTML. |
| ai-closer · support-reply · send-push · waitlist-notify | closer drafts · support · push · waitlist email | support-reply is in repo, not deployed. |

## 7. Data model (Postgres, owner-scoped RLS on all ~29 tables)
- **Core:** `contacts`, `profiles` (`plan`, `subscription_status`, `trial_ends_at`, `full_name`, `onboarding_complete`, `timezone`, `send_hour`), `deals`, `tags`, `pay_plans`.
- **Rex / nurture:** `rex_action_log`, `nurture_messages`, `contact_milestones`, `holiday_calendar`, `contact_sequences` (+ `sequence_steps`), `reminders`, `rex_followups` *(migration committed, NOT applied)*, `weekly_digests`.
- **Usage / limits:** `daily_ai_usage`, `ai_minute_usage` (P2-A2).
- **Misc:** `user_push_tokens`, `waitlist`, `contact_photos` (storage bucket).
- **SECURITY DEFINER RPCs:** `seed_marcus_for_user`, `increment_daily_usage`, `increment_rex_usage`, `handle_new_user` are `anon`-executable = **P0-2 blocker**. `bump_ai_minute` is locked to `service_role`.

## 8. Feature flags
**Client — `lib/v2/rexFeatureFlags.ts`** (build-time `EXPO_PUBLIC_*`, **all default OFF**; `envOn` true for `1/true/yes/on`):
| Flag | Enables |
|---|---|
| `EXPO_PUBLIC_REX_MULTISTEP` | Rex multi-step `chain` (P2-R3) |
| `EXPO_PUBLIC_REX_FAILURE_HONESTY` | spoken failure-recovery line (P2-R8); logging is always-on |
| `EXPO_PUBLIC_REX_ONBOARDING` | conversational first-run interview (P2-R1) vs the carousel |
| `EXPO_PUBLIC_REX_FOLLOWUP` | new-contact → Rex recap → 14-day rep-sent follow-up (also needs the migration applied) |
| `EXPO_PUBLIC_CONTACT_IMPORT` | "Add from phone" picker **and** the bulk-import (⇪) modal. **Set `1` in `eas.json` (native) AND `vercel.json` build.env (web).** |
| `EXPO_PUBLIC_REX_CHAT` | Rex chat v2: closer persona (COACH/LENS/BLAST in-prompt modes, parameterized rep, Eddie/Nissan-of-Omaha demo defaults), token streaming, durable `rex_messages` thread. **Set `1` in `eas.json` AND `vercel.json` build.env.** Off → RexCoach byte-identical. |
| `EXPO_PUBLIC_VEHICLE_FINDER` | Vehicle Finder (P2-V1): rep saves dealership URL (Profile → Dealership website), notes → AI+regex requirement extract → `inventory-search` edge fn reads site inventory → ranked matches + "You might like" near-misses. 🚗 modal + Rex `find_vehicles` pivot (voice+chat). **Also needs `inventory-search` deployed** (committed, NOT deployed). Off → no button/modal/action doc, byte-identical. Set `1` in `eas.json` AND `vercel.json`. |

**Server (ai-proxy env):** `BRAIN_TIERED` + `BRAIN_MODELS_FAST` (P2-R7), `AI_RATE_PER_MIN` (default 30). **Nurture:** `SCHEDULER_HOURLY`.

## 9. Env / build / deploy ⚠️ (where intuition fails)
- **`EXPO_PUBLIC_*` is build-time inlined by Metro** — it must be set *where each build reads env*, and a build must ship for it to take effect:
  - **Native (EAS):** set in the **EAS dashboard env** (where the real `EXPO_PUBLIC_SUPABASE_*` live — `eas.json`'s `env` only has empty placeholders) and/or `eas.json` build-profile `env`. Build: `eas build`. **Native modules (e.g. `expo-contacts`) ONLY work in a native build** — never web / Expo Go.
  - **Web (Vercel):** feature flags live **in-repo in `PocketRepApp/vercel.json` `build.env`** (the two-homes rule: every flag goes in BOTH `eas.json` and `vercel.json`); secrets (Supabase URL/anon key) stay in the Vercel dashboard env. Build = `npm run build:web` (`expo export --platform web`) → `dist`. **Vercel does NOT read `eas.json`.**
  - `.env` is **git-ignored** (never reaches a cloud build); `.env.example` is the template.
- **Vercel:** 2 projects — `pocket-rep` and `project-t90u1` (root = `PocketRepApp`). **Production auto-deploys from `main`**; previews from PR branches.
- **Supabase migrations and edge-function deploys do NOT happen on git merge** — the owner applies/redeploys them.

## 10. CI / quality gates
- `.github/workflows/ci.yml` on PR + push to `main`: `npm ci` → `npm run typecheck` (`tsc --noEmit`) → `npm run lint` (`eslint . --ext .ts,.tsx,.js,.jsx`), cwd `PocketRepApp`.
- **Baseline: 0 errors, 46 warnings.** `eval/` is out of scope; `scripts/` is eslint-ignored.
- No test runner → verification via committed node mirror tests: `npm run test:followup`, `test:chainguard`, `test:contactpick` (mock data only, no real PII).

## 11. Conventions & guardrails
- **Ship as stacked, additive, default-off** changes → production stays inert until a flag is flipped + a build ships.
- **Never fabricate:** no fake/seed data shipped to users, no collecting fields nothing consumes; honest empty states.
- **Prompt safety:** `promptSafety.frameUntrusted(label, body)` wraps attacker-influenceable CRM text so the model treats it as data, not instructions.
- **Owner-gated = hard stop** (don't touch without explicit go-ahead): the gated files (`stripe-webhook`, `lib/featureFlags.ts`), RPC `EXECUTE` grants, cron rows/secret, any live migration-apply / edge-fn redeploy / secret, schema-breaking changes, and vendor/product/cost decisions. `lib/v2/demoAuth.ts` was in this list until the owner explicitly lifted the hold for P0-1 (2026-07-16, real sign-in) — still auth-sensitive, still worth care, but no longer blanket off-limits.
- Web `Alert.alert` doesn't render buttons → use `window.confirm` on web (native keeps `Alert`).
- Commit trailers: `Co-Authored-By` + `Claude-Session`. Work branch pattern: `claude/<slug>-f0s519`.

## 12. Platform realities (recently bitten)
- **iOS Safari (web) cannot read device contacts** — Apple ships no Contacts Picker API. The "Add from phone" button is correctly hidden there; the native picker is the **native app** only.
- **Web "Add from phone" works only in Chrome on Android** (`navigator.contacts`); the true picker (`expo-contacts.presentContactPickerAsync`) is native-app only.
- An `eas.json` flag flip does **nothing** for the Vercel website (separate env source).

## 13. Current state (2026-07-16)
- Merged (flags off unless noted): all **P2-R1…R8** and **P2-A2…A7**; **Add from phone** (#93) + its flag activation (#94); **Rex chat v2 + PWA installability** (#95, closer persona / streaming / durable thread; `postexport-web.js` head injection + manifest + icons — note: `single-page` web output ignores `app/+html.tsx`) with `EXPO_PUBLIC_REX_CHAT=1` + `EXPO_PUBLIC_CONTACT_IMPORT=1` live in **both** flag homes (`vercel.json` build.env → web, `eas.json` → native) — web is installable (Add to Home Screen) on iPhone Safari + Android Chrome. **P2-R1 Rex-voice onboarding activated** (#96, `EXPO_PUBLIC_REX_ONBOARDING=1`, all four flag homes). **P0-1 real sign-in shipped** — `AppShell.tsx` no longer auto-signs visitors into the shared demo account; `AuthScreen.tsx` (email+password) is the default with an explicit "Try the demo" fallback; `handle_new_user()` no longer seeds a fake contact into real sign-ups (migration committed, NOT applied). Migrations committed **NOT applied**: `20260630_v2_future_proofing.sql` (role / store_id / payment targets), `20260716_v2_new_signup_no_fake_seed.sql`.
- **Still open (owner-gated):** P0-2 RPC grants · P0-3 cron secret · P0-5 billing (the paywall — `useAccessGate()` still fails open, so real sign-ups get full access with no subscription check yet). **Owner action for P0-1:** rotate the demo account's Supabase Auth password (can't be done from here) + set the real `EXPO_PUBLIC_V2_DEMO_EMAIL`/`_PASSWORD` in the Vercel/EAS dashboards (credentials, not committed like flags).
- Nothing new is user-visible until the owner ships the relevant build/deploy with the flag set in that build's env (except P0-1, which is live on merge — it's not flag-gated, it's the default auth path once the migration below is applied and the demo password is rotated).

## 14. Fast file index
| Need | File |
|---|---|
| App shell / routing / overlays | `components/v2/AppShell.tsx`, `app/_layout.tsx` |
| Sign-in / sign-up / demo fallback | `components/v2/AuthScreen.tsx`, `lib/v2/demoAuth.ts`, `lib/v2/localSessionClear.ts` (sign-out localStorage sweep) |
| Rex core logic | `lib/v2/rexActions.ts`, `lib/v2/useHeyRex.ts`, `lib/v2/aiProxy.ts` |
| Feature flags (safe) | `lib/v2/rexFeatureFlags.ts` |
| Contacts list / add / detail | `components/v2/ContactsTab.tsx`, `AddContactModal.tsx`, `ContactDetail.tsx` |
| Contact import / device picker | `lib/v2/contactImport.ts`, `components/v2/ImportContactsModal.tsx` |
| Vehicle Finder (match engine / orchestration / UI / edge fn) | `lib/v2/vehicleMatch.ts` (pure), `lib/v2/vehicleFinder.ts`, `components/v2/VehicleFinderModal.tsx`, `supabase/functions/inventory-search/index.ts` |
| Contact writes | `lib/v2/updateContact.ts` |
| AI gateway | `supabase/functions/ai-proxy/index.ts` |
| Nurture engine / cron | `supabase/functions/nurture-scheduler/index.ts`, `lib/v2/nurtureEngine.ts` |
| Roadmap / status (source of truth) | `docs/MASTER_PLAN.md` |
| Build/deploy config | `eas.json`, `vercel.json`, `app.json`, `.github/workflows/ci.yml` |
