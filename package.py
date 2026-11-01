"""Build a zip of the parts anyone can use: README.md, the skill and the extension.

    python package.py        # writes dist/loveworld-songs.zip

Lyrics are never included: the build stops if any .txt file would go in. Personal
learning progress, git history and everything else in this folder (for example a
songs folder) are left out.
"""

import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "dist" / "loveworld-songs.zip"
INCLUDE = ["README.md", "package.py", "loveworld-songs-skill", "loveworld-lyrics-extension"]
SKIP_DIRS = {".git", "__pycache__"}
SKIP_FILES = {"progress.json", "added-songs.csv", ".DS_Store"}


def files_to_ship():
    for name in INCLUDE:
        path = ROOT / name
        if path.is_file():
            yield path
            continue
        for f in sorted(path.rglob("*")):
            rel = f.relative_to(ROOT)
            if f.is_file() and not SKIP_DIRS.intersection(rel.parts) and f.name not in SKIP_FILES \
                    and f.suffix != ".pyc":
                yield f


def main():
    missing = [n for n in INCLUDE if not (ROOT / n).exists()]
    if missing:
        print("Missing:", ", ".join(missing))
        return 1
    files = list(files_to_ship())
    lyric_files = [f for f in files if f.suffix.lower() == ".txt"]
    if lyric_files:
        print(f"Stopped: {len(lyric_files)} .txt file(s) would be shared, e.g. {lyric_files[0]}.")
        print("Lyrics must not go in the zip. Move them out of these folders first.")
        return 1

    OUT.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
        for f in files:
            info = zipfile.ZipInfo.from_file(f, str(Path("loveworld-songs") / f.relative_to(ROOT)))
            info.create_system = 3  # Unix modes, so run-tests.sh stays executable on macOS/Linux
            info.external_attr = (0o100755 if f.suffix == ".sh" else 0o100644) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, f.read_bytes())
    print(f"Wrote {OUT} ({len(files)} files, {OUT.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
