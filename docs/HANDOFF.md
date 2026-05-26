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
- `pocket-rep` and `project-t90u1` CI must both go green to merge; `his-palabra` is permanent noise — ignore.

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
