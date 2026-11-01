# Loveworld songs: learning helper

A Claude Code skill that keeps a song index and your learning progress, with a
spaced-review schedule. It holds no lyrics: to read a song, it opens the song's
page on the site. See [SKILL.md](SKILL.md) for what Claude does with it.

## Set up

You need Python 3.8 or newer. The scripts use only the standard library, so there
is nothing to install with pip. Windows, macOS and Linux all work.

1. Open a terminal in this folder and run:

   ```bash
   python scripts/install.py
   ```

   On macOS and Linux, use `python3` if `python` is not found. This copies the
   skill to `~/.claude/skills/loveworld-songs` (on Windows,
   `%USERPROFILE%\.claude\skills\loveworld-songs`), where Claude Code loads it.
   Your learning progress is kept if you run it again. It refuses to copy if any
   `.txt` file is inside this folder, because the skill must not hold lyrics.

   If this folder syncs between your computers, run `python scripts/install.py --link`
   instead. Claude Code then uses this folder directly, so there is one copy of the
   data and your progress, shared by every computer.

2. Check that it works:

   ```bash
   python scripts/songs.py check
   ```

   The first line should start with `OK: 1481 rows, all checks pass`.

## Everyday commands

Run these from this folder as `python scripts/songs.py <command>`, or just ask
Claude ("what should I learn next?"). Both use the same progress file once the
skill is installed: `stats` prints where it is.

| Command | What it does |
|---|---|
| `stats` | Counts of songs and progress |
| `next 5` | Next five songs to learn |
| `search "he's here"` | Find a song by part of its name (punctuation is ignored, so `search hes here` works too) |
| `show SLUG` | One song's details and progress |
| `mark SLUG learning` / `learned` / `skip` | Set a song's progress |
| `due` | Songs due for review today |
| `review SLUG good` / `again` | Record a review |
| `dupes` | Rebuild the duplicate-review list |
| `audit` | List songs whose section labels may be wrong, with the reason |
| `add LINK` | Track a new song by its page link (loveworldmusic.org links: `add LINK "Song Title"`) |
| `extra` | Songs listed only on loveworldmusic.org |

A SLUG is the song's short name, as shown by `search` (for example `he-s-here`).

To open a song's page in your browser, run `python scripts/open_song.py`, type
part of the name and pick the match. If the song is on loveworldmusic.org too, it
asks which site to open.

## Folder contents

- `SKILL.md`: instructions for Claude
- `data/catalogue.csv`: the 1,481 songs on loveworldlyrics.com, with status and section structure
- `data/song-links.csv`: every song link (1,499, including 18 on loveworldmusic.org only), plus each song's loveworldmusic.org link where there's one clear match
- `data/added-songs.csv`: songs you added with `add`, created the first time you add one
- `data/loveworldmusic-only.csv`: the 18 loveworldmusic.org-only songs
- `data/duplicate-review.csv`: likely duplicates, rebuilt by `dupes`. Mark a duplicate you won't learn with `mark SLUG skip`
- `data/structure-review.csv`: songs whose section labels may be wrong, rebuilt by `audit`
- `data/progress.json`: your learning progress, created the first time you mark a song. After installing, it lives in the installed copy (`~/.claude/skills/loveworld-songs/data/`)
- `scripts/songs.py`: the learning helper
- `scripts/open_song.py`: opens a song page in your browser
- `scripts/install.py`: copies (or with `--link`, links) the skill into Claude Code's skills folder
