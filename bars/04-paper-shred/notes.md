# Notes: 04 Paper shred

Every number on the page, each with its why. Study numbers come from study.md and are tagged there
(`Source: frames` or `Source: page`); the rest are page design, measured on the gate's 960 x 600 view at dpr 1.
Frame time: not measured (the Task 19 look review measures it in the browser pane).

## Study numbers (index.html `STUDY`, Source: frames)

| Number | Value | Why |
|---|---|---|
| pitch | 17.5 CSS px | the reference's strips repeat every 17 to 18 px (frame 79); the same width in CSS px on the phone clip |
| gap | 3 CSS px | the reference's dark gaps are about 3 px wide |
| start | 0.85 of the window height | where the shredder bar enters (frame 73, first shred-down still): the rest state |
| wave | 0.4 of the window height | sway wavelength, half-wave lag 122 to 220 px on a 900 px window |
| ampRest, ampWave, ampLift | 1.9, 5.4, 7 px | the sway's measured growth: 1.9 / 3.5 / 5.4 px at frames 78 to 80, 4 to 10 px (mean 7) while the ends rise |
| rag | 0.13 of the window height | spread of the strip ends while they rise (frames 81 to 83) |
| climb, waveSpan, lift | 0.74, 0.74, 1.67 window heights of scroll | the reference's beats at its wheel rate: 0.4 s, 0.4 s and 0.9 s at 1.667 px per ms on a 900 px window |

The reference scrolls its own canvas on wheel input; this page uses the window's scroll, so the beat lengths are
kept as window heights of scroll (the body is 415vh: one window plus the 3.15 of the beats).

## Page design (index.html `DESIGN` and the paint call)

| Number | Value | Why |
|---|---|---|
| head | 64 CSS px | the header band that stays, as the reference's header stays above the strips; the cut stops at its lower edge |
| curl | 4 CSS px crown, 0.5 to 1 x per strip (seeded) | a crown about half the strip's half-width: the edges slope at about 0.9, so the key light gives each strip a lit crown and dark curled edges, as the reference's strips read |
| twist | 1.6 CSS px | one edge rises over the other along the strip (period about 880 px, seeded phase), so strips catch the light unevenly along their length, as in frames 81 to 84 |
| drop | 3 CSS px | the gaps sit below the paper, so each cut edge is a small step the light shades |
| crease | 1.2 CSS px, 3 px wide | the cut line is a raised crease in the paper (the reference's is a 3D shredder bar, not copied) |
| liftCurl | 6 CSS px over the last 140 px of a strip | a lifting strip's end curls toward the viewer and catches the key, as the free ends do in frames 84 to 88 |
| pin | 0.35 of the window height | the sway grows from 0 at the cut to full over this length, so strips hang from the cut rather than sliding under it |
| lift easing | ends rise as l^1.5 | the reference's ends rise slowly first (118 px in the first 0.2 s) and then fast (the rest in 0.7 s) |
| scroll phase | one wavelength of wave travel per wavelength of scroll | the reference's wave moves down the strips as you scroll; the rate is not measurable from 10 fps frames |
| fade | 48 px | the section's line fades in once the lowest strip end has risen past its top, so no strip ever covers it (the line is HTML, the strips are paint) |
| idle | 3.0 s | Not from the reference: the slow sway at rest (study.md). A Task 19 question |
| key light | dir [-0.7, 0.6, 0.4], level 0.85 | the paper bars' key (bar 03): a grazing key from the upper left |
| ambient | 0.15 | as bar 03: lifts the far slopes off black |
| sheet warp | 0.45 | as bar 03: low macro relief on the uncut paper |
| detail | 0.6 | the paper bars' detail |
| rest position | sway and rise undone per strip | each strip writes where its paper sat on the flat sheet, so fibres, pulp, warp and printed words ride it (below) |
| uRise | h + 2 minus the strip end, CSS px | how far the strips have been pulled up: 0 until the ends rise; the strip's twist is read along its own length (y + uRise) so it rises too |
| printed reading (#print) | top 22%, 34em wide, Georgia 26-38 px heading and 17 px body | own copy (not the reference's), printed on the paper below the header so the cut climbs past it and its words shred; above the rest cut, so the gate reads it uncut |

Measured on the gate's view at seed 1: relight relief 0.0363 (0.0173 at detail 0), sheet height range 0.0299
(before the rework: 0.0367 and 0.0175; the 1.9 px idle sway now moves the fibres in the bottom 15% too).

## Why the gaps are ink, not coverage 0

The plan asks for "coverage gaps between strips". In the shade pass coverage 0 shows the page ground unlit
(`shade.ts`: `col = mix(uGround, col, s.coverage)`), and flat paper under this light (key 0.85 plus ambient 0.15)
comes out at about the ground's own tone, so coverage gaps do not read as gaps, and the "dark section" would be the
paper's own colour. So the strip field writes coverage 1 everywhere and prints the gaps and the revealed section in
the ink channel (ink 1, 3 px below the paper). The ink is "picture" ink (it comes from a non-text field), so
`setInk(false, "text")` leaves it on and the text check judges the header against it as paint. The engine proposal
for a real "behind" colour is in the ledger report (bar-04-report.md).

Measured (lint round, 1440 x 900, seed 1, `__paint.setTime(1)`, relative luminance of the screenshot). A throwaway copy
of the page wrote coverage 0 and ink 0 in the gaps (`vec4(h, body, 0, 0)`); the gap mask came from the real page's ink
gaps at the same scroll and time. At 1.1 window heights, light: gaps median 0.814 against strips 0.816; dark: gaps 0.0488
against strips 0.0461. At 3.2, with the strips gone, the revealed area reads 0.824 (p5 to p95 0.785 to 0.861) in light
and 0.0458 in dark, the paper's own tone (header paper 0.64 and 0.034 at rest). So coverage-0 gaps and the revealed
section come out within 0.002 (light) of the paper at 1.1: they do not read as gaps or as a dark section. The ink
version reads 0.016 in light (deep navy) at 3.2.

Consequence: the revealed section is the ink token in both schemes. In the light scheme that is a deep navy section
under cream paper, as in the reference. In the dark scheme it is a light section under dark paper. A Task 19 question.

## Dark ground: sweep and pick (after text-contrast failed)

The first build used a dark ground at oklch(0.23 0.03 272). The gate's text-contrast floor failed in dark: luma
range 0.0527 under 0.07. Look target, written before the sweep: in the dark scheme the strips' curls read as they
do in light (crowns catch the key, curled edges fall dark) and the page stays a dark page.

First sweep, key elevation (dir z at x -0.7, y 0.6), dark, rest frame, text hidden: relative-luminance range 0.0095
(z 0.4), 0.0107 (0.3), 0.0121 (0.22), 0.0132 (0.15). Crops at 1.1 window heights of scroll: the curls stay invisible
on dark paper at every elevation. Rejected: the light is not the cause.

Second sweep, dark ground lightness L (chroma 0.03, hue 272), same frame, plus the check's own luma range:

| L | luma range (rest) | Look at 1.1 window heights of scroll |
|---|---|---|
| 0.23 | 0.0524 | strips read as flat dark bands split by light gaps; no curl |
| 0.28 | 0.0602 | a faint crown on some strips |
| 0.32 | 0.0703 | crowns visible, edges faint |
| 0.36 | 0.0776 | crowns and dark curled edges read on every strip; still a dark page |

Pick: 0.36, the first that meets the look target (0.32 reaches the floor but its curls are faint). Gate after the
pick: dark range 0.0781, header text 6.88:1 and 6.16:1.

## Capture readout (bar-study-capture.md step 4)

Not run. The reference scrolls its own canvas from wheel deltas (40000 px of wheel over the capture), while this page
scrolls the window (3735 px of scroll at 900 px), so the same command would play this page's whole shred in about
the first 2 s of the reference's 24 s and `compare` would line up different beats. A readout needs a capture of the
page driven to the same beat positions (a scroll-to per beat), a Task 19 question.

## Texture follows the strip (rework, 2026-11-14)

Why: in the first build the strips' outlines swayed and lifted, but the paper's fibres and pulp were drawn at the
screen position, so they stayed pinned while the strips slid over them (the owner: "a green-screen effect"). The engine
round "texture follows the surface" added rest positions. Now:

- The strip field writes `"rest"`. `fieldRest` undoes the strip's sway (`x - swayAt`) and its rise (`y + uRise`).
  Above the cut and in the revealed section it returns the screen position: the sheet above is at rest, and the
  section behind the strips does not move. The side gaps carry their strip's rest (fix round 1): they print in
  ink, so texture riding with them cannot be seen, and a rest that jumped by `uRise` at each gap edge made the
  shade pass break the gap lines into dashes while the strips lift (table below).
- Paper fibres and pulp (materials.paper), the sheet warp (fields.sheet) and the printed text (fields.text) are
  read at the rest position by the engine, so they ride each strip.
- Printed reading is new: a heading and one paragraph (own copy) on the paper under the header. Before, the only
  text was on the header band, which is never cut, so no words could shred. It answers the review's Task 19
  question "do blank strips read as shredding the page?" by printing on them. It sits above the rest cut and is in
  `text.always`.
- Nothing else changed: every study and design number above holds, and the gate passes at seeds 1-3.

### Measured carry (seed 1, 960 x 600, dpr 1, frozen time, grain 0)

Method: two frames, then the normalised cross-correlation peak of the fine detail (`textureShift`: frame minus a
9 x 9 box blur) in a box inside one strip (11 x 32 px, 1 px clear of the gaps), against the strip's own move
predicted from the page's sway and rise formulas at the box centre. "Fibres only" is the frame at detail 1 minus the
frame at detail 0: the strips' shape, warp and words do not depend on detail, so only the fibres and pulp are left
(without this the curl shading, which moves with the strip outline, would bias the plain-frame measure). The control
is the engine's test fault `rest-ignored` (every reader at the screen position), same pages, same boxes.

| Pair | Box | Strip's own move (px) | Texture move, rest positions | Texture move, fault control |
|---|---|---|---|---|
| Sway: scroll 1.3, t 0 vs t 0.75 | words, 4 strips (y 150) | 1.35 to 3.03, 0 | within 1 px in 4/4 (median error 0.35) | (0 or 1, 0) in 4/4: pinned |
| Sway | fibres only, 6 strips (y 360) | 2.38 to 6.33, 0 | within 1 px in 6/6 (median 0.33) | (0, 0) in 6/6, peak score 0.43 to 0.93 |
| Sway | fibres only, 4 strips (y 190) | -2.71 to 2.98, 0 | within 1.2 px in 4/4 | not within 1 px in 3/4 |
| Lift: scroll 1.8 vs 1.86, t 0 | words, 4 strips (y 100) | -0.4 to -0.9, -15.24 | within 1 px in 4/4 (median 0.40), dy -15 | (0 or -1, 0) in 4/4: pinned |
| Lift | fibres only, 6 strips (y 360) | -6.37 to 5.46, -15.24 | dy -15 in 6/6; within 1 px in 4/6, worst 2.43 | (0, 0) in 6/6, peak score 0.77 to 0.98 |
| Lift | fibres only, 4 strips (y 140) | -1.14 to 1.84, -15.24 | within 1 px in 4/4 (median 0.28) | not within 1 px in 0/4 |

The two lift misses over 1 px are in x only (-5 for -2.58, 5 for 3.22): in the lift pair the sway changes along the
32 px box (the wave also travels), and the prediction is taken at the box centre. The plain frame over blank paper
(no fibre isolation) does not track the lift in y: the travelling wave's curl shading dominates the fine band there,
which is why the fibres-only image is the measure.

A box translation under-reads a bending strip: across the 32 rows of a box the sway changes by up to 4 px, so one
shift cannot fit the sheared patch and the peak lands on a compromise. The stronger measure is a dense warp test (the
re-review's): for every strip-body pixel in frame B, sample frame A where the page's own sway and rise formulas say
that paper sat, and correlate. Carried r is 0.66 to 0.997 against pinned r at most 0.60, and the `rest-ignored-paper`
fault drops the fibres to -0.03 to 0.57. The future `carried` gate law (Task 20) should use the dense form, not one
translation per box.

### Fix round 1 (2026-11-14): drawRest forwarded, gaps carry the rest

- `strips()` forwards `drawRest`. The engine now draws every rest pass before any main pass, so both passes set the
  scroll and size uniforms themselves (`sync()`); a plain pass-through would write rest from the last frame's scroll.
  Frames at scroll 1.3 and 1.86 (t 0), and 1.3 at t 0.75 and 1.8, light and dark, match the pre-split build's
  frames: mean abs diff 0, max 0.
- Edge roughness of the gap lines: p99 / p99.9 of the absolute second difference of luminance along y, rows 250 to
  520, every column, 960 x 600, seed 1, grain 0.

| Frame | Gaps at screen position | Gaps carry the strip's rest |
|---|---|---|
| Light, scroll 1.86 | 92 / 188 | 53 / 134 |
| Dark, scroll 1.86 | 93 / 172 | 42 / 104 |
| Light, scroll 1.3 | 55 / 153 | 55 / 153 |
| Dark, scroll 1.3 | 43 / 122 | 44 / 122 |

The sway frames do not change, so the dashes came from the rise. All readers pinned (`rest-ignored`) give 45 / 125
on the dark 1.86 frame, so the fix is below even the no-carry floor.

- Carry after the fix, dense warp test (carried r / pinned r):

| Pair | Region | Light | Dark |
|---|---|---|---|
| Sway: scroll 1.3, t 0 vs 0.75 | fibres, y 360, 6 strips | 0.912 to 0.957 / 0.01 to 0.25 | 0.846 to 0.960 / -0.14 to 0.20 |
| Sway | words, y 150, 4 strips | 0.992 to 0.996 / -0.03 to 0.60 | 0.993 to 0.997 / 0.05 to 0.48 |
| Lift: scroll 1.8 vs 1.86, t 0 | fibres, y 360, 6 strips | 0.864 to 0.921 / -0.10 to 0.19 | 0.740 to 0.921 / -0.02 to 0.21 |
| Lift | words, y 100, 4 strips | 0.950 to 0.986 / -0.02 to 0.45 | 0.969 to 0.986 / 0.12 to 0.36 |

Frames read (Read tool): at scroll 1.3 the heading and paragraph are cut into strips and each strip's piece of a
letter is offset from its neighbours'; between t 0 and t 0.75 the pieces move with their strips. At scroll 1.86 the
words have risen about 67 px with the strips and slide into the cut line under the header; the ragged ends rise over
the navy section.

## Look review (Task 19, 2026-11-15)

Verdict: **keep**. The owner: "Keep". Frame time, measured in the Browser pane on the owner's Mac with the pane on screen (requestAnimationFrame cadence over 4 s, dpr 2, 939x959): scrolled through its full 3021 px range: 240 frames, median 16.7 ms, 95th percentile 17.7 ms, worst 17.8 ms, none over 20 ms (60 fps). Open look questions logged for later: type sizes off the scale; the scroll cue after the hint was removed.

## Look review (Phase 2 Task 5, 2026-11-16)

Read live in the browser pane, dark then light, at a build of 1b7db11. No paint change. The paper's dial-driven fibre variation is zero-mean since Phase 2 Task 2c.

- Dark: **keep**. The owner: "Keep (Recommended)".
- Light: **keep**. The owner: "Keep (Recommended)".
