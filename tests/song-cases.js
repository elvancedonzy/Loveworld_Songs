// Offline tests for the song extraction logic. Fixture lines are invented placeholders, not real lyrics.
var P = 0, F = 0;
function count(hay, needle) { var n = 0, i = 0; while ((i = hay.indexOf(needle, i)) >= 0) { n++; i += needle.length; } return n; }
function check(name, ok, out) {
  if (ok) P++; else F++;
  print((ok ? 'PASS ' : 'FAIL ') + name + (out !== undefined ? '  [' + out.length + '] ' + out.replace(/\n\n/g, ' || ').replace(/\n/g, ' / ').slice(0, 150) : ''));
}
function txt(kids) { __children = kids; return getLoveworldLyricsText(); }
function pp(kids) {
  var t = txt(kids); var p = parseLoveworldMusicLyrics(t);
  var secs = (p.hasLabels && p.sections.length) ? p.sections : classifySections(p.stanzas);
  return formatForProPresenter(secs, { maxLines: 4, mode: 'song' });
}
var v1 = ['Morning light across the valley', 'Every river sings a song of grace', 'Mountains rise to tell the story', 'Of the One who made the stars'];
var ch = ['Mighty Maker King of every nation', 'Ruler of the ages we adore You'];
var o;

// --- dedupe (existing behaviour) ---
o = txt([lab('VERSE 1')].concat(v1.map(s)).concat([lab('CHORUS')]).concat(ch.map(s)).concat([M.apply(null, v1), M.apply(null, ch)]));
check('1 single-labeled then multi-unlabeled: once, labeled', count(o, v1[0]) === 1 && o.indexOf('VERSE 1') >= 0 && o.indexOf('CHORUS') >= 0, o);
check('1b per-line copy joined into blocks', o.indexOf(v1.join('\n')) >= 0 && o.indexOf(ch.join('\n')) >= 0, o);
o = txt([M.apply(null, v1), M.apply(null, ch), M.apply(null, v1)].concat([lab('VERSE 1')]).concat(v1.map(s)).concat([lab('CHORUS')]).concat(ch.map(s)));
check('2 reverse order: keep labeled copy once', count(o, v1[0]) === 1 && o.indexOf('VERSE 1') >= 0, o);
o = txt([lab('VERSE')].concat(v1.map(s)).concat([lab('CHORUS')]).concat(ch.map(s)).concat([lab('VERSE'), M.apply(null, v1), lab('CHORUS'), M.apply(null, ch), lab('CHORUS'), M.apply(null, ch)]));
check('3 both labeled, multi has more labels -> keep multi', count(o, v1[0]) === 1 && count(o, ch[0]) === 2, o);
o = txt([lab('VERSE')].concat(v1.map(s)).concat([lab('CHORUS')]).concat(ch.map(s)).concat([M('Amazing God', 'Lanterns glowing on the harbour wall'), M('Oh oh distant thunder', 'Rolling softly over sleeping towns')]));
check('4 different song in tail -> keep both', o.indexOf('Amazing God') >= 0 && o.indexOf(v1[0]) >= 0, o);
o = txt([lab('VERSE 1')].concat(v1.map(s)).concat([lab('CHORUS')]).concat(ch.map(s)).concat([M.apply(null, ch), M.apply(null, ch)]));
check('5 per-line + 2 grouped chorus repeats -> keep all', count(o, ch[0]) === 3, o);
var kids6 = [lab('VERSE 1'), M('a b c', 'd e f'), s('g h i'), M('j k l', 'm n o'), lab('CHORUS'), M('p q r', 's t u'), s('v w x')];
o = txt(kids6);
check('6 interleaved renderings untouched, singles not joined', o === 'VERSE 1\n\na b c\nd e f\n\ng h i\n\nj k l\nm n o\n\nCHORUS\n\np q r\ns t u\n\nv w x', o);
o = txt([M('aa bb', 'cc dd'), M('ee ff', 'gg hh'), M('ii jj', 'kk ll'), s('mm nn oo')]);
check('7 multi + one single, no labels -> untouched', o === 'aa bb\ncc dd\n\nee ff\ngg hh\n\nii jj\nkk ll\n\nmm nn oo', o);

// --- (2) mixed split: per-line copy w/ a few grouped blocks, then grouped copy with inline labels ---
var lj = ['Faithful Shepherd, guide my footsteps', 'Lead me gently through the meadow', 'Where the quiet waters gather', 'and the weary find their rest'];
var lc = ['Faithful Shepherd, You are near me', 'Strong and steady in the stormy night', 'Your mercy never fails'];
var kids8 = [lab('VERSE 1')].concat(lj.map(s)).concat([lab('CHORUS')]).concat(lc.map(s))
  .concat([lab('BRIDGE'), M('Hallelujah', 'Hallelujah', 'Hallelujah'), s('Glory over all the earth'), M('Hallelujah', 'Hallelujah', 'Hallelujah'), s('Glory over all the earth')])
  .concat([M.apply(null, ['Verse 1'].concat(lj)), M.apply(null, ['Chorus'].concat(lc)), M('Pan', 'Hallelujah', 'Hallelujah', 'Hallelujah', 'Glory over all the earth')]);
o = txt(kids8);
check('8 mixed split (per-line copy + grouped copy with inline labels): copy 2 dropped', count(o, lj[1]) === 1 && o.indexOf('Pan') < 0 && o.indexOf('BRIDGE') >= 0, o);
// mixed but tail genuinely different -> keep
var kids9 = kids8.slice(0, 15).concat([M('Verse 1', 'Faithful Shepherd, guide my footsteps home', 'Brand new words entirely different here', 'Nothing like the first copy at all'), M('Another stanza of fresh content', 'More new words that were not there')]);
o = txt(kids9);
check('9 mixed split but tail differs -> keep all', o.indexOf('Brand new words') >= 0 && o.indexOf('fresh content') >= 0, o);

// --- (3) whole song printed 3x in the same rendering ---
var am = [M('Bright the dawning of the morning', 'gentle is the evening breeze'), M('Silver moonlight on the water', 'Like a lantern in the dark'), M('Holy Maker of the heavens', 'You are wonderful'), M('Praise forever', 'Praise forever')];
o = txt(am.concat(am).concat(am));
check('10 whole song 3x -> once', count(o, 'Bright the dawning') === 1 && count(o, 'Praise forever') === 2, o);
o = txt(am.concat(am).concat(am.slice(0, 2)));
check('11 whole song 2.5x -> once', count(o, 'Bright the dawning') === 1, o);
var vc = [M('verse one line a', 'verse one line b'), M('chorus x', 'chorus y'), M('verse two line a', 'verse two line b'), M('chorus x', 'chorus y')];
o = txt(vc);
check('12 V C V2 C not periodic -> untouched', count(o, 'chorus x') === 2 && o.indexOf('verse two') >= 0, o);
o = txt([lab('VERSE 1'), am[0], lab('CHORUS'), am[2], lab('VERSE 1'), am[0], lab('CHORUS'), am[2]]);
check('13 labeled song repeated -> once incl. its labels', count(o, 'Bright the dawning') === 1 && count(o, 'CHORUS') === 1, o);

// --- per-line join ---
var pl = [lab('VERSE 1')].concat(['l1 a', 'l2 b', 'l3 c', 'l4 d', 'l5 e', 'l6 f'].map(s)).concat([lab('CHORUS')]).concat(['c1 a', 'c2 b', 'c3 c'].map(s));
o = pp(pl);
check('14 labeled per-line song -> 4-line slides under labels', o === 'Verse 1\nl1 a\nl2 b\nl3 c\nl4 d\n\nl5 e\nl6 f\n\nChorus\nc1 a\nc2 b\nc3 c', o);
o = pp(['x1 aaa', 'x2 bbb', 'x3 ccc', 'Chorus', 'y1 ddd', 'y2 eee', 'Solo:', 'y3 fff'].map(s));
check('15 per-line with inline label + cue lines -> joined, cue stripped', o.indexOf('x1 aaa\nx2 bbb\nx3 ccc') >= 0 && o.indexOf('y1 ddd\ny2 eee') >= 0 && o.indexOf('Solo') < 0 && o.indexOf('\nChorus\n') < 0, o);

// --- classifySections verse numbering ---
var st = []; for (var i = 1; i <= 12; i++) st.push('unique stanza number ' + i + '\nsecond line ' + i);
var cs = classifySections(st);
check('16 12 unique stanzas, no chorus -> no Verse > 8', cs.every(function (x) { return !/^Verse (9|\d\d)$/.test(x.group); }), cs.map(function (x) { return x.group; }).join(','));
var V = function (k) { return [k + 'a', k + 'b', k + 'c', k + 'd'].join('\n'); };
var st2 = [V('v1'), V('v2'), 'cho a\ncho b', V('v3'), V('v4'), 'cho a\ncho b', V('v1'), 'cho a\ncho b'];
cs = classifySections(st2);
check('17 short song keeps per-stanza verses + repeated verse reuses label', cs.map(function (x) { return x.group; }).join(',') === 'Verse 1,Verse 2,Chorus,Verse 3,Verse 4,Chorus,Verse 1,Chorus', cs.map(function (x) { return x.group; }).join(','));
var st3 = []; for (var j = 0; j < 4; j++) { st3.push(V('a' + j), V('b' + j), V('c' + j), 'cho a\ncho b'); }
cs = classifySections(st3);
check('18 long song (12 unique verses) -> verse = run between choruses', cs.map(function (x) { return x.group; }).join(',') === 'Verse 1,Verse 1,Verse 1,Chorus,Verse 2,Verse 2,Verse 2,Chorus,Verse 3,Verse 3,Verse 3,Chorus,Verse 4,Verse 4,Verse 4,Chorus', cs.map(function (x) { return x.group; }).join(','));
var hymn = ['h1 a\nh1 b', 'h2 a\nh2 b', 'h3 a\nh3 b', 'h4 a\nh4 b'];
cs = classifySections(hymn);
check('19 4-verse hymn unchanged', cs.map(function (x) { return x.group; }).join(',') === 'Verse 1,Verse 2,Verse 3,Verse 4', cs.map(function (x) { return x.group; }).join(','));

// --- regex: performers / slash labels ---
var yesPerf = ['RESP.', 'Alto/Tenor', 'Soprano', 'Men & Women', 'Solo 1:', 'Call and Response:', 'All:'];
check('20 performer cues', yesPerf.every(function (x) { return LM_PERFORMER_RE.test(x); }), yesPerf.filter(function (x) { return !LM_PERFORMER_RE.test(x); }).join('|'));
var noPerf = ['All the earth', 'Men of God arise', 'Solo Deo gloria', 'Alto and above'];
check('21 lyric lines not performer cues', noPerf.every(function (x) { return !LM_PERFORMER_RE.test(x); }), noPerf.filter(function (x) { return LM_PERFORMER_RE.test(x); }).join('|'));
var yesSec = ['REFRAIN/PAN', 'VERSE 1/2', 'CHORUS/REFRAIN', 'VERSE 1 SOLO', 'Verse 2 Alto/Tenor:', 'VERSE 1 X2', 'CHORUS TAKEN TWICE', 'Chorus (once)', 'VERSE END'];
check('22 section labels', yesSec.every(function (x) { return LM_SECTION_STRICT_RE.test(x); }), yesSec.filter(function (x) { return !LM_SECTION_STRICT_RE.test(x); }).join('|'));
var noSec = ['Chorus of angels sing', 'End of the age', 'Verse by verse we read', 'Bridge over troubled', 'Tag along with me'];
check('23 lyric lines not section labels', noSec.every(function (x) { return !LM_SECTION_STRICT_RE.test(x); }), noSec.filter(function (x) { return LM_SECTION_STRICT_RE.test(x); }).join('|'));
var pr = parseLoveworldMusicLyrics('REFRAIN/PAN\nSoprano\nBe free\nAlto/Tenor\nBe free\nBe free');
check('24 REFRAIN/PAN -> Bridge, voice cues stripped', pr.sections.map(function (x) { return x.group + ':' + x.text.replace(/\n/g, '/'); }).join(' ; ') === 'Bridge:Be free ; Bridge:Be free/Be free', pr.sections.map(function (x) { return x.group + ':' + x.text.replace(/\n/g, '/'); }).join(' ; '));


// --- (2b) labeled grouped copy, then unlabeled grouped replay in sung order  ---
var nr = [lab('VERSE 1'), M('Solo:', 'Long ago before the mountains', 'You had planned a path for me'), lab('ALL'), M('Shaped and molded by Your kindness', 'Made complete'),
  lab('CHORUS'), M('Gracious Father', 'Keeper of the morning'), lab('VERSE 2'), M('Travellers on a winding road', 'with a lamp to light the way'), lab('CHORUS'), M('Gracious Father', 'Keeper of the morning'), M('Like the stars above the ocean', 'Shining be Your name'),
  M('Long ago before the mountains', 'You had planned a path for me'), M('Shaped and molded by Your kindness', 'Made complete'), M('Gracious Father, keeper of the morning'), M('Travellers on a winding road', 'with a lamp to light the way'), M('Gracious Father, keeper of the morning'), M('Like the stars above the ocean', 'Shining be Your name')];
o = txt(nr);
check('25 labeled copy + unlabeled replay -> keep labeled once', count(o, 'Travellers') === 1 && o.indexOf('VERSE 2') >= 0 && count(o, 'Like the stars') === 1, o);
// labeled song whose unlabeled tail is only a short chorus+ending repeat -> keep
var sh = [lab('VERSE 1'), M('Glory glory to the King', 'Sing it in the early morning'), lab('VERSE 2'), M('Many different words in this verse', 'Telling a long and winding story here', 'That never shows up again anywhere'), lab('CHORUS'), M('Glory glory to the King', 'Merciful and mighty'), M('Glory glory to the King', 'Merciful and mighty')];
o = txt(sh);
check('26 labeled song + unlabeled chorus repeat at end -> keep all', count(o, 'Merciful and mighty') === 2, o);

// --- (2c) same rendering, near-total replay (P1 P2 P1 P2, P2 = P1 with doubled lines) ---
var p1 = ['Softly falls the evening rain', 'Gentle on the garden wall', 'Nothing like Your kindness', 'Over all the land', 'Lantern in the window', 'Guiding me home'];
var p2 = ['Softly falls the evening rain', 'Gentle on the garden wall', 'Nothing like Your kindness', 'Nothing like Your kindness', 'Over all the land', 'Over all the land', 'Lantern in the window', 'Guiding me home', 'Guiding me home'];
o = txt([].concat(p1, p2, p1, p2).map(s));
check('27 per-line whole-song replays -> one pass', count(o, 'Lantern in the window') === 1, o);
// chorus opens the song and returns: C V1 C V2 C -> untouched
var C = ['Sing a song of morning gladness', 'Lift it high above the trees'];
var V1 = ['Out along the quiet river', 'Willows bending in the breeze'], V2 = ['Seven bridges in the city', 'Every one a different blue'];
o = txt([M.apply(null, C), M.apply(null, V1), M.apply(null, C), M.apply(null, V2), M.apply(null, C)]);
check('28 chorus-first song -> untouched', count(o, 'Sing a song of morning') === 3 && o.indexOf('Seven bridges') >= 0, o);
o = txt([C, V1, C, V2, C, C, V1, C, V2, C].map(function (x) { return M.apply(null, x); }));
check('29 chorus-first song sung twice -> one pass', count(o, 'Seven bridges') === 1 && count(o, 'Out along the quiet') === 1, o);

// --- cue / repeat handling ---
o = pp([lab('VERSE 1 SAMSON'), M('Shining like the morning star', 'Over every hill and plain'), lab('CHORUS'), M('Seated high above the clouds', 'Ruling all the earth')]);
check('30 "VERSE 1 <singer>" label -> Verse 1, not a lyric', o.indexOf('SAMSON') < 0 && o.indexOf('Verse 1\nShining like the morning') === 0, o);
var pr2 = parseLoveworldMusicLyrics('Chorus\nSteady and true through all the years\nWe will sing 2x\nRepeat\nVerse 2\nRepeat the sounding joy\nHoly (x3)\nAmen (twice)\nPsalm 23\nAdlib: Bro. Sam and Sis. Ada:\nHallelujah');
var flat = pr2.sections.map(function (x) { return x.group + ':' + x.text.replace(/\n/g, '/'); }).join(' ; ');
check('31 repeat cues stripped, lyrics kept', flat === 'Chorus:Steady and true through all the years/We will sing ; Verse 2:Repeat the sounding joy/Holy/Amen/Psalm 23 ; Verse 2:Hallelujah', flat);
var rep = ['Repeat', '(Repeat)', 'Repeat chorus', 'Repeat Chorus x2', 'x2', '2x', '(x3)', 'Twice', 'Rpt.'];
check('32 repeat-only lines recognised', rep.every(function (x) { return LM_REPEAT_RE.test(x); }), rep.filter(function (x) { return !LM_REPEAT_RE.test(x); }).join('|'));
var notRep = ['Repeat the sounding joy', 'Twice as much', 'x marks the spot', '2 Corinthians 5'];
check('33 lyric lines not repeat cues', notRep.every(function (x) { return !LM_REPEAT_RE.test(x); }), notRep.filter(function (x) { return LM_REPEAT_RE.test(x); }).join('|'));

check('34 "End Taken Twice In Harmony" label, "RESP;" cue', LM_SECTION_STRICT_RE.test('End Taken Twice In Harmony') && LM_PERFORMER_RE.test('RESP;') && !LM_SECTION_STRICT_RE.test('End of harmony and peace'), '');

// --- strict replay must not drop new lines  ---
var rj = ['Morning bells are ringing out, and so are we', 'Over every rooftop', 'Calling all the neighbours near', 'Open up the door', 'Bring the bread', 'Pour the tea', 'Everyone is here', 'Celebrate!'];
var rjAll = rj.concat(rj, ['Every lamp is lit tonight', 'Every song is sung tonight'], rj, rj);
o = txt(rjAll.map(s));
check('35 repetitive per-line song with new tail lines -> nothing lost', o.indexOf('Every lamp is lit') >= 0 && o.indexOf('Every song is sung') >= 0, o);
var sg = [M('Evergreen and ever faithful', 'Steady as the hills'), M('No one, nowhere quite like You', 'Higher than the sky'), M('Evergreen and ever faithful', 'Steady as the hills'), M('Evergreen and ever faithful', 'Steady as the hills'), M('Steady as the hills', 'Higher than the sky')];
o = txt(sg);
check('36 grouped chorus-first song -> keeps the unique stanza', o.indexOf('nowhere') >= 0, o);

// --- bracketed labels ---
var br = parseLoveworldMusicLyrics('( Chorus )\nSing a song of morning gladness\n(Bridge)\nOut along the quiet river\n( Verse 2 End )\nSeven bridges in the city');
var brf = br.sections.map(function (x) { return x.group + ':' + x.text; }).join(' ; ');
check('37 "( Chorus )" style labels', brf === 'Chorus:Sing a song of morning gladness ; Bridge:Out along the quiet river ; Ending:Seven bridges in the city', brf);
check('38 lyric in brackets is not a label', !LM_SECTION_STRICT_RE.test('(Chorus of angels)') && !LM_SECTION_STRICT_RE.test('(Bridge over the river)'), '');

check('39 "Coda: 2" / "Verse1" labels', LM_SECTION_STRICT_RE.test('Coda: 2') && LM_SECTION_STRICT_RE.test('Verse1') && LM_SECTION_STRICT_RE.test('Chorus 2x') && !LM_SECTION_STRICT_RE.test('Coda: the end of days'), '');

print('\n' + P + ' passed, ' + F + ' failed');
