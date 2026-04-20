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

# 4. Build + load extension in Chrome
cd ../extension
npm install
npm run build
# Chrome → chrome://extensions → Load unpacked → select extension/
```

## Status

Scaffold. Extension scrapes VinSolutions list view. Backend exposes
draft + send endpoints. Twilio wired via env vars.

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
