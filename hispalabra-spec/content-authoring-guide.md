# Content Authoring Guide — Writing a HisPalabra Week

This is the playbook for drafting one full 7-day devotional week. Target: under 90 minutes per week with the Voice Filter passing on first review.

## What you're producing

7 lesson JSON files, one per day, all anchored to one theme and one passage. Filenames:

```
content/weeks/week-NN-{themeSlug}/
├── day-1-mon-immersion.json
├── day-2-tue-vocab.json
├── day-3-wed-conversation.json
├── day-4-thu-immersion.json
├── day-5-fri-roleplay.json
├── day-6-sat-conversation.json
└── day-7-sun-immersion.json
```

## Step 1 — Pick a theme (5 min)

Rules:
- One theme = one struggle or one truth a Gen Z user is actually wrestling with.
- Pick a theme that can be pressure-tested in 4 real-life scenes (needed for the Friday roleplay).
- Write the theme slug in kebab-case: `identity`, `grace`, `fear`, `grief`, `hustle`, `sex-and-dating`, `family-beef`, `envy`, `loneliness`, `purpose`, `anger`, `shame`.

Check your theme against this filter:
- [ ] Can I name 3 specific places in Gen Z life this shows up? (group chat, 2am scroll, rent stress, situationship, etc.)
- [ ] Is there a single verse that could anchor the whole week?
- [ ] Can I describe the theme to a 19-year-old in one sentence without using any church words?

If any answer is no, re-pick.

## Step 2 — Pick the anchor passage (10 min)

Rules:
- Pick 1 passage, not 7 separate verses. The week benefits from one field to plow deeply.
- Prefer a chapter or half-chapter so the IMMERSION and VOCAB days have real material to draw from.
- Note one "headline" verse inside the passage that becomes `anchorVerse` in every lesson JSON.

Example:
- Theme: `identity`
- Passage: Psalm 139
- Headline verse: Psalm 139:14

Grab:
- The KJV text of the headline verse (`anchorVerseKJV`).
- The Gen Z KJV rendering from the user's corpus (`anchorVerseGenZ`). If it doesn't exist yet, write `"TODO: replace from Gen Z KJV corpus"` and flag the verse for the translation pass.

## Step 3 — Pick the mentor persona (1 min)

Set once for the week. Choose:
- `Marcus` — grounded older-brother voice (default).
- `Jordan` — peer, same-age, figuring it out alongside you.
- `Alex` — quieter, listens more than talks.
- `Kai` — direct, challenges gently.
- `Reese` — warm big-sis energy.
- `Sage` — reflective, asks hard questions.

The Voice Filter handles tone; you just need to pick the name. Mentor persona carries through the whole week for consistency.

## Step 4 — Run the 4 engine prompts (40 min, 10 min each)

Fill in placeholders and run each prompt. Order of operations:

### Monday (IMMERSION)
- Prompt file: `prompts/immersion.md`
- Placeholders: `{themeSlug}`, `{themeTitle}`, `{anchorVerseRef}`, `{anchorVerseKJV}`, `{anchorVerseGenZ}`, `{day}=1`, `{mentorName}`, `{previousThemeWords}=[]`
- Save output: `day-1-mon-immersion.json`

### Tuesday (VOCAB)
- Prompt: `prompts/vocab.md`
- Placeholders: same + `{day}=2`, `{previousThemeWords}=[words from Monday]`, `{wordPool}=<optional hint>`
- Save output: `day-2-tue-vocab.json`

### Wednesday (CONVERSATION)
- Prompt: `prompts/conversation.md`
- Placeholders: same + `{day}=3`, `{scenarioSeed}=<optional>`, `{previousThemeWords}=[Mon+Tue words]`
- Save output: `day-3-wed-conversation.json`

### Thursday (IMMERSION) — second pass
- Prompt: `prompts/immersion.md`
- Placeholders: `{day}=4`, `{previousThemeWords}=[Mon+Tue+Wed]`
- Optional: swap the anchor verse for a different verse in the same passage for Thursday to keep the mid-week pass fresh.
- Save output: `day-4-thu-immersion.json`

### Friday (ROLEPLAY)
- Prompt: `prompts/roleplay.md`
- Placeholders: same + `{day}=5`, `{scenarioDomains}=<3-4 domains>`, `{previousThemeWords}=[Mon–Thu]`
- Save output: `day-5-fri-roleplay.json`

### Saturday (CONVERSATION) — second pass
- Prompt: `prompts/conversation.md`
- Placeholders: `{day}=6`, lighter scenario seed for a warmer wrap.
- Save output: `day-6-sat-conversation.json`

### Sunday (IMMERSION) — reflection
- Prompt: `prompts/immersion.md`
- Placeholders: `{day}=7`. Tip: instruct the model to add a "next-week teaser" in `whyToday` on day 7.
- Save output: `day-7-sun-immersion.json`

## Step 5 — Run Voice Filter on all 7 (15 min)

For each of the 7 JSON files:
1. Pass the JSON through `prompts/voice-filter.md`.
2. Receive the voice-filtered JSON.
3. Replace the file.

If any filter pass fails (output breaks schema, or loses required fields), the upstream prompt ran loose — fix the engine prompt input and retry that one lesson.

## Step 6 — Human review pass (15 min)

Read all 7 files end-to-end as if you were a user. Check:

- [ ] The mentor persona is consistent across all 7.
- [ ] Theme words don't repeat unnecessarily across days.
- [ ] No em-dashes anywhere in user-facing strings.
- [ ] Every verse has ref + kjv + genZ. Any `TODO: replace from Gen Z KJV corpus` strings are listed for the translation pass.
- [ ] Friday's roleplay scenes span ≥3 distinct domains.
- [ ] Sunday's `whyToday` teases next week.
- [ ] Each `WRAP_TAKEAWAY` prompt is a question, not a completion.

## Step 7 — Schema validation (5 min)

Run each JSON through `lesson.schema.json` validation. Any failures block the week.

```bash
ajv validate -s lesson.schema.json -d 'content/weeks/week-NN-*/*.json' --all-errors
```

If a screen's `kind` doesn't match the engine's expected flow (e.g. a `CHAT_OPENER` shows up in an IMMERSION lesson), re-run that lesson's engine prompt.

## Step 8 — Register the week (2 min)

Add the week to `hp_weeks` (or equivalent table from master context):

```sql
insert into hp_weeks (slug, title, anchor_passage, sort_order, unlocks_week)
values ('identity', 'You are not your algorithm', 'Psalm 139', 1, 'grace');

insert into hp_week_lessons (week_slug, day, lesson_id) values
  ('identity', 1, '<monday-lesson-uuid>'),
  ('identity', 2, '<tuesday-lesson-uuid>'),
  ...;
```

## Time budget

| Step | Target | Notes |
|---|---|---|
| 1. Theme | 5 min | |
| 2. Passage | 10 min | |
| 3. Mentor | 1 min | |
| 4. 7 engine prompts | 40 min | |
| 5. Voice filter | 15 min | |
| 6. Human review | 15 min | |
| 7. Schema validation | 5 min | |
| 8. Register | 2 min | |
| **Total** | **~90 min** | |

If you're over 90 minutes, the theme was likely too broad or the passage didn't have enough material. Prune scope before retrying.

## Anti-patterns to avoid

- **Copy-pasting the same scenario** across all 4 roleplay scenes. Span 3+ domains.
- **Using the same 3 theme words** all week. Rotate them so vocab lessons pull new lemmas.
- **Letting the AI write the takeaway**. The user must write it. Every time.
- **Stacking 2 metaphors in a memory trick**. One image per trick.
- **Using "journey," "walk," "season," "press in."** Strip these.
- **Generating Gen Z verse renderings on the fly**. Always pull from the corpus or flag as TODO.

## Quality bar

A week ships when:
- All 7 lessons validate against schema.
- Voice filter passes without changes on ≥5 of 7 files on first try.
- A neutral reader can describe the theme in one sentence after finishing the week.
- The Friday roleplay made the reader genuinely pause on at least 2 of 4 scenes.

If any bar fails, rework before shipping.
