# PocketRep — Developer Handover
> Date: 2026-04-20 | Version: May 31 Launch Build

---

## What Is PocketRep

A mobile app for car dealership sales reps. Think of it as a CRM + AI sales coach that lives in your pocket on the floor. Built in React Native / Expo so it ships to iOS, Android, and web from one codebase.

The rep's workflow:
1. Add customers to their "book" (Contact Book tab)
2. Rank them by heat tier — Hot, Warm, Watch (Heat Sheet tab)
3. Talk to Rex, the AI coach, for scripts, objection handling, deal coaching (Rex tab)
4. Log deals and track monthly commission (Metrics tab)
5. Configure Hey Rex wake word, export data, manage account (Profile tab)

---

## Tech Stack

| Layer | Tech |
|---|---|
| Framework | React Native + Expo SDK 54 |
| Navigation | expo-router v6 (file-based, tab + auth layouts) |
| Backend | Supabase (Postgres + Auth + Edge Functions + Storage) |
| AI | Gemini 2.5 Flash via Supabase Edge Function `rex-chat` |
| Voice | expo-speech-recognition ~4.0.0 (Hey Rex wake word) |
| Audio | expo-av (mic recording for voice-to-Rex) |
| Web deploy | Vercel → `https://app.pocketrep.pro` |
| Language | TypeScript throughout |

---

## Repository Structure

```
PocketRep/
├── CLAUDE.md                  ← AI agent instructions (ignore as human dev)
├── DEVELOPER_HANDOVER.md      ← This file
└── PocketRepApp/
    ├── app/
    │   ├── (tabs)/            ← All tab screens
    │   │   ├── _layout.tsx    ← Tab bar config (5 tabs)
    │   │   ├── index.tsx      ← Heat Sheet
    │   │   ├── contacts.tsx   ← Contact Book / CRM
    │   │   ├── rex.tsx        ← Rex AI Chat
    │   │   ├── metrics.tsx    ← Monthly Commission Tracker
    │   │   ├── profile.tsx    ← Settings / Profile
    │   │   ├── sequences.tsx  ← Hidden — follow-up automation
    │   │   ├── deals.tsx      ← Hidden — legacy
    │   │   └── more.tsx       ← Hidden — superseded by profile.tsx
    │   └── (auth)/            ← Login + signup screens
    ├── components/
    │   ├── HeyRex.tsx         ← Wake word overlay (always mounted)
    │   ├── HeyRexOnboarding.tsx
    │   └── Onboarding.tsx
    ├── lib/
    │   ├── supabase.ts        ← Supabase client init
    │   ├── types.ts           ← All TypeScript types
    │   ├── useWakeWord.ts     ← "Hey Rex" detection hook
    │   ├── industryConfig.ts  ← Industry icon/label map
    │   ├── notifications.ts   ← Weekly digest scheduling
    │   └── messageQueue.ts    ← Offline queue
    ├── constants/
    │   └── theme.ts           ← All colors, spacing, radius, heat config
    ├── supabase/
    │   ├── functions/
    │   │   ├── rex-chat/      ← Gemini proxy (needs deployment)
    │   │   └── support-reply/ ← Already deployed
    │   └── migrations/
    │       └── 20260417_pocketrep_may31.sql  ← Run this in Supabase
    ├── package.json
    ├── vercel.json
    └── app.json
```

---

## Supabase Setup

**Project:** `fwvrauqdoevwmwwqlfav`
**Dashboard:** https://supabase.com/dashboard/project/fwvrauqdoevwmwwqlfav
**URL:** `https://fwvrauqdoevwmwwqlfav.supabase.co`
**Anon key:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3dnJhdXFkb2V2d213d3FsZmF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNzczOTAsImV4cCI6MjA4OTk1MzM5MH0.D0Mu7wWB59NUr7cFtkl_00ijbseSz_SsV86pwJSn0s0`

### Database Tables

**Existing:**
- `profiles` — user profile (full_name, email, industry, plan, trial_ends_at)
- `contacts` — CRM (name, phone, email, vehicle_year/make/model, mileage, heat_tier, notes, last_contact_date)
- `sequences` + `sequence_steps` — follow-up automation
- `rex_messages` — old AI chat log (being replaced)
- `deals` — legacy deal records

**New (run migration to create):**
- `rex_conversations` — Gemini chat history per user
- `monthly_metrics` — per-month commission summary (total, units, closed_at)
- `monthly_deals` — individual deal records linked to a month
- `contact_changelog` — field-level edit history on contacts

**To create new tables:** Supabase Dashboard → SQL Editor → paste + run `PocketRepApp/supabase/migrations/20260417_pocketrep_may31.sql`

All tables have Row Level Security (RLS) enabled — users can only see their own data.

### Edge Functions

**`rex-chat`** — NOT YET DEPLOYED. File is at `PocketRepApp/supabase/functions/rex-chat/index.ts`.
This is the Gemini 2.5 Flash proxy. Rex will not respond without it.

To deploy:
1. Supabase Dashboard → Edge Functions → New Function → upload `rex-chat/index.ts`
2. Add Secret: `GEMINI_API_KEY` = your Google AI Studio API key
3. Or via CLI: `supabase functions deploy rex-chat`

**`support-reply`** — Already deployed. Auto-replies to support tickets.

### Auth
Go to Supabase Dashboard → Authentication → URL Configuration:
- Site URL: `https://app.pocketrep.pro`
- Additional redirect URLs: `https://app.pocketrep.pro/**`

Without this, email confirmation links will redirect to localhost and break login.

---

## Environment Variables

```bash
# PocketRepApp/.env  (local dev — already exists, do not commit)
EXPO_PUBLIC_SUPABASE_URL=https://fwvrauqdoevwmwwqlfav.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
EXPO_PUBLIC_ANTHROPIC_KEY=   # legacy, being phased out

# Vercel — already set in vercel.json (public keys, safe to commit)
# Supabase Edge Function Secrets — set in dashboard
GEMINI_API_KEY=<get from Google AI Studio>
```

---

## Vercel Deployment

**Project:** `project-t90u1`
**URL:** `https://app.pocketrep.pro`
**Root dir:** `PocketRepApp/`
**Build:** `npm run build:web` = `expo export --platform web`
**Output:** `dist/`

Auto-deploys when you push to branch `claude/pull-latest-app-build-ausHc`.

Previously all builds were failing — fixed by upgrading from Expo SDK 51 to SDK 54 (Node 24.x compatibility). Do not downgrade any packages.

---

## Key Features — How They Work

### Heat Sheet (`index.tsx`)
Three sections: Hot / Warm / Watch. Contacts sorted by heat tier. Shows last-contact date, vehicle. Tap to view contact detail, swipe actions to log notes or change tier.

### Contact Book (`contacts.tsx`)
Full CRM list. Search, filter by industry. Tap contact → detail screen with notes timeline, vehicle info, call/text/email shortcuts. Add/edit contact via modal.

### Rex AI Chat (`rex.tsx`)
- Text input → sends to Supabase Edge Function `rex-chat` → Gemini 2.5 Flash → reply displayed
- Voice: tap mic button → records audio → transcribes → sends as text
- Image: tap 📎 → pick screenshot → base64 encoded → sent with message → Gemini reads image
- Quick chips above input: tap to send a preset prompt
- Rex's replies can embed `[QUICK_LOG:{json}]` — the app parses this and can auto-log contact data
- All AI calls go through the Edge Function — Gemini API key is never in the client

### Hey Rex Wake Word (`components/HeyRex.tsx`)
- Always-on overlay component mounted at root layout level
- Uses `expo-speech-recognition` to continuously listen
- Detects "hey rex" phrase → triggers voice intake modal
- Enabled/disabled via Profile tab toggle, stored in AsyncStorage
- Settings: sensitivity (low/med/high), confirm out loud, background listening, pause 30 min

### Metrics (`metrics.tsx`)
- Auto-creates a monthly_metrics row for current month on first visit
- "Log a Deal" modal → saves to monthly_deals + updates monthly_metrics totals
- Long-press a deal row → delete confirmation
- "Close Month" → archives current month, starts fresh
- Closed months shown as accordion history rows below

### Profile (`profile.tsx`)
- User profile card (name, email, plan badge)
- Hey Rex toggle + sensitivity + confirm + background + pause
- Weekly digest (Elite plan only) — currently calls Anthropic API, needs migration to Gemini
- Export contact book as CSV
- Support link, upgrade CTA, sign out

---

## What's Been Built (Complete)

- [x] Full tab bar restructure: 🔥 Heat · 👤 Book · 🎤 Rex · 📊 Metrics · ⚙️ Profile
- [x] Rex tab overhauled — chat-only (removed rebuttals toggle), Gemini routing, quick chips, mic toggle, image upload
- [x] Rex mic toggle — tap to start, tap again to stop (was auto-stop only before)
- [x] Image upload visible on web + native (was native-only before)
- [x] rex-chat Edge Function created (Gemini 2.5 Flash, CORS, QUICK_LOG parsing, image support)
- [x] Metrics tab — full monthly commission tracker with log/close/archive
- [x] profile.tsx — settings screen (copy of more.tsx with updated name)
- [x] SQL migration file for all new tables with RLS
- [x] Expo SDK 54 upgrade (was SDK 51 — incompatible with Vercel Node 24.x)
- [x] Supabase env vars embedded in vercel.json (was missing, web app loaded blank)
- [x] expo-speech-recognition migration (replaced @react-native-voice/voice)
- [x] Hey Rex wake word component + onboarding
- [x] Follow-up sequences (sold/lease/unsold cadences) — hidden tab, functional

---

## What Still Needs to Be Done (Pre-Launch)

### Blockers (app won't fully work without these)
1. **Run SQL migration** — `supabase/migrations/20260417_pocketrep_may31.sql` in Supabase SQL Editor
2. **Deploy rex-chat Edge Function** + add `GEMINI_API_KEY` secret in Supabase dashboard
3. **Supabase auth redirect URLs** — add `https://app.pocketrep.pro` in dashboard

### High Priority
4. **Weekly digest migration** — `profile.tsx` line 27–28 still uses `EXPO_PUBLIC_ANTHROPIC_KEY` + direct Anthropic API. Needs to switch to `rex-chat` Edge Function (Gemini) same as Rex tab
5. **UI design overhaul** — see Design Brief section below
6. **Rex conversation persistence** — currently Rex chat is ephemeral (in-memory only). Should save to `rex_conversations` Supabase table after each exchange
7. **Test on physical device** — Hey Rex wake word, mic recording, image upload

### Nice to Have
8. Delete `more.tsx` (superseded by `profile.tsx`, currently hidden but still exists)
9. Contact changelog UI — `contact_changelog` table exists, need UI to show field-level edit history in contact detail screen
10. Expandable archive rows in Metrics — show individual deals inside each archived month

---

## Design Direction

The target aesthetic: **Bloomberg Terminal meets luxury car interior.** Data-dense, fast, dark, authoritative. The rep is on the floor — the UI must be readable in bright fluorescent light and dark lot conditions simultaneously. Every number should feel important.

Reference apps: Robinhood dark mode, Bloomberg, Tesla app, Apple Stocks.

### Colors
```
Background:  #0c0c0e (base) → #141418 → #18181f → #23232b (darkest to lightest)
Gold:        #d4a843 — primary accent (CTAs, active states, money numbers)
Green:       #42b883 — positive stats, commission totals
Red:         #e05252 — HOT tier, destructive actions
Orange:      #e08c52 — WARM tier
Text:        #ffffff → #b4bac8 → #8a90a0 → #5a6070 (primary to ghost)
```

### Key Rules
- Dark mode only — no light mode toggle
- No shadows — borders define depth (`1px solid #23232b`)
- No gradients — flat fills only
- No pill-shaped CTAs — 10px radius rectangles
- Numbers are always the hero — large, gold or green, tabular figures, tight letter-spacing
- Section labels: ALL CAPS, 10px, gold, 0.8 letter-spacing
- Animations: 100ms press scale(0.97), no bouncy springs, no rubber-band

### Components
- Cards: `#18181f` bg, `1px solid #23232b`, 10px radius
- Primary button: gold fill, ink text, 48px tall
- Input fields: `#1c1c22` bg, gold border on focus
- Bottom sheets: 22px top radius, dark bg, slide up 280ms ease-out
- Tab bar: 72px, emoji 18px + 9px label, 45% opacity inactive, full opacity + gold active

### Rex Tab Specifically
- Pure `#0c0c0e` background — darkest screen in the app
- User bubbles: right-aligned, gold border, goldBg background
- Rex bubbles: left-aligned, surface2 background
- No profile avatars — just the bubbles
- Typing indicator: 3 gold dots, staggered fade (not bounce)
- Mic active: solid red circle, pulse ring animation
- Quick chips: dark pill with gold border and gold text

---

## Local Dev Setup

```bash
cd PocketRepApp
npm install
npm start          # Expo dev server
npm run ios        # iOS simulator
npm run android    # Android emulator
npm run web        # Browser
npm run build:web  # Production web export (same as Vercel runs)
```

Requires Node 18+ (Node 24 works). Expo Go works for basic testing but native features (mic, wake word) need a dev build.

---

## Branch

Always develop on: `claude/pull-latest-app-build-ausHc`

Pushing to this branch triggers Vercel auto-deploy to `https://app.pocketrep.pro`.
Never push directly to `main`.

---

## Contact / Context

Product: PocketRep — "The rep's edge, not the store's"
Target users: Car dealership floor sales reps
Launch target: May 31, 2026
Web: https://app.pocketrep.pro
Marketing: https://pocketrep.pro
