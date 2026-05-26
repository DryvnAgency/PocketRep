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

## 6. Hey Rex roadmap (next PR — not in this branch yet)

The user asked for these in the closing turn of the v2 cutover session:

- **Wake word**: continuous listen for "Hey Rex" using Web Speech API (`SpeechRecognition` with `continuous=true, interimResults=true`). When the phrase is detected, start an "active session" — keep listening until 4 seconds of silence, then process.
- **Universal app access**: Rex tool-use mode against `ai-proxy/brain` with a system prompt enumerating actions:
  - `add_contact { name, phone?, vehicle?, ... }`
  - `update_contact_notes { name, notes }`
  - `delete_contact { name }`
  - `log_deal { name, phone?, stock, frontGross, backGross, ... }`
  - `schedule_followup { name, days_from_now, note }`
  - `show_contact { name }`
- **Output contract**: Rex returns `ACTION: <name>` / `PAYLOAD: {json}` / `SAY: <one-liner>` so the client can render a confirmation card before writing.
- **Privacy**: first-run modal already lands in this PR (`RexDisclosure.tsx`). Always-listen toggle lives in the You tab via `rexSettings.ts`.
- **Native fallback**: web-only for the first pass — Web Speech API. iOS Safari has known limitations; we'll push-to-talk there until a wake-word model is in place.

State already wired in this PR:
- `lib/v2/rexSettings.ts` (localStorage flags)
- `components/v2/RexDisclosure.tsx` (first-run modal)
- `ProfileTab.tsx` → "Always listen for Hey Rex" Switch

Open architectural calls for the Rex PR:
- Confirm-before-write vs auto-write (current plan: confirm)
- Where to mount the confirmation card (inside the Hey Rex orb sheet vs a global toast)
- How to disambiguate contact references when the rep says a first name that matches multiple contacts ("Did you mean Sarah Chen or Sarah Park?")

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
