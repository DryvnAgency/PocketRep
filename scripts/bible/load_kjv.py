"""Download the King James Bible from GitHub and write a normalized JSON file.

Source: https://github.com/thiagobodruk/bible (en_kjv.json)
Output: scripts/bible/data/kjv.json

Usage:
    python load_kjv.py
    python load_kjv.py --out /tmp/kjv.json --pretty
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import requests

SOURCE_URL = (
    "https://raw.githubusercontent.com/thiagobodruk/bible/master/json/en_kjv.json"
)
DEFAULT_OUT = Path(__file__).parent / "data" / "kjv.json"
REQUEST_TIMEOUT = 30


def fetch_source() -> list[dict]:
    """Fetch the raw KJV JSON. Retries once on network failure."""
    last_err: Exception | None = None
    for attempt in (1, 2):
        try:
            resp = requests.get(SOURCE_URL, timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            # The upstream file is ISO-8859-1 encoded; requests may guess wrong.
            resp.encoding = "utf-8-sig"
            try:
                return resp.json()
            except json.JSONDecodeError:
                # Fall back to latin-1 decode if UTF-8 parsing fails.
                return json.loads(resp.content.decode("latin-1"))
        except (requests.RequestException, json.JSONDecodeError) as err:
            last_err = err
            if attempt == 1:
                time.sleep(2)
    raise RuntimeError(f"Failed to fetch KJV source: {last_err}")


def normalize(raw: list[dict]) -> dict:
    """Flatten thiagobodruk's nested structure into a flat verse list.

    Input shape (per book):
        {"abbrev": "gn", "name": "Genesis", "chapters": [[v1, v2, ...], ...]}

    Output shape:
        {"translation": "KJV", "verses": [{"book", "chapter", "verse", "text"}, ...]}
    """
    verses: list[dict] = []
    for book in raw:
        name = book.get("name") or book.get("abbrev", "")
        for chapter_idx, chapter in enumerate(book.get("chapters", []), start=1):
            for verse_idx, text in enumerate(chapter, start=1):
                verses.append(
                    {
                        "book": name,
                        "chapter": chapter_idx,
                        "verse": verse_idx,
                        "text": text.strip(),
                    }
                )
    return {"translation": "KJV", "source": SOURCE_URL, "verses": verses}


def summarize(dataset: dict) -> tuple[int, int, int]:
    verses = dataset["verses"]
    books = {v["book"] for v in verses}
    chapters = {(v["book"], v["chapter"]) for v in verses}
    return len(books), len(chapters), len(verses)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out",
        type=Path,
        default=DEFAULT_OUT,
        help=f"Output path (default: {DEFAULT_OUT})",
    )
    parser.add_argument(
        "--pretty",
        action="store_true",
        help="Pretty-print the output JSON (larger file).",
    )
    args = parser.parse_args()

    print(f"Fetching KJV from {SOURCE_URL} ...")
    raw = fetch_source()
    dataset = normalize(raw)

    book_count, chapter_count, verse_count = summarize(dataset)
    print(f"Parsed: {book_count} books, {chapter_count} chapters, {verse_count} verses")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8") as fh:
        if args.pretty:
            json.dump(dataset, fh, ensure_ascii=False, indent=2)
        else:
            json.dump(dataset, fh, ensure_ascii=False, separators=(",", ":"))

    size_kb = args.out.stat().st_size / 1024
    print(f"Wrote {args.out} ({size_kb:.0f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
