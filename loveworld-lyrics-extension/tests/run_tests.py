"""Run the offline song-extraction tests against extension/content.js.

    python tests/run_tests.py

Works on Windows, macOS and Linux with Node.js (https://nodejs.org). On macOS
without Node it falls back to the built-in JavaScriptCore. Exits 1 if any check fails.
"""

import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
CONTENT_JS = HERE.parent / "extension" / "content.js"
JSC = "/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc"


def main():
    extract = subprocess.run(
        [sys.executable, str(HERE / "extract_functions.py"), str(CONTENT_JS)],
        capture_output=True, text=True, encoding="utf-8",
        env={**os.environ, "PYTHONUTF8": "1"},
    )
    if extract.returncode != 0:
        sys.stderr.write(extract.stderr)  # e.g. "missing functions: ..."
        return 1
    funcs = extract.stdout
    parts = [(HERE / name).read_text(encoding="utf-8") for name in ("dom-shim.js",)]
    parts += [funcs, (HERE / "song-cases.js").read_text(encoding="utf-8")]

    node = shutil.which("node")
    if node:
        runner = [node]
        parts.insert(0, "var print = console.log;")  # the cases print with jsc's print()
    elif os.path.exists(JSC):
        runner = [JSC]
    else:
        print("Needs Node.js (https://nodejs.org), or macOS.", file=sys.stderr)
        return 1

    with tempfile.TemporaryDirectory() as tmp:
        script = Path(tmp) / "lw-song-tests.js"
        script.write_text("\n".join(parts), encoding="utf-8")
        result = subprocess.run(runner + [str(script)], capture_output=True, text=True, encoding="utf-8")
    sys.stdout.write(result.stdout)
    sys.stderr.write(result.stderr)

    # song-cases.js ends with "N passed, M failed" but always exits 0, so read the summary.
    summary = re.search(r"(\d+) passed, (\d+) failed", result.stdout)
    if result.returncode != 0 or not summary or summary.group(2) != "0":
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
