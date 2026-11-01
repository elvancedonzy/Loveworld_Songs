# Loveworld Songs

Tools for learning the Loveworld Singers songs and putting them into ProPresenter:

- a **Claude Code skill** that tracks which songs you are learning and when to review them, and
- a **Chrome extension** that turns a song page on loveworldlyrics.com or loveworldmusic.org into slides for ProPresenter.

Neither one stores lyrics. You read the words on the song sites, which own them.

## Folder structure

```
loveworld-songs/
├── README.md                     this file
├── package.py                    builds a zip to share (see "Sharing")
├── loveworld-songs-skill/        the Claude Code skill
│   ├── README.md                 setup and commands
│   ├── SKILL.md                  instructions for Claude
│   ├── data/                     song index, links, duplicates, your progress
│   └── scripts/
│       ├── install.py            installs the skill for Claude Code
│       ├── songs.py              learning helper (next, mark, review, due, search ...)
│       └── open_song.py          opens a song page in your browser
└── loveworld-lyrics-extension/   the Chrome extension
    ├── README.md                 install, use, and how songs are cleaned up
    ├── extension/                load this folder in Chrome
    ├── reports/                  check of every song page (no lyrics)
    └── tests/                    offline tests (python loveworld-lyrics-extension/tests/run_tests.py)
```

Details: [skill README](loveworld-songs-skill/README.md), [extension README](loveworld-lyrics-extension/README.md), [catalogue check](loveworld-lyrics-extension/reports/SUMMARY.md).

## Set up

Works on Windows, macOS and Linux.

1. **Install Python 3.8 or newer** from [python.org](https://www.python.org/downloads/). On macOS and Linux, type `python3` wherever these steps say `python`. 
   *(Tip for Windows/PowerShell: Using `python -m` ensures scripts run correctly even if your Python `Scripts` directory isn't globally added to your system PATH).*
2. **Install the skill.** Open a terminal in this folder and run:

   ```bash
   python loveworld-songs-skill/scripts/install.py
   ```

   This copies the skill to `~/.claude/skills/loveworld-songs`, where Claude Code finds it.

   If this folder syncs between your computers (OneDrive, Dropbox), add `--link` instead:

   ```bash
   python loveworld-songs-skill/scripts/install.py --link
   ```

   Claude Code then uses this folder directly, so every computer shares one copy of the data and your progress.
3. **Check the skill works:**

   ```bash
   python loveworld-songs-skill/scripts/songs.py check
   ```

   The first line should start with `OK: 1481 rows, all checks pass`.
4. **Install the extension.** In Chrome (or Edge), open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose the `loveworld-lyrics-extension/extension` folder.

## Everyday use

- **Learn:** in Claude Code, ask "what should I learn next?", "mark he's here as learned" or "what's due for review?". Or run the commands yourself:

  ```bash
  python loveworld-songs-skill/scripts/songs.py next 5
  ```

  The [skill README](loveworld-songs-skill/README.md) lists every command.
- **Read a song:** run `python loveworld-songs-skill/scripts/open_song.py`, type part of the name, and pick the match. The song page opens in your browser; if the song is on both sites, it asks which one.
- **Track a new song:** when a song isn't in the list yet, add it by its page link: `python loveworld-songs-skill/scripts/songs.py add https://loveworldlyrics.com/song/<name>`. It fetches nothing and won't add a song that's already tracked.
- **Put a song in ProPresenter:** open the song page, click the extension's ♪ button, check the section labels, and press **Copy for ProPresenter**. In ProPresenter, use **File → Import → Text from clipboard**.

## Sharing

Share the zip, not this folder:

```bash
python package.py
```

This writes `dist/loveworld-songs.zip` with this README, the skill and the extension. It leaves out your learning progress, git history and anything else in the folder, and it stops if a lyric `.txt` file would go in. Lyrics belong to the song sites, so keep them out of anything you share.

## Good to know

- Your learning progress is in `progress.json` inside the installed skill (`~/.claude/skills/loveworld-songs/data/`). Asking Claude and running `songs.py` yourself both use that one file; `songs.py stats` prints its path. With `--link`, that file is this folder's `loveworld-songs-skill/data/progress.json`.
- With a copy install, run the install step again after you change files in this folder, to update Claude Code's copy (your progress is kept). With `--link` there is nothing to update.
- With `--link` on several synced computers, use the skill on one computer at a time, so the sync never has two versions of your progress to merge.
- The song index is a snapshot from 31 October 2026. The extension depends on the song sites' page layout and may need updating if a site changes.