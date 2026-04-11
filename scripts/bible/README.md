# Bible KJV Loader + Gen Z Translator

Python scripts for loading the full King James Version Bible from GitHub and
producing lazy, on-demand Gen Z translations via Claude.

This folder is a standalone Python project and is intentionally isolated from
the Node/TypeScript code elsewhere in the repo.

## Setup

```bash
cd scripts/bible
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # then edit .env and add your ANTHROPIC_API_KEY
```

## Load the KJV dataset

Downloads all 66 books / 1,189 chapters / 31,102 verses from
`thiagobodruk/bible` on GitHub and writes a flat JSON file to
`data/kjv.json`.

```bash
python load_kjv.py
# -> Parsed: 66 books, 1189 chapters, 31102 verses
# -> Wrote data/kjv.json (~4500 KB)
```

Options:

- `--out PATH` — write somewhere other than `data/kjv.json`
- `--pretty` — pretty-print the output JSON (bigger file, easier to diff)

The dataset is gitignored (see `.gitignore`); each clone fetches it fresh.

## Translate a verse (lazy / on-demand)

Translations are **not** pre-computed. Each CLI call hits Claude once per
verse. A prompt-cached system message keeps repeat calls in the same session
cheap.

```bash
python translate_genz.py "John" 3 16
python translate_genz.py "Psalms" 23 --range 1-6
```

You can also import the helpers from your own Python code:

```python
from translate_genz import translate_verse, translate_range

translate_verse("John", 3, 16)
translate_range("Psalms", 23, 1, 6)
```

Each returns a dict (or list of dicts) with `book`, `chapter`, `verse`,
`kjv`, and `genz` fields.

## Environment variables

| Var                 | Required | Default              |
| ------------------- | -------- | -------------------- |
| `ANTHROPIC_API_KEY` | yes      | —                    |
| `CLAUDE_MODEL`      | no       | `claude-sonnet-4-6`  |

## Layout

```
scripts/bible/
├── load_kjv.py        # one-shot KJV downloader
├── translate_genz.py  # lazy Claude translator (CLI + importable API)
├── requirements.txt
├── .env.example
├── .gitignore
└── data/              # kjv.json lives here after load_kjv.py runs
```
