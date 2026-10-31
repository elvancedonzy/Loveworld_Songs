#!/bin/sh
# Run the offline song-extraction tests on macOS (uses the built-in JavaScriptCore).
set -e
cd "$(dirname "$0")"
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
TMP="${TMPDIR:-/tmp}/lw-song-tests.js"
python3 extract_functions.py ../extension/content.js > "$TMP.funcs"
cat dom-shim.js "$TMP.funcs" song-cases.js > "$TMP"
"$JSC" "$TMP"
