# PocketRep Team waitlist — what's done and what you still need to connect

Handoff/checklist for the Teams waitlist on the marketing site (pocketrep.pro).
Ask me **"what's done / what's left on the waitlist"** any time and I'll point you here.

## ✅ What's live (done)
- **`public.waitlist` table** in the PocketRep Supabase project (`fwvrauqdoevwmwwqlfav`):
  columns `id, created_at, name, phone, dealership, seats, email, source`.
  Migration: `PocketRepApp/supabase/migrations/20260608_v2_waitlist_table.sql`.
- **RLS: insert-only for the `anon`/publishable role.** The public key can add rows
  but cannot read, update, or delete them.
- **Marketing-site form** (`Pocketrep/index.html`, the "Join the waitlist" modal)
  inserts the 5 fields + `source` straight into that table via PostgREST using the
  **publishable/anon key** (no secret in the page). On success it shows the existing
  "Thank you for joining the waitlist." confirmation; on failure it shows a friendly
  error and does **not** show the thank-you.
- **`waitlist-notify` Edge Function** (deployed, ACTIVE).
  Source: `PocketRepApp/supabase/functions/waitlist-notify/index.ts`.
- **DB trigger `trg_waitlist_notify`** (pg_net async POST) calls that function on each
  new row. Migration: `PocketRepApp/supabase/migrations/20260608_v2_waitlist_trigger.sql`.

## ⏳ What YOU still need to connect (to turn emails on)
The function is wired and firing on every signup, but it **skips the email until these
3 Edge Function secrets are set** — it logs `secrets_not_set` and returns 200, so
signups are still captured in the table. On your side:

1. **Create a Resend account + API key** — https://resend.com → API Keys.
2. **Verify the `pocketrep.pro` sender domain** in Resend (Domains → add `pocketrep.pro`,
   add the DNS records it gives you). Until verified, Resend rejects the `from` address.
3. **Set the 3 Edge Function secrets** on the PocketRep project (`fwvrauqdoevwmwwqlfav`)
   — Supabase dashboard → Project → Edge Functions → **Manage secrets**, or the CLI:
   ```bash
   supabase secrets set \
     RESEND_API_KEY=re_xxxxxxxxxxxx \
     WAITLIST_NOTIFY_TO=you@yourdomain.com \
     WAITLIST_NOTIFY_FROM="PocketRep <waitlist@pocketrep.pro>"
   ```
   - `RESEND_API_KEY` — your Resend API key.
   - `WAITLIST_NOTIFY_TO` — the inbox that should receive new-signup emails.
   - `WAITLIST_NOTIFY_FROM` — a verified sender, e.g. `waitlist@pocketrep.pro`.

   No redeploy needed — the function reads secrets at runtime. New signups email you
   immediately once the secrets are set.

## 🔒 Optional hardening (not required)
The function accepts the public anon key (same key the page uses). To stop someone
replaying that public key to send you fake-signup emails, set `WAITLIST_WEBHOOK_SECRET=<random>`
as a 4th secret **and** add a matching `x-waitlist-secret` header to the trigger's
`net.http_post` call in `notify_waitlist_signup()`. The function enforces it only when
the secret is set — ask me and I'll wire it.

## 🧪 Quick test
After setting the secrets, submit the waitlist form on pocketrep.pro (or insert a test
row). You should get an email, and the row appears in `public.waitlist`.
