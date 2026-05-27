# PocketRep — handoff (A → Z)

**Last updated**: 2026-05-27
**Latest commit on `main`**: `f601d51` (PR #37 — Pay plan editor + Sequences editor + photo upload + reply marker + profile onboarding)
**Live web**: https://app.pocketrep.pro (Vercel project `project-t90u1`, Expo Web)
**Supabase project**: `fwvrauqdoevwmwwqlfav` — `https://fwvrauqdoevwmwwqlfav.supabase.co`
**Backend models**: brain via OpenRouter (`x-ai/grok-4.3` primary → `moonshotai/kimi-k2.6` fallback), STT/TTS routes are 501 stubs (see §10).

This document is the single source of truth. If anything in the codebase contradicts it, the codebase is right and this doc is stale — fix this doc.

---

## Table of contents

1. [Repo layout](#1-repo-layout)
2. [Tech stack & how the app actually runs](#2-tech-stack--how-the-app-actually-runs)
3. [Branch / commit / merge policy](#3-branch--commit--merge-policy)
4. [Vercel projects + domains](#4-vercel-projects--domains)
5. [Feature flag — `shouldUseNewUi()`](#5-feature-flag--shouldusenewui)
6. [Database schema](#6-database-schema)
7. [Migrations history](#7-migrations-history)
8. [Demo account](#8-demo-account)
9. [Sign-in flow](#9-sign-in-flow)
10. [Edge functions](#10-edge-functions)
11. [The cron](#11-the-cron)
12. [Supabase Storage](#12-supabase-storage)
13. [Expo Push](#13-expo-push)
14. [v2 surface map — every tab + every overlay](#14-v2-surface-map--every-tab--every-overlay)
15. [`lib/v2/` map — every helper](#15-libv2-map--every-helper)
16. [Hey Rex — listener + tool-use](#16-hey-rex--listener--tool-use)
17. [`REX_COPY_RULES` — the canonical tone spec](#17-rex_copy_rules--the-canonical-tone-spec)
18. [Nurture engine](#18-nurture-engine)
19. [Pay plan + commission math](#19-pay-plan--commission-math)
20. [Sequences (Game Plan)](#20-sequences-game-plan)
21. [Cross-deal memory](#21-cross-deal-memory)
22. [Onboarding](#22-onboarding)
23. [Anti-patterns & traps](#23-anti-patterns--traps)
24. [Known gaps / explicitly deferred](#24-known-gaps--explicitly-deferred)
25. [Where to look next](#25-where-to-look-next)

---

## 1. Repo layout

```
/                            <repo root>
├── Pocketrep/               Static marketing site (deployed by `pocket-rep` Vercel project)
│                            Mostly hand-written HTML, served at pocketrep.pro
├── PocketRepApp/            Expo (React Native + Web) app — the actual product
│   ├── app/                 expo-router screens (v1 surface)
│   ├── components/
│   │   └── v2/              ALL the v2 design-port components live here
│   ├── lib/
│   │   └── v2/              ALL the v2 hooks/helpers live here
│   ├── supabase/
│   │   ├── functions/       Edge function source (Deno) — mirrors live functions
│   │   └── migrations/      All schema migrations, ordered by date
│   ├── constants/theme.ts   colors / radius / spacing tokens
│   ├── package.json
│   └── tsconfig.json
├── RexLens/                 Chrome extension that uses the same Supabase backend
├── design/
│   ├── PocketRep-Standalone.html   Original static mock
│   └── extracted/           17 .jsx modules pulled out of the mock — design source of truth
├── docs/
│   ├── HANDOFF.md           THIS FILE
│   ├── PORT_PLAN.md         Original "mock → live" plan (historical)
│   └── VERCEL_SETUP.md      Vercel project conventions
└── HANDOVER_PROMPT.txt      Older handover (superseded by this doc)
```

---

## 2. Tech stack & how the app actually runs

- **Mobile target**: Expo SDK 51 → React Native 0.74.5 (iOS + Android via EAS, web via Expo Web)
- **Web target**: `expo export --platform web` → `dist/` deployed by Vercel project `project-t90u1`
- **State**: no Redux / Zustand / Jotai. Everything is plain React hooks + a handful of custom hooks in `lib/v2/`. State is co-located with `AppShell.tsx`; child screens take props.
- **Routing**: `expo-router` for the v1 surface. The v2 surface lives behind `shouldUseNewUi()` and is rendered as a single `<AppShell>` mounted from `app/(tabs)/index.tsx` (or equivalent entry); navigation inside v2 is local state — no router.
- **Auth + DB**: Supabase JS client (`@supabase/supabase-js@2`)
- **AI**: brain via `ai-proxy` edge function → OpenRouter → Grok 4.3 → Kimi K2.6 fallback. STT/TTS are stubbed.
- **Voice**: Web Speech API (`SpeechRecognition`) — web-only first pass; native wake-word deferred.
- **Push**: Expo Push (iOS/Android only; web silent)

`EXPO_PUBLIC_*` env vars get baked into the JS bundle. Anything sensitive (service role key, OpenRouter key) must live in **Supabase secrets** (see §10) and never in client code.

---

## 3. Branch / commit / merge policy

- **Work branch**: `claude/exciting-goodall-or4T2` (the session's prescribed branch). Don't push to `main` directly.
- **PR flow**: open as draft → CI checks `pocket-rep` and `project-t90u1` go green → flip to ready → squash merge.
- **After squash merge**: `git fetch origin main && git reset --hard origin/main && git push --force-with-lease origin claude/exciting-goodall-or4T2`. This re-aligns the branch with main so the next PR opens cleanly.
- **Commit messages**: short title (`feat(web-v2): …` / `fix(web-v2): …` / `db(v2): …` / `docs: …`) + a body that says what changed + why (not just what).
- **`his-palabra`** check is gone — the orphan Vercel project was deleted. If you ever see it again, that means someone re-created the project; you can ignore it as before until it's deleted.

---

## 4. Vercel projects + domains

| Project | Source dir | Domain | Build |
|---|---|---|---|
| `pocket-rep` | `Pocketrep/` (root) | `pocketrep.pro` | static (marketing site + the old static mock at `/app`) |
| `project-t90u1` | `PocketRepApp/` | `app.pocketrep.pro` + branch alias `project-t90u1-git-*.vercel.app` | `npm run build:web` → `dist/` (Expo Web SPA) |

**Team**: `dryvnagency-1422s-projects`

Both projects auto-deploy on every push to any branch (preview); the `main` branch additionally deploys to `production`. `app.pocketrep.pro` is wired to `project-t90u1`'s production deployment — moving it from `pocket-rep` to `project-t90u1` was the v2 cutover, completed 2026-05-26.

**Vercel env vars** (set in the dashboard, not in the repo):
- `EXPO_PUBLIC_SUPABASE_URL` — `https://fwvrauqdoevwmwwqlfav.supabase.co`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` — the legacy anon JWT (public)
- `EXPO_PUBLIC_NEW_UI` — optional, set to `1` if you want v2 on every preview URL (current default is to rely on hostname auto-detect; see §5)
- `EXPO_PUBLIC_EXPO_PROJECT_ID` — optional, only needed if Expo Push doesn't auto-detect from EAS config

---

## 5. Feature flag — `shouldUseNewUi()`

`PocketRepApp/lib/featureFlags.ts`. Returns `true` when **any** of:

1. `process.env.EXPO_PUBLIC_NEW_UI === '1'` (set at build time)
2. The web hostname is in `V2_HOSTNAMES = { 'app.pocketrep.pro' }`
3. The URL has `?v=2`

Native EAS builds leave the env var unset → production iOS / Android users keep seeing v1 until that's also flipped.

To force v2 on a Vercel preview without an env var: append `?v=2`.

---

## 6. Database schema

All tables live in `public`. Every user-data table has RLS enabled and is scoped by `auth.uid()`.

### Auth-adjacent tables

- **`auth.users`** — Supabase-managed; we don't touch directly except in the demo-user creation migration.
- **`public.profiles`** — canonical "current user" row. FK to `auth.users.id`.
  Columns: `id, email, full_name, plan, trial_ends_at, stripe_customer_id, created_at, username, industry, unlimited, onboarding_complete`
- **`public.users`** — legacy parallel users table (older code paths). Both tables track the same set of accounts; `profiles` is the canonical one for v2.

### Contacts + interaction history

- **`public.contacts`** — the heart of the rep's book
  Core: `id, user_id (→ users.id), first_name, last_name, phone, email`
  Vehicle: `vehicle, trim, vehicle_make, vehicle_model, vehicle_year, lease_end_date, current_mileage`
  Heat / status: `heat_score (0-100), last_contact_date (date), last_contact_method, last_contact_summary, rep_decision (active|kill|push|fence|watch|dead|do_not_nurture), do_not_contact (bool), preferred_language (en|es), is_past_customer`
  v1 leftovers (don't read in v2): `heat_tier (red|orange|blue)` — legacy CHECK constraint, derive tier from `heat_score` client-side instead
  Detail: `notes, next_step, milestones (jsonb), plan_label, photo_url, photo_urls (legacy), tags (text[]), budget, trade_in, purchase_date, follow_up_date, next_followup_date, stage`
  Lifecycle: `is_deleted (bool), created_at, updated_at`

- **`public.interactions`** — call/text/email touch log (older; not heavily used in v2)
- **`public.deals`** — closed sales
  `id, user_id (→ profiles.id), contact_id, title, vehicle, stock, amount, front_gross, back_gross, deal_type (NEW|CPO|USED), funding (finance|lease|cash), split (bool), split_with, closed_at (date), notes, created_at`
- **`public.tags`** — user-scoped tag library
  `id, user_id (→ profiles.id), name, color, created_at`
- **`public.contact_milestones`** — date-bound urgency tags (lease_end, mileage_threshold, purchase_anniversary, budget_ready, birthday, custom)
  `id, contact_id, user_id, milestone_type, milestone_date, urgency_score (0-100), notes, is_active`

### Sequences (Game Plan)

- **`public.sequences`** — multi-step outreach cadences
  `id, user_id, name, description, sequence_type (prospect|sold|custom), is_template, is_custom, is_archived, source_intent, is_ai_drafted, draft_status (pending_review|approved|sending|sent|cancelled), language (en|es|mixed), notes_hash, created_at`
- **`public.sequence_steps`** — per-step config
  `id, sequence_id, step_number, delay_days, channel (text|call|email), message_template, ai_personalize, contact_id (for blast sequences), personalization (jsonb), game_plan, language, hook_used, rep_edited, created_at`
- **`public.contact_sequences`** — active enrollments
  `id, user_id, contact_id, sequence_id, current_step, status (active|paused|completed|cancelled), started_at, next_step_at, completed_at`

### Rex / AI

- **`public.rex_messages`** — raw conversation log per rep, used by cross-deal memory
  `id, user_id (→ profiles.id), contact_id, role (user|assistant), content, created_at`
- **`public.rex_memory`** — rolling summary per rep (4-6 bullets)
  `id, user_id (unique), summary, message_count, updated_at`
- **`public.rex_action_log`** — audit trail of confirmed/cancelled/executed Rex actions
  `id, user_id, action_type, action_payload (jsonb), contact_ids (uuid[]), confirmed_at, executed_at, result (success|cancelled|partial|failed), created_at`
- **`public.daily_ai_usage`** — `ai-proxy/brain` per-user daily cap accounting
  `id, user_id, usage_date, input_tokens, output_tokens, cost_cents, request_count, updated_at`

### Nurture + holidays

- **`public.nurture_messages`** — every draft Rex queues (and the rep's manual sent_at + reply marking)
  `id, contact_id, user_id, message_text, language, hook_used, trigger_type, pitch_intensity, scheduled_for, sent_at, reply_received, reply_text, reply_sentiment, created_at`
- **`public.holiday_calendar`** — what the cron checks each morning
  `id, holiday_name, holiday_date, tone_guidance, pitch_intensity, applies_to_dead_leads, applies_to_past_customers, applies_to_active_leads, created_at`
  Seeded with 9 US 2026 holidays (New Year, Valentine's Day, Memorial Day, July 4, Labor Day, Halloween, Thanksgiving, Black Friday, Christmas).

### Metrics & analytics

- **`public.weekly_digests`** — one row per user × ISO week
  `id, user_id, week_start (date), units, commission, gross, contacts_added, contacts_touched, summary, highlights, generated_at`
- **`public.heat_sheet_log`** — older daily heat snapshot (not actively used in v2)
- **`public.rex_usage`** — older usage counter (legacy)
- **`public.mass_texts`** — older blast log (legacy; superseded by `nurture_messages`)

### Pay plan + push

- **`public.pay_plans`** — rep comp configuration
  `user_id (pk → profiles.id), front_pct, back_pct, flat_mini, base_salary, spiff_per_unit, unit_bonus, unit_bonus_tiers (jsonb), updated_at`
- **`public.user_push_tokens`** — Expo Push tokens
  `id, user_id, expo_token, platform (ios|android|web), device_name, last_used_at, created_at`

### Legacy "other dealership" tables (not v2)

- `dealers, customers, drafts, messages, appointment_signals` — older dealer-integration path. Not wired into v2.

---

## 7. Migrations history

In order. All idempotent (`IF NOT EXISTS` / `ON CONFLICT DO NOTHING`). Live state matches the latest applied migration.

| File | What |
|---|---|
| `20260523_v2_schema_extensions.sql` | adds vehicle/trim/budget/trade_in/milestones/next_step/plan_label to contacts; new `tags` + `pay_plans` tables |
| `20260523_v2_marcus_seed.sql` | `seed_marcus_for_user(uuid)` function + trigger on `auth.users` insert to call it |
| `20260526_v2_handle_new_user_fix.sql` | adds `ON CONFLICT (id) DO NOTHING` to `handle_new_user()` (the Rex Lens V25 unblocker); revokes anon EXECUTE on SECURITY DEFINER funcs |
| `20260526_v2_demo_user_and_backfill.sql` | backfills missing profiles + Marcus seed; creates `demo@pocketrep.pro` |
| `20260526_v2_demo_full_seed.sql` | seeds 9 more mock contacts on the demo account |
| `20260526_v2_demo_deals_seed.sql` | 25 Jan-Apr 2026 mock deals on demo |
| `20260526_v2_demo_may_deals.sql` | 5 May 2026 deals so MTD ≠ 0 |
| `20260526_v2_weekly_digests.sql` | weekly_digests table |
| `20260527_v2_rex_intelligence_schema.sql` | contacts adds (rep_decision/lease_end_date/etc.) + contact_milestones/nurture_messages/holiday_calendar/rex_action_log/user_push_tokens + sequences extensions + 9 US 2026 holidays |
| `20260527_v2_rex_intelligence_seed.sql` | backfill rep_decision='active', Sofia → preferred_language='es', demo lease-end milestones |
| `20260527_v2_profiles_onboarding_complete.sql` | adds `profiles.onboarding_complete` |
| `20260527_v2_contact_photos_bucket.sql` | public storage bucket `contact-photos` + RLS keyed to user_id prefix |

Plus runtime-only, not in repo:
- `pg_cron` + `pg_net` extensions enabled
- Cron job `nurture-scheduler-daily` scheduled at `0 14 * * *` UTC

---

## 8. Demo account

For QA + the v2 web auto-signin flow.

- **Email**: `demo@pocketrep.pro`
- **Password**: `PocketRepDemo2026!`
- **UUID**: `d0000000-0000-0000-0000-000000000001`
- **Plan**: pro · 30-day trial

Seeded state:
- 10 contacts (4 hot · 3 warm · 3 watch) with realistic vehicle data
- 30 deals (Jan–May 2026) totaling ~$89K YTD commission
- 12 starter tags
- 3 lease-end milestones (Marcus, Priya, Derek)
- Sofia Alvarez-Chen flagged `preferred_language='es'` for the bilingual smoke test
- Ravi + Amelia flagged `is_past_customer=true` so the holiday nurture cron has something to chew on

Test commands:
```sql
SELECT COUNT(*) FROM contacts WHERE user_id='d0000000-0000-0000-0000-000000000001' AND is_deleted=false;
-- 10

SELECT COUNT(*) FROM deals WHERE user_id='d0000000-0000-0000-0000-000000000001';
-- 30
```

---

## 9. Sign-in flow

Two paths:

**Web v2 (auto-signin demo)**
- `lib/v2/demoAuth.ts → ensureDemoSession()` runs once at `AppShell` mount
- If no session exists, signs in as `demo@pocketrep.pro` with the hardcoded password
- If a real session already exists (a real user signed in elsewhere) it no-ops

**Real users**
- The v1 auth screens at `app/(auth)/` handle email signup / sign in via Supabase magic link
- On signup, the `handle_new_user()` trigger creates a `profiles` row + seeds Marcus Holloway for the new user (so every account starts with at least one contact to play with)
- The trigger is idempotent (`ON CONFLICT (id) DO NOTHING`) — previously this was the V25 Rex Lens blocker

---

## 10. Edge functions

Three live functions in `fwvrauqdoevwmwwqlfav.supabase.co/functions/v1/`:

### `ai-proxy` — brain (and STT/TTS stubs)
- `verify_jwt: false` — gateway-level open; the function does its own JWT validation
- Routes: `/ai-proxy`, `/ai-proxy/brain` → brain · `/stt` → 501 · `/tts` → 501
- Brain calls OpenRouter with `BRAIN_MODELS = ['x-ai/grok-4.3', 'moonshotai/kimi-k2.6']` (primary → fallback)
- **Per-user daily cap**: looks up `profiles.plan` (`rex_lens=75¢`, `pro=75¢`, `elite=125¢`); enforced by `daily_ai_usage` table. `profiles.unlimited=true` bypasses.
- **Requires** `Authorization: Bearer <user JWT>` header (otherwise 401). Server-to-server callers can't use this directly.
- Env: `POCKETREP_API_KEY` (OpenRouter), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Source: `PocketRepApp/supabase/functions/ai-proxy/index.ts`

### `nurture-scheduler` — daily holiday + weekly check-in cron
- `verify_jwt: false`; access guarded by `X-Cron-Secret` header (only enforced if `CRON_SECRET` env is set)
- Iterates `public.users`, for each rep:
  - If today is a holiday → queue ≤30 holiday nurtures (audience: dead/dormant/past customers)
  - If today is Monday → queue ≤10 quarterly check-ins (audience: dormant `heat_score 20-49`)
- Cadence rules: skip `do_not_contact`, skip if last nurture <30d, skip 60d after a reply, 6-month pause after a negative reply
- Variety: per-contact `last_3_hooks` injected as `hooks_to_avoid` in the brain prompt
- **Brain calls** go DIRECTLY to OpenRouter (not back through `ai-proxy/brain`) because there's no per-user JWT to satisfy the rate limiter. Uses the same `POCKETREP_API_KEY`.
- Fires Expo Push to each rep whose queue grew
- Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` (optional but recommended), `POCKETREP_API_KEY`
- Source: `PocketRepApp/supabase/functions/nurture-scheduler/index.ts`

### `send-push` — Expo Push wrapper
- `verify_jwt: true` — caller must have a valid Supabase session
- POST `{ user_id?, title, body, data? }` — refuses to push to other users
- Looks up `user_push_tokens` for the caller, fans out to Expo Push, bumps `last_used_at`
- Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Source: `PocketRepApp/supabase/functions/send-push/index.ts`

### Older functions (not v2)
- `ai-closer` — older Rex flow, currently inactive
- `stripe-webhook` — Stripe subscription webhook (untouched)

### To deploy a function
The MCP `deploy_edge_function` tool can deploy directly. Or via CLI:
```bash
supabase functions deploy nurture-scheduler
```
**Always use `https://esm.sh/...` imports**, not `jsr:`. Metro chokes on `jsr:` when scanning the repo. The existing `ai-proxy` is the canonical example.

---

## 11. The cron

Scheduled via `pg_cron`:

```sql
SELECT cron.schedule(
  'nurture-scheduler-daily',
  '0 14 * * *',  -- 14:00 UTC = 9 AM ET / 6 AM PT
  $$ SELECT net.http_post(
       url := 'https://fwvrauqdoevwmwwqlfav.supabase.co/functions/v1/nurture-scheduler',
       headers := '{"Content-Type": "application/json"}'::jsonb,
       body := '{}'::jsonb
     ); $$
);
```

Currently runs without `X-Cron-Secret`. If you want to lock it down:
```bash
supabase secrets set CRON_SECRET=<random 32 char string>
```
Then update the cron's `headers` JSON to include `"X-Cron-Secret": "<value>"`.

**To inspect or change the schedule:**
```sql
SELECT * FROM cron.job;
SELECT cron.unschedule('nurture-scheduler-daily');
-- then re-schedule with new cron expression
```

**To trigger manually (from SQL editor or `execute_sql`):**
```sql
SELECT net.http_post(
  url := 'https://fwvrauqdoevwmwwqlfav.supabase.co/functions/v1/nurture-scheduler',
  headers := '{"Content-Type": "application/json"}'::jsonb,
  body := '{}'::jsonb
);
-- Poll the response:
SELECT id, status_code, content::text FROM net._http_response ORDER BY id DESC LIMIT 5;
```

---

## 12. Supabase Storage

One bucket: **`contact-photos`** (public-read)

- Path layout: `<user_id>/<contact_id>-<timestamp>.<ext>`
- Public read so `<Image src=publicUrl>` works without auth tokens
- Write / update / delete locked to the rep's own `user_id/` prefix via RLS
- Client: `lib/v2/contactPhoto.ts → pickAndUploadContactPhoto(contactId)` runs `expo-image-picker` (lazy required), uploads to bucket, stamps `contacts.photo_url`

---

## 13. Expo Push

- **Server side**: `send-push` edge function wraps the Expo Push API
- **Client side**: `lib/v2/pushNotifications.ts → registerForPush()` runs on `AppShell` mount, lazy-requires `expo-notifications`, prompts permission, upserts the token into `user_push_tokens`
- **Web no-ops** (Expo Push doesn't support web tokens in our setup); native iOS/Android registers
- **Test path**: Profile → REX → "Send a test push" calls `sendTestPush()` which POSTs to `send-push` with the user's session JWT

Notification triggers in v1:
- Morning Heat Sheet ready (daily 8am local — TODO, not yet wired)
- Holiday nurture drafts queued (fires from `nurture-scheduler`)
- Quarterly check-in drafts queued (fires from `nurture-scheduler`)
- Stalled lead alert (TODO, not yet wired)

---

## 14. v2 surface map — every tab + every overlay

`PocketRepApp/components/v2/AppShell.tsx` is the top-level controller. Holds:
- 4 tabs: `heat | contacts | metrics | profile`
- All overlay state (selected contact, dealLoggerOpen, blastDraft, stalledOpen, nurtureReviewerOpen, gamePlanOpen, payPlanOpen, addContactOpen, disclosureOpen, onboardingOpen)
- The `useContacts` + `usePayPlan` + `useTags` hooks are owned here and passed down

### Tabs

| Tab | File | What it shows | Source spec |
|---|---|---|---|
| Heat Sheet | `HeatSheetTab.tsx` | Today banner with overdue count · `WeeklyDigestCard` · `NurtureBanner` · HOT/WARM/WATCH sections with days-since counters | `design/extracted/tab-heat.jsx` |
| Contacts | `ContactsTab.tsx` | Search · filter chips (All · 🔥/☀️/👁 + custom tags) · `+` add button · ＋ Tag bulk flow · alphabetical sections with avatar + tag pills + tier dot | `tab-contacts.jsx` |
| Metrics | `MetricsTab.tsx` | YTD hero · 12-month bar chart · MTD + Projected · ＋ LOG A DEAL · monthly accordion | `tab-metrics.jsx` |
| You (profile) | `ProfileTab.tsx` | Hero with avatar + name · Plan callout · `PayPlanSummary` (tappable) · COMPENSATION → Game Plan link · WORKSPACE/REX/ACCOUNT row groups · "Always listen for Hey Rex" Switch · Test push · LEARN replay-onboarding · Sign out · footer | `tab-profile.jsx` |

### Overlays (mounted by AppShell, dismissable)

| Component | Trigger | Source spec |
|---|---|---|
| `ContactDetail.tsx` | Tap a contact row anywhere | `contact-detail.jsx` (the big one, ~900 LOC) |
| `DealLogger.tsx` | Metrics CTA `＋ LOG A DEAL`, ContactDetail `＋ LOG DEAL`, voice `log_deal` | `deal-logger.jsx` |
| `AddContactModal.tsx` | Contacts tab `＋` button | designed inline |
| `BulkTagFlow.tsx` | Contacts tab `＋ Tag` dashed chip | `tab-contacts.jsx → BulkTagFlow` |
| `BlastSequenceDrafter.tsx` | Voice `create_blast_sequence` after confirm | designed inline |
| `StalledLeadsAnalysis.tsx` | Voice `analyze_stalled_leads` | designed inline |
| `NurtureReviewer.tsx` | Heat Sheet `NurtureBanner` tap; voice `schedule_nurture_blast` | designed inline |
| `GamePlanSheet.tsx` | Profile COMPENSATION → Game Plan | `tab-gameplan.jsx` |
| `SequenceEditor.tsx` | Tap a sequence card inside GamePlanSheet | `tab-gameplan.jsx → TemplateEditor` |
| `PayPlanEditor.tsx` | Tap `PayPlanSummary` in Profile | `pay-plan.jsx` |
| `Onboarding.tsx` | First launch after disclosure; Profile → LEARN → Sales rep playbook | `onboarding.jsx` |
| `RexDisclosure.tsx` | First launch (`!hasSeenDisclosure()`) | designed inline |
| `HeyRexSheet.tsx` | Listener state past idle or pending action | designed inline |

### Small atomic UI in `components/v2/`

- `atoms.tsx` — `Label`, `Pill`, `Avatar` (now image-aware), `StatNumber`, `SectionHead`, `HeatStripe`, `rgbaTint()` helper
- `tokens.ts` — `TIERS` (hot/warm/watch with color/icon/label), `stalenessColor(days)`
- `LanguageToggle.tsx` — EN/ES pill toggle (in ContactDetail hero)
- `BookSummaryCard.tsx` — book_summary brain payload renderer in HeyRexSheet
- `ContactListPreview.tsx` — filter_contacts payload renderer
- `MarkReplyButton.tsx` — Positive/Neutral/Negative/Later inline panel
- `NurtureBanner.tsx` — top of Heat Sheet, shows pending + sent-awaiting-reply counts
- `PayPlanSummary.tsx` — Profile compensation card
- `WeeklyDigestCard.tsx` — top of Heat Sheet

---

## 15. `lib/v2/` map — every helper

| File | What it owns |
|---|---|
| `useContacts.ts` | Fetches contacts, sorts by heat desc + days asc, exposes `patchLocal` for optimistic updates and `reload` for forced refetch |
| `useTags.ts` | Fetches user's tag library; supports `refetchKey` arg |
| `useDeals.ts` | Per-contact deals (used by ContactDetail) |
| `useUserDeals.ts` | All deals for current user (used by MetricsTab); supports `refetchKey` |
| `useSequences.ts` | Joins sequences + sequence_steps + active enrollments; also exports `updateSequenceStep`, `renameSequence`, `archiveSequence` |
| `useHeyRex.ts` | Top-level Hey Rex controller — owns listener lifecycle, runs `rexInterpret`, exposes `{state, partial, thinking, action, executing, error, filteredIds, confirm, cancel, dismissFiltered}` |
| `usePayPlan.ts` (in `payPlan.ts`) | Loads + caches the user's saved pay plan |
| `contactNurtures.ts` | `useContactNurtures(contactId)` for the "AWAITING REPLY" section in ContactDetail |
| `useUserDeals.ts` | All deals for current user |
| | |
| `supabase.ts` (at `lib/`) | Supabase client init |
| `demoAuth.ts` | `ensureDemoSession()` — web auto-signin |
| `rexSettings.ts` | localStorage-backed Hey Rex prefs + onboarding flag (now mirrors to `profiles.onboarding_complete`); `subscribeAlwaysListen` event for live toggle propagation |
| `featureFlags.ts` | `shouldUseNewUi()` |
| | |
| `bookContext.ts` | `loadBookContext()` builds the BOOK STATE payload Rex sees on every voice call; `bookContextForPrompt()` compacts it to text |
| `rexActions.ts` | THE central tool-use file. Defines `RexAction` union, the brain prompt, `rexInterpret()`, `executeAction()`, `summarizeAction()`, `actionWritesData()`, `logRexAction()`, `REX_COPY_RULES` (exported, see §17) |
| `rexMemory.ts` | `getRexMemory()` + `recordRexTurn()` + summary regeneration every 8 turns |
| `heyRexListener.ts` | Web Speech API state machine (idle → awake → processing) with 4s silence trigger |
| `callNext.ts` | Deterministic "who do I call next" picker; opener templates that already obey copy rules |
| `batchActions.ts` | bulk add_tag / mark_dead / mark_active / archive |
| `stalledLeads.ts` | `analyzeStalledLeads()` — KILL/PUSH/FENCE decision tree + brain re-engagement openers |
| `blastSequences.ts` | `createBlastDraft()` + `recordSentBlast()` + `copyRuleViolations()` regex sanity net |
| `gamePlan.ts` | One-off Game Plan per-contact AI (the button in ContactDetail) |
| `nurtureEngine.ts` | `scheduleNurtureBlast()` (the client-side equivalent of the cron) + `loadPendingNurtures()` + `markNurtureSent()` + `dismissNurture()` + `countNurtureBanners()` |
| `manualReplyTracker.ts` | `markNurtureReply({kind: positive|neutral|negative|later})` with the cascade side effects |
| `weeklyDigest.ts` | `getLatestDigest()` + `generateDigestForCurrentWeek()` |
| | |
| `updateContact.ts` | `updateContactNotes`, `updateContactTags`, `createContact`, `deleteContact`, `updateContactPreferredLanguage` |
| `tagMutations.ts` | `createTag`, `applyTagToContacts` |
| `dealLogger.ts` | `calcCommission` (legacy default plan), `insertDeal` (now reads `pay_plans`) |
| `payPlan.ts` | `loadPayPlan`, `savePayPlan`, `usePayPlan(refetchKey)`, `calcCommissionWithPlan`, `DEFAULT_PAY_PLAN` constants |
| `contactPhoto.ts` | `pickAndUploadContactPhoto(contactId)` |
| `pushNotifications.ts` | `registerForPush()` on boot, `sendTestPush()` |

---

## 16. Hey Rex — listener + tool-use

### Listener state machine (`heyRexListener.ts`)

```
IDLE → continuous interim listen, scan for "hey rex" / "hi rex" / "ok rex"
     ↓
AWAKE → accumulate transcript, reset 4s silence timer on every chunk
     ↓ (4s of silence)
PROCESSING → emit utterance to caller, pause until .resume()
     ↓
back to IDLE
```

Also surfaces `'unsupported'` (Web Speech API not available) and `'denied'` (mic permission refused). Auto-restarts on Chrome's silent `onend`.

### Wake words

- "hey rex" / "hi rex" / "ok rex" — case-insensitive

### Tool-use actions (`rexActions.ts`)

Brain returns a single JSON object in a fenced block. Actions:

| Action | What it does | Writes? |
|---|---|---|
| `add_contact` | Create a contact | ✅ |
| `update_notes` | Append to `contacts.notes` | ✅ |
| `delete_contact` | Soft delete | ✅ |
| `log_deal` | Insert into `deals` | ✅ |
| `schedule_followup` | Set `contacts.next_followup_date` | ✅ |
| `show_contact` | Open detail card | — |
| `filter_contacts` | Return matching ids + summary | — |
| `book_summary` | Pipeline snapshot | — |
| `call_next` | Pick the next call (deterministic local re-derivation after brain returns) | — |
| `batch_action` | bulk add_tag / mark_dead / mark_active / archive | ✅ |
| `create_blast_sequence` | Pivots into BlastSequenceDrafter | ✅ (eventually via the drafter) |
| `analyze_stalled_leads` | Opens StalledLeadsAnalysis | — |
| `schedule_nurture_blast` | Inserts pending nurture_messages, opens NurtureReviewer | ✅ |
| `clarify` | Ask back when names collide | — |
| `say` | Informational reply, no write | — |

All write actions go through a Confirm card in `HeyRexSheet` first. `actionWritesData()` enumerates which require confirmation.

### Memory

- `rex_memory.summary` is threaded into every brain prompt as "WHAT YOU REMEMBER ABOUT THIS REP"
- After every successful action, `recordRexTurn()` logs the utterance + Rex's reply to `rex_messages`
- Every 8 turns, the brain regenerates the rolling summary (4-6 short bullets)

---

## 17. `REX_COPY_RULES` — the canonical tone spec

Single source of truth. Lives in `lib/v2/rexActions.ts` and is appended to every brain prompt that produces user-facing copy. Mirrored in the `nurture-scheduler` edge function.

```
Tone
- Casual, plain talk
- Lowercase opener: "hey" / "hola" / "qué tal" / "qué onda"
- No jargon, no filler, no emojis (unless contact uses them)

Punctuation
- NEVER use dashes (em-dash —, en-dash –, hyphen between phrases)
- Hyphens inside compound words ("trade-in", "follow-up") are fine
- Use commas, periods, line breaks
- NEVER use bullets or numbered lists in draft text
- No semicolons in drafts. Short sentences.

Closers (pick one)
- "let me know if I can help with anything"
- "just say the word"
- "let me know"
- "avísame si te puedo ayudar con algo" (ES)
- "nomás dime" (ES)
NEVER use: "no rush", "no pressure", "no hurry"

Anti-patterns (NEVER generate)
- "just checking in"
- "following up on our last conversation"
- "hope this finds you well" / "hope all is well"
- "I wanted to reach out" / "touching base"

Bilingual
- Spanish is a REWRITE not a translation
- Target Mexican slang: "carro" not "coche", "chamba", "nomás", "qué onda"

Length
- Under 280 characters
- 2-4 sentences max

Vehicle language
- Trade-ins = "potential equity in your current vehicle"
- Don't say "your old car" — "your current ride" or "what you're driving"

Inference language (when data is incomplete)
- Mileage/lease-end INFERRED → soften ("if you're getting close to your cap")
- Never fabricate specific numbers
```

`blastSequences.copyRuleViolations()` is a regex-based local sanity net — flags em-dash, en-dash, "no pressure", "just checking in", "touching base", "hope this finds you well", "wanted to reach out", "following up on" if the brain slips one past. Surfaced as a per-draft warning in BlastSequenceDrafter.

---

## 18. Nurture engine

### Audiences
- `dead` — `rep_decision IN ('dead','kill')` OR `heat_score < 20`
- `dormant` — `heat_score 20-49 AND days_silent > 30`
- `past_customers` — `is_past_customer = true`
- `all_inactive` — union of the above

### Cadence rules (enforced in `scheduleNurtureBlast`)

| Skip if… | Reason |
|---|---|
| `do_not_contact = true` | permanent flag |
| Last nurture sent <30 days ago | recent_nurture |
| Last reply received <60 days ago | recent_reply (rep takes over) |
| Last reply was `negative` and <180 days ago | negative_pause |

### Variety rule
Per-contact `last_3_hooks_used` is passed to the brain as `hooks_to_avoid`. Brain is instructed never to repeat a hook within the variety window.

### Triggers
- **Holiday** — every morning, `nurture-scheduler` checks `holiday_calendar`. 9 US 2026 holidays seeded.
- **Quarterly** — Mondays, max 10/rep
- **Custom (voice)** — rep says "queue a nurture about X" → `schedule_nurture_blast`

### Reply routing (manual V1)
Rep marks reply in ContactDetail or NurtureReviewer:
- **Positive** → heat +20, `rep_decision = 'active'`, `last_contact_date = today`
- **Negative** → `do_not_contact = true`, `rep_decision = 'do_not_nurture'`
- **Neutral** → flag row only
- **Later N days** → heat +10, `next_followup_date = today + N`

Twilio webhook for auto-classification is explicitly deferred (the user said disregard).

---

## 19. Pay plan + commission math

### Schema
`public.pay_plans` — one row per user (PK on `user_id`). Columns map to the editor:

| DB column | Editor field |
|---|---|
| `front_pct` | Front gross % |
| `back_pct` | Back gross % |
| `flat_mini` | Flat mini per unit |
| `base_salary` | Monthly base |
| `spiff_per_unit` | "Spiffs" per unit |
| `unit_bonus` | "Unit bonus" per unit (CSI etc.) |
| `unit_bonus_tiers` | jsonb `[{units, bonus}, …]` |

### Default (`DEFAULT_PAY_PLAN`)
```ts
{ frontPct: 25, backPct: 5, flatMini: 200, baseSalary: 2000,
  manuBonus: 250, csiBonus: 400,
  unitBonuses: [{units: 10, bonus: 500}, {units: 15, bonus: 1000}, {units: 20, bonus: 1500}] }
```
Used for new users until they edit their plan.

### Formula (`calcCommissionWithPlan`)
```
front = (frontGross * frontPct) / 100
back  = (backGross  * backPct)  / 100
base  = max(front + back, flatMini)
total = round((base + manuBonus + csiBonus) * (split ? 0.5 : 1))
```
Unit bonus tiers are not yet applied in the per-deal math — they're a monthly bonus on top once units are tallied. (Future PR: surface this in Metrics.)

### Where it runs
- `DealLogger` live payout card uses `calcCommissionWithPlan` with the user's saved plan
- `insertDeal` re-computes at insert time so the stored `deals.amount` reflects the plan at sale time
- Changing the plan **does NOT** retroactively recompute historical deals — that's intentional

---

## 20. Sequences (Game Plan)

### Read viewer (`GamePlanSheet`)
Lists all the rep's sequences + the user's tags' templates. Reachable from Profile → COMPENSATION → "Game Plan".

### Editor (`SequenceEditor`)
Tap any sequence card. Per-step fields:
- Channel toggle (`text` | `call` | `email`)
- Delay days (integer)
- Message template with `{{token}}` highlighting in preview · token-chip insert in raw mode

Tokens supported: `first_name, rep_name, dealer, vehicle, color, trade_value, lease_end`

Rename + Archive (soft-hide via `is_archived=true`) at the bottom.

### AI-drafted sequences
Blast sequences (`is_ai_drafted=true`) created by Rex use the same `sequences` + `sequence_steps` tables. Each contact gets its own step row with `contact_id` set (instead of being a template). Filtering live vs draft uses `draft_status`.

---

## 21. Cross-deal memory

Every Rex voice call sees:

1. **BOOK STATE** — built fresh by `loadBookContext()`. Includes tier buckets, stalled segment, past customers, by-make/model counts. Capped at 30 rows per tier; rep drills via `filter_contacts` for the rest.
2. **WHAT YOU REMEMBER ABOUT THIS REP** — `rex_memory.summary` (4-6 short bullets covering recurring patterns, open follow-ups, customer preferences). Regenerated every 8 turns.

This makes voice queries like "who haven't I touched in 2 weeks?" or "queue a Memorial Day nurture for my past customers" actually possible without the rep saying the names.

---

## 22. Onboarding

8-step playbook. `Onboarding.tsx` ports `design/extracted/onboarding.jsx` 1:1 (per-step kicker, title, body, optional bullets + tip + illustration).

Triggers on first launch after the disclosure modal, if `hasCompletedOnboarding()` is false. Replayable from Profile → LEARN → "Sales rep playbook".

Completion state lives in **two places**:
- `profiles.onboarding_complete` (canonical, follows the user across devices)
- `localStorage:pocketrep:v2:onboarding-complete` (fast read-through cache so the disclosure doesn't flash on every load)

`syncOnboardingFromProfile()` runs on boot and hydrates the cache from the profile.

---

## 23. Anti-patterns & traps

- **Don't touch `contacts.heat_tier`** — legacy CHECK constraint with values `red/orange/blue`. v2 derives the tier from `heat_score` client-side (`>=80` hot · `50-79` warm · `<50` watch).
- **Don't use `jsr:` imports in edge functions** — Metro bundler scans the repo and chokes. Use `https://esm.sh/...` instead (matches the existing `ai-proxy` convention).
- **Don't call `ai-proxy/brain` from server-to-server** — it requires a per-user JWT. Server-side fan-out (cron, etc.) goes directly to OpenRouter with `POCKETREP_API_KEY`.
- **Don't add dynamic `require(varname)`** — Metro requires string-literal `require('exact-module-name')` for static analysis. Use lazy `try { require('expo-notifications') } catch {}` pattern from `pushNotifications.ts`.
- **`fontVariantNumeric` is not a valid RN Text style** — it's web/CSS only. Strip it from any port.
- **Don't widen `last_contact_date`** — it's `date` (not `timestamptz`); changing it would break every reader.
- **Demo password is semi-public** (`PocketRepDemo2026!`) — it's baked into client code for auto-signin. The demo account only sees seeded RLS-scoped data so leakage isn't dangerous, but don't treat it as secure.
- **Don't push to `main`** — PR flow only.

---

## 24. Known gaps / explicitly deferred

- **Twilio reply webhook** — user said disregard. Manual reply marking covers V1.
- **Native iOS/Android wake-word** — needs Picovoice or similar (Picovoice was removed in `remove-picovoice` branch). Push-to-talk via orb still works on native.
- **`tab-rex.jsx` full chat tab** — voice already covers it; not ported.
- **`upgrade-sheet.jsx` Stripe upsell** — needs Stripe webhook + plan-limit enforcement first.
- **Unit bonus tiers in commission math** — `pay_plans.unit_bonus_tiers` is editable but not yet applied in monthly bonus calculation (would surface in Metrics).
- **Sequences enrollment UI** — editor exists but per-contact enroll flow doesn't (no "enroll Marcus in Fresh Up Follow Up" button yet).
- **Audit log viewer** — `rex_action_log` is populated but nothing surfaces it in the UI.
- **Morning Heat Sheet push notification** — wired in `nurture-scheduler` paths but no separate daily-summary trigger yet.
- **`speechSynthesis` replay of Rex's "say" line** — text-only today.
- **Email delivery for the weekly digest** — generates in-app card only.

---

## 25. Where to look next

If a new session needs to pick up:

1. **Read this file top-down** — it's the orientation.
2. **`components/v2/AppShell.tsx`** — the navigation map; every other component is reachable from there.
3. **`lib/v2/rexActions.ts`** — the brain prompt + action union; every voice feature lives here.
4. **`design/extracted/*.jsx`** — design source of truth for anything not yet ported.
5. **Latest migrations folder** — check what's been applied vs. local repo.
6. **Live Supabase dashboard** — https://supabase.com/dashboard/project/fwvrauqdoevwmwwqlfav — to inspect tables, RLS, edge function logs, cron schedule, and the secrets list.

**Production URL**: https://app.pocketrep.pro — auto-signs in as the demo user on first visit.
**Preview URL** (current branch): https://project-t90u1-git-claude-exci-dc8df9-dryvnagency-1422s-projects.vercel.app — append `?v=2` if v2 doesn't auto-load.

---

End of handoff. Anything missing is intentionally absent or a real gap — flag it back.
