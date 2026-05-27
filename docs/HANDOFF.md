# PocketRep handoff — v2 cutover edition

**Last updated**: 2026-05-26
**Repo**: `DryvnAgency/PocketRep`
**Live web**: `app.pocketrep.pro` (served by Vercel project `project-t90u1` once the domain is moved off `pocket-rep`)
**Backend**: Supabase project `fwvrauqdoevwmwwqlfav` (`https://fwvrauqdoevwmwwqlfav.supabase.co`)
**Source of truth for design**: `design/PocketRep-Standalone.html` → extracted to `design/extracted/*.jsx`
**Open work branch**: `claude/exciting-goodall-or4T2`

---

## 1. What's shipped

| PR | Title | Sha (squash) |
|---|---|---|
| #31 | Heat Sheet + Contacts wired + handle_new_user hotfix | `be0740d` |
| #32 | Contact detail + Game Plan AI + Profile + Metrics | `5c292e3` |
| #33 | Log Deal + Bulk-tag flow + cutover-ready feature flag | `26c4576` |
| _next_ | Add/Delete contact + Hey Rex disclosure + settings toggle (this PR) | — |

Plus three earlier PRs already merged before this session: #25 (Expo Web scaffold), #26 (chrome + nav), #27/#28/#29 (v2 schema + Marcus seed).

---

## 2. v2 surface map (all on `?v=2` web)

| Tab | Component | Source spec | Notes |
|---|---|---|---|
| Heat Sheet | `components/v2/HeatSheetTab.tsx` | `tab-heat.jsx` | Today banner, HOT/WARM/WATCH sections, days-since counter |
| Contacts | `components/v2/ContactsTab.tsx` | `tab-contacts.jsx` | Search + tier/tag filter carousel + alphabetical sections, + Tag opens BulkTagFlow, + button opens AddContactModal |
| Metrics | `components/v2/MetricsTab.tsx` | `tab-metrics.jsx` | YTD hero, 12-mo bar chart, MTD/projected cards, monthly accordion, + LOG A DEAL → DealLogger |
| You | `components/v2/ProfileTab.tsx` | `tab-profile.jsx` | Hero + plan callout + groups + "Always listen for Hey Rex" toggle + sign out |
| (overlay) | `components/v2/ContactDetail.tsx` | `contact-detail.jsx` | Hero, milestones, notes editor, Game Plan AI, deal log, ⋯ menu → delete contact |
| (overlay) | `components/v2/DealLogger.tsx` | `deal-logger.jsx` | Bottom-sheet form + live commission preview |
| (overlay) | `components/v2/BulkTagFlow.tsx` | `tab-contacts.jsx` (BulkTagFlow) | 2-step create/pick → multi-select → apply |
| (overlay) | `components/v2/AddContactModal.tsx` | (designed inline) | First name + phone min; vehicle/budget/tier/timeline optional |
| (overlay) | `components/v2/RexDisclosure.tsx` | (designed inline) | First-run mic disclosure; opt-in/out toggle for always-listening |

### Shared atoms / hooks

`components/v2/atoms.tsx` — `Label`, `Pill`, `Avatar`, `StatNumber`, `SectionHead`, `HeatStripe`, `rgbaTint`
`components/v2/tokens.ts` — `TIERS`, `stalenessColor`
`components/v2/CustomNavBar.tsx` · `TabBar.tsx` · `HeyRexOrb.tsx` — chrome
`lib/v2/useContacts.ts` — fetches + sorts contacts (hoisted in `AppShell`, shared with all surfaces; supports optimistic `patchLocal` and `reload`)
`lib/v2/useTags.ts` — fetches tags (`refetchKey` arg)
`lib/v2/useDeals.ts` — per-contact deals (`contactId` + `refetchKey`)
`lib/v2/useUserDeals.ts` — all deals for current user (`refetchKey`)
`lib/v2/demoAuth.ts` — auto-signs into `demo@pocketrep.pro` on web boot if no session
`lib/v2/updateContact.ts` — notes / tags / **createContact** / **deleteContact** (soft via `is_deleted=true`)
`lib/v2/gamePlan.ts` — POSTs to `ai-proxy/brain` with the CHANNEL/WHY/SCRIPT prompt
`lib/v2/dealLogger.ts` — `calcCommission` + `insertDeal`
`lib/v2/tagMutations.ts` — `createTag` + `applyTagToContacts`
`lib/v2/rexSettings.ts` — `getAlwaysListenEnabled` / `setAlwaysListenEnabled` / `hasSeenDisclosure` / `markDisclosureSeen` (localStorage-backed on web)

---

## 3. Database state (Supabase `fwvrauqdoevwmwwqlfav`)

Migrations in `PocketRepApp/supabase/migrations/`:

- `20260523_v2_schema_extensions.sql` — adds `vehicle/trim/budget/trade_in/milestones/next_step/plan_label` to `contacts`, plus `tags` + `pay_plans` tables (PR #27)
- `20260523_v2_marcus_seed.sql` — `seed_marcus_for_user` + trigger to call it on signup (PR #29)
- `20260526_v2_handle_new_user_fix.sql` — adds `ON CONFLICT (id) DO NOTHING` to the trigger (was rolling back signups with pre-existing profile rows; surfaced as the Rex Lens V25 "Database error querying schema") and revokes anon `EXECUTE` on the two SECURITY DEFINER functions
- `20260526_v2_demo_user_and_backfill.sql` — backfills profile+Marcus for users the broken trigger skipped; creates `demo@pocketrep.pro` (password `PocketRepDemo2026!`)
- `20260526_v2_demo_full_seed.sql` — 9 additional mock contacts (Priya/Derek/Sofia/etc.) for the demo account
- `20260526_v2_demo_deals_seed.sql` — 25 Jan–Apr 2026 mock deals
- `20260526_v2_demo_may_deals.sql` — 5 May 2026 deals (so MTD ≠ 0)

Demo account state: 10 contacts (4 hot / 3 warm / 3 watch) + 30 deals + 12 starter tags. RLS-scoped to `auth.uid()` like every other user.

---

## 4. Feature flag — `lib/featureFlags.ts`

`shouldUseNewUi()` is true when **any** of:
1. `process.env.EXPO_PUBLIC_NEW_UI === '1'` (native EAS or Vercel build-time)
2. Web hostname is in `V2_HOSTNAMES = { 'app.pocketrep.pro' }` — **dormant until the domain flips**
3. URL has `?v=2`

Native EAS builds leave the env var unset, so production iOS/Android users still see v1 until cutover.

---

## 5. The cutover (the one remaining manual step)

The feature flag is in place. The actual move is two clicks in the Vercel dashboard:

1. `pocket-rep` project → Settings → Domains → Remove `app.pocketrep.pro`
2. `project-t90u1` project → Settings → Domains → Add `app.pocketrep.pro`

Once the domain points at `project-t90u1`, `shouldUseNewUi()` returns true automatically — no code change or rebuild needed.

**Rollback**: reverse the two steps. Both projects share the same Supabase backend, so no data loss either way.

---

## 5b. Rex Intelligence build (PRs #36-#39)

The spec is in chat history (the "Rex Intelligence Build Spec" the user dropped 2026-05-26). This section tracks what's shipped vs pending against that spec.

**Foundation migrations applied to `fwvrauqdoevwmwwqlfav`:**
- `20260527_v2_rex_intelligence_schema.sql` — contacts adds (last_contact_method, last_contact_summary, rep_decision, do_not_contact, preferred_language, lease_end_date, current_mileage, vehicle_year/make/model, is_past_customer) + new tables (contact_milestones, nurture_messages, holiday_calendar, rex_action_log, user_push_tokens) + sequences/sequence_steps extensions + 2026 US holiday seed
- `20260527_v2_rex_intelligence_seed.sql` — backfill rep_decision = 'active', demo lease_end milestones, Sofia → preferred_language = 'es'

**Copy rules** — `REX_COPY_RULES` exported from `lib/v2/rexActions.ts`. Appended to every brain prompt that produces user-facing copy. Bake into any new brain prompt — never re-derive.

### PR #36 — Cross-Deal Memory · **shipped**
- `lib/v2/bookContext.ts` — `loadBookContext()` builds the full-book payload (hot/warm/watch/cold/dead, past customers, stalled list, by-make/model counts). `bookContextForPrompt()` compacts it to text for the brain (capped at 30 per tier).
- `rexInterpret()` now loads book context + Rex memory in parallel and threads BOOK STATE into the prompt with hard guidance ("never invent ids — they must appear in BOOK STATE").
- New actions: `filter_contacts`, `book_summary`, `call_next` (locally re-derived for copy safety), `batch_action`.
- `lib/v2/batchActions.ts` — bulk tag / mark_dead / mark_active / archive.
- `lib/v2/callNext.ts` — deterministic pick + opener templates (already obey copy rules so the brain can't drift on closers).
- `components/v2/BookSummaryCard.tsx` — renders book_summary payload.
- `components/v2/ContactListPreview.tsx` — renders filter_contacts payload with tap-to-open.
- `components/v2/LanguageToggle.tsx` — EN/ES switch wired into ContactDetail hero. Persists to `contacts.preferred_language` via `updateContactPreferredLanguage`.
- `useContacts` widened to surface `preferredLanguage`, `repDecision`, vehicle make/model/year, `leaseEndDate`, `currentMileage`, `isPastCustomer`, `doNotContact`.
- `useHeyRex` now exposes `filteredIds`/`dismissFiltered` and threads `contacts` into `executeAction`; logs every action to `rex_action_log` (success / cancelled / failed).

### PR #37 — Smart Blast Sequences · **shipped**
- `lib/v2/blastSequences.ts`
  - `createBlastDraft({intent, filterSummary, promotion, contacts})` — one brain call that drafts a personalized message per contact in the batch. Uses `REX_COPY_RULES` plus a "VARIETY RULE" that forbids repeating hooks or openers within the batch. Persists into `sequences` (with `is_ai_drafted=true`, `draft_status='pending_review'`) + `sequence_steps` so the rep can come back to a pending review later.
  - `copyRuleViolations(message)` — local regex sanity check that flags any draft slipping forbidden tokens past the brain (em-dash, en-dash, "no pressure", "just checking in", etc.). Surfaced as a per-draft warning in the UI.
  - `recordSentBlast` writes each sent draft to `nurture_messages` for variety tracking by future PR #39 nurture flows.
  - `markBlastApproved` / `markBlastCancelled` flip `sequences.draft_status`.
- `lib/v2/smsLauncher.ts` — `launchSms(draft)` fires `sms:` URLs through `Linking.openURL` (iOS uses `&body=`, Android `?body=`). One user gesture per message — the drafter drives the loop.
- New action `create_blast_sequence` (`rexActions.ts`) — Rex parses the rep's voice intent ("text all my Murano lease customers about 499 SL promo"), returns matched `contact_ids` from BOOK STATE + parsed `promotion`. AppShell catches the confirmation, calls `createBlastDraft`, then opens the drafter sheet.
- `components/v2/BlastSequenceDrafter.tsx` — bottom-sheet review UI. Per-contact card with: avatar, name, hook label, char count, language toggle, message (tap Edit to inline-edit), Rex's "game plan" line, copy-rule violation warning if any, and Skip / Send actions. Header shows the count, Cancel marks the sequence `cancelled`, "Send N" fires SMS one-by-one + marks the sequence `sent`.
### PR #38 — Stalled Lead Intelligence · **shipped**
- `lib/v2/stalledLeads.ts`
  - `analyzeStalledLeads({daysSilentThreshold=14, includeDead=false})` — loads BookContext, runs the spec's decision tree (KILL / PUSH / FENCE / WATCH), and for any PUSH/FENCE asks the brain (one batched call) for a re-engagement opener per contact under `REX_COPY_RULES`. Falls back to a templated opener if the brain is unreachable.
  - `batchKill(ids)` — flips `rep_decision='dead'` (KILL means "stop selling, start nurturing" per spec — not delete).
- New action `analyze_stalled_leads` (`rexActions.ts`) — voice "who haven't I contacted in two weeks" / "show me stalled leads" lands here. AppShell catches the type, opens the overlay, and runs the analyzer.
- `components/v2/StalledLeadsAnalysis.tsx` — overlay sorted by recommendation priority (PUSH > FENCE > KILL > WATCH). Each card: avatar, heat + days-silent, reason, PUSH/FENCE rows show the suggested opener in EN or ES. Multi-select check pattern; footer shows "Kill N" + "Push N" buttons that fan out to `batchKill` or to `BlastSequenceDrafter` pre-loaded with the openers.
### PR #40 — final polish · **shipped**

- **Pay Plan editor** — `components/v2/PayPlanEditor.tsx` ports `design/extracted/pay-plan.jsx`. Replaces the inert "Pay plan" row in Profile → COMPENSATION with `PayPlanSummary` (front/back/mini stat cards + pills) that opens a full editor. `lib/v2/payPlan.ts` loads from / saves to `public.pay_plans` and exposes `usePayPlan(refetchKey)` + `calcCommissionWithPlan`. DealLogger now reads the rep's real plan for the live payout preview + at insert time, so changing rates immediately affects future deal commission math.

- **Sequences editor** — `components/v2/SequenceEditor.tsx`. Tapping any card in `GamePlanSheet` opens a full editor: rename, channel toggle (text/call/email) per step, delay days per step, message template with `{{token}}` highlighting in preview mode, token-chip insert in raw mode, and an Archive sequence link with confirm. `lib/v2/useSequences.ts` exposes `updateSequenceStep` / `renameSequence` / `archiveSequence`.

- **Photo upload on Contact card** — `lib/v2/contactPhoto.ts` runs `expo-image-picker` (lazy-loaded), uploads to the new `contact-photos` Supabase Storage bucket (path `<user_id>/<contact_id>-<timestamp>.<ext>`), and stamps `contacts.photo_url`. ContactDetail hero now has a tap-to-upload affordance with a `+` / `↻` badge. `Avatar` atom renders the photo when `photoUrl` is provided, falls back to initials otherwise. RLS keys writes to the rep's own user_id prefix; bucket is publicly readable so `<Image>` works without auth.

- **MarkReplyButton in ContactDetail** — recent sent nurtures that haven't been marked yet appear above the Deal Log as a "NURTURE · AWAITING REPLY" section. The collapsed pill opens the same inline panel from `NurtureReviewer` (Positive / Neutral / Negative / Follow-up later N days + optional reply text capture) and triggers the right side effects via `markNurtureReply` (heat bump, `rep_decision` update, `do_not_contact`, `next_followup_date`).

- **Onboarding persisted to profile** — `profiles.onboarding_complete` column added; `markOnboardingComplete()` writes to Supabase + localStorage cache; `syncOnboardingFromProfile()` hydrates the cache on boot so a fresh browser doesn't replay the playbook for someone who already finished it.

### PR #39 — Nurture Engine + manual reply tracker · **shipped (V1)**
- `lib/v2/nurtureEngine.ts`
  - `scheduleNurtureBlast({trigger, audience, customIntent?})` — loads BookContext, filters by audience (`dead` / `dormant` / `past_customers` / `all_inactive`), runs cadence checks (skip `do_not_contact`, skip if last nurture <30d, skip 60d after a reply, 6-month pause after a `negative` reply), fetches `last_3_hooks_used` per contact, then makes one batched brain call with `REX_COPY_RULES` plus a VARIETY RULE that forbids any hook in each contact's `hooks_to_avoid`. Inserts pending rows into `public.nurture_messages` (sent_at=null, scheduled_for=now).
  - `loadPendingNurtures()` — joins nurture_messages → contacts for the reviewer UI.
  - `markNurtureSent()` / `dismissNurture()` — manual send/skip from the reviewer.
  - `countNurtureBanners()` — Heat Sheet banner counts (pending drafts + sent-but-unmarked-reply in last 7 days).
- `lib/v2/manualReplyTracker.ts` — `markNurtureReply({nurtureMessageId, contactId, kind, replyText?, followUpInDays?})`. V1 manual classification per the spec's reply routing:
  - `positive` → bump heat +20, set `rep_decision='active'`, update `last_contact_date`
  - `negative` → set `do_not_contact=true`, `rep_decision='do_not_nurture'`
  - `neutral` → flag the row, no contact mutation
  - `later` → bump heat +10, set `next_followup_date` N days out
- `components/v2/NurtureReviewer.tsx` — bulk review bottom sheet. Each row: avatar, name, trigger/hook/language pills, message (tap Edit to inline-edit before send), copy-rule violation warning, Skip / Send (`launchSms` fires `sms:` URL; marks the row sent on success).
- `components/v2/MarkReplyButton.tsx` — opens an inline panel on a sent nurture: Positive / Neutral / Negative / Follow-up-later N days, plus a paste-the-reply text area for memory. Triggers `markNurtureReply`.
- `components/v2/NurtureBanner.tsx` — Heat Sheet banner showing pending draft count (or "N sent · mark replies" when drafts are empty). Taps open the `NurtureReviewer`.
- New action `schedule_nurture_blast` (`rexActions.ts`) — voice "send a holiday blast to my past customers" / "queue a quarterly check-in for dead leads". AppShell catches it, runs `scheduleNurtureBlast`, bumps the banner refetch key, opens the reviewer.

**Out of V1 scope** (post-PR follow-ups):
- Twilio webhook reply auto-classification — still deferred (needs Twilio account / phone / webhook host setup).

**Shipped as PR #40 add-ons (this branch):**
- `send-push` edge function (`verify_jwt=true`) — auth'd POST that resolves the caller's `auth.uid()`, reads their `user_push_tokens`, and fans out to Expo's `/api/v2/push/send`. Refuses to push to other users.
- `nurture-scheduler` edge function (`verify_jwt=false`, guarded by `X-Cron-Secret` env header) — daily call. Looks up `holiday_calendar` for today; if it's a holiday, queues holiday nurtures for each rep. Mondays additionally queue a quarterly check-in batch (max 10/rep). Mirrors the client's cadence + variety rules exactly (re-uses the same brain prompt). Fires a push notification when a rep's queue grows.
  - **Schedule via `pg_cron`**: `SELECT cron.schedule('nurture-scheduler', '0 14 * * *', $$SELECT net.http_post(url:='https://fwvrauqdoevwmwwqlfav.supabase.co/functions/v1/nurture-scheduler', headers:='{"X-Cron-Secret":"<set CRON_SECRET via supabase secrets>"}'::jsonb)$$);` (14:00 UTC = ~9 AM ET).
  - **Required secret**: `supabase secrets set CRON_SECRET=<random-32-char-string>` so unsanctioned callers can't trigger drafts.
- `lib/v2/pushNotifications.ts` — Expo token registration on app boot (no-op on web / unsupported devices). `sendTestPush()` calls `send-push` for the QA row in Profile → REX → "Send a test push".

---

## 6. Roadmap items locked in (PR #35)

The four items the user called out as not-yet-architected:

### Cross-Deal Memory — **shipped**
- `lib/v2/rexMemory.ts` — `getRexMemory()` reads `public.rex_memory.summary`,
  `recordRexTurn()` appends each utterance + Rex's reply to `public.rex_messages`,
  bumps the per-user message counter, and every 8 turns asks the brain to
  regenerate the summary (4-6 short bullets covering recurring patterns,
  open follow-ups, customer preferences).
- `lib/v2/rexActions.ts` threads `memory.summary` into the brain prompt
  ("WHAT YOU REMEMBER ABOUT THIS REP"), so Rex can disambiguate names and
  reference past context.
- `lib/v2/useHeyRex.ts` calls `recordRexTurn()` after every successful
  `executeAction()` (fire-and-forget — UX continues if the memory write
  fails).

### Custom Onboarding — **shipped**
- `components/v2/Onboarding.tsx` ports `design/extracted/onboarding.jsx`:
  8-step playbook with per-step kicker, title, body, optional bullets +
  tip + RN-native illustration. Progress bar at top, skip button, back/next
  CTAs at the bottom.
- Shows automatically on first launch (after the Hey Rex disclosure);
  `markOnboardingComplete()` in `lib/v2/rexSettings.ts` persists the
  "seen" flag in localStorage.
- Replay: Profile → LEARN → "Sales rep playbook" reopens the flow.

### Sequences UI — **shipped (read-only)**
- `lib/v2/useSequences.ts` joins `public.sequences` with
  `public.sequence_steps` and counts active enrollments via
  `public.contact_sequences`.
- `components/v2/GamePlanSheet.tsx` is a full-screen overlay accessed
  from Profile → COMPENSATION → "Game Plan". Lists each sequence as a
  card with channel pipeline (text/call/email dots), enrollment count,
  live/draft pill. Editor + enrollment flows are the next follow-up.

### Weekly Digest — **shipped (manual generate)**
- Migration `20260526_v2_weekly_digests.sql` adds `public.weekly_digests`
  with one row per rep × ISO-week (units / commission / gross / new
  contacts / contacts touched / summary / highlights). RLS-scoped to
  `auth.uid()`.
- `lib/v2/weeklyDigest.ts` — `getLatestDigest()` + `generateDigestForCurrentWeek()`.
  The generator rolls up the deals/contacts in the current week and
  asks the brain for a 2-4-bullet "what went well / what to chase /
  one suggestion" narrative.
- `components/v2/WeeklyDigestCard.tsx` mounts at the top of the Heat
  Sheet with the latest stored digest + a Generate/Regen button.
  Cron-based auto-generation is still pending; the Edge Function lives
  in the next PR.

---

## 7. Hey Rex always-listening + tool-use (PR #34, merged)

Web-only for the first pass. Native iOS/Android falls through to push-to-talk.

- `lib/v2/heyRexListener.ts` — wake-word state machine over the Web Speech API.
  States: `idle` (continuous listen, scan for "hey rex"/"hi rex"/"ok rex") →
  `awake` (accumulate transcript, each new chunk resets a 4s silence timer) →
  `processing` (emit utterance, pause until caller `.resume()`s). Auto-restarts
  on Chrome's silent `onend` while still in the active states. Returns
  `'unsupported'` / `'denied'` when the API is missing or permission is denied.

- `lib/v2/rexActions.ts` — tool schema + brain call + executor.
  Actions: `add_contact`, `update_notes`, `delete_contact`, `log_deal`,
  `schedule_followup`, `show_contact`, `clarify`, `say`. Brain prompt
  includes the user's current contact list (name + id) so Rex can pick
  the right id. Output is a single JSON object in a fenced block; parser
  is loose so prose responses fall back to `say`.

- `lib/v2/useHeyRex.ts` — owns the listener lifecycle, runs `rexInterpret`
  on every captured utterance, exposes `{ state, partial, thinking, action,
  executing, error, confirm, cancel }`.

- `components/v2/HeyRexSheet.tsx` — confirmation card that mounts above the
  tab bar whenever the listener is past idle or an action is pending.
  Shows interim transcript, Rex's "say" line, a proposed-action summary,
  and Cancel / Confirm buttons (write actions always confirm).

- `components/v2/AppShell.tsx` — wires the controller, maps listener state
  → orb visual, refetches contacts/deals after writes, opens contact
  details after `show_contact` / `add_contact`. Listens for the always-on
  toggle via `subscribeAlwaysListen` so flipping the Profile switch
  starts/stops the listener live.

Outstanding (next PR if needed):
- Native (iOS/Android) wake-word — would need a small model (Picovoice
  was removed in `remove-picovoice` branch). Push-to-talk via the orb
  still works there.
- Voice replay of Rex's "say" line via Web Speech `speechSynthesis`
  (text-only today).
- Audit log of Rex-initiated writes — currently no breadcrumb beyond
  `contacts.updated_at`.

---

## 7. Branch / push policy

- All v2 work lives on branch `claude/exciting-goodall-or4T2`.
- After each squash-merge, the branch is force-pushed (`--force-with-lease`) to match `main` so the next PR starts cleanly.
- `pocket-rep` and `project-t90u1` CI must both go green to merge. (The orphaned `his-palabra` Vercel project was deleted from the dashboard 2026-05-26 — if you see it on a PR, the deletion hasn't propagated yet.)

---

## 8. Anti-patterns / known traps

- **Don't touch** the `heat_tier` column on `contacts` — it has a legacy CHECK constraint (`red/orange/blue`). v2 derives the tier from `heat_score` client-side (`>=80` hot · `50-79` warm · `<50` watch).
- **Don't break** the v1 surface on web. The flag gate (`shouldUseNewUi`) makes both available concurrently. Native iOS/Android still uses v1 entirely.
- **Don't merge** PR #28 (Rex Lens V25) until the user re-confirms V25 works against production. The trigger hotfix that landed in this session was its blocker, but the user hasn't verified end-to-end.
- **Don't widen access** on the demo account password. It's intentionally simple (`PocketRepDemo2026!`) because the account only ever sees seeded RLS-scoped data, but treat it as semi-public.

---

## 9. Quick demo paths

- **v2 with no flag (after cutover)**: `https://app.pocketrep.pro/`
- **v2 with flag (any preview)**: `https://<deployment>.vercel.app/?v=2`
- **v1 fallback**: drop `?v=2`, the existing app shell stays intact
- **Force re-disclosure**: clear `pocketrep:v2:hey-rex-disclosure-seen` from localStorage

---

## 10. Where to look next

If a new session needs to pick up:

1. Read `docs/HANDOFF.md` (this file) — top-down summary
2. Read `docs/PORT_PLAN.md` — the original mock → live plan
3. Read `design/extracted/*.jsx` — design source of truth for any tab not yet ported
4. Read `components/v2/AppShell.tsx` — top-level wiring; mostly the navigation map for the rest of the v2 code
5. Run the migrations folder bottom-up if standing up a fresh Supabase
