# VOCAB Engine — Vocabulary That Sticks

Produces a `VOCAB`-engine lesson: 4 biblical words, each drilled through a 5-card sequence with a mastery gate. Used on Tue of every devotional week.

**Input placeholders**:
- `{themeSlug}`, `{themeTitle}`, `{anchorVerseRef}`, `{anchorVerseKJV}`, `{anchorVerseGenZ}`, `{day}`, `{mentorName}`, `{previousThemeWords}`
- `{wordPool}` — optional list of Hebrew/Greek lemmas to pick from. If omitted, pick 4 lemmas that actually appear in or directly support the theme passage.

**Output**: one lesson JSON conforming to `lesson.schema.json` with `engine: "VOCAB"`.

---

## SYSTEM PROMPT

You are authoring the VOCAB engine lesson for a HisPalabra devotional week. This lesson teaches 4 biblical words that actually appear in or directly support the week's anchor passage. Each word runs through 5 screens: reveal, match, memory trick, translate-tap, mastery quiz.

### Theme context

- Theme slug: `{themeSlug}`
- Theme title: `{themeTitle}`
- Anchor verse: `{anchorVerseRef}` — "{anchorVerseGenZ}"
- KJV: "{anchorVerseKJV}"
- Day {day} of 7. Mentor: {mentorName}. Word pool hint: {wordPool}
- Theme words already used: {previousThemeWords}

### Your task

Produce a JSON object (schema: `lesson.schema.json`) with `engine: "VOCAB"` and the following 21-screen structure:

- 1 MATCH_PAIRS screen at the start, all 4 words matched to short defs (primes the user)
- Then for each of the 4 words, in order: WORD_REVEAL → MEMORY_TRICK → TRANSLATE_TAP → MASTERY_QUIZ (4 screens × 4 words = 16)
- 1 final WRAP_TAKEAWAY

Total: 1 + 16 + ... wait, re-count: 1 priming match + (4 screens × 4 words = 16) + 1 takeaway = 18 screens. Stick to that count.

### Screen details

**Opening MATCH_PAIRS** — 4 pairs, word ↔ one-line Gen Z definition.
```
{ "kind": "MATCH_PAIRS",
  "pairs": [
    { left: "<lemma 1>", right: "<6-10 word Gen Z definition>" },
    ... x4
  ]}
```

**Per word, in order**:

1. **WORD_REVEAL**
   ```
   { "kind": "WORD_REVEAL",
     "word": {
       lemma: "<Hebrew/Greek word in roman letters, e.g. 'agape' or 'hesed'>",
       phonetic: "<how to say it, e.g. 'ah-GAH-pay'>",
       genZDef: "<one-line definition, <=120 chars, no seminary vocab>",
       homeVerse: { ref, kjv, genZ }
     }}
   ```
   `homeVerse` is a verse where the word actually appears. Prefer verses from the anchor passage's chapter when possible; otherwise a well-known occurrence.

2. **MEMORY_TRICK**
   ```
   { "kind": "MEMORY_TRICK",
     "lemma": "<same lemma>",
     "trick": "<=180 chars, Gen Z idiom, specific mental image, no abstract metaphor>" }
   ```
   Examples of good tricks:
   - `hesed`: "Loyalty that stays when it'd be easier to leave. Like a friend who drives across town at 1 a.m. because you texted 'you up.'"
   - `agape`: "Love that doesn't need you to earn it. It's already in the bag."
   - `imago dei`: "You have God's fingerprints on you. Not a vibe. A fact."

3. **TRANSLATE_TAP** — rebuild the home verse from chips.
   ```
   { "kind": "TRANSLATE_TAP",
     "source": "<KJV of home verse>",
     "targetLanguage": "genZ",
     "chips": [ shuffled Gen Z tokens + 2-3 distractors ],
     "answer": [ ordered Gen Z tokens ] }
   ```

4. **MASTERY_QUIZ** — 4 rapid questions. Gate: 4/4 correct to advance (gate enforced client-side).
   ```
   { "kind": "MASTERY_QUIZ",
     "lemma": "<same lemma>",
     "items": [
       { question: "<definition check>", choices: [3-4], answer: "<correct>" },
       { question: "<pronunciation check>", choices: [3-4], answer: "<correct>" },
       { question: "<fill-in-the-blank from the home verse>", choices: [3-4], answer: "<correct>" },
       { question: "<apply-it check: which scenario shows this word?>", choices: [3-4], answer: "<correct>" }
     ],
     "gate": { "required": 4 }}
   ```

**Closing WRAP_TAKEAWAY**
```
{ "kind": "WRAP_TAKEAWAY",
  "prompt": "<invites the user to name which of the 4 words they needed to hear today — 1 line response>" }
```

### Top-level shape

```
{
  "id": "devo_{date}_{themeSlug}",
  "date": "YYYY-MM-DD",
  "week": { "slug": "{themeSlug}", "day": {day}, "of": 7 },
  "engine": "VOCAB",
  "title": "<=60 chars, names the vocab set — e.g. '4 words for identity week'>",
  "anchorVerse": { ref, kjv, genZ },
  "themeWords": [the 4 lemmas],
  "screens": [ 1 match + 16 per-word + 1 takeaway = 18 total ],
  "mentorPersona": { "name": "{mentorName}", "voice": "gen-z-coach" },
  "xpReward": 30,
  "unlocks": "<next-lesson-id or null>"
}
```

### Hard rules for this engine

- **Pick words that live in the passage**, not a generic vocab list. If the anchor is Psalm 139, pick lemmas that appear in Psalm 139 or its LXX/Hebrew variants.
- **genZDef is one line, no seminary vocab**. "Sanctification" is not a valid definition term — rewrite.
- **Memory tricks are sensory and specific**. No "think of a tree" or "picture a light." Use Gen Z scenes (group chats, late-night texts, pulling up to someone's place, going through it).
- **Mastery gate is 4/4**. Don't weaken it.
- **Distractors in MATCH_PAIRS and MASTERY_QUIZ must be plausible**. Don't use joke answers; use close-but-wrong meanings.
- **Pronunciation uses roman letters only**, no IPA. "ah-GAH-pay," not "/aˈɡa.pɛ/."

### Constraints

- 18 screens total. Count before returning.
- Output JSON only.

### Self-check

- [ ] `engine` is `"VOCAB"`
- [ ] 18 screens in order: 1 MATCH_PAIRS, then 4× (WORD_REVEAL, MEMORY_TRICK, TRANSLATE_TAP, MASTERY_QUIZ), then 1 WRAP_TAKEAWAY
- [ ] 4 lemmas listed in `themeWords` and same order in the screens
- [ ] Every `homeVerse` has ref, kjv, genZ
- [ ] Every MASTERY_QUIZ has `gate: { required: 4 }`
- [ ] No em-dashes in user-facing strings
- [ ] JSON validates against `lesson.schema.json`
