================================================================================
HIS PALABRA — DEVELOPER HANDOVER + AGENT INSTRUCTIONS
================================================================================
Last Updated: 2026-04-20
Give this ENTIRE file to your next Claude/AI agent at the start of conversation.

================================================================================
SECTION 1: AGENT OPERATING INSTRUCTIONS (THE PROMPT)
================================================================================

You are continuing development on His Palabra. Read this file completely before
doing anything. Here's how you operate:

COMMUNICATION STYLE:
  - 3-word status updates. Caveman style. Examples:
    "Reading files now."
    "Fixed auth bug."
    "Search screen done."
    "Pushing to remote."
  - Don't explain what you're about to do. Just do it.
  - Don't ask permission for fixes. Just fix.
  - Don't narrate your thinking. Just build.

ERROR HANDLING:
  - Error appears? Fix it. Don't tell me about it. Just fix and move on.
  - If you can't fix in 2 attempts, skip and note it at the end.
  - Never stop working because of a non-blocking error.

WHEN TASK IS TOO BIG (stream timeout, context limit, or large scope):
  - Split the work in HALF. Do first half. Then second half.
  - If "API Error: Stream idle timeout" appears, you hit a size limit.
    Split current work into HALVES. Complete each half separately.
  - If it STILL times out after splitting in half, split into FOURTHS.
  - After all parts done, COMPILE everything together in one final pass.
  - Make sure all parts are tied together (imports work, no orphan code).

WORK STYLE:
  - Read all relevant files FIRST. Understand the codebase before touching it.
  - Match existing patterns. Don't introduce new libraries or paradigms.
  - Use the design system (constants/theme.ts). Match existing styling.
  - Commit after each meaningful unit of work. Push when done.
  - Branch: claude/create-his-word-app-7ZfhO

GOLDEN RULES:
  1. Dark theme always. Gold (#F5C842) is primary accent.
  2. Supabase is the backend. Project ID: cljdpcfscszaryqjwswy
  3. All Bible content uses Gen Z / Urban Dictionary slang register.
  4. Capitalize G in God. Always. No exceptions.
  5. No profanity. App-store safe.
  6. Preserve proper nouns (Moses, David, Jesus, Jerusalem, etc.)
  7. StyleSheet.create for all styling. NativeWind is NOT configured.
  8. Expo Router for navigation. File-based routing.
  9. Zustand for state. One store: stores/authStore.ts
  10. Don't create new files unless absolutely necessary. Edit existing.


================================================================================
SECTION 2: WHAT IS HIS PALABRA
================================================================================

A Bible app that shows every verse in TWO versions:
  1. KJV (King James Version) — classic text
  2. Gen Z Slang — "The Lord got me fr — I'm never out here lacking, no cap."

31,102 verses. All translated. Stored in Supabase.

Target: Gen Z (16-28), youth pastors, faith-curious.
Vibe: Dark, clean, premium. "Apple Notes meets Discord dark mode meets streetwear."
Tagline: "The Word, but make it Gen Z."


================================================================================
SECTION 3: TECH STACK (don't change these)
================================================================================

React Native 0.81.5 + Expo 54 + Expo Router 55
TypeScript 5.9 (strict mode)
Zustand 5 (state management)
Supabase 2.103 (backend + auth + realtime)
expo-secure-store (native auth token storage)
Inter font (body) + Playfair Display (headers)
StyleSheet.create (NOT NativeWind/Tailwind)


================================================================================
SECTION 4: DATABASE TABLES (Supabase)
================================================================================

Project: cljdpcfscszaryqjwswy
URL: https://cljdpcfscszaryqjwswy.supabase.co

TABLE: verses (31,102 rows)
  id | book_id (1-66) | chapter | verse_number | text_kjv | text_slang

TABLE: profiles
  id (uuid) | email | username | display_name | age_range | city_group_id
  avatar_color | xp_total | current_streak | longest_streak
  last_active_date | default_bible_mode | font_size
  notifications_enabled | onboarding_done

TABLE: city_groups
  id (uuid) | name | slug | member_count | is_active

TABLE: community_messages
  id | city_group_id | user_id | content | message_type | verse_ref
  is_deleted | created_at
  message_type values: "chat", "prayer_request", "praise_report"

TABLE: verse_of_day
  display_date | verse_id (FK) | reflection

TABLE: lessons
  id | title | description | category | difficulty | xp_reward
  lesson_order | is_active | content (JSON array of steps)

TABLE: quizzes
  id | lesson_id | questions (JSON) | xp_reward | pass_threshold

TABLE: lesson_completions
  user_id | lesson_id | quiz_score | xp_earned

RPC FUNCTIONS:
  award_xp(p_user_id, p_amount)
  update_streak(p_user_id)


================================================================================
SECTION 5: FILE MAP (every file and what it does)
================================================================================

ROOT:
  package.json          — deps, scripts (start/android/ios/web)
  tsconfig.json         — strict TS, extends expo base
  app.json              — Expo config, bundle ID: org.hispalabra.app
  index.ts              — Expo entry (registerRootComponent)
  .env                  — SUPABASE_URL + SUPABASE_ANON_KEY

CONSTANTS:
  constants/theme.ts    — Colors, Fonts, FontSizes, Spacing, Radii
  constants/bible.ts    — 66 books array, getBookById(), getBookByName()

SERVICES:
  lib/supabase.ts       — Supabase client, SecureStore adapter (native/web)
  stores/authStore.ts   — Zustand: session, user, profile, signIn/Up/Out

ROOT LAYOUT:
  app/_layout.tsx       — Loads fonts, initializes auth, conditional routing:
                          no session → auth | no onboarding → onboarding | else → tabs

AUTH FLOW:
  app/(auth)/_layout.tsx         — Stack navigator (dark, slide animation)
  app/(auth)/welcome.tsx         — "His Palabra" title, Get Started + Login buttons
  app/(auth)/login.tsx           — Email + password form, signIn()
  app/(auth)/signup.tsx          — Email + password form, signUp(), 6-char min

ONBOARDING (3 steps):
  app/(auth)/onboarding/_layout.tsx       — Stack navigator
  app/(auth)/onboarding/profile-setup.tsx — Name, username, age range
  app/(auth)/onboarding/city-select.tsx   — Pick city from Supabase list
  app/(auth)/onboarding/starting-point.tsx — Pick where to start, sets onboarding_done=true

MAIN APP (5 tabs):
  app/(tabs)/_layout.tsx   — Tab nav: Home🏠 Bible📖 Learn🎮 City📍 Me👤
  app/(tabs)/index.tsx     — Home: greeting, streak, XP, verse of day, quick actions
  app/(tabs)/bible.tsx     — Book list (OT/NT sections) → chapter grid (5 columns)
  app/(tabs)/learn.tsx     — Lesson list with XP badges + completion tracking
  app/(tabs)/city.tsx      — Realtime group chat (Supabase Realtime INSERT listener)
  app/(tabs)/me.tsx        — Profile, stats, donate link, settings (PLACEHOLDER), sign out

DYNAMIC ROUTES:
  app/bible/[book]/[chapter].tsx  — Verse reader: slang/KJV toggle, chapter nav
  app/learn/[lessonId].tsx        — Devotional steps + quiz (multiple choice, XP)

LANDING (static web):
  landing/index.html     — Landing page with embedded Supabase auth + verse viewer
  landing/privacy.html   — Privacy policy
  landing/terms.html     — Terms of service
  landing/vercel.json    — Vercel deploy config

ASSETS:
  assets/icon.png, adaptive-icon.png, splash-icon.png, favicon.png


================================================================================
SECTION 6: DESIGN SYSTEM (use these exact values)
================================================================================

COLORS:
  bg=#080810  s1=#10101C  s2=#181828  s3=#202035  border=#252540
  text=#EEEDF8  muted=#6868A0  dim=#383858
  gold=#F5C842  green=#4ADE80  red=#F87171
  orange=#FB923C  blue=#60A5FA  purple=#C084FC

FONTS:
  display: PlayfairDisplay_700Bold (titles, chapter headings)
  displayItalic: PlayfairDisplay_400Regular_Italic (KJV verse text)
  body: Inter_400Regular (body text)
  bodySemiBold: Inter_600SemiBold (labels, buttons)
  bodyBold: Inter_700Bold (stats, emphasis)

PATTERNS:
  - Cards: backgroundColor=s1, borderWidth=1, borderColor=border, borderRadius=14
  - Buttons primary: backgroundColor=gold, borderRadius=14, text=bg color
  - Inputs: backgroundColor=s1, border, borderRadius=12, padding 14-16
  - Headers: Playfair Display gold, 28px
  - SafeAreaView edges={['top']} on every screen


================================================================================
SECTION 7: WHAT'S DONE vs WHAT'S NOT
================================================================================

DONE ✅:
  Auth (signup/login/signout)
  Onboarding (3 steps)
  Home screen (greeting, streak, XP, verse of day, actions)
  Bible reader (book list, chapter grid, verse display, slang/KJV toggle)
  Chapter navigation (prev/next)
  Learn screen (lesson list, XP, completion tracking)
  Lesson detail (devotional steps: hook/verse/breakdown/realtalk)
  Quiz system (4 options, scoring, XP award, pass/fail)
  City chat (realtime messaging, prayer requests, praise reports)
  Profile screen (avatar, stats, donate)
  Streak + XP system
  Landing page (web auth + verse viewer)
  Privacy policy + Terms of service
  31,102 verses in DB (KJV + Gen Z slang)
  Dark theme design system

NOT DONE ❌:
  Bible search (NO search screen exists — #1 priority to build)
  Bookmarks & highlights (no table, no UI)
  Verse sharing (no share card generation)
  Settings screens (6 rows displayed but none functional)
  Push notifications (package installed, zero logic)
  Reading plans (no schema, no UI)
  Offline mode
  Side-by-side verse view
  Verse tap actions (bookmark/highlight/share/copy)
  Font size setting (profile field exists, not wired to UI)
  Default bible mode (profile field exists, not wired to reader)

BUGS TO FIX:
  1. DELETE app/(auth)/onboarding/onboarding/ (duplicate nested directory)
  2. DELETE App.tsx (unused boilerplate)
  3. Remove nativewind+tailwindcss from package.json (installed, never configured)
  4. Remove @react-native-async-storage/async-storage (installed, never used)
  5. theme.ts references JetBrainsMono font that's never loaded
  6. Settings rows in me.tsx have no onPress handlers
  7. Reader ignores profile.default_bible_mode (always defaults to "slang")
  8. Reader ignores profile.font_size


================================================================================
SECTION 8: HOW TO RUN
================================================================================

cd /home/user/PocketRep/HisPalabra
npm install
npx expo start
# Press 'w' for web, 'i' for iOS simulator, 'a' for Android

Git:
  Repo: dryvnagency/pocketrep
  Branch: claude/create-his-word-app-7ZfhO
  Push: git push -u origin claude/create-his-word-app-7ZfhO

Supabase SQL:
  Use mcp tool: mcp__0e04dfbb-a518-451c-a434-4e51b1e2f2c2__execute_sql
  Project ID: cljdpcfscszaryqjwswy


================================================================================
SECTION 9: WHAT TO BUILD NEXT (priority order)
================================================================================

1. CLEANUP — delete duplicates, remove unused deps, wire profile settings
2. BIBLE SEARCH — new screen, full-text on text_kjv + text_slang, results
3. BOOKMARKS — new table, tap verse action, saved verses screen
4. VERSE SHARING — generate styled card image, share sheet
5. SETTINGS — wire all 6 rows in me.tsx to actual screens
6. PUSH NOTIFICATIONS — daily verse notification
7. READING PLANS — curated multi-day plans with progress
8. DEEP SLANG REWRITE — fully rewrite remaining large books in Gen Z voice


================================================================================
END OF HANDOVER
================================================================================
