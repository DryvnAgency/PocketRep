# PocketRep — Current State / Decisions

**Last updated:** 2026-09-02 CT / 2026-09-02 UTC

**Purpose:** Living operational truth for PocketRep. Read `PROJECT_OPERATING_SYSTEM.md` first. If older handoffs, plans, PR descriptions, or chat history conflict with this file, this file wins unless current production proves otherwise.

---

## 1. Product identity — LOCKED

PocketRep is a **Daily Sales Execution Engine for individual automotive salespeople working their own book of business**.

Core positioning:

- **WORK YOUR BOOK.**
- **WORK SMARTER.**
- Your next deal may already be in your book.
- PocketRep tells the rep who deserves attention next, why, what to do, and helps move the opportunity forward.

PocketRep V1 is **automotive-only**. It is not being positioned as a generic CRM, generic AI chatbot, bulk-texting platform, dealership management suite, or multi-industry sales tool.

Intended loop:

> Open → know who to work → understand why → take the recommended action → record the outcome → PocketRep determines what comes next.

**Rex** is the salesperson-facing intelligence/coaching layer. The deterministic execution engine remains the system of record and must still function when AI is unavailable.

---

## 2. Verified production baseline

Last verified PocketRep runtime-affecting Git baseline:

`ae8c3b430bc09724b802ab11155da063646a7993` — PR #136

Production surfaces:

- Marketing: `https://pocketrep.pro` / `https://www.pocketrep.pro`
- App: `https://app.pocketrep.pro`

Recent PocketRep sequence:

- **#107** — V1 rep UI, Rex/admin hardening, workflow/audit coverage.
- **#112** — legacy sequence-template compatibility; unknown tokens still blocked.
- **#113** — landing proof and trial activation polish.
- **#114** — organic SEO foundation plus appointment-aware Rex copy.
- **#115** — deterministic DeepSeek Flash/Pro routing, contact-memory isolation, output/cost rails.
- **#116** — Pro responsiveness, one-shot Flash recovery, Rex LIVE/WORKING state, whole-book duplicate/test protection.
- **#117** — whole-book turns clear single-contact scope and use current book data for identity.
- **#119** — legacy/native V1 Rex compatibility through the current AI stack.
- **#123** — native automotive coaching truthfulness rails.
- **#124** — checkout existing-account rebind protection.
- **#126** — verified monthly program context/persistence.
- **#129** — Game Plan now uses the real rep identity instead of hardcoded “Jake”.
- **#130** — native Rebuttals narrowed to automotive-only; fabricated/out-of-scope industries removed.
- **#131** — appointment evidence boundary, cross-customer context isolation, inventory truth rail.
- **#133** — V1 $29 Founding Rep cutover across landing, app signup, thank-you, checkout validation, AI-readable pricing, and current-state decisions; existing paying $39 subscriptions preserved.
- **#134** — completed visible landing $29 alignment, removed unsupported demo urgency/value claims, and hardened the pricing/truthfulness regression guard.
- **#135** — aligned current-state documentation with verified post-cutover runtime.
- **#136** — referral 24-month reward cap now reserved and enforced atomically at the database level (`reserve_referral_reward`, service-role only) before either recipient's Stripe coupon is issued, closing a race where concurrent/duplicate settlement attempts could over-grant free months.

Do not infer production from an old PR or preview. Verify `main`, Vercel, Supabase, Stripe, and the relevant runtime surface.

### RexLens — DISREGARD

**RexLens is separate/out-of-scope from PocketRep. Never include RexLens source, packaging, tests, PRs, issues, routes, or deployment artifacts in PocketRep audits, launch blockers, runtime baselines, or NOW/NEXT priorities unless the owner explicitly reverses this decision.**

Historical RexLens files/commits may remain in Git history but are not PocketRep product truth.

---

## 3. Rex / AI production route — VERIFIED

PocketRep is deterministic-first.

Current live Supabase state relevant to launch:

- `ai-proxy` **v44 ACTIVE**
- `nurture-scheduler` **v17 ACTIVE** — redeployed from bundled repo source carrying the #136 atomic reservation logic; v16 had briefly shipped as a remote-import wrapper pinned to a GitHub raw-content commit instead of bundled source, corrected 2026-09-02.
- `checkout-account` **v15 ACTIVE**; current public V1 checkout is the $39 price, while retired $29 sessions remain accepted only for safe historical/in-flight provisioning compatibility. Strict checkout/session/customer-rebind verification remains in place.
- `rex_monthly_programs` exists with RLS enabled and owner-scoped policies.

Routing:

- Routine Rex coaching/drafting/parsing → `deepseek/deepseek-v4-flash-0731`
- Explicit whole-book / weekly / strategy workloads → `deepseek/deepseek-v4-pro-0813`
- Legacy/native screenshot understanding → `deepseek/deepseek-v4-flash-vision-exp`, isolated vision fallback `google/gemini-2.5-flash`
- Optional triad remains off by default.
- Temporary text outage fallback remains `x-ai/grok-4.3`.

Standing AI rails:

- Flash handles routine work; Pro is reserved for work that merits it.
- Failed/stalled Pro work may receive one bounded Flash recovery attempt.
- Rex presents as **LIVE** when available and **WORKING** while processing; never sleeping/waking.
- Active-customer facts never transfer to another customer.
- Whole-book rankings may not invent/duplicate customers or use obvious QA/test records to fill a count.
- Daily AI caps remain active; monthly AI ceiling remains **$20/account** unless the owner changes it.
- CRM/contact text is untrusted data.

---

## 4. Rex behavior principles — LOCKED

Rex should feel like an elite automotive salesperson/coach in the rep’s pocket, not a generic assistant.

Rex should:

- use the current customer’s real PocketRep context;
- understand notes, vehicle, trade, timing, objections, promises, appointment evidence, sequence state, recent outcome, and relationship context when available;
- recommend the **best next move**, not merely generate copy;
- prioritize getting or protecting the appointment when logical;
- never upgrade tentative appointment language into a confirmed appointment; confirmation requires explicit day/time evidence in notes/conversation because PocketRep V1 has no authoritative appointment calendar feed;
- create legitimate urgency from real calendar timing, customer context, holidays, ownership/lease milestones, and rep-verified programs without fabricating facts;
- never invent inventory, demand, pricing, payments, incentives, rebates, eligibility, manager flexibility, trade/equity/value, repair timing, financing terms, competing buyers, deposits/holds, or dealership promises;
- use genuinely different context-based wording across repeated touches;
- support sold-customer relationship/referral/ownership follow-up;
- preserve human control over every customer-facing send.

Monthly-program rule: during local days 1–3, Rex asks once on the first user-facing turn for the month’s programs if not already prompted. Reps can update programs conversationally mid-month. Verified facts are month-scoped and treated as facts, not instructions.

If an appointment is already confirmed, Rex should reinforce it and relevant prep. It should not ask the customer to come earlier merely to inspect a trade; the trade can be reviewed at the confirmed appointment unless real context says otherwise.

---

## 5. V1 workflow center — LOCKED

The **Heat Sheet / Daily Execution Engine** is the product center.

Current V1 centers on:

- prioritized Heat Sheet / daily opportunities;
- owned contacts/book;
- contact details, notes, tags, vehicle/trade/timing context;
- Game Plan / recommended next move;
- Rex coaching and drafting;
- native call/text/email handoff where supported;
- honest outcome recording;
- Smart Blast / individualized draft review with human send;
- sequences and follow-up state;
- nurture queue;
- deal logging, commission, and production metrics;
- referrals;
- bilingual outreach where supported;
- PWA/web install experience;
- owner/admin visibility without making the rep UX manager-first.

Do not rebuild this workflow during aesthetic, AI, or pricing work.

---

## 6. Messaging / compliance — LOCKED

- No unauthorized auto-send.
- Human review/send remains required where the current workflow requires it.
- DNC / opt-out wins over any Rex recommendation.
- Unique contextual messages are for relevance, not spam-filter evasion.
- Opening an SMS composer is not a confirmed send.
- Unknown sequence tokens must be blocked before customer-facing handoff.
- Do not fabricate customer facts, vehicle data, numbers, dates, trade values, appointment details, incentives, program eligibility, sale terms, or dealer promises.

Future built-in communications must add consent, opt-out, quiet-hour, carrier-registration, usage, and audit controls before any automation expands.

---

## 7. Pricing — OWNER DECISION

The old user-count ladder is **killed**. Do not restore `$39 first 500 / $54 next 500 / $69 after 1,000`.

Owner-approved product-generation direction:

- **V1 Founding Rep: $39/month** for the current individual product.
- The temporary $29 launch cutover is **retired**; do not advertise or route new customers to the retired $29 Payment Link.
- **7-day free trial**, card on file; charge begins on day 8 unless canceled.
- A founding rep keeps the **software subscription rate they joined at while the subscription remains continuously active**.
- **V2 direction for new customers: $59/month** when traction reaches the owner-defined next pricing cohort.
- **V3 direction for new customers: $79/month** when traction reaches the owner-defined later pricing cohort.
- V2/V3 prices are roadmap direction, **not current purchasable offers**. Current desired ladder is **$39 → $59 → $79** for new customers; existing subscribers keep the software rate they joined at while continuously active.

Live Stripe resources prepared for the V1 cutover:

- Product: `prod_UePB5tpacZLwzF`
- Current V1 price: `price_1Tf6MeIKMImSDGHZvYLmeIqS` — $39/month
- Current V1 Payment Link: `plink_1TfLSuIKMImSDGHZWS0cW3QV`
- Checkout URL: `https://buy.stripe.com/cNi4gAbMn4kg9Ax5AucbC06`

Existing paying subscriptions must not be bulk-repriced as part of the cutover.

### Future built-in communications economics

Built-in SMS/calling is V3-direction work, not V1. Grandfathering applies to PocketRep’s software subscription, not unlimited future telecom consumption. Communications may be a separate usage/add-on charge.

Current internal planning target is roughly **500 outbound SMS segments for about $10/month for grandfathered V1/V2 users**, but this exact allowance/price is **not implemented and must not be publicly promised until actual carrier/Twilio economics are verified**.

---

## 8. Referral economics — LOCKED

1. A refers B.
2. Trial/signup alone earns no reward.
3. B must become a qualifying paying customer.
4. A receives one free month.
5. B receives one free month.
6. Reward is one-time for that referral relationship.
7. Additional qualifying referrals can earn additional months.
8. Free usage from referrals is capped at **24 months maximum per account**.

Preserve Stripe-aware qualification, idempotency, reconciliation, and the 24-month cap. Pricing work does not change these economics.

**Enforcement status (verified 2026-09-02, #136):** the 24-month cap and the one-time-per-referral reward are enforced atomically in Postgres via `reserve_referral_reward` (`SECURITY DEFINER`, granted to `service_role` only — confirmed live via `information_schema.routine_privileges`), which advisory-locks and row-locks per recipient before either `stripe-webhook` or `nurture-scheduler` is allowed to issue a Stripe coupon. Retries are idempotent (`already_applied` / `already_reserved` / `cap_reached` / `reserved` outcomes), and a recipient at the cap settles the referral as rewarded instead of retrying forever. Enforcement is now a verified atomic control in the data path, not merely a stated rule.

---

## 9. Stale / superseded / disregard — DO NOT REVIVE

- **RexLens — DISREGARD** for PocketRep.
- **#68** stale June CSV-export implementation.
- **#69** stale June Referral Asks branch.
- **#99** obsolete demo-SMS implementation.
- **#109** superseded launch-copy branch.
- Old provider/privacy/checkpoint drafts and pre-pivot multi-industry plans are historical only.

Historical files such as `HANDOVER_PROMPT.txt`, `PROJECT_MASTER_CONTEXT.txt`, dated `docs/HANDOFF.md` sections, and extracted design experiments are reference material only. They do not override this file.

---

## 10. Production evaluation status

Verified launch-hardening includes:

- DeepSeek Flash and Pro production routing;
- Pro output/recovery hardening;
- Rex LIVE/WORKING state;
- whole-book duplicate/test-record protection;
- whole-book stale identity contamination fix;
- legacy/native V1 Rex compatibility;
- native Rex dealership-truthfulness rails;
- existing-account Stripe customer-rebind protection;
- verified monthly-program persistence;
- Game Plan real-rep identity (#129);
- automotive-only Rebuttals (#130);
- appointment-evidence boundary, cross-customer isolation, and inventory truth rail (#131);
- checkout-account v15 dual-price compatibility retained: $39 is current; retired $29 sessions can still complete historical/in-flight provisioning.
- V1 $29 Founding Rep funnel cutover merged and live (#133).
- remaining stale $39 landing copy and unsupported demo claims removed; regression guard hardened (#134).
- post-#134 production verification: marketing and app deployments READY on commit `1aa51de19ff3b8636cebab535c3ff40b19c04f4d`; direct production landing fetch showed the $29 offer and new Stripe link; app error/fatal logs were empty for the checked one-hour window.
- #136 referral-cap launch hardening verified live (2026-09-02): `reserve_referral_reward` migration present in production and confirmed `service_role`-only via `information_schema.routine_privileges` and `pg_get_functiondef`; `stripe-webhook` v29 and `nurture-scheduler` v17 both ACTIVE and confirmed byte-for-byte to contain the atomic-reservation source (nurture-scheduler's v16 had briefly been a remote-import wrapper instead of bundled source — found and corrected during this pass); edge-function logs show zero errors across the verification window; 42/42 referral regression checks pass on current `main`.

Continue watching real usage for latency, cost, provider errors, context leakage, monthly-program capture quality, and customer-facing truthfulness. Passing tests alone is not sufficient production proof.

---

## 11. NOW / NEXT / LATER

### NOW — launch-critical

1. Keep adversarial Rex/V1 evaluation running across appointment, trade, ghosted, sold, program, whole-book, malformed/hostile, and legacy-client scenarios.
2. Final end-to-end launch audit from landing through checkout/provisioning/login, then daily execution and next action.
3. Referral 24-month cap is now atomically enforced in the database (#136, see §8/§10); this was verified by code/DB/log inspection, not live load, so keep watching real referral volume once launch-scale traffic arrives.
4. Premium app aesthetic/microcopy pass without changing workflow architecture.
5. Keep landing, checkout, thank-you, support, app, and AI-readable claims aligned with V1 reality.

### NEXT

- stronger per-contact next-action recommendation (call vs text vs other move);
- better structured memory for outcomes, objections, promises, appointments, and next action;
- response → appointment → show → sale scorecard where data supports it;
- Coach Rex improvements for new reps/stalled deals;
- business-card / customer-intake flow;
- dealership inventory-link intelligence using verified inventory/context;
- systematic holiday/milestone outreach with unique contextual copy.

### LATER

- native built-in communications when compliance, economics, and usage justify it;
- broader inventory integrations;
- team/dealership expansion that preserves rep-first UX;
- other verticals only after the automotive engine proves product-market fit;
- deeper learning/optimization after sufficient outcome data exists.

---

## 12. Explicitly off-limits unless owner changes the decision

- premature multi-industry repositioning;
- generic CRM rebuild;
- Rex/AI becoming the system of record;
- unauthorized automatic customer sends;
- fabricated inventory/pricing/incentives/appointments/dealer claims;
- pricing/referral changes outside the owner-approved decisions above;
- treating roadmap V2/V3 features or prices as currently available;
- treating RexLens as PocketRep work;
- reviving stale PRs rather than rebuilding from current `main` when evidence supports it.
