# HisPalabra Duolingo-Style Devotionals — Hand-off Spec

This folder is a **hand-off spec**, not runtime code. It lives on branch `claude/gen-z-devotional-app-9zXjE` in the PocketRep repo so it can be reviewed as a PR. Once approved, copy these files into the HisPalabra repo (separate codebase).

## What's inside

| File | Purpose |
|---|---|
| `lesson.schema.json` | JSON Schema for the compiled HisPalabra Devotional Lesson shape. Every lesson JSON validates against this. |
| `prompts/voice-filter.md` | DNA enforcement prompt. Appended to every AI generation call so output sounds like HisPalabra. |
| `prompts/immersion.md` | Engine 1 — 7-Day Scripture Immersion. Produces IMMERSION-engine lesson JSON. |
| `prompts/conversation.md` | Engine 2 — Real Conversation with a Faith Mentor. Produces CONVERSATION-engine lesson JSON. |
| `prompts/vocab.md` | Engine 3 — Vocabulary That Sticks. Produces VOCAB-engine lesson JSON. |
| `prompts/roleplay.md` | Engine 4 — Role Play Real Life. Produces ROLEPLAY-engine lesson JSON. |
| `examples/week-01-identity/mon-immersion.json` | Worked Monday lesson — Psalm 139, identity theme, IMMERSION engine. |
| `examples/week-01-identity/tue-vocab.json` | Worked Tuesday lesson — 4 biblical words anchoring the identity theme. |
| `examples/week-01-identity/wed-conversation.json` | Worked Wednesday lesson — mentor chat around identity struggle. |
| `roadmap-merge.md` | How this feature merges into the existing HisPalabra P1–P8 roadmap (no new P9). |
| `content-authoring-guide.md` | Playbook for drafting new weeks: theme → 4 prompt passes → Voice Filter → review. |

## How the pieces fit

1. Pick a **theme** for the week (identity, grace, fear, grief, hustle, etc.).
2. Pick an **anchor passage** (1 chapter or cluster of verses).
3. Run each of the 4 engine prompts with `{theme, anchorPassage, day}` placeholders filled in. Each produces a lesson JSON.
4. Run the raw output through `voice-filter.md` to enforce HisPalabra DNA.
5. Drop the 7 resulting JSONs into the HisPalabra repo's content directory (path TBD from master context).
6. The HisPalabra app loads a lesson, checks `engine`, renders the matching screen flow.

## Engine rotation (week shape)

| Day | Engine |
|---|---|
| Mon | IMMERSION |
| Tue | VOCAB |
| Wed | CONVERSATION |
| Thu | IMMERSION |
| Fri | ROLEPLAY |
| Sat | CONVERSATION |
| Sun | IMMERSION |

Completing 7 days = week unlocks the next themed week on the path map.

## Pending inputs (do not block review)

- `HISPALABRA_MASTER_CONTEXT.txt` — needed to finalize roadmap-merge acceptance criteria and confirm the content directory path + prompt-template system location in the HisPalabra repo.
- User's **Gen Z KJV translation corpus** — the example lessons use placeholder `genZ` strings marked `TODO: replace from Gen Z KJV corpus`.
