"""Find a song by name and open its page in your own browser.

This does not download, fetch or print any lyrics. It only looks up the
link in data/song-links.csv (and the songs you added) and opens that page, the
same as clicking it. When a song has a clear match on loveworldmusic.org too,
it asks which site to open.
Run it once per song you want to look at:

    python open_song.py
"""

import csv
import re
import sys
import webbrowser
from pathlib import Path

LINKS = Path(__file__).resolve().parent.parent / "data" / "song-links.csv"


def load_links():
    """Every song link, plus the songs you added with `songs.py add`."""
    from songs import load_added
    with LINKS.open(encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    rows += [{"title (from slug)": a["title"], "site": a["site"], "url": a["url"], "status": "Added by you"}
             for a in load_added()]
    return rows


def normalise(text):
    return re.sub(r"[^a-z0-9]", "", text.lower())


def find_matches(rows, query):
    """Songs whose title or slug contains every word of the query."""
    words = [normalise(w) for w in query.split() if normalise(w)]
    if not words:
        return []
    hits = []
    for r in rows:
        haystack = normalise(r["title (from slug)"])
        if all(w in haystack for w in words):
            hits.append(r)
    return hits


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(errors="replace")
    rows = load_links()
    print(f"{len(rows)} songs in data/song-links.csv. Type part of a song name, or 'q' to quit.")
    while True:
        try:
            query = input("\nSong: ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return 0
        if query.lower() in ("q", "quit", "exit", ""):
            return 0
        matches = find_matches(rows, query)
        if not matches:
            print("No song matches that. Try fewer words.")
            continue
        for i, r in enumerate(matches[:20], start=1):
            both = " + loveworldmusic.org" if r.get("loveworldmusic.org", "").startswith("http") else ""
            print(f"  {i}. {r['title (from slug)']}  [{r['site']}{both}]")
        if len(matches) > 20:
            print(f"  ... {len(matches) - 20} more, add words to narrow it down")
        try:
            choice = input("Number to open (Enter to search again): ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return 0
        if not choice:
            continue
        if not choice.isdigit() or not (1 <= int(choice) <= min(len(matches), 20)):
            print("Not a valid number.")
            continue
        row = matches[int(choice) - 1]
        url, other = row["url"], row.get("loveworldmusic.org", "")
        if other.startswith("http"):
            try:
                pick = input("Open on 1) loveworldlyrics.com or 2) loveworldmusic.org? [1]: ").strip()
            except (EOFError, KeyboardInterrupt):
                print()
                return 0
            if pick == "2":
                url = other
        elif other:
            print(f"Also on loveworldmusic.org ({other} there): search for it on that site.")
        print(url)
        webbrowser.open(url)


if __name__ == "__main__":
    sys.exit(main())
