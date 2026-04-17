# His Palabra — App Design Brief

## What Is His Palabra?

**His Palabra** (Spanish for "His Word") is a Bible app that presents Scripture in **heavy Gen Z / Urban Dictionary slang** alongside the original KJV text. It's the Bible for people who grew up on TikTok, group chats, and memes — making God's Word accessible to a generation that speaks a completely different register than traditional Bible translations.

Think of it as: **YouVersion meets Urban Dictionary meets your group chat.**

---

## The Problem

Young people (16-30) find traditional Bible translations hard to connect with. The language feels distant, formal, and disconnected from how they actually talk. Even "modern" translations like NIV or NLT still read like textbooks. Gen Z doesn't read textbooks — they read tweets, captions, and texts.

## The Solution

A dual-translation Bible app where every verse has:
- **KJV** — the classic, authoritative text
- **Gen Z Slang** — the same verse re-voiced in the language of "no cap," "fr fr," "bussin," "deadass," "lowkey," and "vibing"

Example:
> **KJV**: "The Lord is my shepherd; I shall not want."
> **Gen Z**: "The Lord got me fr — I'm never out here lacking, no cap."

> **KJV**: "In the beginning God created the heaven and the earth."
> **Gen Z**: "Okay so straight up, in the beginning God created the heavens and the earth. That's it. That's how it started."

> **KJV**: "Trust in the Lord with all thine heart; and lean not unto thine own understanding."
> **Gen Z**: "Trust in the Lord with ALL your heart and don't lean on your own understanding. GOATED verse fr fr."

---

## Target Audience

- **Primary**: Gen Z Christians and the faith-curious (16-28)
- **Secondary**: Youth pastors, campus ministry leaders, parents wanting to engage their kids
- **Tertiary**: Anyone who finds traditional Bible translations intimidating

### User Personas

1. **Maya, 19** — Goes to church but zones out during sermons. Loves TikTok, reads everything on her phone. Would read the Bible more if it didn't feel like homework.

2. **Jordan, 22** — New believer, came to faith through a friend. Intimidated by the Bible's size and language. Wants to understand it but doesn't know where to start.

3. **Pastor Marcus, 34** — Youth pastor trying to make Wednesday night Bible study less boring. Wants a tool to show Scripture in a way his students actually engage with.

---

## Database (Already Built)

The entire Bible is stored in **Supabase PostgreSQL**:

| Table | Description |
|-------|-------------|
| `verses` | 31,102 rows — every verse of the Bible |

### Verse Schema:
| Column | Type | Description |
|--------|------|-------------|
| `book_id` | int | 1-66 (Genesis through Revelation) |
| `chapter` | int | Chapter number |
| `verse_number` | int | Verse number |
| `text_kjv` | text | Original King James Version text |
| `text_slang` | text | Gen Z / Urban Dictionary slang translation |

**Supabase Project ID**: `cljdpcfscszaryqjwswy`

All 31,102 verses are fully populated in both columns. The Gen Z translations include markers like "fr", "no cap", "deadass", "ngl", "bruh", "lowkey", "bussin", "vibing", "goated", "slay", "mid", etc.

---

## Core Features

### 1. Bible Reader (Primary Screen)
- **Book/Chapter/Verse navigation** — standard Bible nav (66 books, chapters, verses)
- **Dual-view toggle**: Show KJV only, Slang only, or Side-by-side/stacked
- **Default view**: Gen Z slang with KJV available on tap
- **Smooth chapter scrolling** — infinite scroll through chapters
- **Verse highlighting/bookmarking**
- **Share verse** — generates a card-style image or copyable text for social media

### 2. Search
- Full-text search across both KJV and slang translations
- Search suggestions for popular passages
- Recent searches

### 3. Daily Verse
- Push notification with a daily verse in Gen Z slang
- Animated card on home screen
- Shareable to Instagram Stories, TikTok, iMessage

### 4. Bookmarks & Highlights
- Save favorite verses
- Color-coded highlights (multiple colors)
- Add personal notes to verses

### 5. Reading Plans (Future)
- Curated reading plans: "Genesis Speedrun", "Psalms for Bad Days", "Jesus's Origin Story"
- Progress tracking with streaks

### 6. Verse of the Day Widget (Future)
- iOS/Android home screen widget showing daily slang verse

---

## Design Direction

### Vibe
**Dark, clean, youthful, irreverent but reverent.** It should feel like a premium app that doesn't take itself too seriously visually but takes the Word seriously theologically. Think: **Apple Notes meets Discord dark mode meets a streetwear brand.**

### Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `bg-primary` | `#080810` | Main background (near-black with blue tint) |
| `bg-secondary` | `#111118` | Cards, surfaces |
| `bg-tertiary` | `#1a1a24` | Elevated surfaces, modals |
| `accent-gold` | `#d4a843` | Primary accent, CTAs, highlights |
| `accent-gold-light` | `#f0c060` | Hover/active states |
| `text-primary` | `#ffffff` | Headlines, verse text |
| `text-secondary` | `#b4bac8` | Body text, labels |
| `text-muted` | `#5a6070` | Disabled, metadata |
| `slang-highlight` | `#7c6deb` | Purple accent for slang-specific UI elements |
| `kjv-highlight` | `#c9a96e` | Warm gold for KJV-specific elements |
| `success` | `#42b883` | Completed, streaks |
| `error` | `#e05252` | Errors |

### Typography

| Element | Font | Weight | Size |
|---------|------|--------|------|
| App name / Logo | Bricolage Grotesque | 800 | 28-32 |
| Book/Chapter headers | Bricolage Grotesque | 700 | 22-26 |
| Verse text (slang) | Instrument Sans | 400 | 17-18 |
| Verse text (KJV) | Serif (Georgia or similar) | 400 | 16-17 |
| Verse numbers | Instrument Sans | 600 | 12 |
| UI labels/buttons | Instrument Sans | 500-600 | 14-16 |
| Navigation | Instrument Sans | 500 | 13 |

### Iconography
- Use minimal line icons (Lucide or Phosphor style)
- Emoji accents sparingly for personality (not in verse text)
- Tab bar: simple outline icons

### Layout Principles
- **Mobile-first** — portrait orientation locked
- **Full-bleed verse text** — generous padding, easy to read
- **Bottom sheet navigation** — book/chapter picker slides up
- **Gesture-based** — swipe between chapters, pull to refresh daily verse
- **Minimal chrome** — hide navigation when reading, show on scroll up

---

## Screen Breakdown

### 1. Home / Daily Verse
- Large daily verse card (slang version) with gradient background
- "Read more" → opens to that chapter
- Quick-access to continue reading (last position)
- Search bar at top
- Bottom tab navigation

### 2. Bible Reader
- Top bar: Book name + Chapter number + translation toggle (Slang/KJV/Both)
- Verse text fills the screen
- Verse numbers inline (subtle, muted color)
- Tap verse → action bar (bookmark, highlight, share, copy, note)
- Swipe left/right → next/prev chapter
- Bottom: mini chapter scrubber

### 3. Book Picker
- Bottom sheet or full screen
- Two sections: Old Testament / New Testament
- Grid or list of book names
- Tap book → chapter grid (1, 2, 3... n)
- Tap chapter → reader opens

### 4. Search
- Search bar with keyboard
- Results show verse snippet + reference
- Filter by OT/NT
- Trending/popular searches

### 5. Bookmarks / Highlights
- List of saved verses
- Filter by color/tag
- Tap to jump to verse in reader

### 6. Settings
- Translation preference (default view)
- Notification time for daily verse
- Font size adjustment
- About / Credits

---

## Navigation Structure

```
Tab Bar (bottom):
├── Home (daily verse + continue reading)
├── Bible (reader + book picker)  
├── Search
├── Saved (bookmarks + highlights)
└── Settings
```

---

## Tech Stack (Already Set Up)

| Layer | Technology |
|-------|-----------|
| Framework | React Native (Expo 54) |
| Routing | Expo Router (file-based) |
| Styling | NativeWind (TailwindCSS for RN) |
| State | Zustand |
| Backend | Supabase (PostgreSQL + Auth) |
| Storage | AsyncStorage (offline cache) |
| Notifications | expo-notifications |
| Fonts | expo-font |
| Auth | expo-secure-store + Supabase Auth |

---

## App Identity

| Element | Value |
|---------|-------|
| App Name | **His Palabra** |
| Tagline | "The Word, but make it Gen Z" |
| Alt taglines | "Scripture that hits different" / "God's Word no cap" |
| Bundle ID (iOS) | `org.hispalabra.app` |
| Package (Android) | `org.hispalabra.app` |
| URL Scheme | `hispalabra` |
| Dark mode | Always (userInterfaceStyle: "dark") |
| Splash BG | `#080810` |

---

## Content Examples (What's in the Database)

### Genesis 1:1
> **KJV**: In the beginning God created the heaven and the earth.
> **Slang**: Okay so straight up, in the beginning God created the heavens and the earth. That's it. That's how it started.

### Genesis 1:31
> **KJV**: And God saw every thing that he had made, and, behold, it was very good.
> **Slang**: God looked at everything He made and it was VERY good. Not just good — very good. Evening came, then morning — day six fr fr. The whole creation was absolutely bussin.

### Psalm 23:1
> **KJV**: The Lord is my shepherd; I shall not want.
> **Slang**: The Lord got me fr — I'm never out here lacking, no cap.

### Psalm 23:5
> **KJV**: Thou preparest a table before me in the presence of mine enemies...
> **Slang**: You set up a whole feast for me right in front of my haters. You anoint my head with oil — my cup is overflowing. Flexing on the opps deadass.

### John 3:16
> **KJV**: For God so loved the world, that he gave his only begotten Son...
> **Slang**: God loved the world so much He gave His one and only Son — so whoever believes in Him won't perish but have eternal life no cap.

### Proverbs 3:5
> **KJV**: Trust in the Lord with all thine heart; and lean not unto thine own understanding.
> **Slang**: Trust in the Lord with ALL your heart and don't lean on your own understanding. GOATED verse fr fr.

### Isaiah 53:5
> **KJV**: But he was wounded for our transgressions, he was bruised for our iniquities...
> **Slang**: But He was pierced for OUR rebellion, crushed for OUR sins. The punishment that brought us peace was on Him — and by His wounds we are healed. GOATED verse fr fr.

### Jeremiah 29:11
> **KJV**: For I know the thoughts that I think toward you, saith the Lord...
> **Slang**: I know the plans I have for you, declares the Lord — plans to prosper you and not harm you, plans to give you hope and a future. GOATED promise no cap fr fr.

---

## Translation Style Guide

The Gen Z slang translations follow these rules:

### DO:
- Use conversational tone (like a group chat)
- Include slang markers: "fr", "no cap", "deadass", "ngl", "lowkey", "bruh", "fam"
- Use quality words: "bussin", "fire", "goated", "slay", "mid", "W/L"
- Keep it fun and accessible
- Preserve ALL proper nouns (Moses, David, Jerusalem, Jesus)
- Preserve ALL theological content (covenant, salvation, sin, grace)
- Capitalize "G" in God references ("on God" not "on god")

### DON'T:
- Use profanity (app-store safe)
- Change the meaning of Scripture
- Rename biblical figures
- Delete theological concepts
- Make it disrespectful to the text

---

## Monetization (Future)

- **Free**: Full Bible access (both translations), daily verse, search
- **Premium ($2.99/mo)**: Reading plans, highlights, notes, widgets, offline mode, custom themes
- **One-time**: Shareable verse card generator (premium templates)

---

## Design Deliverables Needed

1. **App icon** — Dark background, gold accent, modern typographic or symbolic mark
2. **Splash screen** — Minimal, dark with logo
3. **Home screen** — Daily verse card, continue reading, search
4. **Bible reader** — Verse display with translation toggle
5. **Book/chapter picker** — Clean navigation
6. **Search results** — Verse snippets with references
7. **Bookmarks screen** — Saved verses list
8. **Share card** — Social media verse card template
9. **Settings** — Clean preferences screen
10. **Onboarding** (2-3 screens) — Welcome, explain concept, pick preference

---

## Competitive Landscape

| App | What they do | Where His Palabra differs |
|-----|-------------|--------------------------|
| YouVersion | #1 Bible app, many translations | No slang translation, corporate feel |
| Bible.is | Audio + dramatized | Traditional language only |
| Dwell | Beautiful audio Bible | Premium, no slang, older audience |
| Streetlights Bible | Hip-hop dramatized audio | Audio only, not text-based slang |

**His Palabra's edge**: The ONLY Bible app with a full Gen Z slang text translation of all 31,102 verses. It's not audio, not paraphrase, not "casual English" — it's actual Gen Z register with the markers young people use daily.

---

## Summary

His Palabra is a **dark-themed, mobile-first Bible app** that makes Scripture hit different for Gen Z. The entire 31,102-verse Bible has been translated into heavy Urban Dictionary / Gen Z slang while preserving theological accuracy. The app presents both KJV and slang side-by-side, with daily verses, search, bookmarks, and social sharing.

The backend is built. The translations are done. Now it needs a **fire design** that matches the energy of the content — dark, clean, premium, youthful, and unapologetically Gen Z.

**Scripture that hits different. No cap.**
