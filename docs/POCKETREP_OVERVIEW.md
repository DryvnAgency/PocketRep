# PocketRep — Product & System Overview (start here)

**What this file is:** the 10-minute orientation to *everything* PocketRep is, does, and
could become — and a paste-in handoff prompt for the next AI chat (Part C).
For deep technical truth (full schema, every helper, every overlay), read
**`docs/HANDOFF.md`** — that stays the authoritative engineering reference. This file
is the map; HANDOFF.md is the territory.

**Last refreshed:** 2026-05-30 · **Supabase project:** `fwvrauqdoevwmwwqlfav` ·
**Live web:** https://app.pocketrep.pro · **Marketing:** https://pocketrep.pro

---

## Part A — What PocketRep is and does

### 1. In one paragraph

PocketRep is an **AI-powered follow-up coach and lightweight CRM for automotive sales
reps**. The rep's "book" of customers lives in a contact list that's automatically
**heat-ranked** (who's most likely to buy next). An AI persona named **Rex** — a blunt,
30-year car-sales veteran — drafts the exact text/call/email to send, runs daily
**nurture** outreach so no customer goes cold, tracks **deals and commission**, and
answers voice commands ("hey rex, who haven't I touched in two weeks?"). The product is
deliberately tuned for the automotive retention lifecycle: post-sale onboarding, CSI,
lease-end upgrades, trade-up equity, service reminders, and anniversaries.

### 2. Who it's for & the core loop

**User:** an individual car salesperson (and, via Rex Lens, anyone working leads inside a
CRM in the browser). The loop the whole product optimizes:

```
add / import contacts
     → Heat Sheet ranks who to touch today (hot / warm / watch + overdue)
     → Rex drafts the message following the copy rules (no "just checking in", lowercase, ≤280 chars)
     → rep sends via native SMS / call / email (manual send; the device's own apps)
     → rep marks the reply (positive / neutral / negative / later) → feeds heat + cadence
     → nurture engine keeps cold/past customers top-of-mind on a safe cadence
     → deals get logged → Metrics shows units, gross, commission, projection
```

### 3. The three products (one shared backend)

All three authenticate against the **same Supabase project** (`fwvrauqdoevwmwwqlfav`) and
share `profiles` / `contacts` / `deals` (RLS-scoped by `auth.uid()`).

| Product | What it is | Stack | Entry point | Build → Deploy | Domain |
|---|---|---|---|---|---|
| **`PocketRepApp/`** | The core app (the product) — iOS/Android + web | Expo SDK 51 / RN 0.74, TypeScript, expo-router (v1) + plain hooks (v2) | `app/(tabs)/index.tsx` mounts `<AppShell>` for v2 | `npm run build:web` → `dist/` → Vercel **`project-t90u1`**; native via EAS | `app.pocketrep.pro` |
| **`Pocketrep/`** | Static marketing site + legal/checkout pages | Hand-written HTML/CSS/JS | `index.html` | static → Vercel **`pocket-rep`** | `pocketrep.pro` |
| **`RexLens/`** | Chrome MV3 extension — reads any CRM/email page and coaches in a side panel | TypeScript, esbuild, Manifest V3, Shadow DOM | `src/background/service-worker.ts` + `src/content/*` | `npm run build` (esbuild) → zip → Chrome Web Store (manual) | n/a (browser) |

Also in the repo: `design/` (the original mock + 17 extracted `.jsx` modules that are the
v2 design source of truth) and `docs/` (this file + HANDOFF.md + PORT_PLAN.md + VERCEL_SETUP.md).

### 4. v1 vs v2 UI (important)

There are **two UIs** in `PocketRepApp`, gated by `shouldUseNewUi()` in
`lib/featureFlags.ts` (true when `EXPO_PUBLIC_NEW_UI=1`, host is `app.pocketrep.pro`, or
URL has `?v=2`):

- **v1** — the original `expo-router` screens under `app/(tabs)/` (`heat`, `contacts`,
  `deals`, `sequences`, `rex`, `more`). Still what **native iOS/Android users see**.
- **v2** — the design-port that lives entirely under `components/v2/`, mounted as a single
  `<AppShell>`. This is what **web (`app.pocketrep.pro`) serves** and is the future.

When a feature is described below as "v2", it's in the AppShell surface.

### 5. Feature surface (v2)

Orchestrated by `components/v2/AppShell.tsx` (owns tabs + all overlay state + the
`useContacts`/`usePayPlan`/`useTags` hooks). Full map: HANDOFF.md §14.

**Tabs**
| Tab | File | What it does |
|---|---|---|
| Heat Sheet | `HeatSheetTab.tsx` | Today's overdue banner, weekly-digest card, nurture banner, and HOT/WARM/WATCH lists with days-since-contact counters |
| Contacts | `ContactsTab.tsx` | Search, filter chips (tier + custom tags), add contact, bulk-tag flow, alphabetical book |
| Metrics | `MetricsTab.tsx` | YTD hero, 12-month bar chart, MTD + projected, log-a-deal, monthly accordion |
| You | `ProfileTab.tsx` | Profile, plan callout, pay-plan summary, Game Plan link, "always listen for Hey Rex" toggle, test push, replay onboarding, sign out |

**Major overlays** (all mounted by AppShell)
| Overlay | Opens from | Does |
|---|---|---|
| `ContactDetail.tsx` | tapping any contact | the big card: notes, tags, language, milestones, deals, awaiting-reply, Game Plan button, call/text/email (auto-logs the touch) |
| `DealLogger.tsx` | Metrics / ContactDetail / voice `log_deal` | log a sale with live commission payout preview |
| `HeyRexSheet.tsx` / `RexCoach` | wake word / orb | voice + chat coaching with confirm cards for write actions |
| `GamePlanSheet.tsx` → `SequenceEditor.tsx` | Profile → Game Plan | browse/edit follow-up sequences (now automotive-only) |
| `NurtureReviewer.tsx` | Heat Sheet nurture banner / voice | review, edit, send, or skip queued nurture drafts |
| `StalledLeadsAnalysis.tsx` | voice `analyze_stalled_leads` | KILL/PUSH/FENCE triage of cold leads |
| `BlastSequenceDrafter.tsx` | voice `create_blast_sequence` | review per-contact personalized blast before sending |
| `PayPlanEditor.tsx` | Profile pay-plan card | edit comp (front/back %, mini, base, spiffs, bonus tiers) |
| `AddContactModal.tsx` | Contacts `+` | manual contact entry (CSV + phone import live in v1 `contacts.tsx`) |

### 6. Rex AI capabilities & which route each uses

Everything AI flows through the **`ai-proxy`** edge function (except server-side cron,
which calls OpenRouter directly). Helpers live in `lib/v2/` (HANDOFF.md §15–16).

| Capability | Helper | Route |
|---|---|---|
| Voice intake / chat coaching ("Hey Rex") | `useHeyRex.ts`, `rexActions.ts`, `HeyRex.tsx` | `ai-proxy/gemini` (interactive) |
| Game Plan (per-contact next move) | `gamePlan.ts` | `ai-proxy/brain` |
| Rebuttals / objection prep | `rexActions.ts` | `ai-proxy/brain` |
| Blast / mass-text personalization | `blastSequences.ts` | `ai-proxy/brain` |
| Nurture drafts (cron + manual) | `nurtureEngine.ts` / `nurture-scheduler` fn | `brain` (client) / OpenRouter direct (cron) |
| Weekly digest highlights | `weeklyDigest.ts` | `ai-proxy/brain` |
| Rex Lens CRM page scans | RexLens `src/content/*` | `ai-proxy/gemini` |
| STT / TTS | — | `ai-proxy/stt`, `/tts` → **501 stubs** (deferred) |

**Brain models:** OpenRouter `x-ai/grok-4.3` → `moonshotai/kimi-k2.6` fallback.
**Tone:** the single canonical `REX_COPY_RULES` (HANDOFF.md §17) is appended to every
user-facing generation and mirrored into the cron and Rex Lens prompts.

### 7. Backend at a glance

Supabase project `fwvrauqdoevwmwwqlfav`. Full schema: HANDOFF.md §6. Key tables:
`profiles` (canonical user + plan), `contacts` (the book), `deals`, `pay_plans`, `tags`,
`sequences`/`sequence_steps`/`contact_sequences`, `contact_milestones`,
`nurture_messages`, `holiday_calendar`, `rex_messages`/`rex_memory`/`rex_action_log`,
`daily_ai_usage`, `weekly_digests`, `user_push_tokens`. (`users` is a legacy parallel
table; `profiles` is canonical.)

**Edge functions** (`/functions/v1/`):
| Function | Auth | Purpose |
|---|---|---|
| `ai-proxy` | self-validates JWT (`verify_jwt:false`) | `/brain` (OpenRouter) + `/gemini` (Rex Lens) + STT/TTS stubs; per-user daily cap |
| `nurture-scheduler` | `X-Cron-Secret` | daily holiday + Monday quarterly nurture queue; pushes notifications |
| `send-push` | `verify_jwt:true` | Expo Push wrapper |
| `stripe-webhook` | Stripe HMAC signature | writes `plan`/`stripe_customer_id`/`trial_ends_at` to `profiles` |
| `support-reply` | open | Twilio support-line auto-reply (TwiML) |
| ~~`ai-closer`~~ | — | **removed** this session; deployed copy still needs a dashboard delete (see Part C) |

**Cron:** `nurture-scheduler-daily` via `pg_cron` at `0 14 * * *` UTC.
**Storage:** public bucket `contact-photos` (RLS by `user_id/` prefix).
**Push:** Expo Push (native only; web no-ops).

### 8. Plans & pricing

Tiers stored in `profiles.plan` (`rex_lens` | `pro` | `elite`) plus a `profiles.unlimited`
boolean override. Prices from the founding-launch signup flow (`app/(auth)/signup.tsx`):

| Plan | Founding | Standard | AI daily cap | What you get |
|---|---|---|---|---|
| **Rex Lens** | $29/mo | $39/mo after Apr 30 | 75¢/day | Chrome extension — Deep Scan action plans for 30 contacts at once |
| **Pro — The Closer** | $29/mo | $49/mo | 75¢/day | Full mobile + web app, Heat Sheet, Rex coaching |
| **Elite — Everything** | $59/mo | $89/mo | 125¢/day | Everything in Pro + Rex Lens + proximity alerts |

**Trial:** 7-day free trial (`trial_ends_at`), card required; Elite is the default-selected
plan at signup. **Enforcement:** `ai-proxy` reads `profiles.plan` → `DAILY_CAP_CENTS`
(`rex_lens:75, pro:75, elite:125`), accrues spend in `daily_ai_usage.cost_cents`, and
returns `429 DAILY_LIMIT` when exceeded. `unlimited=true` bypasses the cap.

### 9. Run & deploy

```bash
# PocketRepApp (web)
cd PocketRepApp
npm start              # Metro dev server (all platforms)
npm run web            # Expo Web locally
npm run build:web      # expo export → dist/  (what Vercel project-t90u1 runs)
npx tsc --noEmit       # typecheck

# PocketRepApp (native) — EAS
eas build --platform ios | android

# Pocketrep marketing site — static, no build (Vercel pocket-rep auto-deploys)

# RexLens extension
cd RexLens && npm run build    # esbuild → zip → upload to Chrome Web Store
```

Both Vercel projects auto-deploy on every push (preview); `main` deploys to production.
Web v2 is forced on `app.pocketrep.pro` and on any preview with `?v=2`.

### 10. Demo account

`demo@pocketrep.pro` / `PocketRepDemo2026!` (UUID `d0000000-…-0001`, pro plan). The web
app auto-signs into it on first visit. Seeded with 10 contacts, 30 deals (Jan–May 2026),
tags, lease-end milestones, a Spanish-preference contact, and past customers for the
nurture cron. Details: HANDOFF.md §8.

---

## Part B — What PocketRep could do (roadmap)

### Near-term, grounded backlog (the code already points here — HANDOFF.md §24)

| Opportunity | Why it's ready | Where |
|---|---|---|
| **Twilio reply webhook** | replies are marked manually today; a webhook could auto-classify sentiment → heat/cadence | `support-reply` fn pattern + `manualReplyTracker.ts` |
| **Stripe upsell + paywall UI** | `stripe-webhook` + plan caps exist; the `upgrade-sheet.jsx` design is unported | `design/extracted/upgrade-sheet.jsx`, `ai-proxy` 429 path |
| **Sequence per-contact enrollment** | editor + templates exist; no "enroll Marcus in Lease-End Upgrade" button | `GamePlanSheet`, `contact_sequences` (table empty) |
| **Unit-bonus tiers in commission** | `pay_plans.unit_bonus_tiers` is editable but not applied to monthly math | `payPlan.ts`, `MetricsTab.tsx` |
| **Native wake-word** | push-to-talk works; continuous wake word needs Picovoice or similar | `heyRexListener.ts` (web-only today) |
| **Audit-log viewer** | `rex_action_log` is populated, nothing surfaces it | new v2 overlay |
| **Morning Heat Sheet push + digest email** | push plumbing + digest generation exist; triggers not wired | `nurture-scheduler`, `weeklyDigest.ts` |
| **Consolidate dual template source** | sequence templates live both as hardcoded TS *and* DB rows — drift risk | `app/(tabs)/sequences.tsx` + `public.sequences` |

### Curated vision (grounded in what exists, labeled as opportunity not commitment)

- **Manager / team dashboard** — multi-rep rollups (units, gross, activity) are computable
  from existing `deals` / `contacts` / `weekly_digests`; would need a team/role concept on `profiles`.
- **Dealer / CRM integrations** — the dormant `dealers`, `customers`, `drafts`, `messages`,
  `appointment_signals` tables plus RexLens's CRM page adapters (VinSolutions, Gmail,
  Outlook) are the seed of a two-way DMS/CRM sync.
- **Tighter RexLens ↔ app loop** — Rex Lens already shares the backend; scanned leads and
  generated drafts could flow into the app's contacts/nurture pipeline automatically.
- **Reply-driven heat** — once auto-classification lands, sentiment can continuously
  re-score `heat_score` and drive who surfaces on the Heat Sheet.
- **Monetization** — Elite "unlimited" upsell at the cap, Rex Lens as a standalone
  top-of-funnel product, founding-rate → standard-rate conversion.

---

## Part C — Handoff prompt for the next chat

Paste the block below into a fresh chat to bring it fully up to speed.

```
You are helping develop PocketRep — an AI follow-up coach + lightweight CRM for
automotive sales reps. Monorepo with three deliverables on ONE Supabase backend
(project `fwvrauqdoevwmwwqlfav`):
  • PocketRepApp/  — Expo (RN + web) app; web at app.pocketrep.pro (Vercel project-t90u1)
  • Pocketrep/     — static marketing site at pocketrep.pro (Vercel pocket-rep)
  • RexLens/       — Chrome MV3 extension (shares the backend)

READ FIRST: docs/POCKETREP_OVERVIEW.md (the map) then docs/HANDOFF.md (the technical
source of truth — full schema, edge functions, v2 surface map, Rex tool-use, copy rules).
If the codebase ever contradicts a doc, the codebase wins — fix the doc.

KEY FACTS
- Two UIs gated by shouldUseNewUi() (lib/featureFlags.ts): v2 (components/v2/AppShell.tsx)
  is what web serves; v1 (app/(tabs)/) is what native still shows. Append ?v=2 to preview v2.
- AI flows through the ai-proxy edge function: /brain (OpenRouter grok-4.3 → kimi-k2.6),
  /gemini (Rex Lens), /stt + /tts are 501 stubs. Per-user daily $ cap via daily_ai_usage;
  profiles.unlimited bypasses. Rex's tone is REX_COPY_RULES in lib/v2/rexActions.ts.
- Plans: rex_lens / pro / elite (profiles.plan) + unlimited flag. Sequences are
  automotive-only (auto-first UX; multi-industry code kept but hidden).
- Demo account: demo@pocketrep.pro / PocketRepDemo2026!

WORKING RULES
- Dev on the branch you're given; never push to main. PR flow: open draft → CI
  (Vercel pocket-rep + project-t90u1) green → ready → squash merge.
- Supabase changes go through MCP tools (apply_migration / execute_sql / deploy_edge_function).
  No Supabase CLI or token is available in the web session; deletes/dashboard-only actions
  must be handed to the owner.
- TRAPS: don't touch contacts.heat_tier (legacy; derive tier from heat_score). Don't use
  jsr: imports in edge functions (use esm.sh). Don't call ai-proxy/brain server-to-server
  (cron calls OpenRouter directly with POCKETREP_API_KEY). Don't add dynamic require().

OPEN ACTION (carry over)
- Delete the deployed `ai-closer` edge function from the Supabase dashboard:
  supabase.com → project fwvrauqdoevwmwwqlfav → Edge Functions → ai-closer → Delete.
  (It was removed from the repo; only the deployed copy remains.)

CURRENT STATE
- PR #45 (branch claude/gracious-dirac-fLQO5) is open/green: edge-function cleanup
  (version-controlled stripe-webhook, removed ai-closer) + automotive-only retention
  sequences + auto-first UX. Confirm its status before building on top.
```

---

## Related docs
- **`docs/HANDOFF.md`** — the technical source of truth (read this for any real work).
- **`docs/PORT_PLAN.md`** — historical mock→live architecture rationale.
- **`docs/VERCEL_SETUP.md`** — Vercel project conventions + the v2 cutover.

*(The old root-level `HANDOVER_PROMPT.txt` and `PROJECT_MASTER_CONTEXT.txt` were stale
April-2026 snapshots and have been removed in favor of this file.)*
