# PocketRep mockup → live app — port plan

**Source**: `design/PocketRep-Standalone.html` (SHA-256 `dcbc5c15…`), extracted to `design/extracted/` — 17 modules, 6,389 LOC.
**Target**: `app.pocketrep.pro` (the live, Supabase-backed app surface) looks and behaves like the mockup.
**Scope locked with user**: visual + behavioral fidelity · one-demo-contact seed · remove Tweaks panel · gold accent only · real Supabase data · Hey Rex orb calls `ai-proxy/brain` · don't break what's live.

---

## 1. Architecture decision (NEEDS APPROVAL — biggest call in this doc)

Three viable paths:

| Path | What | Cost to ship tonight | Long-term cost |
|---|---|---|---|
| **A. Native rewrite in existing `PocketRepApp` (Expo)** | Translate all 17 `.jsx` files to React Native (View/Text/Pressable, StyleSheet, expo-linear-gradient, Reanimated for orb). Build for web via Expo Web, deploy at `/app`. | **High** — every component needs translation. Inline CSS → StyleSheet. `<div onClick>` → `<Pressable onPress>`. CSS keyframes → Animated. ~50% of LOC needs rewriting. | **Best** — one codebase ships iOS, Android, web. |
| **B. Fresh React + Vite web app at `/web` (RECOMMENDED for tonight)** | New Vite app under `/web`. Reuse the `.jsx` files **as-is** (they're already standard React). Wire to Supabase JS client. Deploy via Vercel to `pocketrep.pro/app` (replaces the static mock from PR #21). | **Low** — the mock's source files run unmodified on the web. Bulk of work is wiring Supabase reads/writes and the orb to `ai-proxy/brain`. | **Tech debt** — Expo native stays stale. Two codebases until a later parity PR. |
| **C. Static mock now, native catch-up later** | Keep the PR #21 static mock as-is at `/app` for visual demo; build Expo native parity over weeks. | None tonight; PWA already serves a non-interactive mock. | Same as A eventually. |

**Recommendation: B** — ship a real, Supabase-wired web app tonight that matches the mock, accept the Expo-native drift as known tech debt, write a follow-up parity PR for native later. The Expo app's native users keep using the existing app uninterrupted.

If user picks A, scope balloons ~3×; "live tonight" becomes "live this weekend." If C, we ship nothing new.

---

## 2. Screen catalog (all 17 modules)

| Module | LOC | Screen / Component | Status |
|---|---:|---|---|
| `tokens.jsx` | 143 | Design tokens (T), atoms (Label, Pill, Avatar, StatNumber, SectionHead, HeatStripe), TIERS, stalenessColor | **PORT verbatim** |
| `data.js` | 142 | CONTACTS, STARTER_TAGS, DEALS, REX_MESSAGES, QUICK_CHIPS, DEFAULT_PAY_PLAN seed | **Replace with Supabase queries**. Use one (`CONTACTS[0]` = Marcus Holloway) as the demo-seed payload. |
| `app.jsx` | 392 | Main shell, CustomNavBar, tab routing, orb state, overlays | **Port shell** without Tweaks panel; keep CustomNavBar, modal stack |
| `tab-bar.jsx` | 215 | Bottom nav (Heat/Contacts/Metrics/You) + floating HeyRex orb with 4 states | **Port** — orb states: idle / listening / processing / saved |
| `tab-heat.jsx` | 97 | Heat Sheet — top banner + Hot/Warm/Watch buckets | **Port** + wire `contacts.select().order(heat_score)` |
| `tab-contacts.jsx` | 558 | Contact list, tag carousel, search, bulk-tag, "Game Plan" header chip | **Port** + wire CRUD |
| `contact-detail.jsx` | 898 | Avatar/photo upload, tags, vehicle info, Latest Activity / Next Step toggle, NOTES (edit), GAME PLAN AI button, deal log | **Port** — `GAME PLAN` button calls `ai-proxy/brain` with the contact context prompt |
| `tab-gameplan.jsx` | 515 | Sequences + Templates overlay (opens from Contacts header chip) | **Port** + wire `sequences` / `sequence_steps` tables |
| `tab-rex.jsx` | 562 | Rex Tab — chat + Hey Rex wake word + memory compression | **Port** — wire chat to `ai-proxy/brain`, persist to `rex_messages` |
| `tab-metrics.jsx` | 393 | Personal P&L: YTD rundown + month archive | **Port** + wire `deals` aggregation |
| `tab-profile.jsx` | 179 | "You" tab — pay plan summary, settings, onboarding launcher | **Port** + wire `profiles` |
| `deal-logger.jsx` | 411 | Sheet modal — capture closed deal, computes commission | **Port** + write to `deals` |
| `pay-plan.jsx` | 323 | Pay Plan editor — front %, back %, mini, base, spiffs, unit bonus tiers | **Port** — needs a `pay_plans` table (NEW, see §3) |
| `onboarding.jsx` | 456 | 8-step playbook (Welcome → Heat Sheet → Orb → Contacts → Game Plan → Rex → Metrics → Daily Rhythm) | **Port** — set `profiles.onboarded_at` after completion |
| `upgrade-sheet.jsx` | 199 | Plan picker: Pro Monthly $39 / Annual $29 / Team $24 → Stripe checkout | **Port** — wire CTAs to existing Stripe payment links |
| `ios-frame.jsx` | 338 | Desktop preview wrapper (iPhone-shaped div around the app) | **SKIP** — only useful for design playground, not for app surface |
| `tweaks-panel.jsx` | 568 | Dev "Tweaks" panel | **REMOVE per user scope** |

**14 screens to port** (after dropping ios-frame + tweaks-panel).

---

## 3. Supabase data model (existing + extensions)

The Explore agent confirmed the live schema already covers most of the mock's needs. Drift to address:

### Existing tables (no changes needed for v1 port)
- `profiles` — id, email, full_name, plan, industry, trial_ends_at, stripe_customer_id, unlimited
- `contacts` — id, user_id, first/last_name, phone, email, notes, last_contact_date, **vehicle fields** (purchase_date / year / make / model / mileage / annual_mileage / lease_end_date), **heat_tier / heat_score / heat_reason**, lat/lng, rapport_notes/image, follow_up_date, personal_events (JSONB), buying_urgency, **stage**, timestamps
- `deals` — id, user_id, contact_id, title, amount, front_gross, back_gross, closed_at, notes
- `rex_messages` — id, user_id, contact_id, role, content
- `rex_memory` — id, user_id, summary (Elite-only)
- `sequences` + `sequence_steps` — existing
- `contact_interactions` — existing
- `daily_ai_usage` — existing (caps in `ai-proxy`)

### Columns to ADD on `contacts` (the mock uses these, schema doesn't yet)
- `vehicle` (text) — e.g. `'26 M3 Competition` — display string; existing year/make/model can derive but the mock shows a single label
- `trim` (text) — e.g. `Brooklyn Grey · xDrive`
- `budget` (numeric or text — mock uses `'82K'`)
- `trade_in` (text) — e.g. `'22 M240i`
- `tags` (text[]) — currently no tag system
- `milestones` (jsonb) — array of `{kind, t, d}` where kind ∈ `visit | numbers | docs | objection | test-drive | no-response`
- `next_step` (text) — Rex's recommended action, auto-generated
- `plan_label` (text) — `THIS WEEK` / `TODAY` / `THIS MONTH` / `NEXT QTR` (derive from follow_up_date if possible)
- `photo_url` (text)

### New tables
- `tags` — id, user_id, name, color (matches `STARTER_TAGS` shape from `data.js`); RLS user-owns. Pre-seeded with the 12 starter tags from `data.js` on signup.
- `pay_plans` — id (=user_id), front_pct, back_pct, flat_mini, base_salary, spiff_per_unit (manuBonus), unit_bonus (csiBonus), unit_bonus_tiers (jsonb array of `{units, bonus}`). One row per user. Seed with `DEFAULT_PAY_PLAN`.
- Deals already in schema — extend with: `stock` (text), `vehicle` (text), `type` ('NEW'|'CPO'|'USED'), `funding` ('finance'|'lease'|'cash'), `split` (boolean), `split_with` (text).

### RLS
All new tables/columns: `user_id = auth.uid()` policies, copy from existing patterns.

### Migration sequencing
One migration file per PR (small, reversible). All migrations land **before** their consuming UI PR.

---

## 4. One-demo-contact seed on signup

Per user scope: a new account gets exactly **one** demo contact (not the full 10-person Marcus/Priya/Derek/etc. cast).

**Pick: Marcus Holloway** (the headlining contact in `data.js`). He has the richest data — milestones, notes, tags, next-step. Good for showing what a populated contact looks like.

**Implementation**: a Supabase Postgres trigger on `auth.users` insert (or extend the existing `handle_new_user` trigger). Inserts one row in `contacts` with Marcus's full payload + the 12 starter tags into `tags`. The 25 mock DEALS are NOT seeded — Deals start empty so the demo feels honest about a new rep's pipeline.

Once the rep adds their second contact OR clicks a "Hide demo" button in the Marcus contact-detail menu, demo is purged.

---

## 5. PR sequence

Each PR self-contained; preview deploys on Vercel; user QAs visually before merge. After approval of THIS plan (PR #24), I'll open:

| # | Title | Scope | Risk |
|---:|---|---|---|
| 25 | **scaffold**: Vite React app at `/web`, deployed at `/app` via Vercel | Empty React app rendering tokens.jsx + "PocketRep" placeholder. Wires Vercel project, sets up Supabase JS, env vars. Marketing site root untouched. | Low |
| 26 | **shell + nav**: app.jsx + tab-bar.jsx + ios-frame removed | Port shell, custom nav bar, bottom nav, orb (visual states only — no STT yet). Routes between empty placeholder tabs. | Low |
| 27 | **db**: contacts column extensions + tags table + pay_plans table | Supabase migrations only. No UI consumer yet. | Med (schema) |
| 28 | **seed**: one-demo-contact trigger + starter tags on signup | Postgres trigger. Tested on a dev branch first. | Med |
| 29 | **Heat Sheet** wired | `tab-heat.jsx` reading live contacts, grouped by tier | Low |
| 30 | **Contacts + Contact Detail** wired (no AI yet) | List, search, swipe, tag carousel; detail view, edit notes, deal log | Med |
| 31 | **Hey Rex orb** wired to `ai-proxy/brain` | Orb states drive Web Speech API + STT stub → POST `/brain`. Persists Rex turn to `rex_messages`. | Med |
| 32 | **Rex tab** | Chat history from `rex_messages`, quick chips, streaming via `/brain` | Med |
| 33 | **Game Plan overlay** | Sequences + templates list, opens from Contacts header chip | Med |
| 34 | **Metrics tab + Deal Logger** | YTD rundown, month archive, log-a-deal sheet, commission calc | Med |
| 35 | **Pay Plan editor + Profile (You) tab** | Sheet modal, persists to `pay_plans` | Low |
| 36 | **Onboarding** | 8-step flow on first signup; sets `profiles.onboarded_at` | Low |
| 37 | **Upgrade sheet** | Wire CTAs to existing Stripe payment links | Low |
| 38 | **cutover**: replace static `/app` PWA with new Vite app | Update `vercel.json` rewrites, delete static `Pocketrep/app/index.html` etc. (mockup files removed from prod path; design/ folder stays as reference) | Low |

13 code PRs. If we hit it hard, ~8 of them can land tonight; the rest tomorrow.

---

## 6. Visual QA acceptance criteria (per PR)

Each PR's preview URL must show:
- Pixel-close match to the mock at 402×874 (iPhone Pro-ish viewport)
- Gold (`#d4a843`) accent only, no theme picker visible
- No "Tweaks" panel on the right
- All wired data round-trips via Supabase (no hardcoded UI text where the mock has dynamic data)
- HeyRex orb: idle → listening → processing → saved states cycle visibly when tapped
- Lighthouse PWA "Installable" still passes (since we keep PWA scope on `/app`)

---

## 7. Out of scope (this workstream)

- Expo native rewrite (separate followup workstream — tracked as tech debt)
- Push notifications for follow-ups (mock doesn't show; existing app has them)
- CSV / phone-book contact import (existing app has it; not in mock — port from existing if needed)
- VinSolutions/DealerSocket adapters (RexLens Chrome extension, separate product)
- STT/TTS providers — orb uses Web Speech API + `ai-proxy/brain`. Deepgram/OpenAI TTS still stubbed (501) until follow-up.
- Real Stripe webhook handling (existing Stripe payment links work for signup)

---

## 8. Decisions needed before PR #25

1. **Architecture**: confirm Path B (React + Vite at `/web`, deploy replaces static mock at `/app`)? Or do you want Path A (Expo native rewrite, ships web too)?
2. **Domain**: keep at `pocketrep.pro/app`? Or set up `app.pocketrep.pro` as a separate Vercel project / subdomain?
3. **Demo contact**: Marcus Holloway specifically OK? Or pick a different mock contact?
4. **PR cadence**: am I allowed to merge each PR after CI green + a quick preview-URL eyeball from you, or do you want explicit approval per PR?

Awaiting answers before code starts.
