# Catalogue check: 31 Oct 2026

I opened every song page on loveworldlyrics.com (1,481 pages) in a browser and ran the extension's own extraction code on each one. Every page's output was then compared word by word against the lyrics shown on the page.

The per-song results are in `song-check-2026-10-31.csv`. It lists the slug, link, status, slide count, groups and a note for each song, and contains no lyrics.

## Results

| | Songs |
|---|---|
| Pages checked | 1,481 |
| Lyrics extracted OK | 1,271 |
| No lyrics on the site yet ("Lyrics being written out") | 210 |
| Section labels taken from the site | 887 |
| Section labels auto-detected (site has none) | 384 |
| Label, singer or repeat cues showing up as lyrics | **0** |
| Verse numbers above 8 (ProPresenter's limit) | **0** |
| Slides with more than 4 lines | **0** |
| Errors or pages that failed to load | **0** |

### Every word accounted for

For 1,239 songs, every word on the page appears in the output (apart from labels and cues).

The other 32 songs are marked in the CSV. 27 of them are pages where the site has **two slightly different transcriptions** of the same song, and the extension keeps one of them. The words in the copy it doesn't use were checked by hand. They are spelling or wording differences, such as "Halleluyah" vs "Hallelujah", "forevermore" vs "forever more", "stronghold" vs "strong hold" and "gracious" vs "glorious". On one page ("Splendour") it is also the site's own promo text ("Discover more / Live Performance Videos"). The remaining 5 carry a "singer/label cue words removed" note.

## Before vs after this update

These figures are from the 1,152 songs that have lyrics and were measured with both the old and the new logic.

| | Before | After |
|---|---|---|
| Songs printed twice (duplicate copy) | 90+ | 0 |
| Songs with label/cue text, or invalid verse numbers, in the slides | 101 | 0 |
| Songs with "Verse 9" or higher | 127 | 0 |
| Total slides | 40,608 | 22,120 |
| One-line slides | 21,424 (53%) | 3,943 (18%) |

Most of the one-line slides left are intentional. They are call-and-response parts, where each singer's line is its own slide, and short tags such as "Hallelujah".

## Worth knowing

- Twelve "God of Heaven and Earth" pages each give about 260 slides. The site's page really holds a very long anthem with 43 sections, and nothing is duplicated.
- Some songs have no blank lines or labels on the site at all. They come out as one long "Verse 1" split into 4-line slides; you can relabel them in the panel.
