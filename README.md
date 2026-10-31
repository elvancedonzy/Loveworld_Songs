# Loveworld → ProPresenter

A Chrome extension that turns a Loveworld song page (loveworldlyrics.com, loveworldmusic.org), a Rhapsody of Realities devotional (thedevotionals.com.ng, flatimes.com) or a Google Docs prayer outline into text ready for ProPresenter's **File → Import → Text from clipboard**.

## Install

1. Open `chrome://extensions` and switch on **Developer mode**.
2. Click **Load unpacked** and choose the `extension` folder.
3. After pulling an update, press the **↻ reload** button on the extension card.

## Use

Open a song page and click the floating button, check the labels in the panel, then press **Copy**. In ProPresenter, use **File → Import → Text from clipboard** with "Line Break" as the delimiter and 2 delimiters per slide.

The output has a blank line between slides and a group label (Verse 1–8, Chorus, Pre-Chorus, Bridge, Tag, Ending, Intro, Outro, Vamp, Instrumental, Misc) on the first slide of each group. Slides hold up to 4 lines; you can change this in the panel.

## How loveworldlyrics.com songs are cleaned up

The site's lyric data is often messy. The extension handles:

- **Songs printed twice**: a line-by-line copy plus a grouped copy, in either order, with labels on one or both. It keeps the copy with more labels, or the grouped copy if they tie.
- **Labeled copy then unlabeled replay**: a labeled copy followed by an unlabeled replay in sung order, or by a copy whose blocks carry their own "Verse 1" lines. It keeps one copy.
- **Whole song printed 2–4 times**: it keeps one pass.
- **Line-by-line songs**: lines are joined into blocks, so slides get up to 4 lines instead of one.
- **Label notes**: notes like "TAKEN TWICE", "x2", "(once)", "FOUR TIMES", "In Harmony" and "VERSE END" become the right group (VERSE END → Ending).
- **Slash labels**: labels such as "REFRAIN/PAN" are read as labels.
- **Singer and voice cues**: lines like "Solo:", "RESP.", "Alto/Tenor", "Pst Saki:", "Adlib: …:" and "VERSE 1 <singer>" are removed from the slides.
- **Repeat notes**: "Repeat" or "x2" on its own line, and "2x" or "(x3)" at the end of a lyric line, are removed.
- **Too many verses**: no more than Verse 8, since ProPresenter's groups stop there. A repeated stanza keeps its first verse number.

A section is only dropped as a duplicate when nearly every word in it already appears in the copy being kept, so real lyrics are not lost.

## Tests

```sh
tests/run-tests.sh
```

This runs 40 offline checks on macOS against `extension/content.js`. The test lines are invented placeholders, not real lyrics.

`reports/` holds the results of checking every song page on loveworldlyrics.com: status, slide counts and any flags. It contains no lyrics.
