# PocketRep — Agent Handover File
> Last updated: 2026-04-20 | Branch: `claude/pull-latest-app-build-ausHc`

---

## AGENT PROMPT (read this first)

You are working on **PocketRep** — a React Native / Expo app for car dealership sales reps.
Stack: Expo SDK 54, expo-router v6, Supabase (auth + DB + Edge Functions), Gemini 2.5 Flash (via Edge Function `rex-chat`).
Branch: `claude/pull-latest-app-build-ausHc` — always develop and push here.
Web deploy: Vercel project `project-t90u1` → `https://app.pocketrep.pro` (auto-deploys on push).

**Working style:**
- 3-word status updates only ("done", "fixed", "splitting now")
- Never explain errors to user — just fix them silently
- If file/task too large → split in half, do each half, compile into one tied result
- If still too large → cut to fourths, do each, compile — verify everything connects
- If you see `API Error: Stream idle timeout` → split work in half immediately, never retry whole thing

---

## PROJECT OVERVIEW

PocketRep is a sales rep tool for car dealerships. Core features:
- **Heat Sheet** — contact priority tiers (Hot/Warm/Watch)
- **Contact Book** — CRM with notes, vehicle info, last contact date
- **Rex** — AI sales coach (Gemini 2.5 Flash, voice + text + image)
- **Hey Rex** — always-listening wake word for hands-free contact logging
- **Metrics** — monthly commission tracking (log deals, close month, archive)
- **Sequences** — follow-up automation (sold/lease/unsold cadences) — hidden from tab bar but functional
- **Profile** — settings, Hey Rex config, export, digest, sign out

---

## FILE STRUCTURE

```
PocketRepApp/
├── app/
│   ├── (tabs)/
│   │   ├── _layout.tsx        ← Tab bar: 🔥Heat 👤Book 🎤Rex 📊Metrics ⚙️Profile
│   │   ├── index.tsx          ← Heat Sheet (Hot/Warm/Watch contact lists)
│   │   ├── contacts.tsx       ← Contact book / CRM
│   │   ├── rex.tsx            ← Rex AI chat (Gemini, voice, image upload)
│   │   ├── metrics.tsx        ← Monthly commission tracker
│   │   ├── profile.tsx        ← Settings / Hey Rex / export / sign out
│   │   ├── deals.tsx          ← Hidden (href: null) — legacy deals tab
│   │   ├── sequences.tsx      ← Hidden (href: null) — follow-up sequences
│   │   └── more.tsx           ← Hidden (href: null) — superseded by profile.tsx
│   └── (auth)/                ← Login / signup screens
├── components/
│   ├── HeyRex.tsx             ← Always-listening wake word overlay component
│   ├── HeyRexOnboarding.tsx   ← First-time Hey Rex setup flow
│   └── Onboarding.tsx         ← App onboarding
├── lib/
│   ├── supabase.ts            ← Supabase client (uses EXPO_PUBLIC_SUPABASE_*)
│   ├── types.ts               ← TypeScript interfaces (Contact, Profile, RexMessage, etc.)
│   ├── useWakeWord.ts         ← expo-speech-recognition hook for "Hey Rex" detection
│   ├── industryConfig.ts      ← Industry icons/labels map
│   ├── notifications.ts       ← expo-notifications weekly digest scheduling
│   └── messageQueue.ts        ← Offline message queue
├── constants/
│   └── theme.ts               ← colors, radius, spacing, heatConfig
├── supabase/
│   ├── functions/
│   │   ├── rex-chat/          ← Gemini 2.5 Flash Edge Function
│   │   │   └── index.ts       ← POST {message, image_base64?, conversation_history, user_id}
│   │   └── support-reply/     ← Support ticket auto-reply
│   └── migrations/
│       └── 20260417_pocketrep_may31.sql  ← New tables (run in Supabase SQL editor)
├── package.json               ← Expo SDK 54 (react 18.3.2, react-native 0.76.7)
├── vercel.json                ← Vercel build config + Supabase env vars inline
└── app.json                   ← Expo config (scheme: pocketrep, dark mode, permissions)
```

---

## SUPABASE

**Project ID:** `fwvrauqdoevwmwwqlfav`
**URL:** `https://fwvrauqdoevwmwwqlfav.supabase.co`
**Anon key:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3dnJhdXFkb2V2d213d3FsZmF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNzczOTAsImV4cCI6MjA4OTk1MzM5MH0.D0Mu7wWB59NUr7cFtkl_00ijbseSz_SsV86pwJSn0s0`

### Tables (existing)
| Table | Description |
|---|---|
| `profiles` | User profile: full_name, email, industry, plan, trial_ends_at |
| `contacts` | CRM contacts: name, phone, email, vehicle info, heat_tier, notes, last_contact_date |
| `deals` | Deal records (legacy) |
| `sequences` | Follow-up sequences |
| `sequence_steps` | Steps within a sequence |
| `rex_messages` | Old Rex chat messages (replaced by rex_conversations) |

### New tables (run migration SQL before using Metrics or new Rex features)
| Table | Description |
|---|---|
| `rex_conversations` | Gemini chat history (role: user/assistant, content, image_base64, quick_log_data) |
| `monthly_metrics` | Per-month totals: total_commission, units_sold, closed_at |
| `monthly_deals` | Individual deal rows: customer_name, vehicle, commission, notes, month_id |
| `contact_changelog` | Field-level audit: field_name, old_value, new_value, changed_at |

**Migration file:** `PocketRepApp/supabase/migrations/20260417_pocketrep_may31.sql`
Run it in: Supabase Dashboard → SQL Editor → paste and run.

### Edge Functions
| Function | Status | Description |
|---|---|---|
| `rex-chat` | **CREATED, NOT DEPLOYED** | Gemini 2.5 Flash proxy for Rex AI |
| `support-reply` | Deployed | Support ticket auto-reply |

**Deploy rex-chat:**
1. Supabase Dashboard → Edge Functions → deploy `rex-chat`
2. Add secret: `GEMINI_API_KEY` = your Gemini API key

### Auth (manual step — not SQL accessible)
Supabase Dashboard → Authentication → URL Configuration:
- **Site URL:** `https://app.pocketrep.pro`
- **Additional redirect URLs:** `https://app.pocketrep.pro/**`

---

## VERCEL DEPLOYMENT

**Project:** `project-t90u1`
**Domain:** `https://app.pocketrep.pro`
**Root directory:** `PocketRepApp/`
**Build command:** `npm run build:web` → `expo export --platform web`
**Output dir:** `dist/`

Auto-deploys on push to `claude/pull-latest-app-build-ausHc`.
All builds were ERROR (SDK 51 + Node 24.x). Fixed by upgrading to SDK 54.

---

## REX AI — ARCHITECTURE

### Client (`rex.tsx`)
```typescript
const REX_EDGE_URL = 'https://fwvrauqdoevwmwwqlfav.supabase.co/functions/v1/rex-chat';
// Sends: { message, image_base64?, conversation_history, user_id, system_prompt }
// Receives: { reply, quick_log_data? }
```

### Edge Function (`supabase/functions/rex-chat/index.ts`)
- Calls `gemini-2.5-flash` via Google AI API
- Reads `GEMINI_API_KEY` from Deno env (Supabase secret)
- CORS for web, QUICK_LOG parsing, multimodal image support

### Rex Tone
- Starts with "hey" (lowercase). No em dashes. Punchy, 3-5 sentences. Veteran closer energy.

### Quick Chips
Scrollable row above input: `My Heat Sheet` · `Write a Script` · `How's My Month` · `Log a Contact`

### Mic Toggle
- Tap 🎤 → start (`nativeRecRef` / `webRecRef`)
- Tap 🔴 → stop immediately, transcribe, send
- `toggleRexVoice()` checks `rexRecording` state

### Image Upload
- 📎 visible on all platforms. Base64 → Edge Function → Gemini reads it.

---

## HEY REX — WAKE WORD

**Component:** `components/HeyRex.tsx` | **Hook:** `lib/useWakeWord.ts`
**Library:** `expo-speech-recognition ~4.0.0` (SDK 54)

1. Enable in Profile tab → `useWakeWord` starts continuous listening
2. Detects "hey rex" → opens Rex voice modal
3. Settings in AsyncStorage (enabled, sensitivity, background, pause-until, confirm-out-loud)

---

## METRICS TAB

File: `app/(tabs)/metrics.tsx`
- Loads `monthly_metrics`, finds open month (no `closed_at`), auto-creates if none
- "Log a Deal" → modal → inserts `monthly_deals`, updates `monthly_metrics` totals
- Long-press deal → delete
- "Close Month" → archives, creates new open month
- Accordion archive list

---

## TAB BAR

| Tab | File | Icon |
|---|---|---|
| Heat | `index.tsx` | 🔥 |
| Book | `contacts.tsx` | 👤 |
| Rex | `rex.tsx` | 🎤 |
| Metrics | `metrics.tsx` | 📊 |
| Profile | `profile.tsx` | ⚙️ |

Hidden: `deals.tsx`, `sequences.tsx`, `more.tsx` — all `href: null`

---

## PACKAGE VERSIONS (SDK 54)

```json
{
  "expo": "~54.0.0",
  "react": "18.3.2",
  "react-native": "0.76.7",
  "expo-router": "~6.0.23",
  "expo-av": "~16.0.8",
  "expo-speech-recognition": "~4.0.0",
  "expo-image-picker": "~17.0.10",
  "expo-notifications": "~0.32.16",
  "@supabase/supabase-js": "^2.39.0"
}
```

---

## DESIGN SYSTEM

Dark mode only. Bloomberg Terminal density + luxury car interior feel.

**Colors:**
- Background: `#0c0c0e` → `#141418` → `#18181f` → `#23232b` (darkest to lightest surface)
- Gold accent: `#d4a843` (CTAs, active states, key numbers)
- Green: `#42b883` (money, positive)
- Red: `#e05252` / Orange: `#e08c52` (heat tiers)
- Text: `#ffffff` → `#b4bac8` → `#8a90a0` → `#5a6070`

**Cards:** `#18181f` bg, `1px solid #23232b` border, 10px radius, no shadows
**CTAs:** Gold fill, ink text, 48px tall, 10px radius — no gradients, no pills
**Tab bar:** 72px, emoji 18px + 9px label, 45% opacity inactive, gold active
**Animations:** scale(0.97) press, 100ms ease-out. No bouncy springs. No rubber-band.

---

## COMMIT HISTORY (recent)

```
96e7196  docs: add CLAUDE.md agent handover file
57773f4  feat: Metrics tab, tab restructure, rex-chat Edge Function, SQL migrations
36f00a9  Overhaul Rex tab: Gemini 2.5 Flash, chat-only, mic toggle, upload button
94b0829  fix: upgrade to Expo SDK 54 + wire Supabase env vars for web deploy
484c047  refactor: replace @react-native-voice/voice with expo-speech-recognition
```

---

## WHAT STILL NEEDS TO BE DONE (pre-launch)

### P0 — Blockers
- [ ] Run SQL migration in Supabase SQL Editor (`supabase/migrations/20260417_pocketrep_may31.sql`)
- [ ] Deploy `rex-chat` Edge Function + add `GEMINI_API_KEY` secret
- [ ] Supabase Auth → add `https://app.pocketrep.pro` redirect URLs

### P1 — High Priority
- [ ] Migrate weekly digest in `profile.tsx` from Anthropic API → `rex-chat` Edge Function (Gemini)
- [ ] Test Rex image upload end-to-end
- [ ] Test Hey Rex wake word on physical device
- [ ] UI overhaul per design brief (Bloomberg Terminal + luxury car interior aesthetic)

### P2 — Nice to Have
- [ ] Delete `more.tsx` once `profile.tsx` confirmed stable
- [ ] Rex conversation persistence → save to `rex_conversations` after each exchange
- [ ] Contact changelog UI (field-level history viewer in contact detail)
- [ ] Expandable archive rows showing deal breakdown in Metrics

---

## ENV VARS

```bash
# .env (local dev)
EXPO_PUBLIC_SUPABASE_URL=https://fwvrauqdoevwmwwqlfav.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Supabase Edge Function Secrets (set in dashboard)
GEMINI_API_KEY=<your-gemini-api-key>

# Vercel (already in vercel.json — public keys only)
EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY already set
```

---

## AGENT BEHAVIOR RULES

```
- Update user: 3 words max ("done", "fixed", "splitting now")
- Errors: fix silently, never explain unless asked
- Large file/task: split in half → do each half → compile into one tied result
- Still too large: split to fourths → compile all → verify everything connects
- "API Error: Stream idle timeout": split immediately, never retry whole thing
- Branch: always commit + push to claude/pull-latest-app-build-ausHc
- Never push to main/master
- Never create a PR unless user explicitly asks
```
