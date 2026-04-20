# Open Rex

Dealership customer-database reactivation SMS agent. Sits on dormant customer
records, writes Rex-voice SMS check-ins, handles replies, escalates
appointments to the dealer rep.

See `/open-rex-docs/OPEN_REX_MASTER_CONTEXT.txt` and
`/open-rex-docs/OPEN_REX_HANDOVER.txt` for full product spec.

## Layout

- `extension/` — Chrome extension that scrapes customer records from the
  dealer's CRM (VinSolutions first). Ports the Rex Lens scraper.
- `backend/` — Next.js app. Dashboard for dealer review/approve, API for
  extension uploads, Twilio send + webhook, Gemini draft generator,
  scheduler, reply handler.
- `shared/` — Types and prompts shared across extension + backend.
- `backend/supabase/schema.sql` — Postgres schema for Supabase.

## Quick start

```bash
# 1. Copy env template
cp .env.example backend/.env.local

# 2. Fill in Supabase, Gemini, Twilio keys (see .env.example)

# 3. Install + run backend
cd backend
npm install
npm run dev  # http://localhost:3000

# 4. Load extension in Chrome (two options)
#    A) Prebuilt zip (fastest):
#       - Download open-rex/extension/open-rex-extension-v0.1.0.zip
#       - Unzip it
#       - Chrome → chrome://extensions → enable Developer Mode
#         → Load unpacked → point to the unzipped folder
#    B) Build from source:
#       cd ../extension && npm install && npm run build
#       Chrome → chrome://extensions → Load unpacked → select extension/
```

### Extension config after loading
1. Right-click the Open Rex action icon → Manage Extension → Service Worker
   → paste into console:
   ```js
   await chrome.storage.local.set({
     backendUrl: 'http://localhost:3000',
     dealerId: 'your-dealer-id',
     authSecret: '<matches DASHBOARD_AUTH_SECRET in backend/.env.local>',
   });
   ```
2. Open VinSolutions worklist in Chrome, click the Open Rex icon (or
   Cmd/Ctrl+Shift+O). Badge will show upload count.

## Status

Scaffold. Extension scrapes VinSolutions list view. Backend exposes
draft + send endpoints. Twilio wired via env vars.

## LLM provider

Current: **Gemini 2.5 Flash** via Google AI Studio free tier (~15 req/min,
~1M tokens/day). Sized for dealer-pilot volume (hundreds of SMS drafts/day).

**Why not Claude Max:** A Claude Max subscription covers claude.com and
Claude Code only. The Anthropic API is separately billed per token, and
Anthropic's Consumer Terms explicitly forbid using OAuth tokens from
Pro/Max accounts in external products. There's no supported path to
power this backend from Max.

**Swap path (when pilot outgrows the free tier):**
`open-rex/backend/src/lib/gemini.ts` is the only file that changes.
Replace `@google/generative-ai` with `@anthropic-ai/sdk`, switch the
model to `claude-haiku-4-5-20251001`, and rename the env var from
`GEMINI_API_KEY` to `ANTHROPIC_API_KEY`. The `generateText({system,
user, temperature, maxOutputTokens})` signature stays the same so
`draft-generator.ts` and its callers are unchanged. At current pricing,
Claude Haiku 4.5 is ~$0.00025 per SMS vs Gemini paid ~$0.00047.

When to swap: Gemini free-tier 429s becoming frequent, or draft
quality needs a bump.

### Known TODOs before first real send

- **10DLC A2P approval**: Twilio requires registered brand + campaign
  before sending marketing SMS to consumers. Takes 2-6 weeks. Keep
  TWILIO_MESSAGING_SERVICE_SID env var empty until approved.
- **Dashboard auth**: currently a shared bearer secret. Swap for real
  auth (Supabase Auth or Clerk) post-MVP.
- **Inbound phone normalization**: the scraper now normalizes scraped
  phones to E.164 (`+1XXXXXXXXXX`). Confirm Twilio inbound `From`
  matches; adjust webhook lookup if your carrier delivers a different
  format.
- **Scheduling**: no cron yet. Drafts are generated on-demand via POST
  /api/drafts. Add a scheduled worker (Vercel Cron or Supabase pg_cron)
  to pick dormant customers and generate drafts nightly.
- **Phone/email scrape fallbacks**: detail-page fetch uses `mailto:`,
  `tel:`, then labeled-phone regex. If your VinSolutions tenant renders
  contact details via XHR after page load, the fetched HTML won't
  contain them — in that case, swap the fetch approach for a
  headless-click DOM extraction.
