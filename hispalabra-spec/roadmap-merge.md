# Roadmap Merge — Duolingo Devotionals into Existing HisPalabra P1–P8

**Decision locked with user**: merge into existing priorities. No new P9. The devotional lesson becomes the new first-class content entity; the existing P1–P8 extend to treat it that way.

> This document uses placeholder wording for P1–P8 pulled from user's description. Final acceptance criteria will be re-locked against `HISPALABRA_MASTER_CONTEXT.txt` once saved.

## The short version

- **P1 cleanup** — no change.
- **P2 search** — index lessons as searchable entities.
- **P3 bookmarks** — bookmark at screen granularity, not just verse.
- **P4 sharing** — share card = user takeaway + Gen Z KJV verse.
- **P5 settings** — add Mentor Persona + engine-rotation + daily XP.
- **P6 notifications** — driven by engine cadence + streak.
- **P7 reading plans** — reading plans ARE devotional weeks.
- **P8 slang rewrite** — absorbed into the Voice Filter.

**Net**: P7 and P8 get absorbed into the engine layer. P2–P6 extend. P1 untouched.

---

## P1 — Cleanup

**Status**: unchanged. Do P1 first, as planned.

**Why**: The devotional lesson entity should land on a clean codebase. Don't pile new tables onto unresolved cleanup work.

---

## P2 — Search

**Existing spec** (from user's roadmap): search Bible text.

**Additions for devotionals**:
- Index `lesson.title` + `lesson.anchorVerse.ref` + `lesson.anchorVerse.genZ` + `lesson.themeWords[]` per lesson record.
- Search result card for a lesson shows: title, engine icon, week theme, anchor verse ref.
- Tapping a lesson result opens the lesson node on the path map (not directly into the player — user still starts from the unlock state).

**Acceptance criteria**:
- [ ] Typing "identity" returns week-01 lessons as results above raw verse matches.
- [ ] Typing a verse ref (e.g. "Psalm 139") returns both the verse AND lessons anchored there.
- [ ] Search latency under 200ms on a local index of 200 lessons.

---

## P3 — Bookmarks

**Existing spec**: bookmark verses.

**Additions for devotionals**:
- New bookmark type: `LESSON_SCREEN_BOOKMARK` — points at `{lesson_id, screen_index}`.
- User hits a bookmark icon on any lesson screen in the player.
- Bookmarks list has a tab/filter for "lesson screens" vs "verses."

**Schema extension**:
```sql
alter table hp_bookmarks add column lesson_id uuid references hp_lessons;
alter table hp_bookmarks add column screen_index int;
-- existing verse bookmark rows have both null
```
(Table name TBD from master context.)

**Acceptance criteria**:
- [ ] Bookmark icon visible on every lesson screen in the player.
- [ ] Bookmarked screen reopens at that exact screen_index, not at the start of the lesson.
- [ ] Unbookmarking works.

---

## P4 — Sharing

**Existing spec**: share a verse.

**Additions for devotionals**:
- New share card type: `LESSON_TAKEAWAY_CARD`. Layout: user's takeaway line (from `WRAP_TAKEAWAY`) in large type, Gen Z KJV of the anchor verse below, small HisPalabra wordmark in corner.
- OG image auto-generated server-side per lesson (user's takeaway + anchor verse).
- Share destinations: iMessage, Instagram DM, Instagram Story (templated background), copy link.
- Link opens the HisPalabra web preview at `hispalabra.org/shared/{share_token}`.

**Acceptance criteria**:
- [ ] User finishes a lesson, hits share, sees a preview of the card.
- [ ] IG Story share opens the native share sheet with the image pre-filled.
- [ ] Link preview on iMessage renders OG image correctly.
- [ ] Link expires after 30 days (share tokens have TTL).

---

## P5 — Settings

**Existing spec**: app preferences.

**Additions for devotionals**:
- **Mentor persona picker**: Marcus / Jordan / Alex / Kai / Reese / Sage (4–6 options). Changes `mentorPersona.name` + voice class on new lessons. Existing completed lessons keep their original mentor.
- **Daily XP goal**: 10 / 20 / 30 / 50 XP. Drives streak + notification copy.
- **Engine rotation preference**: Default (Mon-IMM/Tue-VOCAB/Wed-CONV/Thu-IMM/Fri-ROLE/Sat-CONV/Sun-IMM), Immersion-heavy (5× IMM + 2× mix), Conversation-heavy (5× CONV + 2× mix).
- **Voice filter strictness**: On (default) / Learning mode (allows mentor lines slightly longer for new users).

**Acceptance criteria**:
- [ ] Changing mentor persona applies to next lesson generated, not retroactively.
- [ ] Changing daily XP goal updates streak math immediately.
- [ ] Engine-rotation preference persists across app launches.

---

## P6 — Notifications

**Existing spec**: reminders.

**Additions for devotionals**:
- "Today's devo is ready" — sent at user's chosen time. Body mentions engine: "Today is a vocab day. 5 minutes."
- Streak reminder — sent if user hasn't started today's lesson by 8pm local. Uses streak count: "Day 12 streak. One lesson keeps it."
- Mastery-gate hint — if a user failed a VOCAB mastery gate, next-day notification nudges: "Yesterday's vocab is ready for another try."
- Week-complete celebration — day 7 complete: "Week of identity — done. Next week unlocks."

**Acceptance criteria**:
- [ ] Notifications respect quiet hours from P5.
- [ ] Copy varies by engine (vocab day ≠ immersion day ≠ roleplay day).
- [ ] Unsubscribe per notification type works.

---

## P7 — Reading Plans → **Devotional Weeks**

**Existing spec**: multi-day Bible reading plans.

**Absorbed into devotional engine**: a reading plan is now literally a devotional week.

**Schema**:
```sql
create table hp_weeks (
  slug text primary key,               -- 'identity', 'grace', 'fear', ...
  title text not null,
  anchor_passage text not null,        -- 'Psalm 139'
  sort_order int,
  unlocks_week text references hp_weeks  -- next week in sequence
);

create table hp_week_lessons (
  week_slug text references hp_weeks,
  day int check (day between 1 and 7),
  lesson_id uuid references hp_lessons,
  primary key (week_slug, day)
);
```
(Table names TBD from master context.)

**Default week shape**: Mon IMM / Tue VOCAB / Wed CONV / Thu IMM / Fri ROLE / Sat CONV / Sun IMM — per engine rotation preference in P5.

**Acceptance criteria**:
- [ ] Starting a week populates 7 lesson slots from `hp_week_lessons`.
- [ ] Completing day N unlocks day N+1 on the path map.
- [ ] Completing day 7 unlocks the next week.
- [ ] User can replay a completed week; mastery state persists.

---

## P8 — Slang Rewrite → **Absorbed into Voice Filter**

**Existing spec**: rewrite KJV verses into Gen Z slang on demand.

**Absorbed**: slang rewrite is no longer a standalone feature. It's what `prompts/voice-filter.md` does on every generation call. The Gen Z KJV corpus (user's translation) is the source of truth; the Voice Filter enforces it.

**What changes for the user**:
- Any verse view in the app shows the Gen Z rendering first, with a tap-to-reveal KJV collapse below. (This replaces the current slang-rewrite button.)
- No more per-verse AI call to "slang-ify" — the rendering is already in the corpus.

**Schema**: no change. The Gen Z rendering lives in the existing Bible-text table as a parallel column (column name TBD from master context).

**Acceptance criteria**:
- [ ] Every verse view shows Gen Z first, KJV under tap.
- [ ] Voice Filter integration tests pass (snapshot-style).
- [ ] Old slang-rewrite button is removed from the UI.
- [ ] Verses not yet in the Gen Z corpus show KJV with a small "Gen Z coming soon" badge.

---

## Sequencing recommendation

Ship P1 first (cleanup). Then split the remaining work:

**Phase A** (foundation for devotionals):
- P7 Reading Plans rewrite (introduces `hp_weeks` + `hp_lessons`).
- P8 Slang Rewrite → Voice Filter integration (introduces Gen Z corpus as first-class).

**Phase B** (extend existing priorities to treat lessons as first-class):
- P2 Search (adds lesson index).
- P3 Bookmarks (adds screen granularity).
- P5 Settings (adds mentor + XP + rotation).

**Phase C** (polish + distribution):
- P4 Sharing.
- P6 Notifications.

Total incremental scope vs original P1–P8: Phase A adds the lesson data model (~2 weeks). Phases B and C extend existing work rather than adding new work.

---

## TBD-CONTEXT items (lock after reading master context)

- Actual table names in the HisPalabra 8-table schema — replace `hp_` placeholders with real names.
- Actual content directory path for lesson JSONs — replace `content/hispalabra/` placeholder.
- Actual P1–P8 wording — re-quote user's exact priority language.
- Whether the existing app uses Supabase RLS patterns — confirm RLS policy template applies.
