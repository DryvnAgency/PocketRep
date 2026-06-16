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
| **P2-R2** | **Screen/state awareness** — Rex knows the current screen + selection | roadmap | `useHeyRex.ts`, `AppShell.tsx`, `bookContext.ts` | `Agent` | |
| **P2-R3** | **Multi-step tool chaining w/ single batch-confirm** | roadmap | `rexActions.ts`, `HeyRexSheet.tsx` | `Agent` | |
| **P2-R4** | **Disambiguation / never-guess** — ask back on collisions instead of guessing | roadmap | `rexActions.ts` (`clarify`) | `Agent` | |
| **P2-R5** | **150-utterance Promptfoo eval suite** as a regression gate in CI | roadmap | new `eval/`, CI | `Agent` (builds on P0-6 CI) | |
| **P2-R6** | **On-device STT** replacing the `/stt` 501 stub (also fixes v1 calling a nonexistent `/whisper` route) | roadmap + audit | `ai-proxy`, native STT module, `speech.ts` | `Eduardo: DECISION` (vendor: native/on-device vs Whisper API) then `Agent⟵decision` | ⚖️ |
| **P2-R7** | **~2s latency budget w/ tiered model routing** | roadmap | `ai-proxy`, `aiProxy.ts` | `Agent` | |
| **P2-R8** | **Failure-honesty recovery messages** logged to `rex_action_log` | roadmap | `rexActions.ts`, `rex_action_log` | `Agent` | |
| **P2-R9** | **Siri App Intents** as a free front-end | roadmap | native iOS (App Intents), EAS | `Agent⟵decision` (native track) | ⚖️ (native) |
| P2-A1 | Native track — fill `eas.json`, Apple/Google accounts, push entitlements, photo-lib permission string, kill-or-gate v1 | audit | `eas.json`, `app.json`, `app/` | `Eduardo: ACTION` (dev accounts) + `Agent` | ⚖️ 🔑 |
| P2-A2 | Per-minute AI throttle + streaming-usage fix; prompt-injection hardening (treat CRM text as untrusted, cap lengths) | audit | `ai-proxy` | `Agent` | |
| P2-A3 | Timezone-aware cron/cadence + per-rep send hour | audit | `nurture-scheduler`, `nurtureEngine.ts` | `Agent` | |
| P2-A4 | Bring deployed reality into git — commit `stripe-webhook` + `ai-closer` (or delete); deploy/delete `support-reply` | audit | `supabase/functions/` | `Agent` (commit) / `Eduardo: DECISION` (delete `ai-closer`?) | ⚖️ |
| P2-A5 | Audit-log viewer for `rex_action_log`; Expo SDK 51→ upgrade once CI exists | audit | new UI; deps | `Agent` | |

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
| Twilio inbound (`support-reply`) | **In repo, NOT deployed** | drift |
| `ai-closer` | **Deployed v26, no source in git** | unknown behavior |
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
