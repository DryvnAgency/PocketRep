# CLAUDE.md — PocketRep

Read this first. Dense by design. Human-facing docs: `DEVELOPER_HANDOVER.md`.

## What this is

AI sales-follow-up coach for car-dealership reps (and other sales verticals via swappable industry config). Loop: voice into Hey Rex orb → Whisper transcribes → Haiku parses → contact auto-updated in Supabase → Heat Sheet scores leads → Rex Chat coaches → Sequences batch-send follow-ups.

## Stack

| Layer     | Tech                                              |
| --------- | ------------------------------------------------- |
| App       | Expo SDK 51, React Native 0.74.5, React 18.2      |
| Routing   | expo-router 3.5 (file-based)                      |
| Backend   | Supabase (Postgres + Auth + Edge Functions)       |
| Rex Chat  | Anthropic Claude Haiku                            |
| AI proxy  | Gemini 2.5 Flash via `ai-proxy` edge function     |
| Voice     | expo-av + OpenAI Whisper                          |
| Wake word | Picovoice Porcupine (optional)                    |
| Styling   | React Native StyleSheet + Animated (no NativeWind)|
| Storage   | expo-secure-store (native) / localStorage (web)   |

## Repo tree

```
PocketRep/
├── PocketRepApp/   ← Expo app (work here)
├── RexLens/        ← sibling browser extension (separate project)
├── Pocketrep/      ← web export output (generated)
├── vercel.json
├── DEVELOPER_HANDOVER.md
└── CLAUDE.md
```

## Files inside `PocketRepApp/`

| Path                              | Purpose                                                  |
| --------------------------------- | -------------------------------------------------------- |
| `app/_layout.tsx`                 | Root layout, auth routing, ErrorBoundary                 |
| `app/(auth)/index.tsx`            | Login (`{username}` → `{username}@pocketrep.app`)        |
| `app/(auth)/signup.tsx`           | Signup + trial                                           |
| `app/(tabs)/_layout.tsx`          | Tab bar + HeyRex overlay                                 |
| `app/(tabs)/index.tsx`            | Heat Sheet (hot/warm/watch + today's follow-ups)         |
| `app/(tabs)/contacts.tsx`         | CRUD + CSV import + swipe-to-delete                      |
| `app/(tabs)/deals.tsx`            | Closed-deals log (front/back gross)                      |
| `app/(tabs)/sequences.tsx`        | Templates + batch message queue                          |
| `app/(tabs)/rex.tsx`              | Rex Chat (Haiku + intent parsing)                        |
| `app/(tabs)/more.tsx`             | Settings, digest, export, sign-out                       |
| `components/HeyRex.tsx`           | Draggable voice-intake orb                               |
| `components/Onboarding.tsx`       | First-run industry-selection wizard                      |
| `lib/supabase.ts`                 | Client init (SecureStore on native / localStorage web)   |
| `lib/types.ts`                    | All TS interfaces                                        |
| `lib/notifications.ts`            | expo-notifications scheduling                            |
| `lib/messageQueue.ts`             | Batch send queue + persistence                           |
| `lib/industryConfig.ts`           | Industry templates + rules                               |
| `constants/theme.ts`              | Colors / radius / spacing / heatConfig                   |
| `supabase/functions/ai-proxy/`    | Gemini proxy + JWT + daily cost cap                      |
| `supabase/functions/support-reply/` | Stubbed                                                |
| `sql/`                            | Schema files                                             |

## Supabase

**Tables:** `profiles`, `contacts`, `deals`, `rex_messages`, `rex_memory`, `sequence`, `sequence_steps`, `interactions`, `daily_ai_usage`.

**Auth:** email+password; username is sugar (`{u}@pocketrep.app`). Add Vercel domains to Auth → URL Configuration → Redirect URLs.

**Deploy ai-proxy:**
```bash
supabase secrets set GEMINI_API_KEY=...
supabase functions deploy ai-proxy
```
Daily caps in code: `pro`/`rex_lens` = $1, `elite` = $2.

## Env vars

All prefixed `EXPO_PUBLIC_`. Put in `PocketRepApp/.env` for local, `eas.json` per-channel for native, Vercel project settings for web.

| Var                            | Required | Purpose                                      |
| ------------------------------ | -------- | -------------------------------------------- |
| `SUPABASE_URL`                 | yes      | Supabase project URL                         |
| `SUPABASE_ANON_KEY`            | yes      | Anon key                                     |
| `ANTHROPIC_KEY`                | yes      | Claude Haiku (Rex Chat)                      |
| `OPENAI_KEY`                   | yes      | Whisper                                      |
| `PICOVOICE_KEY`                | no       | Custom wake word                             |
| `AI_PROXY_URL`                 | no       | Override AI endpoint (defaults to Anthropic) |

`.env.example` currently only lists the first 4 — expand it (TODO §what's-left).

## Deploy

- **Web (Vercel):** `expo export --platform web`, output `Pocketrep/`, `vercel.json` at repo root handles SPA rewrites + asset caching.
- **Native (EAS):** `eas.json` channels `development` / `preview` / `production`. Bundle id `pro.pocketrep.app`.

## Local dev

```bash
cd PocketRepApp && npm install && cp .env.example .env && npx expo start
```

## Built ✅

- Heat Sheet (tiered scoring: lease end, mileage, purchase date, last contact, urgency)
- Contact Book (CRUD, CSV import, swipe-delete, tap-to-call/email)
- Deals (link to contact, front/back gross)
- Rex Chat (Haiku, system prompt with rep name + memory + active contact + industry rules; parses `mass_text` / `show_followups` / `log_customer` / `start_sequence`; markdown + action buttons; screenshot coaching)
- Hey Rex orb (draggable, Whisper → Haiku parse → auto-save to matching contact)
- Sequences (built-in templates + custom; batch queue with resume; Pro 50 / Elite 100 caps)
- Onboarding (industry selection + trial)
- Settings (weekly digest, CSV export)
- `ai-proxy` edge function (Gemini 2.5 Flash, JWT verified, daily cost cap)
- 3-tier pricing (Pro / Pro Bundle / Elite)

## What's left ❌

1. Wire interactions UI to `interactions` table (schema + type exist, no CRUD screen)
2. Finish `support-reply` edge function (stubbed)
3. Custom "Hey Rex" wake word — Porcupine console setup + `PICOVOICE_KEY`
4. Personal-events reminders (parsed but not all paths scheduled in `notifications.ts`)
5. Location-based proximity alerts (permission asked, logic missing)
6. Rapport notes + photo attachment (schema supports, UI missing)
7. Stripe hooks for plan-downgrade enforcement
8. Device testing of end-to-end voice flow
9. Expand `.env.example` to include all 6 vars

## Design tokens (`constants/theme.ts`)

**Ink:** `#0c0c0e`, `#141418`, `#1c1c22`, `#23232b`; surfaces `#111116`, `#18181f`
**Gold:** `#d4a843`, `#f0c060`; bg `rgba(212,168,67,0.10)`; border `rgba(212,168,67,0.22)`
**Grey:** `#5a6070`, `#8a90a0`, `#b4bac8`; white `#ffffff`
**Status:** red `#e05252`, orange `#e08c52`, green `#42b883` (each with matching Bg rgba ~0.10 and Border rgba ~0.22)
**Spacing:** xs 4 / sm 8 / md 12 / lg 16 / xl 24 / xxl 32
**Radius:** sm 7 / md 10 / lg 14 / xl 18 / full 999
**Heat badges:** hot 🔥 red / warm ☀️ orange / watch 👁 gold
**Rules:** dark mode only, `StyleSheet` + `Animated` only, no third-party UI kit, elevation by ink-step layering (no shadows)

## Rex tab specifics

- System prompt = rep name + `rex_memory` + active contact + `industryConfig` rules
- Intents parsed: `mass_text`, `show_followups`, `log_customer`, `start_sequence` → rendered as action buttons
- Markdown replies; screenshot upload → Haiku vision → coaching
- Hey Rex orb overlays the entire `(tabs)` layout, not just Rex Chat

## Agent prompt to paste at session start

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
