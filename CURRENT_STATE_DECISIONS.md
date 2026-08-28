# PocketRep — Current State / Decisions

**Last updated:** 2026-08-28

**Purpose:** Living operational truth for PocketRep. Update this file whenever a product decision changes, a meaningful PR merges, production behavior changes, pricing/referral economics change, or the launch priority changes.

Read `PROJECT_OPERATING_SYSTEM.md` first.

---

## 1. Source-of-truth rules

- Owner decisions recorded here are authoritative business/product decisions.
- Production behavior must be verified before calling something shipped.
- `main` describes intended shipped code, but deployment/runtime should be checked when it matters.
- Open PRs are proposed/claimed work until merged and deployed.
- `HANDOVER_PROMPT.txt`, `PROJECT_MASTER_CONTEXT.txt`, and older dated handoff sections are historical snapshots and **must not override this file**.
- If this file conflicts with current production, flag the mismatch and resolve it deliberately. Do not silently rewrite business rules to match stale code or stale marketing.

---

## 2. Current product identity — LOCKED

PocketRep is a **Daily Sales Execution Engine for individual salespeople**.

Initial wedge: **automotive sales reps working their own book of business**.

Core positioning:

- **WORK YOUR BOOK.**
- **WORK SMARTER.**
- Your next deal may already be in your phone/book.
- PocketRep tells the rep who deserves attention next and helps move that opportunity forward.

PocketRep is not being positioned primarily as a generic CRM, generic AI assistant, bulk texting platform, or sales-automation suite.

**Rex** remains the salesperson-facing intelligence/coaching identity.

The product should increasingly feel like:

> Open → know who to work → understand why → take the recommended action → record the outcome → PocketRep determines what comes next.

---

## 3. Current repository / deployment baseline — VERIFIED

As of this update, `main` HEAD is:

`fae1f2d2b2427aef028d1bf07aaa8e217bd910b3`

Latest merged launch-polish work on `main` includes:

- closing the unpaid/free-account signup backdoor;
- removing expired pricing-date/placeholders;
- wiring the full test suite into CI;
- fixing the Vercel Expo build dependency;
- adding the PWA install experience.

Recent merged `main` work also includes:

- Stripe-backed paid signup/entitlement handling;
- webhook-based entitlement clearing;
- referral reward hardening/idempotency;
- paid-invoice qualification for referral rewards;
- more honest SMS send-state handling.

Production web surfaces:

- Marketing: `https://pocketrep.pro`
- App: `https://app.pocketrep.pro`

Do not infer that an open PR is production merely because its preview deploy is green.

---

## 4. Current V1 product thesis

The **Daily Execution Engine / Heat Sheet workflow** is the product center.

The current experience is built around these capabilities/surfaces:

- Heat Sheet / prioritized book;
- contacts / owned book;
- contact context and notes;
- Game Plan / next move;
- Rex coaching and drafting;
- text/call follow-up workflow;
- Smart Blast / personalized per-contact draft workflow with human send/review;
- nurture/follow-up state;
- deal logging and commission/production metrics;
- sequences;
- referral logic;
- bilingual outreach where supported;
- PWA/web app install flow.

Do not expand the roadmap just because older files contain Rex Lens, dealership-suite, or multi-industry concepts.

---

## 5. AI / architecture decision — LOCKED PRINCIPLE

PocketRep is **deterministic-first**.

Core workflow must remain useful if AI providers are unavailable.

Provider/model selection is an implementation choice, not the product thesis.

Current discussions have considered multiple providers/models, including OpenRouter-based routing, DeepSeek, GLM, Claude, GPT, Grok, Kimi, and others. **Discussion does not equal an approved production migration.**

Before changing the live model/provider stack:

1. verify the currently deployed route/model;
2. define the workload being improved;
3. compare latency, quality, reliability, and cost;
4. protect caching and deterministic behavior;
5. define rollback;
6. run a representative PocketRep eval.

Do not rebuild product logic around a model vendor.

---

## 6. Messaging / compliance — LOCKED

- No unauthorized auto-send.
- The rep remains in control of outbound customer messaging where the current workflow requires review/send.
- DNC / opt-out handling wins over AI recommendations.
- Do not weaken origin/source rules.
- Unique contextual messages are for relevance and quality, **not spam-filter evasion**.
- Record honest send state. Opening a composer is not the same as confirmed delivery.
- Nothing in growth work should weaken compliance rails.

---

## 7. Pricing — OWNER DECISION + CURRENT MISMATCH

### Current owner-approved pricing direction

- **Users 1–500:** $39/month
- **Users 501–1,000:** $54/month
- **After 1,000:** $69/month
- 7-day free trial remains part of the current individual offer unless explicitly changed.

### Current production/marketing mismatch

The current marketing source on `main` still states:

- $39/month founding price for the first 500 reps;
- then $69/month.

Therefore the $54 middle stage is **an owner decision that still needs deliberate production alignment**.

Do not silently change Stripe prices, landing copy, checkout links, or existing-customer terms merely because this file contains the intended ladder. Before implementation, verify exact Stripe products/prices and define whether the ladder applies only to new cohorts.

---

## 8. Referral economics — LOCKED

Current referral principle:

1. A refers B.
2. B may begin a trial, but **no reward is earned merely for trial/signup**.
3. After B successfully becomes a paying customer / has the qualifying paid invoice, the referral qualifies.
4. A receives **one free month**.
5. B receives **one free month**.
6. This is a one-time reward for that successful referral relationship.
7. B can later refer C and earn another qualifying free month when C pays.
8. Free usage earned from referrals is capped at **24 months maximum per account**.

Recent `main` commits verify that referral qualification was hardened to paid invoice behavior and reward processing was made Stripe-idempotent.

**The 24-month cap remains a locked business rule. Verify enforcement before launch-scale referral promotion; do not assume a dashboard monitor equals enforcement.**

Never change referral economics without an explicit owner decision.

---

## 9. Active work — NOT YET PRODUCTION

### PR #107 — `Admin dashboard hub + Rex UX improvements + voiceTone wiring`

Status at this update: **OPEN, DRAFT, mergeable**.

CLAIMED scope includes:

- owner/admin dashboard;
- Stripe/revenue/admin data views;
- Heat Sheet UX changes;
- simplified Rex settings;
- tone presets;
- support/admin improvements;
- additional product/AI/referral analytics work;
- follow-up fixes discovered during audit.

Do not describe #107 features as shipped until the PR is reviewed, merged, CI/deploy is verified, and production behavior is checked where relevant.

### PR #109 — `Launch copy: premium, accurate V1 funnel`

Status at this update: **OPEN, DRAFT, mergeable**.

Scope is intentionally limited to:

- `Pocketrep/index.html`
- `Pocketrep/thankyou.html`

Purpose:

- make the launch funnel sound premium;
- remove claims that overstate hands-off automation;
- make human review/control explicit;
- turn the post-checkout page into a premium trial-activation / first-mission experience.

This PR should remain isolated from app logic.

### Older open PRs

There are multiple older draft PRs in the repository from previous product directions/workstreams.

**Default rule:** treat an old open PR as stale until explicitly reactivated. Do not merge it because it exists.

---

## 10. Immediate launch sequence — NOW

### #1 NEXT MOVE

**Finish and independently verify PR #107.**

Why it matters:

It contains the active product/admin/UX hardening work and must be resolved before visual polish or launch work is layered on top.

Complete when:

- scope is reviewed against the current product thesis;
- code/tests are checked;
- migrations/edge functions are verified where touched;
- security/compliance implications are reviewed;
- the app preview is healthy;
- production steps are clear;
- it is merged only if the work is genuinely launch-safe.

### Secondary priority 1

**Align the actual app aesthetic and microcopy with the premium landing/thank-you direction.**

Desired feel:

> Private sales operating system for a serious producer.

Design direction:

- Heat Sheet = command center;
- Rex = sales intelligence, not generic chatbot;
- Contacts = the rep's book;
- daily list = today's opportunities;
- Metrics = production scoreboard;
- cleaner hierarchy, spacing, surfaces, icons, and microcopy;
- restrained premium accents rather than noisy “AI app” decoration.

Do not redesign core workflow during this aesthetic pass.

### Secondary priority 2

**Run a final end-to-end launch audit, then align/merge launch copy.**

Audit the complete chain:

> Ad/landing → pricing/trial → Stripe checkout → account provisioning → thank-you/setup → login/app access → onboarding → first five / first daily list → follow-up action → outcome recording → next action.

Verify both happy path and failure/retry states.

---

## 11. NOW / NEXT / LATER

### NOW

- Finish/verify active launch-critical work.
- Premium app aesthetic/microcopy alignment without workflow rebuild.
- End-to-end launch verification.
- Resolve pricing ladder mismatch deliberately.
- Verify referral 24-month cap enforcement before aggressive referral promotion.
- Keep landing/app/checkout claims aligned with real V1 behavior.

### NEXT

- Stronger Rex recommended-action layer per contact: text vs call vs other next move.
- Better structured memory around outcomes, objections, promises, and next action.
- Outcome scorecard focused on response → appointment → show → sale where data exists.
- Coach Rex improvements for newer reps and stalled deals.
- Business-card/customer-intake flow that can start the relationship and first thank-you/follow-up workflow.
- Inventory-link intelligence that can help select relevant dealership inventory based on customer context.
- More systematic holiday/milestone outreach using unique contextual copy.

### LATER

- Twilio/native communications inside PocketRep when justified by usage/compliance/cost.
- Broader inventory integrations.
- Additional verticals such as RV, powersports, marine, aviation, real estate, mortgage, etc. only after the automotive execution engine is proven.
- Team/dealership expansion where it does not compromise rep-first UX.
- Deeper learning/optimization after enough outcome data exists.

---

## 12. Explicitly off-limits until changed by owner decision

- Premature multi-industry repositioning.
- Rebuilding PocketRep as a generic CRM.
- Making Rex/AI the system of record.
- Core workflow that fails when AI is down.
- Unauthorized auto-send.
- Messaging designed to evade spam safeguards.
- Silent pricing changes.
- Silent referral-economics changes.
- Large architecture rewrites without evidence.
- Merging stale PRs because they appear “complete.”
- Marketing speculative future features as shipped.
- Letting admin/team features make the individual rep experience manager-first.

---

## 13. Legacy context warning

These files remain useful for historical architecture/reference but are stale as product-direction sources:

- `HANDOVER_PROMPT.txt` — April-era product framing/pricing/model assumptions.
- `PROJECT_MASTER_CONTEXT.txt` — April-era master context.
- `docs/HANDOFF.md` — useful deep technical map, but its header/current-state sections are dated and must be verified against current code/production.

Do not delete useful history, but do not allow it to override this document.

---

## 14. Maintenance rule

Update this file after any of the following:

- meaningful merge to `main`;
- production deployment that changes behavior;
- pricing/trial/referral decision;
- model/provider migration;
- launch priority change;
- feature moves between NOW/NEXT/LATER;
- a previously speculative feature becomes verified production functionality;
- a serious known issue is discovered or resolved.

A future session should be able to read this file and know **where PocketRep actually stands without reconstructing months of chat history**.
