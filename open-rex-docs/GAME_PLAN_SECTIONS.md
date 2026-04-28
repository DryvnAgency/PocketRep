# OpenRex Game Plan — A-to-Z Section Plan

**Total: 25 sections, four phases.** Each section has a single
deliverable, an owner (Operator vs Engineering), and a blocker chain.
Engineering can ship Sections 9–25 against a placeholder repo today;
Operator unblocks Sections 1–8 in parallel.

The Game Plan campaign engine — full pivot context — lives in
[`/root/.claude/plans/handover-package-shipped-to-fizzy-thompson.md`](../../../root/.claude/plans/handover-package-shipped-to-fizzy-thompson.md).
This file is the executable cut-down: every row maps to one shippable
artifact.

Engineering drafts that don't need the new repo yet are staged in
[`game-plan-starter/`](./game-plan-starter/) and ported on Section 9.

---

## Phase 0 — Foundations (Operator-led, parallel)

| # | Section | Deliverable | Owner | Blocks |
|---|---|---|---|---|
| 1 | **Repo + domain naming** | Final name (e.g. `rex-game-plan`) and final apex/sub. | Operator | 3, 5 |
| 2 | **Pricing model** | Flat per store / per Game Plan / per outbound tier. One-pager. | Operator | 23 |
| 3 | **GitHub repo created** | `DryvnAgency/<name>` with main + branch protection. | Operator | 9 |
| 4 | **Supabase project provisioned** | New project, keys captured. | Operator | 10, 11 |
| 5 | **Vercel project linked** | Repo connected, env scaffolded, custom domain. | Operator | 9 |
| 6 | **Twilio dealership 10DLC submitted** | Brand + campaign + Messaging Service, sized for mass. | Operator | 16 |
| 7 | **Chrome Web Store re-submission** | Scraper-only Rex Lens listing. | Operator | 13 |
| 8 | **Legal templates drafted** | MSA, privacy, ToS, DPA from templates. | Operator | 25 |

---

## Phase 1 — Core build, mock-send demo loop (Engineering)

| # | Section | Deliverable | Owner | Blocks |
|---|---|---|---|---|
| 9 | **Repo scaffold + env helper** | Monorepo (apps/web, apps/extension, supabase, packages/shared); `lib/env.ts` paste-to-activate. | Engineering | 11–18 |
| 10 | **Database schema + RLS** | `migrations/0001_init.sql` — all tables from plan Part 2 with policies + indexes. | Engineering | 12 |
| 11 | **Auth + tenant onboarding** | Supabase Auth SSR, memberships, role gating. First-sign-in trigger creates owner row. | Engineering | 12, 15 |
| 12 | **Rex Lens scraper v1** | Strip prior UI; one-screen extension; VinSolutions Advanced Search adapter; selector-version tag. | Engineering | 14 |
| 13 | **Game Plan builder UI** | `/game-plans/new` form — target filter, offer, send mode, cadence, handoff. Persists. | Engineering | 14, 16 |
| 14 | **Contacts ingestion API** | `POST /api/ingest/contacts` — dedup, parser_events telemetry, attaches pool to game_plan_id. | Engineering | 15 |
| 15 | **Message generation worker** | Supabase function — Gemini call, brand voice + offer + per-customer fields, schema validation. | Engineering | 16, 21 |
| 16 | **Mock-send scheduler + Heat Sheet stub** | Drafts flip to `sent_mock`, table view of campaign_contacts with status badges. End-to-end demoable. | Engineering | 17 |

**Phase 1 done-gate:** manager builds a Game Plan, clicks run, sees a
pool of unique drafts in mock-send mode within 5 minutes.

---

## Phase 2 — Live SMS + autonomy (Engineering, post-10DLC)

| # | Section | Deliverable | Owner | Blocks |
|---|---|---|---|---|
| 17 | **Twilio outbound + throttling** | Real send path; quiet hours, DNC, STOP-list checked per send; carrier TPS sharding. | Engineering | 18 |
| 18 | **Twilio inbound webhook** | STOP/HELP/START parsed; `consent_status` flipped; audit log row. | Engineering | 19 |
| 19 | **Hybrid autonomy classifier + guardrails** | Gemini classifier (`simple_yesno` / `timing` / `substantive`); hard rules (no price, no appointment confirm, cap 2 auto-replies). | Engineering | 20 |
| 20 | **Approval queue + Rex draft editor** | Manager view of queued Rex drafts; approve / edit / send; identity logged. | Engineering | 21 |
| 21 | **Heat Sheet real-time + cadence nudge worker** | Front page lists active threads sorted by recency + temperature; per-Game-Plan follow-up cron. | Engineering | 22 |

**Phase 2 done-gate:** dry-run to one test number — outbound sent,
STOP/HELP/START round-trip, consent flipped, quiet hours honored,
substantive reply queued for manager.

---

## Phase 3 — Polish + first paid dealership

| # | Section | Deliverable | Owner | Blocks |
|---|---|---|---|---|
| 22 | **Lead assignment + campaign archive** | Manager → salesperson handoff with RLS; archive view with reply rate, copy, re-send. | Engineering | 25 |
| 23 | **Stripe dealership-tier billing** | Single price; checkout gated on `live.stripe`; webhook handler. | Engineering | 25 |
| 24 | **Onboarding wizard + demo loom + GM PDF** | Install extension → first scrape → mock Game Plan → live; 5-min loom; 1-page rollout PDF. | Engineering | 25 |
| 25 | **Dry-run + first dealership cutover** | Internal dry-run, fix top 3 frictions, sign first MSA, paste keys, soft launch. | Both | — |

**Phase 3 done-gate:** first dealership has signed MSA, has logged in,
has run a real Game Plan, and is on a Stripe subscription.

---

## What I (engineering) am doing first

Working sections in this order while Operator handles 1–8:
**10 → 9 → 11 → 13 → 15 → 12 → 14 → 16.**

Schema first because every other section binds to it. Drafts land in
[`game-plan-starter/`](./game-plan-starter/) and copy-paste into the
new repo on Section 9.

## What's blocking right now

- **Section 1** (repo name) — pick `rex-game-plan` or alternative.
- **Section 2** (pricing) — flat / per Game Plan / per message tier.
- **Section 3–7** (provisioning) — operator runs these in parallel; I
  don't need them to start drafting code.

Confirm Section 1 + 2 and the rest unblocks.
