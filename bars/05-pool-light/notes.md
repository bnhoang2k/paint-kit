# 05 Pool light: notes

Measured numbers, each with a why. Frames at the bar's view (393 x 852, dpr 1) unless a row says otherwise.
Frame time: not measured (the look review measures it on real hardware).

## Numbers

| Number | Value | Why | Source |
|---|---|---|---|
| Waves, rate, wave height | 6, 1, 0.6 | the water page's, picked by Task 15's look target (a cellular net of thin lines); the reference has 5 to 7 cells per short side | Task 15 report; study.md (Source: frames) |
| Floor depth | 1.0 short sides | the water page's focus depth for those waves | Task 15 report |
| Climb start | 2.2 s | the card's top reaches the bottom edge | study.md (Source: frames) |
| Climb speed | 0.089 short sides/s | the card's top edge, 4 s to 18 s, 25.7 px/s on a 290 px screen | study.md (Source: frames) |
| Card width | 0.59 short sides, capped so its height is at most 0.9 of the page | about 170 of 290 px; the cap keeps the card inside its picture on a wide page | study.md (Source: frames) |
| Card aspect | 852 / 393 | a phone screenshot | study.md (Source: frames) |
| Rise | 0.6 short sides, the card's lifted layer (depth 0.4) | look target and measured sweep below; outline ripple 2.55% mean, inside the 2 to 4% target | this file, "Rise" |
| Rise time | 3 s, smoothstep | the card is off the floor before its white panel shows (3 s x 0.089 = 0.27 short sides in view) | this file |
| Settle, alive | 10 s; 10 to 11.6 s | the reference's close-up window (10 to 11.6 s at 10 fps); the card is part way up there, so reduced motion and the sheet show the card | study.md (Source: frames) |
| Key direction | [-0.35, 0.45, 0.82] | the water page's | Task 15 report |
| Light split | key 0.15, ambient 1.0 | look target and sweep below | this file, "Light split" |
| Heading colour | `--title` white in light, the ink token in dark; the ink token without WebGL | the reference's heading is white serif | study.md (Source: frames) |

## Rise

### Fix round 2: the card as a lifted layer (current)

Look verdict on round 1: "Close: crisper card". The round-1 card was painted into the floor picture, so its outline
was read at the floor's full depth and tore and melted (round 1 below). The engine now has a lifted layer
(`fields.water({ layer: { picture, rise, shift } })`, water-layer-report.md in the ledger): the card is a picture of its
own, seen at its own depth, the floor (1.0) less its rise. The floor picture is now the plain accent and stays still;
the field's `shift` and `rise` map are gone.

Core look, named before the sweep: a crisp card under moving water. A phone shape with its rounded corners kept and
straight-reading edges that wobble a little, 2 to 4% of the card's width as in the reference's close-up; soft streaks
on its face. Not torn, not melted, and not a stiff sticker.

Measure: as round 1 (light mode, seed 1, detail 0.5, 393 x 852, dpr 1, heading hidden, luma under 60 from outside,
top, left and right edges, t 10, 10.3, 12, 14), now through the engine's shared `src/checks/outline.ts`: sub-pixel,
corners 24 px out, rows clipped to the page. Read with the caustic on (as seen) and off; the two differ by at most
0.1 point, so the table gives caustic on. The `before` row reproduces round 1's 0.45 row (27 / 13.6 / 15.1 px at t 10).

Sweep: RISE 0.55, 0.6, 0.65, 0.7 (the brief's range; the engine's table put rise 0.6 at 2.92% on a centred card).
Ripple in % of the card's width (232 px), top / left / right:

| RISE | t 10 | t 10.3 | t 12 | t 14 | in 2 to 4% | mean | median |
|---|---|---|---|---|---|---|---|
| before (painted, rise map 0.45) | 11.57 / 5.86 / 6.50 | 7.21 / 4.95 / 3.81 | 3.52 / 8.18 / 7.35 | 5.17 / 7.44 / 6.93 | 2 of 12 | 6.54 | 6.72 |
| 0.55 | 3.71 / 3.17 / 3.17 | 3.12 / 2.65 / 1.69 | 1.48 / 3.30 / 3.11 | 2.70 / 2.71 / 3.43 | 10 of 12 | 2.85 | 3.12 |
| **0.6 (picked)** | 3.04 / 2.91 / 3.01 | 2.78 / 2.53 / 1.60 | 1.32 / 2.67 / 2.71 | 2.62 / 2.57 / 2.81 | 10 of 12 | 2.55 | 2.69 |
| 0.65 | 2.26 / 2.31 / 2.58 | 2.28 / 2.10 / 1.30 | 1.01 / 2.51 / 2.60 | 2.49 / 2.18 / 2.71 | 10 of 12 | 2.19 | 2.30 |
| 0.7 | 1.84 / 2.16 / 2.24 | 2.04 / 1.83 / 1.04 | 0.92 / 2.08 / 2.25 | 1.92 / 1.78 / 2.17 | 6 of 12 | 1.86 | 1.98 |

**The target is reached** at 0.55, 0.6 and 0.65 (10 of 12 readings in 2 to 4%, medians inside it). The two readings
under 2% at each value are the same ones (t 10.3 right, t 12 top): the water is calm there, not the card stiff.

Pick: 0.6. The count ties 0.55, 0.6 and 0.65. Round 1's tie-break (the median nearest 3%) would take 0.55; this round
breaks the tie by the verdict ("crisper card") and by eye against the reference strip (out/wl-zoom.png), and says so,
as it was chosen after measuring. At 0.55 the top edge still shows a small lump beside the left corner at t 10
(3.71%, the highest reading in the band). At 0.65 the top edge is near straight at t 12 (1.01%) and the card starts to
read stiffer than the reference's gently bending panel. At 0.6 every reading is at or under 3.04%: a crisp phone shape
with a small, even wobble, and the panel's edges bend gently, as in the reference.

The card enters at rise 0 (depth 1.0, about 6.9% on the engine's centred card) and reaches 0.6 over RISE_TIME (3 s), so
its outline settles as it lifts. At t 5 (rise 0.59, card top at 754 px) it reads 2.76 / 2.22 / 2.20%.

The card's picture follows the water-layer review's rules: opaque, coverage in green (never alpha, which the upload
un-premultiplies into a hard edge); red holds the frame's tone past the card's edge, so filtering at the edge meets the
frame's own tone, not a fringe; built at device pixels (CSS size x devicePixelRatio, capped at the GPU's
MAX_TEXTURE_SIZE on the long side, read from the painter (`Painter.maxTextureSize`, since e9caa1b; round 2b used a throwaway WebGL2 context); 2048, the
least WebGL2 promises, if it cannot be read; on a device whose limit is 2048 a dpr 3 phone gets 80% of device pixels at
393 x 852 and 73% at 430 x 932). The floor picture is 1 x 1 (a flat tone, sampled linear and clamped by the engine). The
pictures are rebuilt after a 150 ms pause in resizing, and on a pixel-ratio change (a `matchMedia` resolution query,
re-armed after each change); the rise is never negative
(0 to 0.6). At dpr 1 the frames are pixel-identical to the CSS-pixel build; a dpr 2 frame at t 10 shows a crisp
edge (`out/bar05-r2/after-dpr2-t10-crop.png`). The measure scans 30 px each side of the rest edge, so it cannot read a
ripple far over that; the largest reading here is the before row's 26.9 px, which matches round 1's integer 27 px.

Frames (light, seed 1, heading hidden; out/ is not tracked): `out/bar05-r2/before-t{10,10.3,12,14}.png`,
`out/bar05-r2/after-t{3.5,5,10,10.3,12,14}.png`, dark `before-dark-t{10,14}.png` and `after-dark-t{10,14}.png`, the
sweep `rise{0.55,0.6,0.65,0.7}-t*.png`, strips `strip-t10.png`, `strip-t14.png` (before, 0.55, 0.6, 0.65, 0.7) and
`zoom-055-060.png`. Script: the round's scratchpad `bar05-r2-frames.mjs`.

### Fix round 1: the painted card (superseded)


Fix round 1 (review-bar-05.md, Important 3) replaced the first pick. The first sweep judged the outline by eye and
claimed "about 2 to 4%"; the reviewer measured 4 to 12% at 0.3.

Look target, written before this sweep: the card's outline ripples by 2 to 4% of the card's width, peak to peak, as
the reference's close-up does (study.md, "Outline ripple", Source: frames: 5 to 10 px on a card about 250 px wide).
The face's lines read as soft streaks (study.md, "Light on the card"); that is judged by eye in the frames after the pick.

Measure, the reviewer's: light mode, seed 1, detail 0.5, the bar's view (393 x 852, dpr 1), text hidden. Along each
edge, the first pixel with luma (Rec. 601) under 60 scanning inward from outside the card; the card's frame is the
dark ink end of the ramp, the floor is far lighter. Top edge: the middle 60% of the columns. Left and right edges: rows
from 40 px below the card's top (past the corner) to the card's bottom less 40 px or the page's bottom. Corners are
left out. Ripple = peak to peak of that edge's positions, in px and in % of the card's width (0.59 x 393 = 232 px).

Sweep, stated before measuring: rise.height 0, 0.3, 0.45, 0.6, 0.75 and 0.9 short sides (the floor is at 1.0); at t
10, 10.3, 12 and 14 (the card is fully risen from t 5.2). Pick rule, stated before measuring: the value with the most
of its 12 readings (3 edges x 4 times) inside 2 to 4%; a tie goes to the median nearest 3%. The target is reached when
that value's median is inside 2 to 4% and at least half its readings are. If no value reaches it, this file says so
and no other number is changed to force it.

Readings: ripple in px (% of 232 px), seed 1. The 0.3 row reproduces the review's top edge (27 and 17 px).

| rise.height | t 10 top / left / right | t 10.3 | t 12 | t 14 | in 2 to 4% | median |
|---|---|---|---|---|---|---|
| 0 | 28 (12.1) / 14 (6.0) / 21 (9.1) | 17 (7.3) / 8 (3.5) / 21 (9.1) | 6 (2.6) / 20 (8.6) / 26 (11.2) | 13 (5.6) / 23 (9.9) / 29 (12.5) | 2 of 12 | 8.0% |
| 0.3 (the first pick) | 27 (11.6) / 13 (5.6) / 22 (9.5) | 17 (7.3) / 8 (3.5) / 9 (3.9) | 5 (2.2) / 19 (8.2) / 17 (7.3) | 12 (5.2) / 17 (7.3) / 17 (7.3) | 3 of 12 | 7.3% |
| **0.45 (picked)** | 27 (11.6) / 13 (5.6) / 15 (6.5) | 16 (6.9) / 7 (3.0) / 7 (3.0) | 6 (2.6) / 19 (8.2) / 17 (7.3) | 12 (5.2) / 17 (7.3) / 16 (6.9) | 3 of 12 | 6.7% |
| 0.6 | 26 (11.2) / 13 (5.6) / 15 (6.5) | 17 (7.3) / 7 (3.0) / 6 (2.6) | 6 (2.6) / 19 (8.2) / 16 (6.9) | 12 (5.2) / 17 (7.3) / 16 (6.9) | 3 of 12 | 6.7% |
| 0.75 | 32 (13.8) / 13 (5.6) / 15 (6.5) | 17 (7.3) / 7 (3.0) / 6 (2.6) | 5 (2.2) / 19 (8.2) / 16 (6.9) | 12 (5.2) / 17 (7.3) / 16 (6.9) | 3 of 12 | 6.7% |
| 0.9 | 30 (12.9) / 13 (5.6) / 15 (6.5) | 17 (7.3) / 7 (3.0) / 6 (2.6) | 5 (2.2) / 19 (8.2) / 16 (6.9) | 12 (5.2) / 17 (7.3) / 16 (6.9) | 3 of 12 | 6.7% |

**No rise value reaches the target.** Every value has a median of 6.7% or more, and only 3 of 12 readings fall in 2 to
4%. Above 0.45 the outline does not change. The rise straightens the card's face, not its outline.

Why (a diagnostic probe, not a pick, and not kept): at the floor depth 0.5 with rise 0.45, the same measure reads
1.3 to 3.5% (t 10: 7 / 7 / 7 px; t 10.3: 7 / 3 / 3; t 12: 3 / 6 / 7; t 14: 7 / 5 / 8). So the floor's depth sets the
outline, not the card's rise. The `under` picture paints the card onto the floor itself. Beside the card, the eye's
ray goes down to the full floor depth, lands inside the card's footprint, and shows the card there. The floor depth
1.0 is the water page's caustic focus number (Task 15), so it stays. Closing this needed an engine change (the floor
under a lifted card drawn as floor, not as card); it was in the fix report, and round 2 made it. Until then the outline
rippled by about 7%, about twice the reference.

Pick: the rule leaves a tie, 0.45 to 0.9 (3 of 12 each, median 6.7%). The tie is broken by the look target's other
half, the face, judged by eye in the frames at t 10 and t 14 (this tie-break was chosen after measuring, and is
stated here as such). At 0.45 faint soft streaks still cross the white panel and the print bends a little with the
water. At 0.6 the streaks almost vanish. At 0.9 the face is flat and unbent inside a wobbling outline, a sticker on
the water rather than a card in it. So 0.45.

## Light split

Order of events, stated plainly: the first gate run failed text-contrast (light: heading 2.05:1, needs 3). Reading
that, I compared the pool with the reference and found our lines near white where the reference's are faint. The look
target came from the frames before the sweep: the reference's water (crop-4-19s, 4 s frame, no card) reads OKLab
lightness p50 0.603, p95 0.686, p99 0.709. The sweep keeps the water page's flat-floor sum (key + ambient = 1.15). Seed
1, detail 0.5, t 2, rows y 150 to 800:

| Key / ambient | p5 | p50 | p95 | p99 | Caustic width (px) |
|---|---|---|---|---|---|
| 0.85 / 0.3 (the water page's) | 0.479 | 0.568 | 0.904 | 0.927 | 2.52 / 2.65 |
| 0.3 / 0.85 | 0.553 | 0.589 | 0.753 | 0.795 | 3.56 / 3.59 |
| 0.2 / 0.95 | 0.563 | 0.593 | 0.713 | 0.747 | 3.52 / 3.54 |
| 0.15 / 1.0 | 0.568 | 0.595 | 0.690 | 0.720 | 3.50 / 3.55 (picked) |

Picked 0.15 / 1.0: the nearest to the frames on all three percentiles. The net still reads as a net (out/bar05/
sweep-split-s1.png). The reference's frames are downscaled video, which softens thin lines, so its p99 may understate
the peaks; a look question for Task 19.

## Heading

Set after the text-contrast fail, so stated here: the heading first used the ground token (lightness 0.975, the
card's panel). The reference's heading is white, so the heading got its own white token in light mode. Two values,
ground and white; picked white by the reference. Measured with the text-contrast check, seed 1, at the final light
split (key 0.15, ambient 1.0), worst tenth of the background:

| Heading colour (light mode) | Light | Dark (the ink token in both rows) |
|---|---|---|
| the ground token | 3.19:1 | 5.37:1 |
| white (picked) | 3.43:1 | 5.37:1 |

Both clear the 3:1 floor for large text, so the light split, not the white token, cleared it. White follows the
reference.

## The caustic law on this page

The caustic law now reads the light's concentration with every other light at 0 and nothing clipped, and judges
thinness by concentration (`relight.causticConcentration`), not by the old line width (task-caustic-fix-report.md in
the ledger). This page's frames at the bar's own split (key 0.15, ambient 1.0) did not clip, so the old width read
3.5 px here against 1.35 on the clipped water page; that was the old measure's fault, not this page's. Under the new
law the gate reads, at seed 1: concentration 5.19 / 5.07 (t 2 / t 2.5), overlap 0.013, read alone at 1.0 x the
light's level; at detail 0, 4.92 / 4.50. The width column in "Light split" above is the old measure, kept as measured
then.

The relight frames (t 2, t 2.5) catch the card at the bottom edge (its top reaches it at 2.2 s), so the law reads the
bare floor. No check reads the lines on the card's face; only the look review judges them.

Fix round 2 (the card as a lifted layer): the law did not move at seed 1. Concentration 5.19 / 5.07, overlap 0.013,
the same as round 1; at detail 0, 4.91 / 4.50 (round 1: 4.92 / 4.50). The relight frames still read the bare floor
(the card's top is at the bottom edge at t 2.5, at rise near 0), so the card's softer streaks are not in them. No
threshold was changed. Bar gate, once, at the end of round 2 (`node dist/src/cli/paint-kit.js gate
bars/05-pool-light`): exit 0, all nine checks `pass` at seeds 1, 2, 3, verdict `passed`.

## Laws: caustic only

bar.json declares `"laws": ["caustic"]`, not the plan's `caustic, relief`: no light on this page declares relief
(`throughWater` declares caustic, `ambient` none), and moving the wrapped key changes the frame by 0.0372 with the
caustic on but 0.0009 with `caustic: 0`, so the "relief" was the caustic sliding with the light's lean (review-bar-05.md,
Important 2).

## What the frames show

Fix round 2, RISE 0.6 on the lifted layer, seed 1, 393 x 852, light and dark, t 3.5 to 14:

- A crisp phone shape. The rounded corners are kept at every time, and each edge wobbles a little and evenly (2.55%
  mean). The round-1 lump on the top edge at t 10 and the bites along the sides are gone (strip-t10.png, before
  against 0.6).
- The card enters at the bottom edge at 2.2 s and lifts over 3 s; at t 3.5 and t 5 its top edge already reads clean.
- Soft pale streaks cross the white panel, softer than the floor's lines, because the layer sits out of the floor's
  focus. In dark mode the card's light frame carries the streaks more clearly; the shape reads the same.
- The print (panel, chip, dot, line, phone shapes, captions) travels with the card and bends a little with the water.
- The floor's net of thin light lines re-forms between the times, as before; the floor no longer moves (it is plain).

Fix round 1, at rise 0.45 (the painted card, superseded), seed 1, 393 x 852, light and dark, t 10 and t 14:

- The card climbs about 140 px from t 10 to t 14. Its panel, chip, dot, phone shapes and caption lines move with it,
  and each bends differently at each time (the line under the dot is straight-ish at t 10, wavy at t 14). The face's
  print travels with the card.
- Faint pale soft streaks cross the white panel in light mode, fainter than at rise 0.3. In dark mode the streaks
  show more clearly on the card's light lower part.
- The outline still ripples about 7% of the card's width, with a melted bulge on the top edge at t 10 ("Rise": the
  floor's depth sets it, an engine gap).
- The floor's net of thin light lines re-forms between the times. Dark mode: darker blue water, light heading, the
  card inverted by the tokens (light frame, dark panel).
- Sheet (36 cells, from the first round, before the rise change): the net and the card show in every cell; seeds 2
  and 3 read more grid-like; detail 1 adds a finer mesh; key B moves the net a little.

## Look review (Task 19, 2026-11-15)

First look: **close**. The owner: "Close: crisper card (Recommended)". The engine gained a lifted layer under the water and the card moved onto it at rise 0.6 (rounds 2 and 2b). Second look, with the card's top edge and the pool floor ringed: **keep**. The owner: "Keep as is (Recommended)". The floor stays plain. Frame time, measured in the Browser pane on the owner's Mac with the pane on screen (requestAnimationFrame cadence over 4 s, dpr 2, 939x959): 240 frames before the card rises and 240 with the card on screen (t 8 to 12), each median 16.7 ms, 95th percentile 17.6 ms, worst 17.7 ms, none over 20 ms (60 fps).

## Phase 2 dark readings (Task 1, 2026-11-16)

Measured before any change with `scripts/measure.mjs` (commit 539073c), seeds 1 / 2 / 3.

- Caustic concentration, against `relight.causticConcentration` 2.565: light 5.065 / 5.789 / 4.484; dark 0.9246 / 1.258 / 1.083. Dark fails at every seed.
- Caustic overlap, against `relight.causticOverlap` 0.5: light 0.01270 / 0.01931 / 0.007663; dark 0.000 / 0.000 / 0.000, reported failing at every seed with the concentration.
- `detail` rise, against `detail.minRise` 0.012: light 0.6348 / 0.7034 / 0.6262; dark 0.4275 / 0.4914 / 0.4212. Dark passes.
- **Which case holds:** the caustic law fails bar 05 in dark, so the gate can see the spread. The Task 4 fix is judged by the gate and then by the owner's eye; no limit changes.

## Phase 2 dark fix (Task 4, 2026-11-16): no paint change; the dark read is blocked

**Result:** the paint call is unchanged. The dark caustic is as thin and as mobile as the light one. The caustic law
fails in dark because its exposure rule halves the whole read, and the halved dark floor then falls under the law's
readability floor. A paint change that passes would change the look to dodge the check, which AGENTS.md forbids. The
decision goes back to the owner and the plan driver.

**Cause, measured** (probe scripts in the task's scratchpad, the law's own `readCaustic`, `brightMask` and `overlap`
from dist at 0093062):

1. At t 2.5 the card's top edge is about 10 px into the page (it enters at 2.2 s). In dark the tokens invert the card,
   so its frame (ramp 0.9) is near the ink token, near white. With the key alone at its level (0.15), the caustic on
   that frame reaches the finish's knee: 32 px, rows 847 to 851, seed 1. No floor pixel reaches it. In light the
   frame is dark, so nothing reaches the knee.
2. One pixel at the knee makes the law halve the light for the whole frame (level 0.5).
3. At half level, the dark floor (the accent, oklch 0.43) reads a caustic-off luminance of 0.0061 (p50), under
   `CAUSTIC_DARK` 0.01. So 99.5% of the floor is left out. The law then reads about 0.1% of the page (stray card and
   edge pixels): concentration near 1, overlap 0. At full level the same floor reads 0.0119, just over 0.01.

**The dark lines are not spread.** Read by the law's own code with the level held at 1 x (its knee guard off):

| Seed | Light, as the gate reads it (level 1) | Dark, as the gate reads it (level 0.5) | Dark held at level 1 |
|---|---|---|---|
| 1 | conc 5.19 / 5.07, overlap 0.0127, kept 99.4% | conc 1.01 / 0.92, overlap 0, kept 0.1% | conc 5.00 / 4.86, overlap 0.0132, kept 99.9% |
| 2 | conc 5.79 / 5.85, overlap 0.0193, kept 99.3% | conc 6.66 / 1.26, overlap 0, kept 0.1% | conc 5.56 / 5.63, overlap 0.0201, kept 100% |
| 3 | conc 4.48 / 4.51, overlap 0.0077, kept 99.3% | conc 1.08 / 1.96, overlap 0, kept 0.2% | conc 4.39 / 4.42, overlap 0.0078, kept 100% |

Thresholds: `relight.causticConcentration` 2.565 (at least), `relight.causticOverlap` 0.5 (under). The dark column at
level 1 would pass at every seed, within 0.3 of light's concentration. The `measure.mjs` cells (relight and relight0,
seeds 1 to 3, both schemes) match Task 1's readings exactly; light is unchanged because nothing was changed.

**The sheet** (rendered before this task; no change, so no after sheet): the dark cells show the same net of thin bright
lines as the light cells, in the same places, on a darker floor (seed 1, detail 0.5, key A, light beside dark). The
card is inverted in dark (light frame, dark panel), as the tokens give it.

**Changes that would pass, and why none was made:**

- Darken the card's frame in dark, or keep the card from inverting: a look change to the card the owner kept, made only
  because of the check.
- Raise the dark accent or the key's level: brightens the dark pool to clear `CAUSTIC_DARK`, a number picked so the
  check passes.

**Where a fix could go** (outside this bar, so not done): the law's knee guard could judge only the floor, or the
pixels it then reads, so a bright layer's clip does not halve the whole frame; or the readability floor could follow
the exposure. Either is a check change with its own planted-fault fixture. The other route is a look decision on the
dark card's frame, for the owner.

### Check fix (Task 4 round 2, 2026-11-16)

The driver took the check-side route. The caustic law's knee guard halved the light for the whole read when any water
pixel reached the knee. It now judges only the pixels the law reads (`kneeBiases` in `src/checks/relight.ts`). It
halves while a read pixel reaches the knee in its caustic-off frame, or in a caustic-on frame with its c - 1 at or
under that frame's cut. The knee only lowers an on frame, so a pixel clipped above the cut cannot change the cut or the
brightest 5%. No threshold, law or page changed. The planted fault `test/faults/relight-dark-05-pool-light` (a soft,
spread caustic plus a clipping card frame, both in dark only) still fails at seeds 1 to 3.

After readings (`measure.mjs`, relight, level 1 x in every cell), concentration and overlap, seeds 1 / 2 / 3:

- Light: 5.065 / 5.789 / 4.484 and 0.0127 / 0.0193 / 0.0077, the same as before.
- Dark: 4.860 / 5.556 / 4.394 and 0.0132 / 0.0201 / 0.0078 (before: 0.92 / 1.26 / 1.08 and 0).
- Detail 0, light: 4.503 / 5.418 / 3.731; dark: 4.294 / 5.205 / 3.660. All pass.

The paint is unchanged. In the sheet the dark cells show the same thin net as the light cells, on a darker floor
(seeds 1 to 3, detail 0 to 1).

## Look review (Phase 2 Task 5, 2026-11-16)

Read live in the browser pane, dark then light, at a build of 1b7db11. No paint change: the old dark caustic failure was the check reading one clipped pixel on the card frame (Task 4 guard fix); the dark net matches the light net.

- Dark: **keep**. The owner: "Keep (Recommended)".
- Light: **keep**. The owner: "Keep (Recommended)".
