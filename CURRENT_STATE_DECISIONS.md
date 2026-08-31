# PocketRep — Current State / Decisions

**Last updated:** 2026-08-31

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

### 2026-08-30 rep UI stress hardening — ON PR #107, NOT PRODUCTION

Implementation commits `4869240` and `6e46780` address issues reproduced in the active rep UI and then carried through the current native V1 screens:

- desktop web SMS handoffs are capability-gated before `sms:` can strand the UI; unsupported work remains pending with an explicit phone-required message;
- SMS callers, including sequence and mass-text paths, only record explicitly confirmed sends and now retain unsent drafts;
- deal gross input preserves cents, rejects malformed/negative/implausibly large values, validates required data, rounds at persistence, and blocks rapid duplicate saves;
- key deal and notification modal controls now expose button names/states to assistive technology;
- legacy native mass text no longer opens one group-message composer, resolves `{{first_name}}` per recipient, and has a same-tick duplicate guard;
- EAS profiles no longer override project Supabase values with committed empty strings.

Verification completed on the implementation tree:

- all 20 test scripts pass (558 checks);
- TypeScript passes with 0 errors;
- ESLint passes with 0 errors / 51 pre-existing warnings;
- Expo exports succeed for web, current native V1 iOS/Android, and the flag-enabled V2 iOS/Android cutover path;
- GitHub CI passed on both implementation commits and the `pocket-rep` branch preview reached READY on the mobile-parity commit.

### 2026-08-31 full rep + mobile stress follow-up — ON PR #107, NOT PRODUCTION

The continued desktop/mobile stress pass found and fixed additional workflow-integrity issues on the PR branch:

- desktop web `tel:` handoffs are now capability-gated in the call queue, sequence queue, and contact composer, so a browser without a dialer stays usable and the rep can record the real outcome manually;
- contact history labels SMS composer attempts honestly (`COMPOSER OPENED`, `NOT SENT`, `FAILED`, or `NO NUMBER`) instead of making an unconfirmed attempt look sent;
- sequence personalization now shares one supported-token contract between the editor and launch path, resolves rep/dealer/contact/vehicle/lease values, and blocks missing or unknown fields before any customer-facing channel opens;
- a blank rep name can no longer be saved, preventing `{{rep_name}}` workflows from being silently broken;
- surfaced contact-detail actions now have explicit accessible names/states for call, text, email, notes, tags, relationship data, Rex actions, and deal logging;
- Expo SDK 51 dependencies were realigned (`expo-linking ~6.3.1`, `expo-image-picker ~15.1.0`) and `expo install --check` reports the dependency set current;
- native Supabase auth persistence now uses generation-based encrypted SecureStore chunks, including migration from the previous single-value key, to avoid historical iOS large-value rejection during cold restarts;
- native rep settings now hydrate from and persist to AsyncStorage before the authenticated shell renders, so dealership/title/tone/inventory values survive restart and sequence dealer tokens stay reliable;
- native sign-out now clears retained contacts, tags, pay-plan, notifications, customer-bearing overlays/drafts, and every older in-memory Rex/coach/demo/inventory cache; a fast account switch waits for the device sweep before hydrating the next rep.

Verification completed on the latest working tree:

- all 20 test scripts pass (**603 checks**);
- TypeScript passes with 0 errors;
- ESLint passes with 0 errors / 50 existing warnings;
- Expo dependency validation reports dependencies up to date;
- clean V1 and flag-enabled V2 exports succeed for web, iOS, and Android, with distinct bundle hashes between modes (the first cached comparison was discarded and rebuilt clean);
- the authenticated isolated audit build verified Heat, contacts/search/filtering, sequence call/text failure honesty, call outcomes, deal validation/commission math, notifications, Metrics, and profile editing without a browser protocol wedge.

Remaining verification boundaries are explicit:

- the newest local bundle was not promoted: the deployment safety gate rejected replacing even the isolated audit alias without fresh deploy approval;
- a refreshed cloud-browser session could not reopen the audit account because the secure sign-in handoff was blocked before prompting, so the newest timeline/token/auth-storage changes are covered by builds and focused tests rather than a second live touch pass;
- production `app.pocketrep.pro` previously authenticated the audit credentials but returned `Account not found. This account is no longer active.` while the isolated PR build allowed the same account; trace the production entitlement/profile boundary before launch, without silently granting access;
- real-device verification is still required for cold-restart auth, iOS/Android permission prompts, native Messages/dialer return behavior, and installed-app safe-area/keyboard behavior;
- PR #107 remains draft/unmerged and production has not been promoted.

Still open before calling this shipped or mobile-certified:

- PR #107 remains draft/unmerged and production was not promoted;
- the separate `project-t90u1` preview continues to cancel before useful build logs, while the `pocket-rep` preview is healthy;
- the cloud interaction browser did not recover from the original external-protocol wedge, so the rebuilt preview has not received a fresh authenticated touch/viewport pass;
- real-device checks remain required for cold-start auth persistence, native permission prompts, OS composer return behavior, and installed-app safe-area/keyboard behavior;
- native EAS builds intentionally remain on V1 until the explicit `EXPO_PUBLIC_NEW_UI=1` cutover decision.

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
