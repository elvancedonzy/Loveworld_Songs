"""Helper for the loveworld-songs skill.

Works only on the catalogue index and the learning progress. It never reads
or writes lyrics: the catalogue has slugs, URLs, status and slide/section
counts only.

Commands:
  stats                      counts for the whole catalogue
  check                      validate catalogue.csv (exit 1 on any failure)
  search TEXT                find songs whose slug or title contains TEXT (punctuation ignored)
  dupes                      write data/duplicate-review.csv for manual review
  audit                      write data/structure-review.csv: songs whose labels may be wrong
  next [N]                   next N songs not yet learned (default 10)
  mark SLUG STATUS           set status: learning | learned | skip
  review SLUG good|again     spaced-review result for a learned song
  due [DATE]                 songs due for review on DATE (default today)
  show SLUG                  one song's index row and progress
  extra                      18 songs on loveworldmusic.org only (no loveworldlyrics page)
  add LINK ["TITLE"]         track a new song by its page link (fetches nothing);
                             loveworldmusic.org links need a title. --anyway adds it
                             even when a song with the same title is already tracked
"""

import csv
import difflib
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
CATALOGUE = DATA / "catalogue.csv"
# Your own files (progress, songs you added) live with the installed skill when there
# is one, so Claude Code and a copy run from another folder share the same files.
INSTALLED_DATA = Path.home() / ".claude" / "skills" / "loveworld-songs" / "data"
USER_DATA = INSTALLED_DATA if INSTALLED_DATA.is_dir() else DATA
PROGRESS = USER_DATA / "progress.json"
ADDED = USER_DATA / "added-songs.csv"
ADDED_FIELDS = ["slug", "title", "site", "url", "added_on"]
DUPES = DATA / "duplicate-review.csv"
AUDIT = DATA / "structure-review.csv"
EXTRA = DATA / "loveworldmusic-only.csv"
LINKS = DATA / "song-links.csv"

STATUS_OK = "OK"
STATUS_NO_LYRICS = "No lyrics on the site yet"
STATUS_ADDED = "Added by you"
ALLOWED_GROUPS = {
    "Verse", "Pre-Chorus", "Chorus", "Bridge", "Tag", "Ending", "Intro",
    "Outro", "Vamp", "Instrumental", "Misc",
}
ALLOWED_LABEL_SOURCES = {"from site", "auto-detected", ""}
# Days until the next review after each consecutive "good" answer.
REVIEW_INTERVALS = [1, 3, 7, 14, 30, 60]
SMALL_WORDS = {"s", "t", "ll", "re", "ve"}


def load_catalogue():
    with CATALOGUE.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def load_added():
    if not ADDED.exists():
        return []
    with ADDED.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def added_as_rows(added):
    """Songs you added, shaped like catalogue rows (no slide or section data yet)."""
    return [{"#": "", "slug": a["slug"], "url": a["url"], "status": STATUS_ADDED, "section labels": "",
             "slides": "", "one-line slides": "", "groups": "", "note": f"added {a['added_on']}",
             "title": a["title"]} for a in added]


def load_progress():
    if not PROGRESS.exists():
        return {}
    return json.loads(PROGRESS.read_text(encoding="utf-8"))


def save_progress(progress):
    PROGRESS.write_text(json.dumps(progress, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def display_title(slug):
    """Approximate title from the slug (the catalogue has no title column)."""
    words = slug.split("-")
    out = []
    for w in words:
        if out and w in SMALL_WORDS and out[-1] and not out[-1].endswith("'"):
            out[-1] = out[-1] + "'" + w
        else:
            out.append(w.capitalize())
    return " ".join(out)


def base_slug(slug):
    return re.sub(r"-\d+$", "", slug)


def same_shape(a, b):
    """'yes' when both songs have lyrics and the same slide count and groups."""
    both_ok = a["status"] == STATUS_OK and b["status"] == STATUS_OK
    same = a["slides"] == b["slides"] and a["groups"] == b["groups"]
    return "yes" if both_ok and same else "no"


def cmd_stats(rows):
    ok = [r for r in rows if r["status"] == STATUS_OK]
    print(f"Songs in catalogue : {len(rows)}")
    print(f"With lyrics (OK)   : {len(ok)}")
    print(f"No lyrics yet      : {len(rows) - len(ok)}")
    print(f"Labels from site   : {sum(r['section labels'] == 'from site' for r in ok)}")
    print(f"Labels auto-detect : {sum(r['section labels'] == 'auto-detected' for r in ok)}")
    print(f"Songs with a note  : {sum(bool(r['note']) for r in rows)}")
    print(f"Songs you added    : {len(load_added())}")
    progress = load_progress()
    counts = Counter(v.get("status", "learning") for v in progress.values())
    print(f"Progress entries   : {len(progress)} {dict(counts) if counts else ''}")
    print(f"Progress file      : {PROGRESS}")


def cmd_check(rows):
    failures = []

    def fail(msg):
        failures.append(msg)

    if len(rows) != 1481:
        fail(f"expected 1481 rows, found {len(rows)}")
    slugs = [r["slug"] for r in rows]
    if len(set(slugs)) != len(slugs):
        fail("duplicate slugs")
    urls = [r["url"] for r in rows]
    if len(set(urls)) != len(urls):
        fail("duplicate URLs")

    for r in rows:
        s = r["slug"]
        if r["url"] != f"https://loveworldlyrics.com/song/{s}":
            fail(f"{s}: URL does not match slug")
        if r["status"] not in (STATUS_OK, STATUS_NO_LYRICS):
            fail(f"{s}: unknown status {r['status']!r}")
        if r["section labels"] not in ALLOWED_LABEL_SOURCES:
            fail(f"{s}: unknown section-label source {r['section labels']!r}")
        if r["status"] == STATUS_OK:
            slides = int(r["slides"])
            one_line = int(r["one-line slides"])
            if slides < 1:
                fail(f"{s}: OK but 0 slides")
            if one_line > slides:
                fail(f"{s}: more one-line slides than slides")
            if not r["groups"].strip():
                fail(f"{s}: OK but no groups")
            for g in [x.strip() for x in r["groups"].split("/")]:
                if g not in ALLOWED_GROUPS:
                    fail(f"{s}: group {g!r} not an allowed label")
        else:
            if r["slides"] or r["groups"] or r["section labels"]:
                fail(f"{s}: no-lyrics row has slide/group data")

    # The numbers in reports/SUMMARY.md, checked against this file.
    ok = [r for r in rows if r["status"] == STATUS_OK]
    expected = {
        "pages": (len(rows), 1481),
        "lyrics OK": (len(ok), 1271),
        "no lyrics yet": (len(rows) - len(ok), 210),
        "labels from site": (sum(r["section labels"] == "from site" for r in ok), 887),
        "labels auto-detected": (sum(r["section labels"] == "auto-detected" for r in ok), 384),
    }
    for name, (got, want) in expected.items():
        if got != want:
            fail(f"SUMMARY.md says {name} = {want}, catalogue gives {got}")

    if failures:
        print(f"FAIL: {len(failures)} problem(s)")
        for msg in failures[:50]:
            print("  -", msg)
        return 1
    print(f"OK: {len(rows)} rows, all checks pass, numbers match SUMMARY.md")
    return 0


def search_key(text):
    """Letters and digits only, so "he's here", "he-s-here" and "hes here" all match."""
    return re.sub(r"[^a-z0-9]", "", text.lower())


def cmd_search(rows, text):
    needle = search_key(text)
    if not needle:
        print("Search needs at least one letter or number.")
        return
    hits = [r for r in rows if needle in search_key(r["slug"])
            or needle in search_key(r.get("title") or display_title(r["slug"]))]
    if not hits:
        print(f"No song matches {text!r}.")
        return
    progress = load_progress()
    for r in hits[:40]:
        p = progress.get(r["slug"], {}).get("status", "-")
        print(f"{r['slug']:55} {r['status'][:9]:9} slides={r['slides']:>3} progress={p}")
    if len(hits) > 40:
        print(f"... {len(hits) - 40} more")


def dupe_rows(rows):
    """Clusters: same base title (slug minus -N) or near-identical slugs."""
    by_base = defaultdict(list)
    for r in rows:
        by_base[base_slug(r["slug"])].append(r)
    exact = {r["slug"] for r in rows}

    out = []
    cluster_id = 0
    for base, members in sorted(by_base.items()):
        # Only a suffixed slug whose bare title also exists counts as a copy.
        # Without that rule, medley-1 .. medley-24 would merge into one cluster.
        if len(members) < 2 or base not in exact:
            continue
        cluster_id += 1
        all_same = all(same_shape(members[0], m) == "yes" for m in members[1:])
        for m in members:
            out.append({
                "cluster": f"C{cluster_id:03d}",
                "reason": "same title (slug suffix)",
                "slug": m["slug"],
                "status": m["status"],
                "slides": m["slides"],
                "groups": m["groups"],
                "same_shape_as_cluster": "yes" if all_same else "no",
                "note": m["note"],
            })

    # Near-identical slugs with different suffixes, e.g. "...in-my-mouth" vs "...in-our-mouth".
    slugs = [r["slug"] for r in rows]
    near_pairs = []
    for i in range(len(slugs)):
        a = base_slug(slugs[i])
        for j in range(i + 1, len(slugs)):
            b = base_slug(slugs[j])
            if a == b or abs(len(a) - len(b)) > 4:
                continue
            sm = difflib.SequenceMatcher(None, a, b)
            if sm.quick_ratio() < 0.92:
                continue
            if sm.ratio() >= 0.92:
                near_pairs.append((slugs[i], slugs[j]))
    row_by_slug = {r["slug"]: r for r in rows}
    for a, b in near_pairs:
        cluster_id += 1
        cid = f"N{cluster_id:03d}"
        for s in (a, b):
            m = row_by_slug[s]
            out.append({
                "cluster": cid,
                "reason": "near-identical title",
                "slug": s,
                "status": m["status"],
                "slides": m["slides"],
                "groups": m["groups"],
                "same_shape_as_cluster": same_shape(row_by_slug[a], row_by_slug[b]),
                "note": m["note"],
            })
    return out


def cmd_dupes(rows):
    out = dupe_rows(rows)
    fields = ["cluster", "reason", "slug", "status", "slides", "groups", "same_shape_as_cluster", "note"]
    with DUPES.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(out)
    clusters = {r["cluster"] for r in out}
    same_title = {r["cluster"] for r in out if r["reason"].startswith("same title")}
    print(f"Wrote {DUPES}")
    print(f"Clusters: {len(clusters)} ({len(same_title)} same-title, {len(clusters) - len(same_title)} near-identical)")
    print(f"Rows in clusters: {len(out)}")
    identical = {r["cluster"] for r in out if r["same_shape_as_cluster"] == "yes"}
    print(f"Clusters where every row has the same slide count and groups: {len(identical)}")


MEDLEY_WORDS = ("medley", "instrumental", "orchestra", "compilation")


def audit_flags(r):
    """Reasons a song's section labels may be wrong, from index data only."""
    if r["status"] != STATUS_OK:
        return []
    groups = [g.strip() for g in r["groups"].split("/")]
    slides, one_line = int(r["slides"]), int(r["one-line slides"])
    flags = []
    if groups == ["Verse"]:
        flags.append("everything labelled Verse")
    elif "Chorus" not in groups:
        flags.append("no chorus found")
    if "Misc" in groups:
        flags.append("has Misc section")
    if slides >= 6 and one_line / slides > 0.5:
        flags.append("over half the slides are one line")
    if slides > 60 and not any(w in r["slug"] for w in MEDLEY_WORDS):
        flags.append("very long for one song")
    if slides <= 2:
        flags.append("only 1-2 slides")
    return flags


def cmd_audit(rows):
    out = []
    for r in rows:
        flags = audit_flags(r)
        if flags:
            out.append({"slug": r["slug"], "url": r["url"], "section labels": r["section labels"],
                        "slides": r["slides"], "groups": r["groups"], "flags": "; ".join(flags), "note": r["note"]})
    with AUDIT.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["slug", "url", "section labels", "slides", "groups", "flags", "note"])
        w.writeheader()
        w.writerows(out)
    counts = Counter(flag for r in out for flag in r["flags"].split("; "))
    print(f"Wrote {AUDIT}")
    for flag, n in counts.most_common():
        print(f"  {flag:36} {n}")
    print(f"{len(out)} songs flagged. Flags are warning signs, not confirmed mistakes:"
          " check the song page with the extension's panel.")


def cmd_next(rows, n):
    progress = load_progress()
    todo = [r for r in rows if r["status"] in (STATUS_OK, STATUS_ADDED)
            and progress.get(r["slug"], {}).get("status") not in ("learned", "skip", "learning")]
    for r in todo[:n]:
        print(f"{r['slug']:55} slides={r['slides']:>3} groups={r['groups']}")
    print(f"({len(todo)} songs left to start)")


def cmd_mark(rows, slug, status):
    if status not in ("learning", "learned", "skip"):
        print("status must be learning, learned or skip")
        return 2
    if slug not in {r["slug"] for r in rows}:
        print(f"Unknown slug {slug!r}. Use search to find it.")
        return 2
    progress = load_progress()
    previous = progress.get(slug, {})
    entry = dict(previous)
    entry["status"] = status
    entry.setdefault("reviews", 0)
    # Start a fresh schedule when a song becomes learned, so an old
    # next_review from a skipped or in-progress entry can't make it due at once.
    if status == "learned" and previous.get("status") != "learned":
        today = date.today()
        entry["reviews"] = 0
        entry["learned_on"] = today.isoformat()
        entry["next_review"] = (today + timedelta(days=REVIEW_INTERVALS[0])).isoformat()
    progress[slug] = entry
    save_progress(progress)
    print(f"{slug}: {status}")
    return 0


def cmd_review(rows, slug, result):
    if result not in ("good", "again"):
        print("result must be good or again")
        return 2
    progress = load_progress()
    entry = progress.get(slug)
    if not entry or entry.get("status") != "learned":
        print(f"{slug} is not marked learned. Run mark first.")
        return 2
    today = date.today()
    if result == "good":
        entry["reviews"] = entry.get("reviews", 0) + 1
        step = min(entry["reviews"], len(REVIEW_INTERVALS) - 1)
        entry["next_review"] = (today + timedelta(days=REVIEW_INTERVALS[step])).isoformat()
    else:
        entry["reviews"] = 0
        entry["next_review"] = (today + timedelta(days=REVIEW_INTERVALS[0])).isoformat()
    entry["last_review"] = today.isoformat()
    progress[slug] = entry
    save_progress(progress)
    print(f"{slug}: next review {entry['next_review']}")
    return 0


def cmd_due(progress_day):
    progress = load_progress()
    due = sorted((v.get("next_review", ""), k) for k, v in progress.items()
                 if v.get("status") == "learned" and v.get("next_review", "") <= progress_day)
    for when, slug in due:
        print(f"{slug:55} due {when}")
    print(f"({len(due)} due on or before {progress_day})")


def cmd_extra():
    """Songs listed on loveworldmusic.org with no loveworldlyrics.com page in the catalogue."""
    with EXTRA.open(encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    for r in rows:
        print(f"{r['title']:45} {r['url']}")
    print(f"({len(rows)} songs; lyrics are on loveworldmusic.org only)")
    return 0


LYRICS_SONG_RE = re.compile(r"^https?://(?:www\.)?loveworldlyrics\.com/song/([a-z0-9-]+)/?(?:[?#].*)?$", re.I)
MUSIC_SONG_RE = re.compile(r"^https?://(?:www\.)?loveworldmusic\.org/loveworldlyrics\?(?:.*&)?song=([0-9a-f-]{36})", re.I)


def parse_song_link(link):
    """(site, slug or None, clean url) for a song page link, or None if it isn't one."""
    m = LYRICS_SONG_RE.match(link.strip())
    if m:
        slug = m.group(1).lower()
        return "loveworldlyrics.com", slug, f"https://loveworldlyrics.com/song/{slug}"
    m = MUSIC_SONG_RE.match(link.strip())
    if m:
        return "loveworldmusic.org", None, f"https://loveworldmusic.org/loveworldlyrics?view=detail&song={m.group(1).lower()}"
    return None


def cmd_add(rows, link, title=None, anyway=False):
    """Track a new song by its page link. Fetches nothing: only the link and title are stored."""
    parsed = parse_song_link(link)
    if not parsed:
        print("That isn't a song page link. Use a link like https://loveworldlyrics.com/song/<name>")
        print("or https://loveworldmusic.org/loveworldlyrics?view=detail&song=<id>.")
        return 2
    site, slug, url = parsed
    if site == "loveworldmusic.org" and not title:
        print('loveworldmusic.org links don\'t contain the song name. Add it: add LINK "Song Title"')
        return 2
    if title is not None and not search_key(title):
        print("The title needs at least one letter or number.")
        return 2
    if slug is None:
        slug = "lwm-" + (re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-") or "song")
    title = title or display_title(slug)

    with LINKS.open(encoding="utf-8", newline="") as f:
        link_rows = list(csv.DictReader(f))
    known = {r["url"].lower(): r["slug"] for r in rows}
    known.update({r["url"].lower(): r["title (from slug)"] for r in link_rows})
    # The same song's loveworldmusic.org page, matched in song-links.csv.
    known.update({r["loveworldmusic.org"].lower(): r["title (from slug)"] for r in link_rows
                  if r.get("loveworldmusic.org", "").startswith("http")})
    if url.lower() in known:
        print(f"Already tracked: {known[url.lower()]}")
        return 0
    same_title = [r["slug"] for r in rows
                  if search_key(r.get("title") or display_title(r["slug"])) == search_key(title)]
    same_title += [r["title (from slug)"] for r in link_rows
                   if r["site"] == "loveworldmusic.org" and search_key(r["title (from slug)"]) == search_key(title)]
    if same_title and not anyway:
        print(f"A song with this title is already tracked: {', '.join(same_title[:3])}.")
        print("If this is a different song or version, run the same command with --anyway.")
        return 1

    taken = {r["slug"] for r in rows}
    base, n = slug, 2
    while slug in taken:
        slug, n = f"{base}-{n}", n + 1

    new_file = not ADDED.exists()
    with ADDED.open("a", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=ADDED_FIELDS)
        if new_file:
            w.writeheader()
        w.writerow({"slug": slug, "title": title, "site": site, "url": url, "added_on": date.today().isoformat()})
    print(f"Added {slug} ({title}). It now shows in search, next, mark and open_song.py.")
    print(f"Saved in {ADDED}")
    return 0


def cmd_show(rows, slug):
    row = {r["slug"]: r for r in rows}.get(slug)
    if not row:
        print(f"Unknown slug {slug!r}.")
        return 2
    print(json.dumps(row, indent=2, ensure_ascii=False))
    print("progress:", json.dumps(load_progress().get(slug, {}), ensure_ascii=False))
    return 0


def main(argv):
    # Never crash on a character the terminal can't show (e.g. an em dash on cp437).
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(errors="replace")
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    rows = load_catalogue()                   # the checked catalogue only
    songs = rows + added_as_rows(load_added())  # plus the songs you added
    cmd, rest = argv[0], argv[1:]
    if cmd == "stats":
        cmd_stats(rows)
    elif cmd == "check":
        return cmd_check(rows)
    elif cmd == "search" and rest:
        cmd_search(songs, " ".join(rest))
    elif cmd == "dupes":
        cmd_dupes(rows)
    elif cmd == "audit":
        cmd_audit(rows)
    elif cmd == "next":
        if rest and not rest[0].isdigit():
            print("next takes a number, for example: next 5")
            return 2
        cmd_next(songs, int(rest[0]) if rest else 10)
    elif cmd == "mark" and len(rest) == 2:
        return cmd_mark(songs, rest[0], rest[1])
    elif cmd == "review" and len(rest) == 2:
        return cmd_review(songs, rest[0], rest[1])
    elif cmd == "due":
        cmd_due(rest[0] if rest else date.today().isoformat())
    elif cmd == "show" and rest:
        return cmd_show(songs, rest[0])
    elif cmd == "extra":
        return cmd_extra()
    elif cmd == "add" and 1 <= len([a for a in rest if a != "--anyway"]) <= 2:
        args = [a for a in rest if a != "--anyway"]
        return cmd_add(songs, args[0], args[1] if len(args) > 1 else None, "--anyway" in rest)
    else:
        print(__doc__)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
