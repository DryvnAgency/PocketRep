# PocketRep — Current State / Decisions

**Last updated:** 2026-09-01 CT / 2026-09-02 UTC

**Purpose:** This is PocketRep's living operational truth. Read `PROJECT_OPERATING_SYSTEM.md` first. If older handoffs, plans, PR descriptions, or chat history conflict with this file, this file wins unless current production proves otherwise.

---

## 1. Product identity — LOCKED

PocketRep is a **Daily Sales Execution Engine for individual automotive salespeople working their own book of business**.

Core positioning:

- **WORK YOUR BOOK.**
- **WORK SMARTER.**
- Your next deal may already be in your book.
- PocketRep tells the rep who deserves attention next, why, what to do, and helps move the opportunity forward.

PocketRep is **not** being positioned as a generic CRM, generic AI chatbot, bulk-texting platform, dealership management suite, or multi-industry sales tool for V1.

The intended loop is:

> Open → know who to work → understand why → take the recommended action → record the outcome → PocketRep determines what comes next.

**Rex** is the salesperson-facing intelligence/coaching layer. Rex is the highest product priority, but the deterministic execution engine remains the system of record and must still function when AI is unavailable.

---

## 2. Verified production baseline

Current `main` HEAD:

`33bf3cc191497b492dc2420003545c837454dd12`

Production surfaces:

- Marketing: `https://pocketrep.pro` / `https://www.pocketrep.pro`
- App: `https://app.pocketrep.pro`

Both Vercel production projects are **READY** on `33bf3cc`.

Recent production sequence:

- **PR #107** — V1 rep UI, Rex/admin hardening, workflow and audit coverage.
- **PR #112** — legacy sequence-template compatibility restored; unknown tokens still blocked.
- **PR #113** — landing proof and trial-activation polish.
- **PR #114** — organic SEO foundation plus appointment-aware Rex copy.
- **PR #115** — deterministic DeepSeek Flash/Pro routing, active-contact memory isolation, output/cost rails.
- **PR #116** — Pro responsiveness hardening, one-shot Flash recovery, Rex `LIVE` / `WORKING` state, duplicate/test-record whole-book protection.
- **PR #117** — whole-book turns now clear single-contact scope and ignore stale prior chat claims so current CRM data is the identity source.

Do not infer that an old PR or green preview is production. Verify `main`, Vercel, and Supabase when behavior matters.

---

## 3. Rex / AI production route — VERIFIED

PocketRep is **deterministic-first**.

Current live Supabase state:

- `ai-proxy` **v42 ACTIVE**
- `nurture-scheduler` **v15 ACTIVE**

Routing:

- Routine Rex coaching/drafting/parsing → `deepseek/deepseek-v4-flash-0731`
- Explicit whole-book / weekly / strategy workloads → `deepseek/deepseek-v4-pro-0813`
- Structured repair may escalate to Pro only where explicitly allowed.
- Optional triad remains **off by default**.
- Temporary outage fallback remains `x-ai/grok-4.3`.

Production hardening now includes:

- hidden Pro reasoning disabled on user-facing work so output budget produces visible answers;
- stalled/empty/timed-out Pro work gets one Flash recovery attempt;
- Rex presents as **LIVE** when available and **WORKING** while processing; never sleeping/waking;
- single-contact memory follows the active customer without bleeding into another customer;
- whole-book requests clear single-contact scope and exclude stale chat-history identity claims;
- whole-book rankings may not invent customers, duplicate contacts to fill a count, or rank obvious QA/test/audit records;
- appointment state must be respected: if an appointment is already set, Rex should reinforce the appointment and relevant prep rather than ask the customer to come in earlier for a redundant step;
- daily AI caps remain active;
- monthly AI ceiling remains **$20/account** unless explicitly changed;
- output is bounded;
- CRM/contact text is treated as untrusted data.

Verified live model usage on 2026-09-02 UTC shows both DeepSeek Flash and DeepSeek Pro in the AI usage ledger. The immediately prior production usage was Grok, confirming the provider cutover is real rather than configuration-only.

Rollback reference for the Rex stress-test window: `ai-proxy` v39 is the pre-v42 stress-hardening baseline. Do not roll back casually; verify the exact desired behavior first.

---

## 4. Rex behavior principles — LOCKED

Rex should feel like an elite salesperson sitting in the rep's pocket, not a generic assistant.

Rex should:

- know the current customer's real PocketRep context;
- understand notes, vehicle, trade, timing, objections, promises, appointment state, sequence state, recent outcome, and relationship context when available;
- recommend the **best next move**, not merely generate copy;
- prioritize getting or protecting the appointment when that is the logical deal-moving action;
- give practical selling angles around value, family/use case, ownership, trade/equity, vehicle fit, urgency, and next step without fabricating facts;
- carry relevant context inside one customer conversation;
- never transfer one customer's facts into another customer's conversation;
- use current CRM/book data as the only customer-identity source for whole-book rankings;
- return fewer ranked contacts rather than inventing or duplicating names;
- preserve human control over customer-facing sends;
- remain useful when the model provider is degraded by falling back to deterministic workflow guidance where possible.

Customer-facing copy should be conversational, specific, concise, appointment-aware, and based only on known context. Avoid generic follow-up filler and corporate AI language.

---

## 5. V1 workflow center — LOCKED

The **Heat Sheet / Daily Execution Engine** is the product center.

Current V1 centers on:

- prioritized Heat Sheet / daily opportunities;
- owned contacts/book;
- contact details, notes, tags, vehicle/trade/timing context;
- Game Plan / recommended next move;
- Rex coaching and drafting;
- call/text/email handoff workflows where supported;
- honest outcome recording;
- Smart Blast / individualized draft review with human send;
- sequences and follow-up state;
- nurture queue;
- deal logging, commission, and production Metrics;
- referrals;
- bilingual outreach where supported;
- PWA/web install experience;
- owner/admin visibility without making the rep UX manager-first.

Do not rebuild the core workflow during aesthetic or AI work.

---

## 6. Messaging / compliance — LOCKED

- No unauthorized auto-send.
- Human review/send remains required where the current workflow requires it.
- DNC / opt-out wins over any Rex recommendation.
- Unique contextual messages are for relevance, not spam-filter evasion.
- Opening an SMS composer is **not** a confirmed send.
- Real SMS flows preserve explicit `sent` / `not_sent` / failure truth where supported.
- Unknown sequence tokens must be blocked before customer-facing handoff.
- Legacy supported aliases such as product/color/trade/dealership/lease remain supported through the shared renderer.
- Do not fabricate customer facts, vehicle data, numbers, dates, trade values, or appointment details.

---

## 7. Pricing — OWNER DECISION / ALIGNMENT REQUIRED

Owner-approved direction:

- Users 1–500: **$39/month**
- Users 501–1,000: **$54/month**
- After 1,000: **$69/month**
- Current individual offer retains a **7-day trial** unless explicitly changed.

Do not silently alter Stripe, checkout, landing copy, or existing-customer terms. Verify the live Stripe price/product setup and define cohort behavior before changing the production ladder.

---

## 8. Referral economics — LOCKED

1. A refers B.
2. Trial/signup alone earns no reward.
3. B must become a qualifying paying customer.
4. A receives one free month.
5. B receives one free month.
6. The reward is one-time for that referral relationship.
7. A customer may earn additional months from additional successful paying referrals.
8. Free usage from referrals is capped at **24 months maximum per account**.

The live referral pipeline includes Stripe-aware qualification/reward handling and reconciliation for stuck qualified referrals. Preserve idempotency and the 24-month cap.

---

## 9. Stale / superseded work — DO NOT MERGE

Old drafts are historical reference unless explicitly rebuilt from current `main`.

Explicitly superseded/closed include prior provider/privacy/checkpoint drafts plus:

- **PR #68** — stale June CSV-export implementation. CSV portability may be reconsidered later, but rebuild fresh if prioritized.
- **PR #69** — stale June Referral Asks branch. Production referral/nurture infrastructure has evolved beyond it.
- **PR #99** — obsolete demo-SMS implementation that would regress the newer sent/not-sent confirmation/audit contract.
- **PR #109** — superseded launch-copy branch; do not merge.

Do not revive old Claude/Grok/Kimi/provider plans merely because their PRs or docs still exist.

Historical files such as `HANDOVER_PROMPT.txt`, `PROJECT_MASTER_CONTEXT.txt`, and dated sections of `docs/HANDOFF.md` are reference material only.

---

## 10. Production evaluation status

The DeepSeek/Rex production evaluation has progressed beyond the old checkpoint:

Verified:

- DeepSeek Flash live routing;
- DeepSeek Pro live routing;
- model names recorded in usage ledgers;
- Pro hidden-output failure reproduced and fixed;
- Flash fallback added for failed/stalled Pro turns;
- Rex `LIVE` / `WORKING` presentation shipped;
- whole-book duplicate/test-record protection shipped;
- stale whole-book chat-history contamination reproduced and fixed in PR #117;
- both production Vercel surfaces READY on #117;
- no app runtime error clusters found during the immediate post-deploy check.

Continue watching real usage for latency, cost, provider errors, and unexpected context leakage. Do not call an AI change complete only because tests pass.

---

## 11. NOW / NEXT / LATER

### NOW — launch-critical

1. **Rex quality first.** Continue adversarial production evaluation across real car-sales scenarios: objection, appointment set, trade, ghosted customer, sold customer, lease/ownership timing, pronoun follow-up, whole-book ranking, and malformed/hostile context.
2. **Premium app aesthetic/microcopy pass** without changing workflow architecture. Desired feel: a private sales operating system for a serious producer.
3. **Final end-to-end launch audit:** landing → pricing/trial → Stripe → provisioning → thank-you/setup → login → onboarding → daily list → customer action → outcome → next action.
4. **Resolve pricing ladder implementation deliberately.**
5. **Verify referral 24-month cap enforcement at launch scale.**
6. Keep landing, checkout, thank-you, support, and app claims aligned with what V1 actually does.

### NEXT — after launch-critical proof

- stronger Rex per-contact action recommendation: call vs text vs other next move;
- better structured memory for outcomes, objections, promises, appointments, and next action;
- response → appointment → show → sale scorecard where data supports it;
- Coach Rex improvements for new reps and stalled deals;
- business-card / customer-intake flow that can begin the relationship and first thank-you workflow;
- dealership inventory-link intelligence using customer context;
- systematic holiday/milestone outreach with genuinely unique contextual copy.

### LATER

- Twilio/native in-app communications when usage, compliance, and economics justify it;
- broader inventory integrations;
- team/dealership expansion that preserves rep-first UX;
- additional verticals only after the automotive engine proves product-market fit;
- deeper learning/optimization after sufficient outcome data exists.

---

## 12. Explicitly off-limits unless the owner changes the decision

- premature multi-industry repositioning;
- generic CRM rebuild;
- Rex/AI becoming the system of record;
- workflow that becomes useless if AI is down;
- unauthorized auto-send;
- spam-safeguard evasion;
- silent pricing or referral-economics changes;
- large architecture rewrites without evidence;
- merging stale PRs because they look complete;
- marketing speculative future features as shipped;
- turning the individual rep experience into a manager-first dashboard.

---

## 13. Maintenance rule

Update this file whenever any of these changes:

- meaningful merge to `main`;
- production behavior/deployment;
- model/provider route;
- pricing/trial/referral decision;
- launch priority;
- a feature moves between NOW/NEXT/LATER;
- a serious known issue is discovered or resolved.

A future PocketRep session should be able to read this file and know **where production actually stands without reconstructing months of chat history**.
