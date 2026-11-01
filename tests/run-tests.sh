#!/bin/sh
# Run the offline song-extraction tests. The work is done by run_tests.py, which
# also runs on Windows: python tests/run_tests.py
cd "$(dirname "$0")"
if command -v python3 >/dev/null 2>&1 && python3 -c "" >/dev/null 2>&1; then
  exec python3 run_tests.py
fi
exec python run_tests.py
