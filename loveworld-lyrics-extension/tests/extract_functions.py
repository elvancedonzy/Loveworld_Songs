"""Pull the song-extraction functions out of extension/content.js so they can be
tested outside the browser.

Usage: python3 extract_functions.py ../extension/content.js > /tmp/funcs.js
"""
import re
import sys

FUNCS = ["fingerprint", "splitIntoSlides", "classifySections", "formatForProPresenter",
         "lyricsFromNodes", "songFileNodes", "parseSongFile", "gitHubSongKind",
         "getLoveworldLyricsText", "lmGroupFor", "lmIsCapsHeader", "parseLoveworldMusicLyrics", "lmTitle"]

src = open(sys.argv[1], encoding='utf-8').read().split('\n')
blocks = []
i = 0
while i < len(src):
    line = src[i]
    if re.match(r'^  const (LM_[A-Z_]+|DEFAULT_MAX_LINES|PP_GROUPS)\b', line):
        j = i
        while not src[j].rstrip().endswith(';'):
            j += 1
        blocks.append(('const', src[i:j + 1]))
        i = j + 1
        continue
    m = re.match(r'^  (async )?function (\w+)\(', line)
    if m and m.group(2) in FUNCS:
        j = i
        while src[j] != '  }':
            j += 1
        blocks.append((m.group(2), src[i:j + 1]))
        i = j + 1
        continue
    i += 1

missing = set(FUNCS) - {name for name, _ in blocks}
if missing:
    sys.exit('missing functions: %s' % ', '.join(sorted(missing)))
print('\n'.join('\n'.join(l[2:] if l.startswith('  ') else l for l in blk) for _, blk in blocks))
