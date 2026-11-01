"""Install this skill into Claude Code's skills folder, so Claude Code loads it.

    python scripts/install.py                 # copies to ~/.claude/skills/loveworld-songs
    python scripts/install.py --link          # links to this folder instead of copying
    python scripts/install.py --dest FOLDER   # installs somewhere else, e.g. to test

Works on Windows, macOS and Linux.

A copy is independent of this folder. It copies everything except your own
files (data/progress.json and data/added-songs.csv), which are only copied when
the destination has none, so they are never overwritten. Run it again after
changing files here.

A link (--link) makes Claude Code use this folder directly, so there is only one
copy of the data and your progress. Use it when this folder syncs between your
computers (OneDrive, Dropbox): every computer then shares the same files.

Either way it stops if any .txt file is inside the skill folder, because the
skill must never hold lyrics.
"""

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
DEFAULT_DEST = Path.home() / ".claude" / "skills" / "loveworld-songs"
# Your own files: kept at the destination, copied only when it has none yet.
USER_FILES = ("progress.json", "added-songs.csv")
IGNORE = shutil.ignore_patterns(*USER_FILES, "__pycache__", "*.pyc")


def same_path(a, b):
    return os.path.normcase(str(a)) == os.path.normcase(str(b))


def make_link(dest):
    """A junction on Windows (needs no admin rights), a symlink elsewhere."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    if os.name == "nt":
        try:
            import _winapi
            _winapi.CreateJunction(str(SKILL), str(dest))
        except (ImportError, AttributeError):
            subprocess.run(["cmd", "/c", "mklink", "/J", str(dest), str(SKILL)],
                           check=True, stdout=subprocess.DEVNULL)
    else:
        os.symlink(SKILL, dest, target_is_directory=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Install the loveworld-songs skill for Claude Code.")
    parser.add_argument("--dest", type=Path, default=DEFAULT_DEST,
                        help=f"where to install (default: {DEFAULT_DEST})")
    parser.add_argument("--link", action="store_true",
                        help="link to this folder instead of copying it (for a folder synced between computers)")
    args = parser.parse_args(argv)
    dest = args.dest.expanduser().absolute()

    lyric_files = sorted(f for f in SKILL.rglob("*") if f.is_file() and f.suffix.lower() == ".txt")
    if lyric_files:
        print(f"Stopped: {len(lyric_files)} .txt file(s) found inside the skill folder, e.g. {lyric_files[0]}.")
        print("The skill must not hold lyrics. Move them out, then run this again.")
        return 1

    if dest.exists():
        real = dest.resolve()
        if same_path(real, SKILL):
            print(f"{dest} is already this skill. Nothing to do.")
            return 0
        if args.link:
            print(f"{dest} already exists. Move or delete it first, then run this again to link.")
            print(f"(Copy its data/{' and data/'.join(USER_FILES)} into {SKILL / 'data'} first,"
                  " to keep your progress and the songs you added.)")
            return 1
        # Only the destination itself being a link matters; a linked parent
        # folder (e.g. ~/.claude kept in a dotfiles repo) is fine.
        if not same_path(real, dest.parent.resolve() / dest.name):
            print(f"{dest} is a link to {real}. Nothing copied; remove the link first to install a copy.")
            return 1

    if args.link:
        make_link(dest)
        print(f"Linked {dest} -> {SKILL}")
        print("Claude Code now uses this folder directly, including its progress file.")
        print(f'Check it with: python "{dest / "scripts" / "songs.py"}" check')
        return 0

    shutil.copytree(SKILL, dest, ignore=IGNORE, dirs_exist_ok=True)

    for name in USER_FILES:
        src_file, dest_file = SKILL / "data" / name, dest / "data" / name
        if dest_file.exists():
            print(f"Kept your {name} already at {dest_file}.")
        elif src_file.exists():
            shutil.copy2(src_file, dest_file)
            print(f"Copied your {name}.")

    print(f"Installed to {dest}")
    print(f'Check it with: python "{dest / "scripts" / "songs.py"}" check')
    return 0


if __name__ == "__main__":
    if sys.version_info < (3, 8):
        sys.exit("Python 3.8 or newer is needed.")
    sys.exit(main())
