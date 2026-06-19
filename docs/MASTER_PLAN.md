# PocketRep — Master Plan (single prioritized source of truth)

**Created**: 2026-06-12 · **Owner**: Eduardo (empr14@icloud.com)
**Scope**: consolidates the **Rex 2.0 upgrade roadmap** (product/architecture) and the **2026-06 production-readiness audit** into one prioritized backlog.
**Companion docs**: `HANDOFF.md` (how the system works today — A→Z), `openrex_handoff.md` (Rex 2.0 detail). This file does **not** replace them; it sequences the work and assigns ownership.

> Reading order for a new agent: this file for *what to do next and who owns it* → `HANDOFF.md` for *how the code works* → the relevant source.

---

## TL;DR

PocketRep's core is real and working (v2 UI, Rex tool-use, nurture engine + referral asks, deal logging, RLS owner-scoped on all 29 tables, Stripe checkout + a signature-verified webhook). **It is not launchable today** for one product reason and four hardening reasons — the **5 launch blockers**:

1. **No real web auth** — `app.pocketrep.pro` auto-signs everyone into the shared `demo@pocketrep.pro` account; v1 auth screens are unreachable. Every web "user" writes into one demo book. *(Blocked by constraint: `demoAuth.ts`/`featureFlags.ts` are off-limits this session.)*
2. **Cross-tenant SECURITY DEFINER RPCs** — `seed_marcus_for_user`, `increment_daily_usage`, `increment_rex_usage`, `handle_new_user` are `anon`-executable (verified live). Anyone with the public anon key can inject contacts into any account or burn another user's AI cap. *(Parked — needs the RPC-grant decision; not in the safe bucket.)*
3. **Open cron** — `nurture-scheduler` is `verify_jwt=false` and `CRON_SECRET` is unset (a secretless call executed it this session). *(Parked — prod-secret change, Eduardo's action.)*
4. **Hardcoded fake data shipping to users** — names, streaks, quotas, renewal dates, version string, fake appointment. *(Safe — shipping now.)*
5. **Billing-loop holes** — webhook matches payers by email; `trial_ends_at` not enforced; cancel → `pro` (the signup default) so paid/cancelled/trialing are indistinguishable. *(Blocked by constraint: Stripe/billing off-limits.)*

Underneath everything: **zero tests, zero lint, no CI gate beyond Vercel builds**, and repo↔prod drift (deployed `stripe-webhook` v15 + `ai-closer` v26 have no source in git; repo's `support-reply` isn't deployed).

**Two work tracks run in parallel:**
- **Track A — Launch hardening (audit):** close the 5 blockers + the P0/P1 list. Mostly small, several blocked on Eduardo decisions (auth UX, free-tier semantics, dev accounts).
- **Track B — Rex 2.0 (roadmap):** the product leap (voice onboarding, architecture overhaul, on-device STT, eval gate). Larger, mostly agent-buildable, a few decisions (STT vendor).

**Recommended sequence:** ship the **safe bucket** now (this PR) → Eduardo unblocks the **auth + cron + RPC-grant + billing** decisions (P0) → then Rex 2.0 Phase 1 (the user-visible roadmap wins) in parallel with the architecture overhaul.

---

## Legend

**Owner**
- `Agent` — an agent can do it autonomously (no decision, no forbidden files, no prod secrets).
- `Agent⟵decision` — agent builds it *after* Eduardo decides the open question.
- `Eduardo: DECISION` — needs a product/architecture call before anyone builds.
- `Eduardo: ACTION` — needs Eduardo in an external system (Stripe/Apple/Google/Resend dashboards, set a secret).

**Status / flags**
- 🟢 `safe-bucket` — shipping in the current draft PR (no decisions, no forbidden files, no prod secrets).
- 🔒 `BLOCKED-constraint` — off-limits under current session constraints (`auth`/`demoAuth.ts`/`featureFlags.ts`, Stripe/billing).
- ⚖️ `needs-decision` — has an open question only Eduardo can answer.
- 🔑 `prod-secret` — requires a production secret / external-dashboard change.

---

## Master priority table

### P0 — launch blockers (do before any real user signs in)

| # | Item | Source | Files / surface | Owner | Flags |
|---|---|---|---|---|---|
| P0-1 | **Real web auth** — sign-in/up in the v2 shell; demote demo to an explicit "Try the demo" path; rotate the demo password | audit | `components/v2/AppShell.tsx`, new auth screens, `lib/v2/demoAuth.ts`, `lib/featureFlags.ts` | `Eduardo: DECISION` (magic-link vs password; does demo stay public?) then `Agent⟵decision` | 🔒 ⚖️ |
| P0-2 | **Revoke `anon`/`authenticated` EXECUTE on SECURITY DEFINER RPCs** (`seed_marcus_for_user`, `increment_daily_usage`, `increment_rex_usage`, `handle_new_user`, `handle_new_auth_user`, `notify_waitlist_signup`, `rls_auto_enable`) | audit | migration (no app code) | `Agent⟵decision` (confirm nothing client-side calls them via RPC) | ⚖️ |
| P0-3 | **Lock the cron** — set `CRON_SECRET`, add header to both `cron.job` rows | audit | Supabase secret + `cron.job` | `Eduardo: ACTION` | 🔑 |
| P0-4 | **Fake-data sweep** — replace hardcoded values with real data or empty-state CTAs | audit | `ProfileTab.tsx`, `CustomNavBar.tsx`, `HeatSheetTab.tsx`, `repSettings.ts` | `Agent` | 🟢 |
| P0-5 | **Close the billing loop** — commit webhook to git; match by `stripe_customer_id`/`client_reference_id` not email; enforce `trial_ends_at`; define cancelled/expired tier | audit | `stripe-webhook` (prod-only source), `profiles` | `Eduardo: DECISION` (free-tier semantics) + `Eduardo: ACTION` (verify endpoint + `STRIPE_WEBHOOK_SECRET` in Stripe) | 🔒 ⚖️ 🔑 |
| P0-6 | **Minimum CI floor** — GitHub Actions running `tsc --noEmit` + ESLint on PRs | audit | `.github/workflows/`, `package.json`, eslint config | `Agent` | 🟢 |

### P1 — before general availability

| # | Item | Source | Files / surface | Owner | Flags |
|---|---|---|---|---|---|
| P1-1 | **Retry + pull-to-refresh + distinguish failed-vs-empty** in loaders | audit | `AppShell.tsx`, `useUserDeals.ts`, `useContacts.ts`, `useSequences.ts`, `HeatSheetTab.tsx`, `MetricsTab.tsx` | `Agent` | 🟢 |
| P1-2 | **Sign-out confirmation** | audit | `ProfileTab.tsx` | `Agent` | 🟢 |
| P1-3 | **KeyboardAvoidingView on mobile modals** | audit | `AddContactModal.tsx`, `DealLogger.tsx` | `Agent` | 🟢 |
| P1-4 | **Web back-button handling for overlays** | audit | `AppShell.tsx` | `Agent` | 🟢 |
| P1-5 | **Validate brain JSON before writes** — action-enum + `contact_id` existence in `parseAction()` before `insertDeal`/`sequence_steps` | audit | `lib/v2/rexActions.ts` | `Agent` | 🟢 |
| P1-6 | **Error tracking** — wire the existing dead `logger.ts` sink to Sentry (or similar) | audit | `lib/v2/logger.ts`, app entry | `Agent⟵decision` (vendor) | ⚖️ |
| P1-7 | **DB hygiene** — drop duplicate `contacts` policy + duplicate index; index hot FKs; `(select auth.uid())` RLS rewrite | audit | migration | `Agent` | 🟢 |
| P1-8 | **Enable leaked-password protection**; rate-limit/captcha waitlist insert; verify Resend funnel | audit | Supabase Auth config, `waitlist` policy, `waitlist-notify` | `Eduardo: ACTION` (Auth toggle + Resend) + `Agent` (rate-limit) | 🔒 (waitlist form) 🔑 |
| P1-9 | **Legal/account basics** — ToS + privacy pages, account-deletion path (App Store requires), support email | audit | marketing site + app | `Eduardo: ACTION` + `Agent` | 🔒 (landing copy) |
| **P1-R1** | **Heat Sheet reason codes** — why each contact is hot/at-risk today | roadmap | `HeatSheetTab.tsx`, scoring in `lib/v2` | `Agent` | ✅ done |
| **P1-R2** | **Fix `unit_bonus_tiers` in commission math** + surface in Metrics | roadmap | `lib/v2/payPlan.ts`, `MetricsTab.tsx` | `Agent` | ✅ done |
| **P1-R3** | **Wire the morning Heat Sheet push** (daily 8am-local summary) | roadmap | `nurture-scheduler` (or new fn), `pushNotifications.ts` | `Agent` (cron secret is P0-3) | 🔑 (shares cron) |
| **P1-R4** | **One-tap reply sentiment** — collapse the 4-way panel into one tap | roadmap | `MarkReplyButton.tsx`, `manualReplyTracker.ts` | `Agent` | ✅ done |
| **P1-R5** | **Sequence enrollment button on ContactDetail** (closes "0 enrollments ever") | roadmap | `ContactDetail.tsx`, `useSequences.ts`, `contact_sequences` | `Agent` | ✅ done |

### P2 — post-launch / Rex 2.0 architecture + native

| # | Item | Source | Files / surface | Owner | Flags |
|---|---|---|---|---|---|
| **P2-R1** | **Voice onboarding rebuild** — replace CSV-import-first with a Rex interview as step 1 | roadmap | `Onboarding.tsx`, new Rex interview flow, `rexActions.ts` | `Agent⟵decision` (scope of interview) | ⚖️ |
| **P2-R2** | **Screen/state awareness** ✅ — Rex's prompt now includes the active tab + open contact so it resolves "this"/"her" in context (additive; nothing removed) | roadmap | `useHeyRex.ts`, `rexActions.ts`, `AppShell.tsx` | `Agent` | ✅ done |
| **P2-R3** | **Multi-step tool chaining w/ single batch-confirm** ✅ — behind `EXPO_PUBLIC_REX_MULTISTEP` (default off → prompt byte-identical). When on, a multi-intent utterance returns a `chain` of 2+ confirmable writes; steps are normalized + validated to a chainable allow-list (no nesting), run in order stop-on-failure, summarized as a numbered list under one Confirm | roadmap | `rexActions.ts`, `rexFeatureFlags.ts`, `AppShell.tsx` | `Agent` | ✅ done (flag off) |
| **P2-R4** | **Disambiguation / never-guess** ✅ — client guard converts an ambiguous-name contact action into `clarify`+candidates; HeyRexSheet renders the tappable pick-list | roadmap | `rexActions.ts`, `HeyRexSheet.tsx` | `Agent` | ✅ done |
| **P2-R5** | **150-utterance Promptfoo eval suite** as a regression gate in CI | roadmap | new `eval/`, CI | `Agent` (builds on P0-6 CI) | 🟡 scaffold shipped (~26 seed cases, `npx`/no committed dep, opt-in `workflow_dispatch`); **blocking gate deferred** — needs `OPENROUTER_API_KEY` secret + per-run AI cost decision (owner) |
| **P2-R6** | **On-device STT** replacing the `/stt` 501 stub (also fixes v1 calling a nonexistent `/whisper` route) | roadmap + audit | `ai-proxy`, native STT module, `speech.ts` | `Eduardo: DECISION` (vendor: native/on-device vs Whisper API) then `Agent⟵decision` | ⚖️ |
| **P2-R7** | **~2s latency budget w/ tiered model routing** ✅ (code only, not deployed) — behind `BRAIN_TIERED` (default off → byte-identical). When on, a `{tier:'fast'}` request (Hey Rex voice) routes to `BRAIN_MODELS_FAST`; double no-op (unset fast list also falls back to default). Client `callBrain`/`callBrainStream` gain an optional `tier`; Hey Rex requests `fast`. Activation = redeploy + `BRAIN_TIERED=1` + `BRAIN_MODELS_FAST` | roadmap | `ai-proxy`, `aiProxy.ts`, `rexActions.ts` | `Agent` | ✅ done (flag off, **redeploy owner-gated**) |
| **P2-R8** | **Failure-honesty recovery messages** logged to `rex_action_log` ✅ — failure reason now always captured in the log (`action_payload._rex_failure_reason`, no schema change); chain failures logged `partial`. Honest SPOKEN recovery line (Rex corrects its optimistic "done") behind `EXPO_PUBLIC_REX_FAILURE_HONESTY` (default off → unchanged failure UX) | roadmap | `rexActions.ts`, `useHeyRex.ts`, `rexFeatureFlags.ts` | `Agent` | ✅ done (spoken part flag-off; logging always-on) |
| **P2-R9** | **Siri App Intents** as a free front-end | roadmap | native iOS (App Intents), EAS | `Agent⟵decision` (native track) | ⚖️ (native) |
| P2-A1 | Native track — fill `eas.json`, Apple/Google accounts, push entitlements, photo-lib permission string, kill-or-gate v1 | audit | `eas.json`, `app.json`, `app/` | `Eduardo: ACTION` (dev accounts) + `Agent` | ⚖️ 🔑 |
| P2-A2 | **Per-minute AI throttle + prompt-injection hardening** (treat CRM text as untrusted, cap lengths) — streaming-usage fix carved to P2-A6 | audit | `ai-proxy` | `Agent` | ✅ done |
| P2-A3 | **Per-rep timezone + daily send hour** (data model + Profile setting) — scheduler local-time gating split to P2-A7 | audit | `profiles`, `ProfileTab.tsx`, `sendTime.ts` | `Agent` | ✅ done |
| P2-A4 | **Bring deployed reality into git** — ✅ committed `ai-closer` source + reconciled `nurture-scheduler` git→deployed v8 (+ its `nurture_kind` migration); `support-reply` documented (in repo, not deployed); `stripe-webhook` left owner-owned (gated). Open: keep-or-delete `ai-closer`; deploy-or-delete `support-reply` | audit | `supabase/functions/` | `Agent` (commit done) / `Eduardo: DECISION` | ⚖️ |
| P2-A5 | **Audit-log viewer for `rex_action_log`** ✅ (Rex Activity screen) · Expo SDK 51→ upgrade split to P2-A8 | audit | new UI; deps | `Agent` | ✅ (viewer) |
| P2-A6 | **Streaming-usage metering** (carved from P2-A2) — ⏸️ **deferred**: `flush()` meters completed streams correctly but records nothing on early client disconnect (flush never fires) → under-counts. Needs a **staging repro + a disconnect-cost decision** (tee+read-to-completion = pay for unseen tokens, vs delta-estimate = imprecise) before touching the live stream path | audit | `ai-proxy` | `Agent⟵decision` | ⚖️ |
| P2-A7 | **Scheduler honors `profiles.timezone`/`send_hour`** — ✅ code shipped behind `SCHEDULER_HOURLY` flag (off = unchanged daily behavior): per-rep local-hour gating + local date/Monday. **Inert until** owner redeploys + sets `SCHEDULER_HOURLY=1` + flips the cron daily→hourly | roadmap+audit | `nurture-scheduler` | `Agent` (code done) + `Eduardo: ACTION` (redeploy + cron) | ✅ 🔑 |
| P2-A8 | **Expo SDK 51 → upgrade** (split from P2-A5) — multi-package cascade (expo/RN 0.74→/expo-router/all `expo-*`); not safely doable blind, needs a validated app run | audit | `package.json`, deps | `Agent⟵decision` (run + test) | ⚖️ |

---

## Decisions Eduardo owns (nothing ships on these until answered)

1. **Auth UX** (P0-1) — magic-link vs email+password; does the public demo stay (and where)?
2. **Free-tier / plan semantics** (P0-5) — what does a cancelled or expired subscriber get? Today everyone defaults to `pro`, so there is effectively no lower tier.
3. **STT vendor** (P2-R6) — on-device/native STT vs a hosted Whisper-style API (cost vs privacy vs latency).
4. **Dev accounts** (P2-A1/R9) — Apple Developer Program + Google Play Console (needed for TestFlight/Play, push certs, Siri Intents).
5. **Error-tracking vendor** (P1-6) — Sentry vs alternative.
6. **`ai-closer` fate** (P2-A4) — it's deployed (v26) with no source in git; keep+commit or delete?

## Actions Eduardo owns (external systems — an agent can't reach them)

- **P0-3 / P1-R3**: set `CRON_SECRET` and add it to `cron.job`.
- **P0-5**: verify the Stripe webhook endpoint + `STRIPE_WEBHOOK_SECRET` are registered in the Stripe dashboard.
- **P1-8**: toggle Supabase Auth leaked-password protection; confirm Resend domain/secrets.
- **P2-A1**: Apple/Google developer accounts + signing credentials.

## Parked under current session constraints (🔒)

Cannot be touched in the current PR series: **auth / `demoAuth.ts` / `featureFlags.ts`** (P0-1) and **Stripe / billing** (P0-5). The safe-bucket PR explicitly avoids all of these.

---

## Integrations: wired vs. stubbed (from the audit)

| Service | Status | Note |
|---|---|---|
| Supabase (auth/DB/storage/functions) | **Live** | RLS solid; `contact-photos` bucket is public-read + listable |
| OpenRouter (Grok→Kimi) | **Live** | `ai-proxy/brain` + `nurture-scheduler`; daily cost cap only |
| Anthropic direct (Claude) | **Live** | RexLens routes inside `ai-proxy` (`REXLENS_API_KEY`) — undocumented in HANDOFF |
| Stripe checkout | **Live** | 3 payment links on landing page |
| Stripe webhook | **Live, source not in git** | Verifies signatures; matches payers by **email**; `payment_failed` is a logged no-op |
| Expo Push | **Wired, unproven** | 0 tokens ever registered; web no-ops by design |
| Resend (waitlist email) | **Wired, unverifiable** | silently returns 200 if secrets unset; 0 waitlist rows to date |
| Twilio inbound (`support-reply`) | **In repo, NOT deployed** | tracked; ready to wire (deploy-or-delete is Eduardo's call) |
| `ai-closer` | **Deployed v26, source now in git (P2-A4)** | legacy v1 Rex closer (reads legacy `users` table + `increment_rex_usage`/`rex_usage`); keep-or-delete still open |
| STT / TTS | **501 stubs** | v1 Rex tab calls a nonexistent `/whisper` route and silently no-ops |
| Calendar / analytics / Sentry | **Absent** | the fake "1 appt at 2:30" implies a calendar that doesn't exist |

## UI/UX flow fixes (from the audit — folded into P0-4 / P1-1..4)

Fake-data inventory (P0-4): `ProfileTab` name fallback "Jake Morales", "34 MO STREAK" (+ `CustomNavBar`), "PLAN · … ANNUAL / Renews Aug 12 2026", "22 / 32" quota, "v3.2.4 · build 1042", `repSettings` DEFAULTS (dealership/title/phone/security/data-sources/custom-prompts/inventory-feed); `HeatSheetTab` "1 appt at 2:30". Flow fixes (P1-1..4): retry + pull-to-refresh, failed-vs-empty loaders, sign-out confirm, keyboard avoidance, web back button, overlay-close-on-tab-change, root-only error boundary, hardcoded safe-area, desktop modal max-width, WCAG-AA contrast on small gold-bg text, missing a11y labels.

---

## Live snapshot (why fixing schema/auth now is cheap)

As of 2026-06-09: 7 users (6 testers + demo), 18 contacts, 30 deals (all demo), **0 push tokens**, **0 waitlist rows**, **0 sequence enrollments**, 2 weekly-active AI users, ~13¢/week AI spend. Almost no real data to migrate — the cheapest moment to harden auth, RLS, and schema.

---

## Gated P0 — Eduardo only (exact specs)

Eduardo's three P0 decisions (2026-06-13): **(1)** STT = on-device native (iOS Speech / Android SpeechRecognizer), no cloud vendor; **(2)** billing = **HARD LOCKOUT** (a cancelled sub or expired trial cannot use the app — re-pay to regain access, no free tier); **(3)** auth = real per-user sign-in/up replacing the shared demo, with the lockout gate for non-payers. **Auth method (confirmed 2026-06-13): email + password** (password-based, like v1; **no OAuth, no magic-link**) — `AuthScreen` already implements exactly this, so G1/G3 must keep email+password.

**Already shipped** in the STT/auth-scaffolding PR (touches no gated files): on-device STT (`lib/v2/sttDictation.ts` + `.native.ts`, wired into `app/(tabs)/rex.tsx`, `@react-native-voice/voice` + plugin); the `AuthScreen` + `LockoutScreen` UI; the `accessGate` hook + `decideAccess()` policy; an **inert** lockout gate in `AppShell` (returns `allowed`). The three items below are what remains and **only Eduardo** should land (they touch `demoAuth.ts` / billing).

### G1 — Demote the shared demo to explicit opt-in
- **Files**: `lib/v2/demoAuth.ts`, `components/v2/AppShell.tsx` (boot), optionally `lib/featureFlags.ts`.
- **Change**: `ensureDemoSession()` must NOT auto-sign-in on every mount. Gate it behind an explicit signal only (e.g. `?demo=1` / a "Try the demo" button), so the default boot has **no session** → `AppShell` renders `<AuthScreen/>`.
- **Acceptance**: fresh load of `app.pocketrep.pro` with no session shows `AuthScreen` (not the demo book); `?demo=1` still loads the seeded demo; real sign-in/up creates/uses a per-user session; the demo account can no longer be reached without the explicit opt-in.

### G2 — Hard-lockout billing state (webhook + schema)
- **Files**: `supabase/functions/stripe-webhook/index.ts` (source not yet in git — commit it), a migration adding the gating field.
- **Status model (source of truth)**: add `profiles.subscription_status text` (mirror of the Stripe subscription status: `active | trialing | past_due | canceled | unpaid | incomplete_expired`). `trial_ends_at` stays the trial fallback. **`subscription_status` is the field that gates access.**
- **Webhook must set**: on `checkout.session.completed` → `subscription_status='active'` (+ existing plan/`stripe_customer_id`, clear `trial_ends_at`); on `customer.subscription.updated` → mirror `sub.status`; on `customer.subscription.deleted` → `subscription_status='canceled'` (do **not** silently reset `plan='pro'` — that's what makes paid/cancelled indistinguishable today); on `invoice.payment_failed` → `subscription_status='past_due'`. Match by `stripe_customer_id`/`client_reference_id`, not email.
- **Acceptance**: cancelling a sub in Stripe flips `profiles.subscription_status='canceled'` within the webhook; an expired trial (no active sub, `trial_ends_at` in the past) is distinguishable from an active payer; no code path resets a cancelled user to a usable state.

### G3 — Wire the lockout gate to real state
- **Files**: `lib/v2/accessGate.ts` (the single `TODO(Eduardo)` in `useAccessGate`), `components/v2/AppShell.tsx` (the unauthenticated branch + `onResubscribe`).
- **Change**: in `useAccessGate`, read `supabase.auth.getUser()` then `profiles.subscription_status` + `trial_ends_at` and return `decideAccess({...})` (the policy is already written + the lockout reasons mapped). In `AppShell`, render `<AuthScreen/>` when there's no session, and set `LockoutScreen`'s `onResubscribe` to open Stripe checkout/billing portal.
- **Acceptance**: `decideAccess` already maps `active|trialing→allowed`, `canceled→subscription_canceled`, `past_due|unpaid→payment_failed`, expired/none→`trial_expired|no_subscription`; once wired, a cancelled/expired user sees `LockoutScreen` and cannot reach any tab until `subscription_status` returns to `active`; a paying user is never locked out; unauthenticated users see `AuthScreen`.

---

## Change log

- **2026-06-12** — created; merges Rex 2.0 roadmap + 2026-06 production-readiness audit. Safe-bucket items (P0-4, P0-6, P1-1..5, P1-7) shipping in the accompanying draft PR; the rest sequenced above.
- **2026-06-13** — added §"Gated P0 — Eduardo only" with exact specs (G1 demote demo, G2 hard-lockout billing state, G3 wire the gate) after Eduardo's 3 decisions. On-device STT + auth/lockout UI scaffolding shipped in a separate stacked draft PR. Auth method confirmed: email + password (no OAuth/magic-link).
- **2026-06-15** — P1-R2 shipped: `unit_bonus_tiers` now actually applied (`unitBonusFor`/`nextUnitBonusTier` in `payPlan.ts`) and surfaced in Metrics (this-month bonus + next-tier nudge + YTD addendum). Per-deal commission math unchanged (tiers are a monthly aggregate). Stacked draft PR.
- **2026-06-15** — P1-R1 shipped: Heat Sheet reason codes (`lib/v2/heatReasons.ts`) — each row shows the top 1-2 reasons it's hot/at-risk (lease end, silence, timeline, birthday, rep decision, past customer, trade-in, referral), derived strictly from saved contact fields. Stacked draft PR. Next intended: P1-R5 then P1-R4 (hold for pick).
- **2026-06-15** — P1-R5 shipped: "Enroll in sequence" on ContactDetail (`enrollContactInSequence` in `useSequences.ts` + a SequencePicker overlay) — idempotent upsert into the existing `contact_sequences` table (no schema change), verified live on the demo account + cleaned up. Closes "0 enrollments ever". Stacked draft PR. Next intended: P1-R4 (hold for pick).
- **2026-06-16** — P1-R4 shipped: one-tap reply sentiment — `MarkReplyButton` collapsed state is now a single "👍 Positive" tap (the common case) plus a ⋯ that opens the existing full neutral/negative/later panel. The `manualReplyTracker` cascade side-effects are untouched. Stacked draft PR. **Agent-ownable P1 roadmap backlog is now empty** — remaining items are gated (G1–G3, Eduardo) or need a decision/action (P1-3 cron secret, P1-6 error-tracking vendor) or are P2.
- **2026-06-17** — P2-A2 (partial) shipped: **per-minute AI throttle** + **Rex Lens prompt-injection hardening** in `ai-proxy`. Added `ai_minute_usage` + `bump_ai_minute(uuid)` RPC (additive migration `20260617_v2_ai_rate_limit.sql`, applied live); `authAndPlan()` now returns 429 above `AI_RATE_PER_MIN` (default 30/min, **fails open**) on every route; `fmtContact()` clamps all CRM fields and wraps them in untrusted-data markers (+ a reinforcing system-prompt line). `ai-proxy` redeployed (v31→v32, `verify_jwt=false` preserved). Verified: migration applied; `bump_ai_minute` atomically increments (RPC returned 1,2,3) and table writes are RLS-gated to `service_role` (an `authenticated` call is denied), so non-service callers can't poison counters; deployed v32 source confirmed byte-identical to the repo. (The HTTP burst e2e couldn't run — the build container's network egress allowlist blocks the Supabase host; the throttle fails open so a miss can't block real users.) The original row's **streaming-usage metering fix is carved out to P2-A6** (the live SSE meter is delicate, left untouched). Stacked draft PR on #75.
- **2026-06-17** — P2-A3 (partial) shipped: per-rep **timezone + daily send hour** data model + Profile setting. Additive migration `20260617_v2_profiles_send_time.sql` (`profiles.timezone`, `profiles.send_hour smallint default 8 check 0..23`), applied live; `lib/v2/sendTime.ts` (device-tz auto-capture on app mount via AppShell + `loadSendTime`/`setSendHour`); a "Daily send time" picker in ProfileTab (writes through the rep's own owner-scoped RLS — no service role, no grant change). The nurture-scheduler does **not** yet consume these — that local-time gating is **deferred to P2-A7**, coupled to the gated cron-cadence flip (`0 14 * * *` → hourly) and reconciling the scheduler git↔deploy drift (deployed v8 has #69's referral asks, not in this stack). No scheduler touched (zero prod-regression risk). Stacked draft PR on #76.
- **2026-06-18** — P2-A4 (partial) shipped: brought deployed edge-function reality into git. Reconciled `nurture-scheduler` (git was the stale pre-referral version; now = **deployed v8** = #69's referral scheduler, materialized from #69's blob, structurally verified — 414 lines + every referral marker) + committed its `nurture_kind` migration (additive, already live) so the repo is self-consistent. Committed the **`ai-closer`** v26 source (was deployed with no source in git). **`stripe-webhook` excluded** (gated — stays owner-owned); **`support-reply`** left tracked + documented (in repo, not deployed). No redeploys, no schema changes (the migration was already applied live). **Unblocks P2-A7** (scheduler local-time gating can now build on the real referral-inclusive scheduler + redeploy a superset safely). Note: this subsumes #69's scheduler + nurture_kind migration — #69's remaining referral client files (referralAsks.ts, dealLogger, repSettings, ProfileTab toggle, referral_ask_settings migration) still land separately. Stacked draft PR on #77. Open: keep-or-delete `ai-closer`; deploy-or-delete `support-reply`.
- **2026-06-18** — P2-A7 (code) shipped: timezone-aware nurture delivery, **behind the `SCHEDULER_HOURLY` flag (default off → byte-identical daily behavior)**. In hourly mode (flag on + cron moved to hourly), `runHourlyMode` processes each rep once, in the hour their LOCAL time (`profiles.timezone`, device-captured in P2-A3, fallback `America/New_York`) matches `profiles.send_hour`, using their LOCAL date/Monday for holiday + quarterly; referral asks + pushes ride the same local-hour gate. The existing daily path is untouched (one early-return branch). No new migration, no RPC, no schema change. Intl local-time math unit-tested (NYC/LA/Tokyo/UTC/midnight-boundary/bad-tz) + the Deno file syntax-checked. **Not yet deployed** — the redeploy is owner-gated (presented for approval); with the flag off it's a behavior no-op. Activation = redeploy + `SCHEDULER_HOURLY=1` + cron `0 14 * * *`→`0 * * * *` (the cron flip stays the owner's call). Stacked draft PR on #78.
- **2026-06-18** — P2-A6 **deferred** (investigation only — no code change): the streaming meter records usage only in `TransformStream.flush()`, which fires on normal stream close but **not on client disconnect**, so a Hey Rex stream the user stops mid-reply goes **unmetered** (under-count; completed streams meter correctly, verified). Not safely fixable blind: capturing disconnect usage needs tee+read-upstream-to-completion (pay for unseen tokens) or delta-estimation (imprecise), both restructuring the live stream path — requires a **staging repro + a disconnect-cost decision**. Low severity (daily cap + P2-A2 per-minute throttle bound exposure). Doc-only PR.
- **2026-06-19** — P2-A5 (viewer) shipped: a read-only **Rex Activity** screen (`components/v2/RexActivityViewer.tsx` + `lib/v2/useRexActionLog.ts`) listing the rep's own `rex_action_log` entries — action label, result badge (done/cancelled/partial/failed/pending), affected-contact names, relative time — opened from Profile → REX → "Rex activity". RLS owner-scoped read; no migration, no writes, no gated files. The bundled **Expo SDK-51 upgrade is split to P2-A8 and deferred** (multi-package cascade — expo/RN/expo-router/all `expo-*`; needs a validated app run, not safely doable blind). Stacked draft PR on #80.
- **2026-06-19** — P2-R2 shipped: **Rex screen/state awareness**. `useHeyRex` now passes the active tab + open-contact id into `rexInterpret`, which adds a compact "WHERE THE REP IS RIGHT NOW" block to the prompt (`buildScreenContext`) so Rex can resolve "this" / "her" / "this one" against the contact the rep has open — while still deferring to the BOOK STATE. Purely additive (the block is empty when no screen is passed; existing context + action parsing untouched). tsc/eslint green. Stacked draft PR on #81.
- **2026-06-19** — P2-R4 shipped: **Rex disambiguation / never-guess**. Two additive layers on the existing (previously brain-only) `clarify` action: (1) a client-side guard in `rexInterpret` — if a contact-referencing action (`update_notes`/`delete_contact`/`schedule_followup`/`show_contact`/`retier_contact`) names someone matching 2+ people in the book, it's converted to a `clarify` with the candidate list instead of trusting the brain's single pick (exact full-name + single/no-name cases untouched → happy path unchanged); (2) `HeyRexSheet` now renders the `clarify` candidates as a tappable pick-list (tap → open that contact) — they were previously ignored. tsc/eslint green. Stacked draft PR on #82.
- **2026-06-19** — P2-R5 **scaffold** shipped (regression gate **deferred** to owner): **Promptfoo Rex action-selection eval**. New repo-root `eval/` — `promptfooconfig.yaml` (OpenRouter provider mirroring `BRAIN_MODELS[0]`, `temperature:0`), `rexPrompt.txt` (a maintained condensed mirror of `buildPrompt()` + a fixed BOOK STATE so contact cases resolve), `cases.yaml` (**26 seed** utterances across all 16 action types incl. ambiguous-name→`clarify`), `assertAction.js` (parses the fenced JSON exactly like `parseAction` and checks `action===expected`), and a README documenting how to grow to the 150-utterance target. Runs via **`npx` (no committed dependency)** — `npm run eval:rex` or `npx promptfoo eval`. CI is **opt-in only**: `.github/workflows/rex-eval.yml` is `workflow_dispatch` (manual), fails fast if the key is missing — **NOT** a PR gate, because a blocking gate needs an `OPENROUTER_API_KEY` repo secret + a per-run AI-cost decision (and a pass-rate threshold, since LLM output varies) — all **owner calls**. App `tsc`/`eslint` untouched (eval/ is outside `PocketRepApp` CI scope); JS/YAML validated (26 cases parse). Stacked draft PR on #86.
- **2026-06-19** — P2-R8 shipped: **Rex failure-honesty / never-fabricate**. Rex speaks its confirmation optimistically *before* the write runs, so a failed write used to leave a spoken "done" the rep already heard, plus only a raw exception chip on screen and a reasonless `failed` log row. Two additive layers: (1) **always-on richer logging** — `logRexAction` now folds the caught error into `action_payload._rex_failure_reason` (clamped 300 chars; the table has no dedicated column and adding one is an owner-gated migration, so jsonb keeps it schema-free + queryable) and labels a failed **chain** `partial` (a value the `result` CHECK already allowed but nothing used); invisible to the user. (2) **flag-gated spoken recovery** behind `EXPO_PUBLIC_REX_FAILURE_HONESTY` (default off) — on failure Rex SPEAKS + shows a specific `failureRecoveryLine(action)` ("That didn't save — the deal for Marcus didn't go through. Want me to try again?") via the one-shot `speak()` that cancels the stale optimistic TTS; when off, the failure UX is byte-identical (raw error text, no extra speech). Wired at both failure sites (`confirm()` write path + `autoRunSafe()` read path) in `useHeyRex`. Note: chains only exist when the P2-R3 flag is on, so with the default config the `partial` label is unreachable and logging stays exactly as before bar the (absent-on-success) reason field. tsc/eslint green (0 errors, 46 baseline warnings). Stacked draft PR on #85.
- **2026-06-19** — P2-R7 shipped (**code only — flag off, NOT redeployed**): **tiered model routing** for the ~2s interactive latency budget. `ai-proxy/index.ts`: new `BRAIN_TIERED` env flag (default off) + `BRAIN_MODELS_FAST` env list; `modelsForTier()` picks the fast list **only** when the flag is on AND the request carries `{tier:'fast'}` AND a fast list is configured — a **double** default-to-no-op (flag off → tier ignored, every call uses `BRAIN_MODELS`; flag on but no fast list → still `BRAIN_MODELS`). `handleBrain` computes `models` once and uses it for both the streaming + non-streaming OpenRouter calls; GET health now reports `tiered`/`brainFast` so activation is verifiable. Client `aiProxy.ts`: `callBrain`/`callBrainStream` gain an optional `tier` that's added to the body **only when set** (existing callers' wire format byte-identical); the Hey Rex voice path (`rexInterpret`→`callBrainStream`) now requests `tier:'fast'` (inert until activation). git `ai-proxy` == deployed **v32** (last touched by P2-A2; nothing since), so a future redeploy is exactly v32 + this additive delta. **Not deployed** (redeploy owner-gated). Activation = redeploy + `BRAIN_TIERED=1` + `BRAIN_MODELS_FAST=<models>`. App tsc/eslint green (0 errors, 46 baseline warnings; Deno fn excluded from app CI). Stacked draft PR on #84.
- **2026-06-19** — P2-R3 shipped (**flag off by default**): **Rex multi-step tool chaining**. New `lib/v2/rexFeatureFlags.ts` (`EXPO_PUBLIC_REX_MULTISTEP`, default off — when off the chain instruction is omitted, so the brain prompt is byte-identical to before and Rex still returns one action per utterance). When on: a new `chain` action lets a clearly multi-intent utterance return 2+ DISTINCT writes confirmed together. `parseAction` normalizes each nested step into a real `RexAction` and validates it against a chainable allow-list (`add_contact`/`update_notes`/`delete_contact`/`log_deal`/`schedule_followup`/`retier_contact`/`create_reminder`/`batch_action` — no read/heavyweight actions, no nested chains); a chain that collapses to 0 steps → safe `say`, exactly 1 → that lone action. `executeAction` runs steps in order, **stop-on-first-failure** (never half-applies silently past an error); `summarizeAction` renders them as a numbered list under the single existing Confirm; `AppShell.handleRexConfirm` refreshes exactly the surfaces the steps touched (deals key for `log_deal`, contacts reload for contact writes). `actionWritesData('chain')`→true so the confirm gate shows. tsc/eslint green (0 errors, baseline 46 warnings). Stacked draft PR on #83.
