# PocketRep — Developer Handover

Welcome. This document is written for a human developer taking over PocketRep. If you are an AI coding agent, read `CLAUDE.md` instead — same facts, tighter format.

---

## 1. What PocketRep Is

PocketRep is an AI-powered sales follow-up coach for CRM-less sales teams — primarily car-dealership reps, with other industries (real estate, insurance, home services) served by swappable `industryConfig`. The core loop:

1. Rep voices a customer interaction into the gold **Hey Rex** orb (draggable overlay).
2. **Whisper** transcribes the audio.
3. **Claude Haiku** parses contact name, vehicle interest, objections, follow-up dates, personal events.
4. Contact is auto-created or updated in Supabase.
5. The **Heat Sheet** auto-scores leads (hot / warm / watch) and surfaces who to call next.
6. The **Rex Chat** tab coaches the rep with live context from the contact record.
7. **Sequences** send templated or custom batch follow-ups (plan-tiered caps).

Revenue model: three-tier subscription (Pro, Pro Bundle, Elite) with server-side daily AI-cost caps enforced by the `ai-proxy` edge function.

---

## 2. Repo Layout

```
PocketRep/
├── PocketRepApp/          # The Expo app (this is what you'll work in day-to-day)
├── RexLens/               # Sibling browser extension, esbuild-built (separate project)
├── Pocketrep/             # Web-export build output (generated, deployed to Vercel)
├── vercel.json            # Root-level Vercel config
├── README.md              # One-liner; this file is the real docs
├── DEVELOPER_HANDOVER.md  # This file
└── CLAUDE.md              # Same content for AI agents
```

---

## 3. Tech Stack

| Layer          | Technology                                                    |
| -------------- | ------------------------------------------------------------- |
| Framework      | Expo SDK 51, React Native 0.74.5, React 18.2                  |
| Routing        | `expo-router` 3.5 (file-based routing under `app/`)           |
| Backend        | Supabase (Postgres + Auth + Edge Functions)                   |
| AI — chat      | Anthropic Claude Haiku (Rex Chat tab)                         |
| AI — proxy     | Gemini 2.5 Flash, via the `ai-proxy` edge function            |
| Voice          | `expo-av` + OpenAI Whisper (transcription)                    |
| Wake word      | Picovoice Porcupine (optional, for custom "Hey Rex" trigger)  |
| Styling        | React Native `StyleSheet` + `Animated` (no Tailwind/NativeWind) |
| Secure storage | `expo-secure-store` on native, `localStorage` on web          |
| Build (native) | EAS Build (`eas.json` defines channels)                       |
| Build (web)    | `expo export --platform web` → deployed via Vercel            |

---

## 4. File Structure (inside `PocketRepApp/`)

```
PocketRepApp/
├── app/
│   ├── _layout.tsx            # Root: ErrorBoundary, auth-state routing, StatusBar
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   ├── index.tsx          # Login (username → {username}@pocketrep.app)
│   │   └── signup.tsx         # Signup + trial
│   └── (tabs)/
│       ├── _layout.tsx        # Tab bar + HeyRex overlay mounted here
│       ├── index.tsx          # HEAT SHEET — hot/warm/watch + today's follow-ups
│       ├── contacts.tsx       # CONTACTS — CRUD, CSV import, swipe-to-delete
│       ├── deals.tsx          # DEALS — log closed business (front/back gross)
│       ├── sequences.tsx      # SEQUENCES — templates + batch send queue
│       ├── rex.tsx            # REX CHAT — Haiku coaching, intent parsing
│       └── more.tsx           # SETTINGS — plan, industry, digest, export, sign-out
├── components/
│   ├── HeyRex.tsx             # Draggable voice-intake orb (Whisper + parsing)
│   └── Onboarding.tsx         # First-run wizard
├── lib/
│   ├── supabase.ts            # Client init (SecureStore on native, localStorage on web)
│   ├── types.ts               # TS interfaces: Profile, Contact, Deal, Sequence, ...
│   ├── notifications.ts       # expo-notifications: follow-ups, lease milestones
│   ├── messageQueue.ts        # Batch message generation + persistence
│   └── industryConfig.ts      # Industry-specific templates and rules
├── constants/
│   └── theme.ts               # Colors, radius, spacing, heatConfig
├── supabase/functions/
│   ├── ai-proxy/              # Gemini 2.5 Flash proxy + JWT + daily cost cap
│   └── support-reply/         # Stub (see §11)
├── sql/                       # Schema files
├── assets/                    # Icons, splash
├── .env.example
├── app.json                   # Expo config, permissions, plugins
├── eas.json                   # EAS channels: development / preview / production
└── package.json
```

---

## 5. Supabase Setup

### Tables to create (referenced in code)

- `profiles` — user row; plan tier, industry, trial dates
- `contacts` — full CRM book with vehicle fields (year, make, model, mileage, lease end)
- `deals` — `contact_id`, amount, front gross, back gross, closed date
- `rex_messages` — Rex Chat history
- `rex_memory` — AI-distilled rep profile (fed back into system prompt)
- `sequence` — sequence instances per contact
- `sequence_steps` — step templates (channel, delay, body)
- `interactions` — call/text/email logs (schema live; UI partial — see §11)
- `daily_ai_usage` — per-user per-day cost counter, enforced by `ai-proxy`

SQL for these lives under `PocketRepApp/sql/` — apply in order.

### Auth

- Supabase Auth with email+password.
- Login collects a **username**; the app maps `{username}` → `{username}@pocketrep.app` under the hood (`app/(auth)/index.tsx`). Users never see the email form.
- Add `pocketrep.app` (and your Vercel preview domain) to **Auth → URL Configuration → Redirect URLs** in the Supabase dashboard.

### Edge function: `ai-proxy`

Handles Gemini calls server-side so the API key never ships to the client, and enforces per-tier daily spend:

```bash
# One-time
supabase secrets set GEMINI_API_KEY=your-key

# Each deploy
supabase functions deploy ai-proxy
```

Caps (hard-coded in `supabase/functions/ai-proxy/index.ts`): `rex_lens`/`pro` = $1/day, `elite` = $2/day. Hit the cap and the function 429s until midnight UTC.

### Edge function: `support-reply`

Currently a stub. See §11.

---

## 6. Environment Variables

Put these in `PocketRepApp/.env` (git-ignored). For EAS builds, put them in `eas.json` under the channel's `env` block; for Vercel, set them in the project settings.

| Variable                          | Required | What it does                                                           |
| --------------------------------- | -------- | ---------------------------------------------------------------------- |
| `EXPO_PUBLIC_SUPABASE_URL`        | Yes      | Supabase project URL                                                   |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY`   | Yes      | Public anon key                                                        |
| `EXPO_PUBLIC_ANTHROPIC_KEY`       | Yes      | Claude Haiku key used by Rex Chat                                      |
| `EXPO_PUBLIC_OPENAI_KEY`          | Yes      | Whisper key for Hey Rex voice transcription                            |
| `EXPO_PUBLIC_PICOVOICE_KEY`       | Optional | Porcupine key for the custom "Hey Rex" wake word                       |
| `EXPO_PUBLIC_AI_PROXY_URL`        | Optional | Override AI endpoint; defaults to Anthropic direct if unset            |

> Note: `.env.example` today only lists the first four. Expanding it is item 9 in §11.

---

## 7. Vercel Deployment (web)

- Build command: `expo export --platform web`
- Output directory: `Pocketrep/`
- `vercel.json` at repo root handles:
  - SPA rewrites (`/* → /index.html`) so deep links work
  - Long-lived cache headers on static assets (`max-age=31536000`)

Push to main → Vercel picks it up. Previews deploy per branch.

---

## 8. EAS Builds (iOS / Android)

- `eas.json` defines `development` (simulator), `preview` (internal TestFlight / APK), `production` channels.
- Bundle id / package name: `pro.pocketrep.app`.
- Env vars are scoped per channel inside `eas.json`.
- Standard flow: `eas build --profile preview --platform ios` (or `android`).

---

## 9. Local Dev Setup

```bash
cd PocketRepApp
npm install
cp .env.example .env          # Fill in real values (see §6)
npx expo start                # Scan QR in Expo Go, or press `i`/`a`/`w`
```

For the ai-proxy edge function locally:

```bash
supabase start
supabase functions serve ai-proxy --env-file ./supabase/.env
```

---

## 10. What's Built ✅

- **Heat Sheet** — tiered scoring (lease-end, mileage, purchase date, last contact, urgency); today's follow-ups pinned on top
- **Contact Book** — full CRUD, CSV import with field mapping, swipe-to-delete, tap-to-call / email
- **Deals** — log closed business with front/back gross, link to contact
- **Rex Chat** — Haiku-backed coach; system prompt carries rep name, rep memory, active contact, industry rules; parses intents (`mass_text`, `show_followups`, `log_customer`, `start_sequence`); markdown responses with action buttons; accepts screenshot uploads for deal coaching
- **Hey Rex voice orb** — draggable overlay, mic → Whisper → Haiku parsing → auto-save to matching contact, can auto-generate follow-up sequence
- **Sequences** — built-in templates (post-sale retention, referral, service) + custom; batch message queue with resume; plan-tiered caps (Pro 50 / Elite 100 per batch)
- **Onboarding** — first-run industry-selection wizard + trial sign-up
- **Settings** — weekly digest scheduling, CSV export, sign-out, plan/industry switching
- **ai-proxy edge function** — Gemini 2.5 Flash, JWT-verified, daily cost cap per tier
- **3-tier pricing** — Pro / Pro Bundle / Elite (see commit `211f96c`)

---

## 11. What Still Needs Work (priority order)

1. **Wire interactions UI to the `interactions` table.** Schema exists; type is defined in `lib/types.ts`. No CRUD screen yet.
2. **Finish the `support-reply` edge function.** Directory exists under `supabase/functions/support-reply/` but it's stubbed.
3. **Set up the custom "Hey Rex" wake word in Porcupine console.** Code has the hook in `components/HeyRex.tsx`; needs a trained keyword file + `EXPO_PUBLIC_PICOVOICE_KEY`.
4. **Finish personal-events reminders.** Baby due / anniversary / birthday are parsed from voice but not every reminder path is scheduled in `lib/notifications.ts`.
5. **Location-based proximity alerts.** Location permission is requested at onboarding; no logic consumes it.
6. **Rapport notes + photo attachment on contacts.** Schema supports, UI missing.
7. **Stripe hooks for plan-downgrade enforcement.** Today the app trusts `profiles.plan`; need webhook to downgrade on failed payment / cancellation.
8. **Device testing for voice flow end-to-end.** Whisper + Haiku + contact match hasn't been stress-tested on a real iPhone/Android with background noise.
9. **Expand `PocketRepApp/.env.example`** to include all six variables from §6 (currently missing `EXPO_PUBLIC_PICOVOICE_KEY` and `EXPO_PUBLIC_AI_PROXY_URL`).

---

## 12. Design Brief

All tokens in `PocketRepApp/constants/theme.ts`. Dark mode only.

**Colors**
- Ink (backgrounds): `#0c0c0e`, `#141418`, `#1c1c22`, `#23232b`; surfaces `#111116`, `#18181f`
- Gold (accent): `#d4a843`, `#f0c060`, with `rgba(212,168,67,0.10)` bg and `rgba(212,168,67,0.22)` border
- Greys (text): `#5a6070`, `#8a90a0`, `#b4bac8`; white `#ffffff`
- Status: red `#e05252`, orange `#e08c52`, green `#42b883` — each with matching `*Bg` (rgba ~0.10–0.12) and `*Border` (rgba ~0.22–0.25)

**Spacing**: `xs 4 / sm 8 / md 12 / lg 16 / xl 24 / xxl 32`

**Radius**: `sm 7 / md 10 / lg 14 / xl 18 / full 999`

**Heat-tier badges** (`heatConfig`)
- `hot` — 🔥, red
- `warm` — ☀️, orange
- `watch` — 👁, gold

**Component rules**
- `StyleSheet.create()` + `Animated` only — no third-party UI kit
- Every interactive element gets a gold accent (border or chip)
- Dark surfaces layered with 2–4px of ink-step elevation, never shadows

---

## 13. Rex Tab Specifics

- System prompt composes: rep display name + `rex_memory` row + active contact record + industry rules from `industryConfig.ts`.
- Parses rep intents from the reply and renders them as action buttons:
  - `mass_text` — kick off a batch send
  - `show_followups` — navigate to Heat Sheet filtered to due
  - `log_customer` — open the contact sheet pre-filled
  - `start_sequence` — launch sequence picker
- Markdown rendered with action buttons inlined on their own line.
- Screenshot upload: deal photo → Haiku vision call → coaching text back.
- The Hey Rex orb lives at the `(tabs)` layout level so it overlays every tab, not just Rex Chat.

---

## 14. Agent Prompt for Future Sessions

Paste this at the start of every new Claude Code session that touches this repo:

```
Read CLAUDE.md at repo root before touching anything.

You are building PocketRep — Expo SDK 54 app, car dealership sales reps.
Branch: claude/pull-latest-app-build-ausHc — push all work here.

Rules you follow without exception:
- Tell user 3 words max. Nothing more. ("done" "fixed" "splitting now")
- Error? Fix it. Don't mention it. Just fix it.
- File or task too big? Split in half. Do half. Do other half. Compile both — make sure it connects.
- Still too big? Cut to fourths. Compile all four. Verify everything ties together.
- See "API Error: Stream idle timeout"? Split immediately. Never retry the whole thing.
- Always commit + push after every change. Never push to main.
- Never create a PR unless user says "make a PR."

Go.
```
