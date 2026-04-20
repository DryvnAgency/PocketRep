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
- If file/task too large → split in half, do each half, compile
- If still too large → cut to fourths, do each, compile — make sure all pieces tie together
- If you see `API Error: Stream idle timeout` → split work in half immediately

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
│   │   ├── metrics.tsx        ← Monthly commission tracker (NEW)
│   │   ├── profile.tsx        ← Settings / Hey Rex / export / sign out (NEW)
│   │   ├── deals.tsx          ← Hidden (href: null) — old deals tab
│   │   ├── sequences.tsx      ← Hidden (href: null) — follow-up sequences
│   │   └── more.tsx           ← Legacy (superseded by profile.tsx, still exists)
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
│   │   ├── rex-chat/          ← Gemini 2.5 Flash Edge Function (NEW)
│   │   │   └── index.ts       ← POST {message, image_base64?, conversation_history, user_id}
│   │   └── support-reply/     ← Support ticket auto-reply
│   └── migrations/
│       └── 20260417_pocketrep_may31.sql  ← NEW TABLES (run in Supabase SQL editor)
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
| `deals` | Deal records (legacy — old deals tab) |
| `sequences` | Follow-up sequences |
| `sequence_steps` | Steps within a sequence |
| `rex_messages` | Old Rex chat messages (being replaced by rex_conversations) |

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

**To deploy rex-chat:**
1. Supabase Dashboard → Edge Functions → Deploy `rex-chat`
2. Add secret: `GEMINI_API_KEY` = your Gemini API key
3. Or use Supabase CLI: `supabase functions deploy rex-chat`

### Auth (manual step required)
Supabase auth.config is NOT SQL-accessible. Must set in dashboard:
- **Authentication → URL Configuration → Site URL:** `https://app.pocketrep.pro`
- **Additional redirect URLs:** `https://app.pocketrep.pro/**`

---

## VERCEL DEPLOYMENT

**Project:** `project-t90u1`
**Domain:** `https://app.pocketrep.pro`
**Root directory:** `PocketRepApp/`
**Build command:** `npm run build:web` (= `expo export --platform web`)
**Output dir:** `dist/`

Auto-deploys on push to `claude/pull-latest-app-build-ausHc`.

Previous builds were ALL ERROR due to Expo SDK 51 + Node 24.x incompatibility.
Fixed by upgrading to SDK 54 (see package.json).

---

## REX AI — ARCHITECTURE

### Client (`rex.tsx`)
```typescript
const REX_EDGE_URL = 'https://fwvrauqdoevwmwwqlfav.supabase.co/functions/v1/rex-chat';

// Sends to Edge Function:
{ message, image_base64?, conversation_history, user_id, system_prompt }

// Receives:
{ reply, quick_log_data? }
```

### Edge Function (`supabase/functions/rex-chat/index.ts`)
- Calls `gemini-2.5-flash` via Google AI API
- Reads `GEMINI_API_KEY` from Deno env (Supabase secret)
- Handles CORS for web
- Parses `[QUICK_LOG:{json}]` embedded in Gemini response
- Supports multimodal (image_base64 as inlineData)

### Rex Tone
- Starts with "hey" (lowercase)
- No em dashes
- Punchy, direct, 3-5 sentences max
- Like a veteran car closer coaching on the lot

### Quick Chips
Scrollable row above input: `My Heat Sheet`, `Write a Script`, `How's My Month`, `Log a Contact`

### Mic Toggle
- Tap 🎤 → starts recording (`nativeRecRef` / `webRecRef`)
- Tap 🔴 → stops immediately, transcribes, sends to Rex
- `toggleRexVoice()` checks `rexRecording` state

### Image Upload
- 📎 button visible on ALL platforms (web + native)
- Uses expo-image-picker, base64 encodes, shows preview banner
- Sent as `image_base64` to Edge Function → Gemini reads it

---

## HEY REX — WAKE WORD

**Component:** `components/HeyRex.tsx`
**Hook:** `lib/useWakeWord.ts`
**Library:** `expo-speech-recognition ~4.0.0` (SDK 54 compatible)

Flow:
1. User enables "Hey Rex" in Profile tab
2. `useWakeWord` hook starts continuous listening via `ExpoSpeechRecognitionModule`
3. Detects "hey rex" → fires callback → opens Rex voice intake modal
4. Settings stored in AsyncStorage (enabled, sensitivity, background, pause-until, confirm-out-loud)

---

## METRICS TAB — HOW IT WORKS

File: `app/(tabs)/metrics.tsx`

- On focus: loads `monthly_metrics` for user, finds open month (no `closed_at`)
- If no months exist: auto-creates one for current month
- "Log a Deal" → modal → inserts to `monthly_deals`, updates `monthly_metrics` totals
- Long-press a deal → delete confirmation
- "Close Month" → sets `closed_at`, creates new open month
- Archived months shown in accordion history list

---

## TAB BAR

Current (`_layout.tsx`):
| Tab | File | Icon |
|---|---|---|
| Heat | `index.tsx` | 🔥 |
| Book | `contacts.tsx` | 👤 |
| Rex | `rex.tsx` | 🎤 |
| Metrics | `metrics.tsx` | 📊 |
| Profile | `profile.tsx` | ⚙️ |

Hidden (accessible via deep link, not tab bar):
- `deals.tsx` — `href: null`
- `sequences.tsx` — `href: null`
- `more.tsx` — `href: null` (superseded by profile.tsx)

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

Node 24.x (Vercel default) requires SDK 52+. SDK 54 is the target.

---

## KNOWN ISSUES / TECH DEBT

1. `more.tsx` still exists — it's hidden in the tab bar but not deleted. Safe to delete once confirmed profile.tsx covers everything.
2. `rex_messages` table (old) still exists in Supabase. New code uses `rex_conversations`. Old table can be dropped once migration is confirmed working.
3. `deals.tsx` still exists (hidden). If deal tracking moves fully to Metrics tab, this can be removed.
4. `more.tsx` references `ANTHROPIC_KEY` for the weekly digest — this should be migrated to a Supabase Edge Function using Gemini (same pattern as rex-chat) before launch.
5. Hey Rex wake word uses `expo-speech-recognition` which is web-only fallback — native iOS/Android needs actual background audio permission flow (UIBackgroundModes: audio already in app.json).

---

## COMMIT HISTORY (recent)

```
57773f4  feat: Metrics tab, tab restructure, rex-chat Edge Function, SQL migrations
36f00a9  Overhaul Rex tab: Gemini 2.5 Flash, chat-only, mic toggle, upload button
94b0829  fix: upgrade to Expo SDK 54 + wire Supabase env vars for web deploy
484c047  refactor: replace @react-native-voice/voice with expo-speech-recognition
e60d4c3  chore: remove Picovoice key from eas.json, update lockfile
950d532  feat: follow-up machine — sold/lease/unsold sequences with enforced cadences
```

---

## WHAT STILL NEEDS TO BE DONE (pre-launch)

### P0 — Blockers
- [ ] **Run SQL migration** in Supabase SQL Editor (file: `supabase/migrations/20260417_pocketrep_may31.sql`)
- [ ] **Deploy `rex-chat` Edge Function** + add `GEMINI_API_KEY` secret in Supabase
- [ ] **Supabase Auth redirect URLs** — add `https://app.pocketrep.pro` and `https://app.pocketrep.pro/**`

### P1 — High Priority
- [ ] Migrate weekly digest in `profile.tsx` from Anthropic API to `rex-chat` Edge Function (Gemini)
- [ ] Test Rex image upload end-to-end (screenshot → base64 → Edge Function → Gemini response)
- [ ] Test Hey Rex wake word on physical device

### P2 — Nice to Have
- [ ] Delete `more.tsx` once `profile.tsx` confirmed stable
- [ ] Contact changelog UI (history viewer in contact detail screen)
- [ ] Rex conversation persistence — save to `rex_conversations` table after each exchange
- [ ] Monthly Metrics: expandable archive rows showing deal breakdown

---

## ENV VARS

```bash
# .env (local dev)
EXPO_PUBLIC_SUPABASE_URL=https://fwvrauqdoevwmwwqlfav.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Supabase Edge Function Secrets (set in dashboard)
GEMINI_API_KEY=<your-gemini-api-key>

# Vercel (already in vercel.json — public keys only)
EXPO_PUBLIC_SUPABASE_URL=https://fwvrauqdoevwmwwqlfav.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## AGENT BEHAVIOR RULES

```
- Update user: 3 words max ("done", "fixed", "splitting now")
- Errors: fix silently, never explain unless asked
- Large file/task: split in half → do each half → compile into one tied result
- Still too large: split to fourths → compile all → verify everything connects
- "API Error: Stream idle timeout": split immediately, never retry whole thing
- Branch: always commit + push to `claude/pull-latest-app-build-ausHc`
- Never push to main/master
- Never create a PR unless user explicitly asks
```
