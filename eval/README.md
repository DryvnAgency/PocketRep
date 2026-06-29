# Rex eval (P2-R5)

A [promptfoo](https://promptfoo.dev) regression suite for **Rex action selection** —
the part of Hey Rex most likely to regress when the brain prompt or model changes.
Given a rep utterance and a small fixed book, it checks that the brain returns the
**right `action`** in the fenced JSON block that `rexActions.parseAction` reads.

> **Status: SCAFFOLD.** ~26 seed cases (`cases.yaml`), meant to grow toward the
> 150-utterance target in the roadmap. It is **not** a blocking PR gate — it calls a
> real model, so it needs a key and costs a few cents per run.

## Run it

From `PocketRepApp/`:

```bash
OPENROUTER_API_KEY=sk-... npm run eval:rex
```

…or directly from the repo root (no install — uses `npx`, so nothing is added to
`package.json`'s deps):

```bash
OPENROUTER_API_KEY=sk-... npx --yes promptfoo@latest eval -c eval/promptfooconfig.yaml
OPENROUTER_API_KEY=sk-... npx --yes promptfoo@latest view   # open the result UI
```

To test the fallback model instead of the primary:

```bash
OPENROUTER_API_KEY=sk-... npx --yes promptfoo@latest eval -c eval/promptfooconfig.yaml \
  --providers openrouter:moonshotai/kimi-k2.6
```

## Files

| File | Purpose |
|---|---|
| `promptfooconfig.yaml` | provider (OpenRouter, `temperature: 0`), prompt, cases, default assertion |
| `rexPrompt.txt` | the prompt sent to the model — a **maintained, condensed mirror** of `buildPrompt()` in `lib/v2/rexActions.ts` (action catalog + format rules + a fixed BOOK STATE so contact-referencing cases resolve) |
| `cases.yaml` | the seed utterances, each with an `expected_action` |
| `assertAction.js` | parses the reply exactly like `parseAction` and asserts `action === expected_action` |

## Why this isn't a blocking CI gate (deferred — owner action)

Making this a required check on every PR needs two things the agent can't safely
provision:

1. **A secret.** `OPENROUTER_API_KEY` must be added to the repo's Actions secrets.
2. **A cost decision.** Each full run makes ~26 (→ eventually ~150) live model calls.
   Running that on every PR spends real money and adds latency/flakiness (LLM output
   isn't deterministic even at `temperature: 0`).

So instead this ships as an **opt-in** workflow — `.github/workflows/rex-eval.yml`,
`workflow_dispatch` only (run by hand from the Actions tab). It fails fast with a
clear message if the secret is missing. Promote it to a PR gate once the key + budget
are signed off — and consider a pass-rate threshold (e.g. `--fail-on` / a min score)
rather than requiring 100%, since model replies vary.

## Caveat: the prompt is a mirror, not the source

`rexPrompt.txt` is a hand-maintained extract of `buildPrompt()`, not imported from it
(the app module pulls in React-Native/Supabase deps that don't load in a plain
promptfoo run). When you materially change the action catalog or format rules in
`rexActions.ts`, mirror the change here. A future hardening step is a tiny build step
that emits this prompt from the real `buildPrompt()` so the two can't drift.

## Extending toward 150

Add rows to `cases.yaml` (keep the BOOK STATE names consistent with `rexPrompt.txt`).
For cases where the *payload* matters, not just the action type, add a per-row
`assert:` with a `javascript` check on specific fields (e.g. `log_deal` front/back
gross parsed to integers, `filter_contacts` returning only real ids).
