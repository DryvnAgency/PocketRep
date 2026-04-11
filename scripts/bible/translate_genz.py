"""Lazy, on-demand Gen Z translator for KJV verses.

Reads scripts/bible/data/kjv.json (produced by load_kjv.py), then calls
Claude to translate a single verse or a small range into Gen Z English.

Usage:
    python translate_genz.py "John" 3 16
    python translate_genz.py "Psalms" 23 --range 1-6

Environment:
    ANTHROPIC_API_KEY  (required)
    CLAUDE_MODEL       (optional, defaults to claude-sonnet-4-6)
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from functools import lru_cache
from pathlib import Path

from anthropic import Anthropic
from dotenv import load_dotenv

KJV_PATH = Path(__file__).parent / "data" / "kjv.json"
DEFAULT_MODEL = "claude-sonnet-4-6"

SYSTEM_PROMPT = """You are a Gen Z Bible translator. Given a single King James \
Version verse, rewrite it in modern Gen Z English.

Rules:
- Preserve the original meaning precisely.
- Use contemporary slang sparingly and naturally; never force it.
- Stay respectful of the text's spiritual significance.
- Output ONLY the translated verse text. No preface, no reference, no quotes, \
no commentary.
- Keep it to one sentence or short paragraph matching the verse's length.
"""


@lru_cache(maxsize=1)
def _load_dataset() -> dict:
    if not KJV_PATH.exists():
        raise FileNotFoundError(
            f"KJV dataset not found at {KJV_PATH}. "
            "Run `python load_kjv.py` first."
        )
    with KJV_PATH.open("r", encoding="utf-8") as fh:
        return json.load(fh)


@lru_cache(maxsize=1)
def _verse_index() -> dict[tuple[str, int, int], str]:
    """Build an in-memory {(book_lower, chapter, verse) -> text} index."""
    data = _load_dataset()
    return {
        (v["book"].lower(), v["chapter"], v["verse"]): v["text"]
        for v in data["verses"]
    }


def lookup_kjv(book: str, chapter: int, verse: int) -> str:
    text = _verse_index().get((book.lower(), chapter, verse))
    if text is None:
        raise KeyError(f"Verse not found: {book} {chapter}:{verse}")
    return text


@lru_cache(maxsize=1)
def _client() -> Anthropic:
    load_dotenv()
    if not os.getenv("ANTHROPIC_API_KEY"):
        raise RuntimeError(
            "ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key."
        )
    return Anthropic()


def _translate_text(kjv_text: str) -> str:
    """Single Claude call. System prompt is prompt-cached for cheap follow-ups."""
    client = _client()
    model = os.getenv("CLAUDE_MODEL", DEFAULT_MODEL)
    message = client.messages.create(
        model=model,
        max_tokens=400,
        system=[
            {
                "type": "text",
                "text": SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": f"KJV verse:\n{kjv_text}"}],
    )
    # Response content is a list of blocks; concatenate any text blocks.
    return "".join(
        block.text for block in message.content if getattr(block, "type", None) == "text"
    ).strip()


def translate_verse(book: str, chapter: int, verse: int) -> dict:
    """Translate a single verse. Returns {book, chapter, verse, kjv, genz}."""
    kjv = lookup_kjv(book, chapter, verse)
    return {
        "book": book,
        "chapter": chapter,
        "verse": verse,
        "kjv": kjv,
        "genz": _translate_text(kjv),
    }


def translate_range(book: str, chapter: int, start: int, end: int) -> list[dict]:
    """Translate an inclusive verse range within one chapter."""
    if end < start:
        raise ValueError(f"Invalid range: {start}-{end}")
    return [translate_verse(book, chapter, v) for v in range(start, end + 1)]


# TODO: add a batch-all-verses command here once we decide on storage
# (local JSON cache vs. Supabase table). Keeping translation lazy for now.


def _parse_range(value: str) -> tuple[int, int]:
    if "-" not in value:
        n = int(value)
        return n, n
    start, end = value.split("-", 1)
    return int(start), int(end)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("book", help='Book name, e.g. "John"')
    parser.add_argument("chapter", type=int)
    parser.add_argument(
        "verse",
        nargs="?",
        help="Verse number, or omit when using --range",
    )
    parser.add_argument(
        "--range",
        dest="verse_range",
        help="Inclusive verse range within the chapter, e.g. 16-18",
    )
    args = parser.parse_args()

    try:
        if args.verse_range:
            start, end = _parse_range(args.verse_range)
            results = translate_range(args.book, args.chapter, start, end)
        elif args.verse is not None:
            results = [translate_verse(args.book, args.chapter, int(args.verse))]
        else:
            parser.error("Provide a verse number or --range")
    except (FileNotFoundError, RuntimeError, KeyError, ValueError) as err:
        print(f"error: {err}", file=sys.stderr)
        return 1

    for r in results:
        print(f"\n{r['book']} {r['chapter']}:{r['verse']}")
        print(f"  KJV:  {r['kjv']}")
        print(f"  GenZ: {r['genz']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
