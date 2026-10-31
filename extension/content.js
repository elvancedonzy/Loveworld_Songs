(function () {
  'use strict';

  // ================================================================
  //  CONSTANTS
  // ================================================================

  const PP_GROUPS = [
    'Verse 1','Verse 2','Verse 3','Verse 4','Verse 5','Verse 6','Verse 7','Verse 8',
    'Chorus','Pre-Chorus','Bridge','Tag','Ending','Intro','Outro','Vamp','Instrumental','Misc'
  ];
  const DEFAULT_MAX_LINES = 4;

  // ================================================================
  //  UTILITIES
  // ================================================================

  /** Normalize a stanza for fingerprint comparison. */
  function fingerprint(s) {
    return s.toLowerCase()
      .replace(/[‘’`]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[^\p{L}\p{N}\s']/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Split a long text block into slide-sized chunks of ≤ maxLines. */
  function splitIntoSlides(text, maxLines) {
    const lines = text.split('\n');
    if (lines.length <= maxLines) return [text];
    const slides = [];
    for (let i = 0; i < lines.length; i += maxLines) {
      slides.push(lines.slice(i, i + maxLines).join('\n'));
    }
    return slides;
  }

  // ================================================================
  //  SONG SECTION CLASSIFIER
  // ================================================================

  function classifySections(stanzas) {
    if (!stanzas || !stanzas.length) return [];

    const fps = stanzas.map(fingerprint);
    const counts = {};
    fps.forEach(f => { counts[f] = (counts[f] || 0) + 1; });

    // Find the most-repeated stanza (chorus candidate, needs ≥2 occurrences)
    let chorusFp = null, chorusN = 0;
    for (const [f, c] of Object.entries(counts)) {
      if (c >= 2 && c > chorusN) { chorusFp = f; chorusN = c; }
    }

    // Chorus partner: the fp that most often immediately follows the chorus fp
    let partnerFp = null;
    if (chorusFp) {
      const follows = {};
      for (let i = 0; i < fps.length - 1; i++) {
        if (fps[i] === chorusFp) {
          const nf = fps[i + 1];
          if (nf !== chorusFp) follows[nf] = (follows[nf] || 0) + 1;
        }
      }
      let best = null, bc = 0;
      for (const [f, c] of Object.entries(follows)) {
        if (c >= 2 && counts[f] >= 2 && c > bc) { best = f; bc = c; }
      }
      partnerFp = best;
    }

    // Label chorus / partner
    const labels = fps.map(f => {
      if (chorusFp && f === chorusFp) return 'CHORUS_A';
      if (partnerFp && f === partnerFp) return 'CHORUS_B';
      return null;
    });

    // Pre-chorus heuristic: unlabeled stanza immediately before CHORUS_A,
    // BUT only if it's short (≤3 lines) or its fingerprint appears ≥2× in
    // pre-chorus position.  Without this guard, simple Verse-Chorus songs
    // mislabel every verse as Pre-Chorus.
    const preChorusPositions = [];
    for (let i = 1; i < labels.length; i++) {
      if (labels[i] === 'CHORUS_A' && labels[i - 1] === null) {
        preChorusPositions.push(i - 1);
      }
    }
    const pcFpCounts = {};
    for (const idx of preChorusPositions) {
      const f = fps[idx];
      pcFpCounts[f] = (pcFpCounts[f] || 0) + 1;
    }
    const preChorusIdxs = new Set();
    for (const idx of preChorusPositions) {
      const f = fps[idx];
      const lines = stanzas[idx].split('\n').length;
      if (pcFpCounts[f] >= 2 || lines <= 3) {
        preChorusIdxs.add(idx);
      }
    }

    // Tag heuristic: final stanza, ≤2 lines, echoes chorus words
    const chorusWords = chorusFp
      ? new Set(chorusFp.split(' ').filter(w => w.length > 3))
      : new Set();

    // Verse numbering. A stanza that repeats an earlier verse reuses that verse's label.
    // ProPresenter only knows Verse 1–8, so if one-number-per-stanza would go past 8
    // (long unlabeled songs), a verse becomes the whole run of stanzas between choruses.
    const assign = (mergeRuns) => {
      let verseN = 0, prev = null;
      const verseOf = {};
      return stanzas.map((text, i) => {
        let group;
        if (labels[i] === 'CHORUS_A' || labels[i] === 'CHORUS_B') {
          group = 'Chorus';
        } else if (preChorusIdxs.has(i)) {
          group = 'Pre-Chorus';
        } else {
          // Tag detection — fingerprint candidate words so punctuation doesn't
          // prevent matches against the cleaned chorusWords set
          const isLast = i === stanzas.length - 1;
          const lineCount = text.split('\n').length;
          const tagWords = fingerprint(text).split(' ').filter(w => w.length > 3);
          const overlap = tagWords.filter(w => chorusWords.has(w)).length / Math.max(1, tagWords.length);
          if (isLast && lineCount <= 2 && overlap > 0.25) {
            group = 'Tag';
          } else if (verseOf[fps[i]]) {
            group = verseOf[fps[i]];
          } else if (mergeRuns && prev && prev.startsWith('Verse ')) {
            group = verseOf[fps[i]] = prev;
          } else {
            verseN = Math.min(verseN + 1, 8);
            group = verseOf[fps[i]] = `Verse ${verseN}`;
          }
        }
        prev = group;
        return { group, text };
      });
    };
    const perStanza = assign(false);
    const distinctVerses = new Set(perStanza.filter(s => s.group.startsWith('Verse ')).map(s => fingerprint(s.text)));
    return distinctVerses.size > 8 ? assign(true) : perStanza;
  }

  // ================================================================
  //  PROPRESENTER TEXT FORMATTER
  // ================================================================

  /**
   * sections: [{group: string, text: string}, ...]
   * opts: { maxLines: number, mode: 'song'|'ror'|'prayer' }
   *
   * ProPresenter "Import → Text from clipboard" format:
   *   - Slides delimited by Line Break, 2 delimiters per slide (= blank line)
   *   - Recognized group labels on their own line: Verse 1, Chorus, Pre-Chorus,
   *     Bridge, Tag, Ending, Intro, Outro, Vamp
   *   - Lines within a slide = single newlines
   */
  function formatForProPresenter(sections, opts = {}) {
    const maxLines = opts.maxLines || DEFAULT_MAX_LINES;
    const mode = opts.mode || 'song';
    const chunks = [];
    let prevGroup = null;

    for (const sec of sections) {
      const slides = splitIntoSlides(sec.text, maxLines);

      for (let j = 0; j < slides.length; j++) {
        const slideText = slides[j].trim();
        if (!slideText) continue;

        // For songs: emit a group label when the group changes
        if (mode === 'song' && sec.group !== prevGroup) {
          chunks.push(sec.group + '\n' + slideText);
        } else {
          chunks.push(slideText);
        }
        prevGroup = sec.group;
      }
    }
    return chunks.join('\n\n');
  }

  // ================================================================
  //  BIBLE VERSE HANDLER
  // ================================================================

  /** Parse a "Further Study" string into individual references.
   *  e.g. "Joshua 1:8; Psalm 119:105; James 1:22-25" → ['Joshua 1:8','Psalm 119:105','James 1:22-25']
   */
  function parseReferences(refStr) {
    return refStr
      .split(/;\s*/)
      .map(r => r.replace(/\(.*?\)/g, '').trim())
      .filter(Boolean);
  }

  /** Fetch a single Bible reference via background service worker.
   *  translation defaults to 'kjv'. If the requested translation isn't supported
   *  by bible-api.com, background.js silently falls back to KJV (see _actualTranslation).
   *  Returns {reference, verses, text, _requestedTranslation, _actualTranslation}. */
  function fetchBible(reference, translation) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'fetchBible', reference, translation: translation || 'kjv' },
        resp => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (!resp || !resp.ok) return reject(new Error(resp?.error || 'Unknown error'));
          resolve(resp.data);
        }
      );
    });
  }

  // ================================================================
  //  SITE EXTRACTORS
  // ================================================================

  /** Read the lyrics text from the loveworld* SPA DOM across layout variants:
   *  - .lyrics-scroll : newer loveworldlyrics+ — a scroll container holding section-label
   *                     <p>s (uppercase/font-semibold) + lyric <p class="whitespace-pre-line">.
   *                     Many songs carry the lyrics twice (per-line + grouped) or the whole song
   *                     2–3×; we rebuild from the children, keep one copy, and join per-line
   *                     <p>s into blocks.
   *  - a single .whitespace-pre-line div holding the whole song (older layout).
   *  - multiple .whitespace-pre-line with no wrapper → join them.
   *  Returns '' if nothing substantial is found. */
  function getLoveworldLyricsText() {
    const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
    const scroll = document.querySelector('.lyrics-scroll');
    if (scroll && scroll.children.length) {
      const isLabel = (el) => /font-semibold/.test(el.className || '') && /uppercase/.test(el.className || '')
        && !/whitespace-pre-line/.test(el.className || '');
      const nodes = [...scroll.children]
        .map(c => ({ txt: (c.innerText || '').trim(), label: isLabel(c), multi: (c.textContent || '').includes('\n') }))
        .filter(n => n.txt);

      // Many songs render the lyrics TWICE: one copy with a <p> per line and one with stanzas
      // grouped into multi-line <p>s — in EITHER order, and either copy may or may not carry the
      // section-label <p>s. Keep the copy with more labels (tie → the more grouped copy, which
      // makes better slides), and drop the other only when it is the same song: ≥80% of its
      // words appear in the kept copy AND it contains ≥60% of the kept copy's distinct words
      // (so repeated choruses at the end are never mistaken for a second copy, and genuinely
      // different lyrics are never discarded).
      const lyricIdx = nodes.map((n, i) => (!n.label ? i : -1)).filter(i => i >= 0);
      const words = (arr) => arr.flatMap(n => norm(n.txt).split(' ').filter(Boolean));
      const coveredBy = (drop, kept) => {
        const s = new Set(words(kept)); const w = words(drop);
        return w.length ? w.filter(x => s.has(x)).length / w.length : 0;
      };
      const distinctCoveredBy = (kept, drop) => {
        const k = [...new Set(words(kept))]; const s = new Set(words(drop));
        return k.length ? k.filter(x => s.has(x)).length / k.length : 0;
      };
      const labels = (arr) => arr.filter(n => n.label).length;
      const multiFrac = (arr) => {
        const l = arr.filter(n => !n.label);
        return l.length ? l.filter(n => n.multi).length / l.length : 0;
      };
      // strict: the dropped copy may add (almost) no word the kept copy lacks — used when the two
      // copies look alike, where a repetitive song's tail could otherwise pass as a replay.
      const dedupeAt = (cutAt, strict = false) => {
        while (cutAt > 0 && nodes[cutAt - 1].label) cutAt--;  // labels right before copy 2 belong to it
        const A = nodes.slice(0, cutAt), B = nodes.slice(cutAt);
        const preferA = labels(A) > labels(B) || (labels(A) === labels(B) && multiFrac(A) >= multiFrac(B));
        const options = preferA
          ? [[A, B, [0, cutAt]], [B, A, [cutAt, nodes.length]]]
          : [[B, A, [cutAt, nodes.length]], [A, B, [0, cutAt]]];
        for (const [kept, drop, range] of options) {
          const ok = strict
            ? distinctCoveredBy(drop, kept) >= 0.98 && distinctCoveredBy(kept, drop) >= 0.90
            : coveredBy(drop, kept) >= 0.80 && distinctCoveredBy(kept, drop) >= 0.60;
          if (ok) return range;
        }
        return null;
      };

      let keep = null;
      if (lyricIdx.length >= 4) {
        // (1) Clean split: every lyric <p> of one rendering, then every lyric <p> of the other.
        const firstMulti = nodes[lyricIdx[0]].multi;
        const b = lyricIdx.findIndex(i => nodes[i].multi !== firstMulti);
        if (b >= 2 && lyricIdx.length - b >= 2 && lyricIdx.slice(b).every(i => nodes[i].multi !== firstMulti)) {
          keep = dedupeAt(lyricIdx[b]);
        }
        // (2) Restart split: copy 2 starts where the song's opening line comes back. When the two
        // halves are clearly different renderings — one mostly per-line and the other mostly
        // grouped (e.g. a per-line copy with a few grouped "Hallelujah" blocks, then a grouped
        // copy with inline "Verse 1" labels), or one with label <p>s and the other with none
        // (a labeled copy followed by an unlabeled replay in the sung order) — the usual
        // thresholds apply. Otherwise the rest must be a near-total replay of the whole song
        // (strict), so a chorus that opens the song and comes back later is never cut.
        if (!keep) {
          const firstLine = (t) => norm(t.split('\n').map(x => x.trim())
            .find(x => x && !LM_SECTION_STRICT_RE.test(x) && !LM_PERFORMER_RE.test(x) && !LM_CUE_RE.test(x)) || '');
          const open = firstLine(nodes[lyricIdx[0]].txt);
          for (let k = 2; !keep && open.length >= 8 && k <= lyricIdx.length - 2; k++) {
            const fl = firstLine(nodes[lyricIdx[k]].txt);
            if (fl.length < 8 || !(fl.startsWith(open) || open.startsWith(fl))) continue;
            let cutAt = lyricIdx[k];
            while (cutAt > 0 && nodes[cutAt - 1].label) cutAt--;
            const A = nodes.slice(0, cutAt), B = nodes.slice(cutAt);
            const otherRendering = Math.abs(multiFrac(A) - multiFrac(B)) >= 0.5;
            const otherLabeling = Math.min(labels(A), labels(B)) === 0 && Math.max(labels(A), labels(B)) >= 2;
            keep = dedupeAt(cutAt, !otherRendering && !otherLabeling);
          }
        }
      }
      let kept = keep ? nodes.slice(keep[0], keep[1]) : nodes;

      // (3) The whole song printed 2–3× in the same rendering: keep one pass.
      const ly = kept.map((n, i) => (!n.label ? i : -1)).filter(i => i >= 0);
      const lt = ly.map(i => norm(kept[i].txt));
      for (let k = 2; k <= lt.length / 2; k++) {
        if (lt.slice(k).every((t, i) => t === lt[i % k])) {
          let cutAt = ly[k];
          while (cutAt > 0 && kept[cutAt - 1].label) cutAt--;
          kept = kept.slice(0, cutAt);
          break;
        }
      }

      // A per-line rendering (one <p> per lyric line) has no stanza breaks: join consecutive
      // single-line <p>s so each section becomes one block that splits into ≤maxLines slides,
      // instead of one slide per line.
      const lyr = kept.filter(n => !n.label);
      const singles = lyr.filter(n => !n.multi).length;
      const perLine = singles >= 4 && singles / lyr.length >= 0.6;
      const isLine = (n) => n && !n.label && !n.multi;
      // A label <p> holding a section word plus a singer name ("VERSE 1 RITASOUL") gets a colon
      // so the parser reads it as a named section label instead of a lyric line.
      const namedLabel = /^(?:verses?|chorus|pre[-\s]?chorus|bridge|refrain|intro|outro|vamp|coda|interlude)(?:\s+\d+)?\s+\S/i;
      const text = (n) => (n.label && n.txt.length <= 30 && namedLabel.test(n.txt) && !/:$/.test(n.txt)
        && !LM_SECTION_STRICT_RE.test(n.txt)) ? n.txt + ':' : n.txt;
      const out = kept.map((n, i) => (i === 0 ? '' : (perLine && isLine(n) && isLine(kept[i - 1]) ? '\n' : '\n\n')) + text(n))
        .join('').trim();
      if (out.length > 20) return out;
    }
    const wpls = [...document.querySelectorAll('.whitespace-pre-line')];
    if (wpls.length === 1) {
      const t = (wpls[0].textContent || '').trim();
      if (t.length > 20) return wpls[0].textContent;
    } else if (wpls.length > 1) {
      const joined = wpls.map(w => w.textContent || '').join('\n');
      if (joined.trim().length > 20) return joined;
    }
    return '';
  }

  // ---- loveworldlyrics.com ----
  function extractLoveworldLyrics() {
    // New site (Loveworld Lyrics +): lyrics in a .lyrics-scroll / .whitespace-pre-line
    // container, same labeled format as loveworldmusic.org — reuse the shared parser.
    const raw = getLoveworldLyricsText();
    if (raw) {
      const title = lmTitle();
      const parsed = parseLoveworldMusicLyrics(raw);
      if (parsed.hasLabels && parsed.sections.length) {
        return { type: 'song', title, sections: parsed.sections, stanzas: parsed.stanzas };
      }
      if (parsed.stanzas.length) return { type: 'song', title, stanzas: parsed.stanzas };
    }

    // Legacy WordPress layout: .entry-content paragraphs → auto-classify.
    const el = document.querySelector('.entry-content');
    if (el) {
      const ps = [...el.querySelectorAll('p')];
      const stanzas = ps
        .map(p => (p.innerText || '').trim())
        .filter(t => t && !/^(DOWNLOAD|MORE FROM|Healing streams)/i.test(t));
      if (stanzas.length) {
        const title =
          (document.querySelector('h1')?.innerText || document.title || '')
            .replace(/\s*[-–—|].*/i, '')
            .replace(/\s*BY\s.*/i, '')
            .trim();
        return { type: 'song', title, stanzas };
      }
    }

    return null;
  }

  // ---- loveworldmusic.org ----
  // Section words. May be combined with a number and/or a performer/singer name on
  // one line, e.g. "VERSE 1 SOLO:", "REFRAIN ALL:", "Verse 1 Ritasoul:", "Pre-chorus".
  const LM_SECTION_WORDS = 'intro|verses?|chorus|pre[-\\s]?chorus|bridge|outro|tag|interlude|vamp|ending|end|hook|rap|refrain|coda|modulation';
  // Performer / voice-part words that annotate who sings a part (stripped, keep group).
  const LM_PERFORMER_WORDS = 'solo|all|lead|choir|congregation|group|men|women|ladies|duet|call|resp|response|soprano|tenor|alto|altho|choral|descant|unison';

  // Optional repetition / position annotations after a label: "TAKEN TWICE", "(once)", "x2",
  // "2x", "FOUR TIMES", "repeat", "END", "In Harmony" — e.g. "VERSE 1 TAKEN TWICE",
  // "Chorus (twice)", "VERSE END", "End Taken Twice In Harmony".
  const LM_ANNOT = '(?:\\s*[-–(]?\\s*(?:taken\\s+)?(?:once|twice|thrice|again|repeat(?:ed)?|end|ending|final|last'
    + '|\\d+\\s*x|x\\s*\\d+|\\d+\\s*times|(?:one|two|three|four|five|six|seven|eight)\\s+times|(?:in\\s+)?harmony)\\s*\\)?)*';
  // One performer, or several joined by / & , "and": "Solo 1", "RESP.", "RESP;", "Alto/Tenor", "Men & Women".
  const LM_PERFORMER_ONE = `(?:${LM_PERFORMER_WORDS})[.;]?(?:\\s+\\d+)?`;
  const LM_PERFORMERS = `${LM_PERFORMER_ONE}(?:(?:\\s*[/&,]\\s*|\\s+and\\s+)${LM_PERFORMER_ONE})*`;
  // Strict section label, optionally in brackets ("( Chorus )"): section [+number, "Coda: 2" too]
  // [+/alternate, e.g. "REFRAIN/PAN"] [+performers] [+annotation] [+colon].
  const LM_SECTION_STRICT_RE = new RegExp(
    `^\\(?\\s*(${LM_SECTION_WORDS})(?:\\s*:?\\s*(\\d+))?(?:\\s*/\\s*[a-z0-9]+(?:\\s+\\d+)?)?(?:\\s+${LM_PERFORMERS})?${LM_ANNOT}\\s*\\)?\\s*:?\\s*$`, 'i');
  // Named section label: section [+number] + arbitrary singer name, REQUIRES trailing colon.
  const LM_SECTION_NAMED_RE = new RegExp(
    `^(${LM_SECTION_WORDS})(?:\\s+(\\d+))?\\s+\\S[^\\n]{0,24}:\\s*$`, 'i');
  // Known performer cue: "Solo:", "Call:", "Soprano:", "Solo 1:", "RESP.", "Alto/Tenor".
  const LM_PERFORMER_RE = new RegExp(`^${LM_PERFORMERS}\\s*:?\\s*$`, 'i');
  // Generic ≤5-word cue ending in a colon — catches singer names/credits like
  // "Pst Saki:", "Ritasoul:", "Solo call:", "Faith Ejura and Uche:", "Adlib: Dcn. Isaiah and Pst. Saki:".
  const LM_CUE_RE = /^(?:\S+(?:\s+\S+){0,4}|ad[\s-]?lib\b.{0,40}):\s*$/i;
  // Repeat instructions on their own line: "Repeat", "(Repeat chorus)", "Repeat x2", "x2", "2x".
  const LM_REPEAT_RE = new RegExp(
    `^\\(?\\s*(?:(?:repeat|rpt)\\.?(?:\\s+(?:${LM_SECTION_WORDS})(?:\\s+\\d+)?)?|x\\s*\\d+|\\d+\\s*x|twice|thrice|\\d+\\s*times)${LM_ANNOT}\\s*\\)?\\s*:?\\s*$`, 'i');
  // Repeat marker at the end of a lyric line: "Lord we worship You 2x", "Holy (x3)", "Amen (twice)".
  const LM_TRAILING_REPEAT_RE = /\s+(?:\(?\s*(?:x\s*\d+|\d+\s*x)\s*\)?|\(\s*(?:once|twice|thrice|\d+\s*times|repeat)\s*\))\s*$/i;

  /** Map a site section word (+ optional number) to a ProPresenter group label. */
  function lmGroupFor(word, num, autoVerse) {
    const w = word.toLowerCase().replace(/[\s-]/g, '');
    if (w === 'intro') return 'Intro';
    if (w === 'verse' || w === 'verses') {
      const n = num ? parseInt(num, 10) : (++autoVerse.n);
      return 'Verse ' + n;
    }
    if (w === 'chorus') return 'Chorus';
    if (w === 'prechorus') return 'Pre-Chorus';
    if (w === 'bridge') return 'Bridge';
    if (w === 'refrain') return 'Bridge';          // PP has no Refrain — Bridge is closest
    if (w === 'coda' || w === 'end' || w === 'ending') return 'Ending';
    if (w === 'outro') return 'Outro';
    if (w === 'tag') return 'Tag';
    if (w === 'vamp') return 'Vamp';
    if (w === 'interlude') return 'Instrumental';
    return 'Misc';                                  // hook, rap, modulation, medley titles
  }

  /** Is this a standalone ALL-CAPS header line (a medley sub-song title)?
   *  Must be short, ≥2 words, no lowercase, and flanked by blank lines. */
  function lmIsCapsHeader(lines, i) {
    const t = lines[i].trim();
    if (t.length < 4 || t.length > 32) return false;
    if (!/\s/.test(t)) return false;                       // need ≥2 words
    if (/[a-z]/.test(t) || !/[A-Z]/.test(t)) return false; // all-caps only
    if (!/^[A-Z0-9 '.,!?()&‘’–-]+$/.test(t)) return false;
    const prevBlank = i === 0 || !lines[i - 1].trim();
    const nextBlank = i === lines.length - 1 || !lines[i + 1].trim();
    return prevBlank && nextBlank;
  }

  /** Parse loveworldmusic lyric text into both labeled sections (if the site
   *  provides section labels) and plain stanzas (fallback for unlabeled songs). */
  function parseLoveworldMusicLyrics(raw) {
    // Strip invisible/zero-width/direction marks (e.g. U+200E LEFT-TO-RIGHT MARK) that
    // the site sometimes prefixes to labels — they silently break "Verse 1"/"Chorus"
    // detection and leak the label into the lyrics. Also covers BOM & word-joiner.
    raw = String(raw || '').replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, '');
    const lines = raw.split('\n');
    const sections = [];   // [{group, text}] — site-labeled
    const stanzas = [];    // ['text', ...] — unlabeled fallback
    let curGroup = null;
    let curStanza = [];
    let labelCount = 0;
    const autoVerse = { n: 0 };

    const flush = () => {
      if (curStanza.length) {
        const text = curStanza.join('\n');
        sections.push({ group: curGroup || 'Misc', text });
        stanzas.push(text);
        curStanza = [];
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed) { flush(); continue; }

      // 1) Section label (strict, or section+name ending in colon)
      const m = trimmed.match(LM_SECTION_STRICT_RE) || trimmed.match(LM_SECTION_NAMED_RE);
      if (m) {
        flush();
        labelCount++;
        // "VERSE END" / "CHORUS ENDING" mark the closing section → Ending
        const afterWord = trimmed.slice(trimmed.toLowerCase().indexOf(m[1].toLowerCase()) + m[1].length);
        curGroup = /\b(end|ending)\b/i.test(afterWord)
          ? 'Ending' : lmGroupFor(m[1], m[2], autoVerse);
        continue;
      }

      // 2) Performer / singer-name cue or repeat instruction (≤30 chars): strip it but
      //    flush so each performer's lines become their own slide (important for
      //    songs with no blank lines between parts, e.g. "King of Eternity").
      if ((trimmed.length <= 30 || /^ad[\s-]?lib\b/i.test(trimmed))
        && (LM_PERFORMER_RE.test(trimmed) || LM_CUE_RE.test(trimmed) || LM_REPEAT_RE.test(trimmed))) {
        flush();
        continue;
      }

      // 3) ALL-CAPS standalone header = medley sub-song title → its own titled slide
      if (lmIsCapsHeader(lines, i)) {
        flush();
        labelCount++;
        curGroup = 'Misc';
        curStanza.push(trimmed);
        flush();
        continue;
      }

      // 4) Lyric line (minus a trailing repeat marker like "2x")
      curStanza.push(trimmed.replace(LM_TRAILING_REPEAT_RE, '') || trimmed);
    }
    flush();

    // Require ≥2 labels to trust the site's labeling (avoids a stray line that
    // happens to look like a label flipping an unlabeled song into "labeled").
    const hasLabels = labelCount >= 2;
    return { sections: sections.filter(s => s.text.trim()), stanzas: stanzas.filter(s => s.trim()), hasLabels };
  }

  function lmTitle() {
    // document.title: "Song Name — Loveworld Singers | Loveworld Lyrics"
    // or (new loveworldlyrics+): "Song Name Lyrics & Audio Download — Loveworld Singers | …"
    const stripSuffix = (s) => s.replace(/\s+lyrics(\s*&\s*audio\s*download)?\s*$/i, '').trim();
    let dt = stripSuffix((document.title || '').split(/\s+[—–|]\s+/)[0].trim());
    if (dt && !/^loveworld/i.test(dt)) return dt;
    let h1 = stripSuffix((document.querySelector('h1')?.innerText || '').trim());
    if (h1 && !/^loveworld/i.test(h1)) return h1;
    return document.querySelector('meta[property="og:title"]')?.content || 'Untitled Song';
  }

  /** loveworldmusic.org can default to "Synced" view, which exposes only lyric
   *  lines (no Verse/Chorus labels). If the labeled Static view isn't rendered but
   *  a "Static" toggle exists, switch to it and wait for the structured lyrics. */
  async function ensureLoveworldMusicStatic() {
    const hasStatic = () => getLoveworldLyricsText().length > 20;
    if (hasStatic()) return;
    const btn = [...document.querySelectorAll('button')]
      .find(b => /^static$/i.test((b.textContent || '').trim()));
    if (!btn) return;
    btn.click();
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 100));
      if (hasStatic()) return;
    }
  }

  async function extractLoveworldMusic() {
    await ensureLoveworldMusicStatic();
    const title = lmTitle();

    const build = (raw) => {
      const parsed = parseLoveworldMusicLyrics(raw);
      if (parsed.hasLabels && parsed.sections.length) {
        return { type: 'song', title, sections: parsed.sections, stanzas: parsed.stanzas };
      }
      if (parsed.stanzas.length) {
        return { type: 'song', title, stanzas: parsed.stanzas };
      }
      return null;
    };

    // Static mode: labeled lyrics text (.lyrics-scroll / .whitespace-pre-line)
    const staticText = getLoveworldLyricsText();
    if (staticText) {
      const result = build(staticText);
      if (result) return result;
    }

    // Synced mode: one button per line in a scroll container
    const container = document.querySelector('[class*="overflow-y-auto"][class*="scroll-smooth"]');
    if (container) {
      const buttons = [...container.querySelectorAll('button')];
      if (buttons.length >= 3) {
        const lines = buttons.map(b => (b.textContent || '').trim());
        const result = build(lines.join('\n'));
        if (result) return result;

        // Last-resort fallback: split every 4 lyric lines
        const lyricsOnly = lines.filter(t => t && !LM_SECTION_STRICT_RE.test(t) && !LM_PERFORMER_RE.test(t));
        const fallback = [];
        for (let i = 0; i < lyricsOnly.length; i += 4) {
          fallback.push(lyricsOnly.slice(i, i + 4).join('\n'));
        }
        if (fallback.length) return { type: 'song', title, stanzas: fallback };
      }
    }

    return null;
  }

  // Shared ROR extraction helpers
  // Match all quote variants: straight (0x22), curly left/right (“/”), single curly (‘/’)
  const ROR_QUOTE_CLASS = '[\\u201C\\u201D\\u2018\\u2019"]';

  function extractRorFromText(fullText, opts = {}) {
    // Topic — try multiple patterns
    let topic = '';
    const patterns = [
      // "TOPIC: Xxx" (flatimes explicit format) — try first; stop at newline or parenthesis
      /TOPIC\s*[:\-]\s*([^\n(]+)/i,
      // "topic ... Is "Xxx"" — thedevotionals prose format; REQUIRE quotes so an
      // unquoted "is …" in the verse text below can't be mistaken for the topic
      new RegExp(`topic[\\s\\S]{0,200}?Is\\s+${ROR_QUOTE_CLASS}(.+?)${ROR_QUOTE_CLASS}`, 'i'),
      // "topic ... "Xxx"" with quotes around topic (last resort)
      new RegExp(`topic[\\s\\S]{0,200}?${ROR_QUOTE_CLASS}(.+?)${ROR_QUOTE_CLASS}`, 'i'),
    ];
    for (const re of patterns) {
      const m = fullText.match(re);
      if (m && m[1]) {
        topic = m[1]
          .replace(/[“”‘’"]/g, '')
          .replace(/\s*\(.*?\)\s*$/, '')      // strip trailing parenthetical
          .replace(/\.+$/, '')
          .trim();
        if (topic.length > 2) break;
        topic = '';
      }
    }

    // Today's Scripture (opening verse ref)
    const scriptureMatch = fullText.match(/Today['’]?s\s+Scripture.*?\((.+?)\)/i);
    const openingRef = scriptureMatch ? scriptureMatch[1].trim() : (opts.openingRef || '');

    // PRAYER (optionally followed by /CONFESSION or CONFESSIONS)
    const prayerMatch = fullText.match(
      /PRAYER(?:\s*[/&]?\s*CONFESSIONS?)?\s*\n+([\s\S]*?)(?=\n\s*FURTHER\s+STUDY|\n\s*\d+-YEAR\s+BIBLE|\n\s*DIVINE\s+HEALTH|\n\s*Click|$)/i
    );
    const prayer = prayerMatch ? prayerMatch[1].trim() : '';

    // FURTHER STUDY — parse into verses with translation and (if inline) verse text.
    // - thedevotionals gives just refs: "Joshua 1:8; Psalm 119:105; James 1:22-25"  → fetch each from bible-api.com
    // - flatimes gives ref line + full verse text: "Romans 8:1-2 (AMPC)\nTherefore..." → use inline text directly
    const fsMatch = fullText.match(/FURTHER\s+STUDY[:\s]*\n?([\s\S]*?)(?=\n\s*\d+-YEAR\s+BIBLE|\n\s*DIVINE\s+HEALTH|\n\s*Click|$)/i);
    const furtherStudyVerses = fsMatch ? extractFurtherStudyVerses(fsMatch[1]) : [];
    // Keep the string form for backward compat / manual override
    const furtherStudy = furtherStudyVerses.map(v => v.ref).join('; ');

    // 1-Year and 2-Year Bible Reading Plans
    const oneYearMatch = fullText.match(/1-YEAR\s+BIBLE\s+READING\s+PLAN\s*[:\-]?\s*\n?([\s\S]*?)(?=\n\s*2-YEAR|\n\s*Click|\n\s*DIVINE\s+HEALTH|$)/i);
    const oneYear = oneYearMatch ? oneYearMatch[1].trim() : '';

    const twoYearMatch = fullText.match(/2-YEAR\s+BIBLE\s+READING\s+PLAN\s*[:\-]?\s*\n?([\s\S]*?)(?=\n\s*Click|\n\s*Share|\n\s*Rhapsody|\n\s*DIVINE\s+HEALTH|$)/i);
    const twoYear = twoYearMatch ? twoYearMatch[1].trim() : '';

    return { type: 'ror', topic, openingRef, prayer, furtherStudy, furtherStudyVerses, oneYear, twoYear };
  }

  /** Parse a FURTHER STUDY block into [{ref, translation, text}].
   *  - Ref line = a line that is only Bible reference(s), optionally with (TRANSLATION).
   *    Multiple refs on one line are semicolon-separated (thedevotionals format).
   *  - Text following a ref line (until the next ref line) is treated as that verse's inline text
   *    (flatimes format). If no inline text, text is '' and buildRorOutput fetches via bible-api.com.
   */
  function extractFurtherStudyVerses(raw) {
    if (!raw) return [];
    // Matches: "Book Chap:Verse[-endVerse]" optionally followed by translation code
    // (parenthesized or bare): "Joshua 1:8", "Romans 8:1-2 (AMPC)", "Colossians 2:9-10 AMPC"
    const REF_RE = /^((?:[1-3]\s+)?[A-Z][A-Za-z]+(?:\s+of\s+[A-Z][A-Za-z]+)?\s+\d+:\d+(?:[-,]\s*\d+)*)(?:\s+\(?([A-Za-z]{2,6})\)?)?$/;
    const verses = [];
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);

    for (const line of lines) {
      // Try to parse as ref line (possibly semicolon-separated multi-refs)
      const parts = line.split(/\s*;\s*/);
      const parsed = [];
      let allRefs = true;
      for (const part of parts) {
        const m = part.trim().match(REF_RE);
        if (m) parsed.push({ ref: m[1].trim(), translation: (m[2] || 'KJV').toUpperCase(), text: '' });
        else { allRefs = false; break; }
      }
      if (allRefs && parsed.length) {
        // Ref line: add each ref as a new verse entry
        for (const p of parsed) verses.push(p);
      } else if (verses.length) {
        // Text line: append to the most recently added verse
        const last = verses[verses.length - 1];
        last.text = last.text ? last.text + ' ' + line : line;
      }
    }
    return verses;
  }

  // ---- thedevotionals.com.ng ----
  function extractROR_Devotionals() {
    const article =
      document.querySelector('article') ||
      document.querySelector('.entry-content') ||
      document.querySelector('main');
    if (!article) return null;
    const fullText = article.innerText || '';
    return extractRorFromText(fullText);
  }

  // ---- flatimes.com ----
  function extractROR_Flatimes() {
    const article =
      document.querySelector('.entry-content') ||
      document.querySelector('article') ||
      document.querySelector('main') ||
      document.body;
    const fullText = article.innerText || '';
    return extractRorFromText(fullText);
  }

  // ---- docs.google.com (Prayer documents) ----
  async function extractGDocsPrayer() {
    // Try the export-as-text API (same-origin, uses user's Google session)
    const docIdMatch = window.location.pathname.match(/\/document\/d\/([^/]+)/);
    if (!docIdMatch) return null;
    const docId = docIdMatch[1];

    let text = '';
    try {
      const resp = await fetch(
        `https://docs.google.com/document/d/${docId}/export?format=txt`,
        { credentials: 'include' }
      );
      if (resp.ok) text = await resp.text();
    } catch (e) {
      console.warn('[LW→PP] Export API failed, trying DOM extraction', e);
    }

    // Fallback: scrape from Google Docs DOM
    if (!text) {
      const lines = document.querySelectorAll('.kix-lineview');
      if (lines.length) {
        text = [...lines].map(l => (l.textContent || '').trimEnd()).join('\n');
      }
    }

    if (!text) return { type: 'prayer', title: '', mainTitle: '', sections: [], rawText: '' };

    const parsed = parsePrayerText(text);
    const title = parsed.sections[0]?.title || parsed.mainTitle || 'Prayer';

    return { type: 'prayer', title, mainTitle: parsed.mainTitle, sections: parsed.sections, rawText: text };
  }

  // ================================================================
  //  ROR: BUILD PROPRESENTER OUTPUT
  // ================================================================

  async function buildRorOutput(data, maxLines) {
    const parts = [];

    // Cache fetched verses so maxLines changes don't re-fetch.
    // Priority: use furtherStudyVerses (new array with translation & optional inline text).
    // Fallback: parse furtherStudy string as refs and fetch each via KJV.
    if (!data._cachedVerses) {
      data._cachedVerses = [];
      const verseEntries = data.furtherStudyVerses?.length
        ? data.furtherStudyVerses
        : parseReferences(data.furtherStudy || '').map(ref => ({ ref, translation: 'KJV', text: '' }));

      for (const entry of verseEntries) {
        const { ref, translation, text: inlineText } = entry;
        const trans = (translation || 'KJV').toUpperCase();

        // If article gave us the verse text (flatimes), use it directly — preserves original translation.
        if (inlineText && inlineText.trim()) {
          data._cachedVerses.push({
            ref: `${ref} (${trans})`,
            text: inlineText.trim().replace(/\n/g, ' ')
          });
          continue;
        }

        // Otherwise fetch from bible-api.com. Non-KJV-safe translations fall back to KJV silently
        // in background.js — we surface what was actually returned.
        try {
          const result = await fetchBible(ref, trans);
          const actualTrans = result._actualTranslation || 'KJV';
          if (result.verses && result.verses.length) {
            for (const v of result.verses) {
              data._cachedVerses.push({
                ref: `${v.book_name} ${v.chapter}:${v.verse} (${actualTrans})`,
                text: v.text.trim().replace(/\n/g, ' ')
              });
            }
          } else if (result.text) {
            data._cachedVerses.push({ ref: `${ref} (${actualTrans})`, text: result.text.trim() });
          }
        } catch (e) {
          console.warn(`[LW→PP] Failed to fetch ${ref}:`, e);
          data._cachedVerses.push({ ref: `${ref} (${trans})`, text: '[Could not load verse text]' });
        }
      }
    }

    // Emit cached verses, respecting maxLines
    for (const v of data._cachedVerses) {
      const full = v.ref + '\n' + v.text;
      const slides = splitIntoSlides(full, maxLines);
      for (const s of slides) parts.push({ text: s.trim() });
    }

    // Prayer / Confession
    if (data.prayer) {
      const slides = splitIntoSlides(data.prayer, maxLines);
      for (let i = 0; i < slides.length; i++) {
        const prefix = i === 0 ? 'PRAYER / CONFESSION\n' : '';
        parts.push({ text: prefix + slides[i].trim() });
      }
    }

    // Bible Reading Plans (optional, as final slides)
    if (data.oneYear || data.twoYear) {
      let planText = '';
      if (data.oneYear) planText += '1-Year: ' + data.oneYear;
      if (data.twoYear) planText += (planText ? '\n' : '') + '2-Year: ' + data.twoYear;
      parts.push({ text: 'BIBLE READING PLAN\n' + planText });
    }

    // Topic appears once at the top (not repeated per slide — that's prayer-only behavior)
    const titleEl = document.getElementById('lwpp-title');
    const title = titleEl ? titleEl.value.trim() : (data.topic || '');
    const body = parts.map(p => p.text).join('\n\n');
    return title ? title + '\n\n' + body : body;
  }

  // ================================================================
  //  PRAYER: BUILD PROPRESENTER OUTPUT
  // ================================================================

  function buildPrayerOutput(data, maxLines) {
    const parts = [];
    const withTitle = (title, body) => (title && body) ? title + '\n' + body : (body || title || '');

    for (const sec of data.sections) {
      if (!sec.title && !sec.verses?.length && !sec.prayer?.length) continue;

      // Verse slide: title + all Bible verses for this section
      if (sec.verses?.length) {
        parts.push(withTitle(sec.title, sec.verses.join('\n')));
      } else if (sec.title && !sec.prayer?.length) {
        parts.push(sec.title);
      }

      // Prayer slide(s): title + prayer text (split by maxLines if long)
      const prayerText = Array.isArray(sec.prayer) ? sec.prayer.join('\n') : (sec.prayer || '');
      if (prayerText.trim()) {
        const slides = splitIntoSlides(prayerText.trim(), maxLines);
        for (const slide of slides) {
          if (slide.trim()) parts.push(withTitle(sec.title, slide.trim()));
        }
      }
    }

    return parts.join('\n\n');
  }

  // ================================================================
  //  OVERLAY UI
  // ================================================================

  let panelState = {
    open: false,
    data: null,
    sections: null,   // for songs: classified sections
    maxLines: DEFAULT_MAX_LINES,
    outputText: ''
  };

  function createFAB() {
    if (document.getElementById('lwpp-fab')) return;
    const fab = document.createElement('button');
    fab.id = 'lwpp-fab';
    fab.title = 'Extract for ProPresenter';
    fab.innerHTML = '♪'; // music note
    fab.addEventListener('click', togglePanel);
    document.body.appendChild(fab);
  }

  function createPanel() {
    if (document.getElementById('lwpp-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'lwpp-panel';
    panel.innerHTML = `
      <div class="lwpp-header">
        <h3>Loveworld → ProPresenter</h3>
        <span class="lwpp-badge" id="lwpp-type-badge">...</span>
      </div>
      <div class="lwpp-body" id="lwpp-body">
        <div class="lwpp-status loading" id="lwpp-status">
          <span class="lwpp-spinner"></span> Detecting content…
        </div>
      </div>
      <div class="lwpp-footer">
        <button class="lwpp-btn lwpp-btn-secondary" id="lwpp-btn-refresh">↻ Refresh</button>
        <button class="lwpp-btn lwpp-btn-primary" id="lwpp-btn-copy" disabled>Copy for ProPresenter</button>
      </div>
    `;
    document.body.appendChild(panel);

    document.getElementById('lwpp-btn-copy').addEventListener('click', handleCopy);
    document.getElementById('lwpp-btn-refresh').addEventListener('click', handleExtract);
  }

  function togglePanel() {
    const panel = document.getElementById('lwpp-panel');
    if (!panel) return;
    panelState.open = !panelState.open;
    panel.classList.toggle('open', panelState.open);
    if (panelState.open && !panelState.data) handleExtract();
  }

  function setStatus(msg, type = '') {
    const el = document.getElementById('lwpp-status');
    if (!el) return;
    el.className = 'lwpp-status ' + type;
    if (type === 'loading') {
      el.innerHTML = '<span class="lwpp-spinner"></span> ' + msg;
    } else {
      el.textContent = msg;
    }
  }

  async function handleExtract() {
    setStatus('Extracting…', 'loading');
    document.getElementById('lwpp-btn-copy').disabled = true;

    try {
      const site = detectSite();
      let data;

      switch (site) {
        case 'loveworldlyrics': data = extractLoveworldLyrics(); break;
        case 'loveworldmusic':  data = await extractLoveworldMusic();  break;
        case 'ror-devotionals': data = extractROR_Devotionals(); break;
        case 'ror-flatimes':    data = extractROR_Flatimes();    break;
        case 'gdocs-prayer':    data = await extractGDocsPrayer();  break;
        default:
          setStatus('This site is not supported.', 'error');
          return;
      }

      if (!data) {
        setStatus('Could not find content on this page.', 'error');
        return;
      }

      panelState.data = data;
      await renderBody(data);
    } catch (err) {
      console.error('[LW→PP]', err);
      setStatus('Error: ' + err.message, 'error');
    }
  }

  async function renderBody(data) {
    const body = document.getElementById('lwpp-body');
    const badge = document.getElementById('lwpp-type-badge');
    const copyBtn = document.getElementById('lwpp-btn-copy');

    if (data.type === 'song') {
      badge.textContent = 'SONG';
      badge.className = 'lwpp-badge lwpp-badge-song';

      // Use the site's own section labels when available (loveworldmusic.org);
      // otherwise auto-classify by repetition (loveworldlyrics.com, unlabeled songs).
      panelState.sections = (data.sections && data.sections.length)
        ? data.sections
        : classifySections(data.stanzas);

      body.innerHTML = `
        <input class="lwpp-title-input" id="lwpp-title" value="${escHtml(data.title)}" placeholder="Song title">
        <div class="lwpp-options">
          <label>Max lines/slide
            <input type="number" id="lwpp-maxlines" value="${panelState.maxLines}" min="1" max="10">
          </label>
        </div>
        <div class="lwpp-tabs">
          <button class="lwpp-tab active" data-tab="sections">Sections</button>
          <button class="lwpp-tab" data-tab="preview">Preview</button>
        </div>
        <div id="lwpp-tab-sections">
          <ul class="lwpp-section-list" id="lwpp-section-list"></ul>
        </div>
        <div id="lwpp-tab-preview" style="display:none">
          <div class="lwpp-preview" id="lwpp-preview"></div>
        </div>
        <div class="lwpp-status success" id="lwpp-status">
          ${panelState.sections.length} sections detected — adjust labels if needed
        </div>
      `;

      // Wire tabs
      body.querySelectorAll('.lwpp-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          body.querySelectorAll('.lwpp-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          const target = tab.dataset.tab;
          document.getElementById('lwpp-tab-sections').style.display = target === 'sections' ? '' : 'none';
          document.getElementById('lwpp-tab-preview').style.display = target === 'preview' ? '' : 'none';
          if (target === 'preview') updatePreview();
        });
      });

      // Wire max-lines change
      document.getElementById('lwpp-maxlines').addEventListener('change', e => {
        panelState.maxLines = parseInt(e.target.value) || DEFAULT_MAX_LINES;
        updatePreview();
      });

      renderSectionList();
      updateOutput();
      copyBtn.disabled = false;

    } else if (data.type === 'ror') {
      badge.textContent = 'ROR';
      badge.className = 'lwpp-badge lwpp-badge-ror';

      body.innerHTML = `
        <input class="lwpp-title-input" id="lwpp-title" value="${escHtml(data.topic)}" placeholder="Devotional topic">
        <div class="lwpp-options">
          <label>Max lines/slide
            <input type="number" id="lwpp-maxlines" value="${panelState.maxLines}" min="1" max="10">
          </label>
        </div>
        <div class="lwpp-status loading" id="lwpp-status">
          <span class="lwpp-spinner"></span> Fetching Bible verses…
        </div>
        <div class="lwpp-preview" id="lwpp-preview" style="display:none"></div>
      `;

      document.getElementById('lwpp-maxlines').addEventListener('change', async e => {
        panelState.maxLines = parseInt(e.target.value) || DEFAULT_MAX_LINES;
        await updateRorOutput();
      });

      await updateRorOutput();
      copyBtn.disabled = false;

    } else if (data.type === 'prayer') {
      badge.textContent = 'PRAYER';
      badge.className = 'lwpp-badge lwpp-badge-prayer';

      // If no sections were parsed, show a paste area
      if (!data.sections.length && !data.rawText) {
        body.innerHTML = `
          <p style="font-size:13px;color:#a6adc8;margin:0 0 8px">
            Could not auto-extract the document. Paste the prayer text below:
          </p>
          <textarea class="lwpp-paste-area" id="lwpp-paste" placeholder="Paste prayer text here (Cmd+A → Cmd+C from the Google Doc, then Cmd+V here)"></textarea>
          <div class="lwpp-options">
            <label>Max lines/slide
              <input type="number" id="lwpp-maxlines" value="${panelState.maxLines}" min="1" max="10">
            </label>
          </div>
          <div class="lwpp-preview" id="lwpp-preview" style="display:none"></div>
          <div class="lwpp-status" id="lwpp-status">Paste text and click "Copy for ProPresenter"</div>
        `;

        document.getElementById('lwpp-paste').addEventListener('input', () => {
          const raw = document.getElementById('lwpp-paste').value;
          panelState.data.rawText = raw;
          // Re-parse — parsePrayerText returns {mainTitle, sections}
          const parsed = parsePrayerText(raw);
          panelState.data.mainTitle = parsed.mainTitle;
          panelState.data.sections = parsed.sections;
          updatePrayerOutput();
        });

        copyBtn.disabled = false;
        return;
      }

      body.innerHTML = `
        <input class="lwpp-title-input" id="lwpp-title" value="${escHtml(data.title)}" placeholder="Prayer title">
        <div class="lwpp-options">
          <label>Max lines/slide
            <input type="number" id="lwpp-maxlines" value="${panelState.maxLines}" min="1" max="10">
          </label>
        </div>
        <div class="lwpp-preview" id="lwpp-preview"></div>
        <div class="lwpp-status success" id="lwpp-status">
          ${data.sections.length} prayer sections found
        </div>
      `;

      document.getElementById('lwpp-maxlines').addEventListener('change', e => {
        panelState.maxLines = parseInt(e.target.value) || DEFAULT_MAX_LINES;
        updatePrayerOutput();
      });

      updatePrayerOutput();
      copyBtn.disabled = false;
    }
  }

  /** Parse raw prayer text into structured sections.
   *  Returns { mainTitle, sections: [{title, verses: [], prayer: []}] }.
   *  - main title = first line (all caps)
   *  - section title = subsequent all-caps line
   *  - Bible verse = line starting with a quote character (curly or straight)
   *  - prayer text = other lines (or verse continuations if last verse lacks a "~ ref")
   */
  function parsePrayerText(raw) {
    // Strip BOM and normalise
    raw = String(raw || '').replace(/\uFEFF/g, '');
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);

    // Any opening-quote character. Explicit \u escapes so the class is never
    // confused with the visually-identical straight quotes.
    const QUOTE_START_RE = /^[“”„«"']/;
    const isAllCaps = (line) => {
      if (line.length < 8) return false;
      if (QUOTE_START_RE.test(line)) return false;   // starts with quote → verse
      if (!/[A-Za-z]/.test(line)) return false;      // must contain letters
      return !/[a-z]/.test(line);                    // no lowercase → all caps
    };
    const isVerse = (line) => QUOTE_START_RE.test(line);

    let mainTitle = '';
    const sections = [];
    let current = null;
    let awaitingVerseCont = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (isAllCaps(line)) {
        awaitingVerseCont = false;
        if (!mainTitle && !current) {
          mainTitle = line;
          continue;
        }
        if (current) sections.push(current);
        current = { title: line, verses: [], prayer: [] };
      } else if (isVerse(line)) {
        awaitingVerseCont = false;
        if (!current) current = { title: mainTitle || '', verses: [], prayer: [] };
        current.verses.push(line);
        if (!/~\s/.test(line)) awaitingVerseCont = true;
      } else {
        if (!current) current = { title: mainTitle || '', verses: [], prayer: [] };
        if (awaitingVerseCont) {
          current.verses[current.verses.length - 1] += ' ' + line;
          if (/~\s/.test(line)) awaitingVerseCont = false;
        } else {
          current.prayer.push(line);
        }
      }
    }
    if (current) sections.push(current);

    return { mainTitle, sections };
  }

  function renderSectionList() {
    const list = document.getElementById('lwpp-section-list');
    if (!list) return;
    list.innerHTML = '';

    panelState.sections.forEach((sec, i) => {
      const li = document.createElement('li');
      li.className = 'lwpp-section-item';

      const select = document.createElement('select');
      PP_GROUPS.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g;
        opt.textContent = g;
        if (g === sec.group) opt.selected = true;
        select.appendChild(opt);
      });
      select.addEventListener('change', () => {
        panelState.sections[i].group = select.value;
        updateOutput();
      });

      const textDiv = document.createElement('div');
      textDiv.className = 'lwpp-section-text';
      textDiv.textContent = sec.text;

      li.appendChild(select);
      li.appendChild(textDiv);
      list.appendChild(li);
    });
  }

  function updateOutput() {
    if (!panelState.sections) return;
    const body = formatForProPresenter(panelState.sections, {
      maxLines: panelState.maxLines,
      mode: 'song'
    });
    // Prepend the song title so the ProPresenter presentation gets a name
    const titleEl = document.getElementById('lwpp-title');
    const title = titleEl ? titleEl.value.trim() : '';
    panelState.outputText = title ? title + '\n\n' + body : body;
  }

  function updatePreview() {
    updateOutput();
    const el = document.getElementById('lwpp-preview');
    if (!el) return;
    // Highlight group labels in the preview
    const html = escHtml(panelState.outputText)
      .replace(/^(Verse \d+|Chorus|Pre-Chorus|Bridge|Tag|Ending|Intro|Outro|Vamp|Instrumental|Misc)$/gm,
        '<span class="pp-group">$1</span>')
      .replace(/\n\n/g, '<span class="pp-slide-break"></span>\n');
    el.innerHTML = html;
  }

  async function updateRorOutput() {
    const data = panelState.data;
    if (!data || data.type !== 'ror') return;

    setStatus('Fetching Bible verses…', 'loading');
    try {
      panelState.outputText = await buildRorOutput(data, panelState.maxLines);
      const preview = document.getElementById('lwpp-preview');
      if (preview) {
        preview.style.display = '';
        preview.textContent = panelState.outputText;
      }
      setStatus('Ready — click "Copy for ProPresenter"', 'success');
    } catch (err) {
      setStatus('Error loading verses: ' + err.message, 'error');
    }
  }

  function updatePrayerOutput() {
    const data = panelState.data;
    if (!data || data.type !== 'prayer') return;
    panelState.outputText = buildPrayerOutput(data, panelState.maxLines);
    const preview = document.getElementById('lwpp-preview');
    if (preview) {
      preview.style.display = '';
      preview.textContent = panelState.outputText;
    }
  }

  /** Build an HTML version of a slide sequence where each slide's first line
   *  (section title / Bible ref / prayer header) is wrapped in <strong><u>...</u></strong>.
   *  Written to the clipboard alongside plain text — if the target app reads
   *  text/html, first lines come in bold+underlined. Used for prayer and ROR. */
  function outputToHtmlWithBoldFirstLine(plainText) {
    const slides = plainText.split('\n\n');
    const htmlSlides = slides.map(slide => {
      const lines = slide.split('\n');
      if (!lines.length) return '';
      const first = escHtml(lines[0]);
      const rest = lines.slice(1).map(escHtml).join('<br>');
      const firstLine = `<strong><u>${first}</u></strong>`;
      return rest ? firstLine + '<br>' + rest : firstLine;
    });
    return `<div style="font-family:sans-serif">${htmlSlides.join('<br><br>')}</div>`;
  }

  async function writeClipboard(plainText, htmlText) {
    // Prefer async Clipboard API with both formats
    if (navigator.clipboard && window.ClipboardItem && htmlText) {
      try {
        const item = new ClipboardItem({
          'text/plain': new Blob([plainText], { type: 'text/plain' }),
          'text/html':  new Blob([htmlText],  { type: 'text/html'  })
        });
        await navigator.clipboard.write([item]);
        return;
      } catch (e) {
        console.warn('[LW→PP] Clipboard write() failed, falling back:', e);
      }
    }
    // Fallback: plain text only
    try {
      await navigator.clipboard.writeText(plainText);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = plainText;
      ta.style.cssText = 'position:fixed;left:-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  }

  async function handleCopy() {
    // For prayer paste fallback: regenerate from textarea
    if (panelState.data?.type === 'prayer' && !panelState.outputText) {
      const paste = document.getElementById('lwpp-paste');
      if (paste && paste.value) {
        const parsed = parsePrayerText(paste.value);
        panelState.data.mainTitle = parsed.mainTitle;
        panelState.data.sections = parsed.sections;
        updatePrayerOutput();
      }
    }
    // For songs: ensure output is current
    if (panelState.data?.type === 'song') updateOutput();

    const text = panelState.outputText;
    if (!text) {
      setStatus('Nothing to copy.', 'error');
      return;
    }

    // Prayer & ROR output: also write an HTML variant with bold+underlined
    // first line of each slide (section title / verse ref / prayer header).
    const htmlText = (panelState.data?.type === 'prayer' || panelState.data?.type === 'ror')
      ? outputToHtmlWithBoldFirstLine(text)
      : null;

    try {
      await writeClipboard(text, htmlText);
      setStatus('✓ Copied! Paste in ProPresenter → File → Import → Text from clipboard', 'success');
      const btn = document.getElementById('lwpp-btn-copy');
      btn.textContent = '✓ Copied!';
      setTimeout(() => { btn.textContent = 'Copy for ProPresenter'; }, 2000);
    } catch (err) {
      setStatus('Copy failed: ' + err.message, 'error');
    }
  }

  function escHtml(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ================================================================
  //  SITE DETECTION & INIT
  // ================================================================

  function detectSite() {
    const host = location.hostname.replace(/^www\./, '');
    if (host === 'loveworldlyrics.com') return 'loveworldlyrics';
    if (host === 'loveworldmusic.org') return 'loveworldmusic';
    if (host === 'thedevotionals.com.ng') return 'ror-devotionals';
    if (host === 'flatimes.com') return 'ror-flatimes';
    if (host === 'docs.google.com' && location.pathname.includes('/document/')) return 'gdocs-prayer';
    return null;
  }

  function init() {
    const site = detectSite();
    if (!site) return;

    // Both loveworldmusic.org and the new loveworldlyrics.com ("Lyrics +") are SPAs.
    if (site === 'loveworldmusic' || site === 'loveworldlyrics') {
      let tries = 0;
      const checkReady = () => {
        const hasStatic = getLoveworldLyricsText().length > 20;
        const container = document.querySelector('[class*="overflow-y-auto"][class*="scroll-smooth"]');
        const hasSynced = container && container.querySelectorAll('button').length > 3;
        const legacy = document.querySelector('.entry-content');
        if (hasStatic || hasSynced || legacy || tries > 12) {
          createFAB();
          createPanel();
        } else {
          tries++;
          setTimeout(checkReady, 1000);
        }
      };
      checkReady();

      // Also watch for SPA navigation
      let lastUrl = location.href;
      const observer = new MutationObserver(() => {
        if (location.href !== lastUrl) {
          lastUrl = location.href;
          panelState = { open: false, data: null, sections: null, maxLines: DEFAULT_MAX_LINES, outputText: '' };
          // Remove old panel state
          const oldPanel = document.getElementById('lwpp-panel');
          if (oldPanel) oldPanel.classList.remove('open');
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    } else {
      createFAB();
      createPanel();
    }
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
