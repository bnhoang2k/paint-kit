# Notes: 03 Halftone resolve

Every number on the page, each with its why. Timeline numbers come from study.md and are tagged there
(`Source: frames`); the rest are page design, measured on the gate's 960 x 600 view at dpr 1.

## Timeline (index.html `TIMELINE`, Source: frames)

| Number | Value | Why |
|---|---|---|
| empty | 0.35 s | the reference tile stays empty until 0.35 s |
| steps | 4, 2, 1 x the fine cell from 0.35, 0.5, 0.6 s | three grids, pitch ratio 2 per step (16 -> 8.4 -> 4.2 px), about 0.1 s each |
| fullAt | 0.75 s | the dots reach full tone and hold at about 0.75 s (0.4 s from first dots) |
| arrivals | 2.0 s, 3.67 s | the next pictures arrive at the reference's 1.67 s cadence |
| darken | 0.2 s | a later picture goes from pale to dark within about 0.2 s |
| across | 58 fine cells across the plate | the reference's fine grid is about 58 cells across its tile |
| cycle | 5.34 s | 0.35 s lead-in plus three pictures at 1.67 s; then the plate empties and the cycle starts again, as the reel loops |
| angle | 0 degrees | the reference grid runs with the tile's edges |

## Page design

| Number | Value | Why |
|---|---|---|
| FULL (grow at hold) | 0.9 | at grow 1 the darkest dots overlap (a deferred halftone minor the brief says to avoid); at 0.9 the darkest tone (0.92) prints dots that just touch, so a dark side reads near solid, as in the reference |
| first picture's grow | 0 to FULL, ease-in (x squared) over 0.35 to 0.75 s | the reference's coarse step shows tiny dots (about an eighth of the 16 px pitch across), the middle step mid dots, the fine step full ones. A first try with a pale start (0.2) and ease-out printed big dots at the coarse step (frame at 0.4 s): wrong against the stills |
| PALE (later pictures' start) | 0.2 of FULL | a pale field, by eye off `bm-top` (the room's first frame: small dots everywhere the picture is dark) |
| plate | a square 0.72 x the page height, centred at 0.6 x the width (wide); 0.84 x the width at 0.42 x the height (tall) | one picture with room for the label at the bottom left; checked at 960 x 600, the sheet's small cells and 375 x 812 |
| sheet warp | 0.45 | low macro relief (Task 13), chosen by the look target below from the fix round 1 sweep. Warp 1 (the first build) made the paper look handled and blotchy at detail 0 |
| key light | dir [-0.7, 0.6, 0.4], level 0.85 | a grazing key from the upper left, key-led (core.html's pattern, lower: z 0.4 against core's 0.6), so the gentle swells catch light on the side toward the key and fall off on the far side. At warp 0.45 it measures relight 0.0148 / 0.0157 / 0.0153 at detail 0 (seeds 1 / 2 / 3), over the 0.01 floor with room |
| ambient | 0.15 | key-led: ambient only lifts the far slopes off black, as core.html |
| detail | 0.6 | the paper pages' detail: fibres and the ink film both show |
| label | 16 px Georgia 600, "Printed in one ink" | a plate label, kept short; its width stops 24 px short of the plate (`max-width` from plateRect) |

The pictures are tone maps (0 bare paper, 1 solid ink) computed per pixel from page shapes: a moon (light side,
seas and craters seeded), hills under a sun (ridge phases and sun place seeded), and three balls on a table with
their shadows (light side and ball sizes seeded). They use no colour, so the dots print in the live ink token in both
schemes: light ink on dark paper in dark mode, a negative print. The accent token tints the paper's fibre tone
(the paper material mixes toward ramp stop 1, between ground and accent, by detail).

Measured accent shift (fix round 1, replaces the review's estimate): the page frozen at t 1, seed 1, against the
same page with `--accent` set to the `--ground` token's own value, OKLab distance per pixel on the paper left of the
plate. Light: mean 0.0033 (p95 0.0051, max 0.0078) at detail 0.6, 0 at detail 0, 0.0051 at detail 1. Dark: mean
0.0063 (max 0.0132) at 0.6, 0 at 0, 0.0103 at 1. No pixel reaches the palette check's 0.02 "moved" step at any
detail: the accent is close to nominal, and invisible at detail 0. A Task 14 question (a tinted plate tile, or two
tokens).

## Mechanism note

`fields.halftone` takes `cell` and `grow` as numbers or as functions of t, read at every draw and set as uniforms.
The page wraps it in one field (`plate()`) that makes one halftone per picture at init, each with `cell` and `grow`
read from `halftoneAt(t)`, and at each draw prints the picture `halftoneAt(t)` names. So an arrival compiles no
shader and uploads no texture (each picture is uploaded once, at init, and again only after a resize, which changes
the picture's shape). A frame depends on t alone: `setTime(t)` prints the same plate as a live frame at t. The field
keeps no state (`stateful: false`). Before fix round 1 the plate made a new halftone whenever grow changed: 74
shader compiles and 37 texture uploads over the 38 frames of the first arrival and one darken (now 0 and 0;
test/pages/halftone.test.ts, fault test/faults/halftone-rebuild-per-frame).

Reduced motion: the plate declares `settleTicks` 45, `TIMELINE.fullAt` (0.75 s), where the first picture's dots
reach full tone and hold (`halftoneAt(0.75)` is picture 0, the fine step, grow FULL). The engine draws it once there,
with no tick replay (engine fix E2). bar.json declares the same time, `"settle": 0.75`, so the `still` check holds the
engine to it (a page whose engine settle drifts fails). The page never reads `prefers-reduced-motion`.

## Look target for the paper (fix round 1, written before the warp and light sweep)

Task 13 asks for `fields.sheet` with low macro relief. Target: at a glance the paper reads as a flat printed
sheet, one even tone behind the plate. Relief shows only where the grazing key catches it: soft, wide swells
that brighten on the side toward the key and fall off on the far side, never a blotch the size of the plate's
craters. A stain, a crumple, or a "handled" sheet misses the target. The dots stay the subject; the paper must not
compete with them. Judged at detail 0 (no fibre to hide behind), light scheme first, since dark mode shows little
relief either way.

## Warp and light sweep (fix round 1)

Grid: sheet warp 0.3, 0.45, 0.6 by four lights, all from the upper left. L0 the first build's (key 0.7 at dir z 0.7,
ambient 0.3); L1 core.html's (key 0.85 at [-0.7, 0.6, 0.6], ambient 0.15); L2 grazing (key 0.85 at [-0.7, 0.6, 0.4],
ambient 0.15); L3 low graze (key 0.9 at [-0.7, 0.6, 0.25], ambient 0.1). Seed 1, 960 x 600, dpr 1; relight is the
gate's relight check (needs over 0.01), "detail" the gate's detail check (which runs relight at detail 0). Frames
read at detail 0, t 1, light scheme (dark mode shows little relief in any cell).

| Warp | Light | Relight at 0.6 | Relight at 0 | Detail check | What the sheet shows at detail 0 |
|---|---|---|---|---|---|
| 0.3 | L0 | 0.0153 | 0.0044 | fail | flat, relief almost gone |
| 0.3 | L1 | 0.0253 | 0.0075 | fail | flat, faint swells |
| 0.3 | L2 | 0.0328 | 0.0098 (seeds 2, 3: 0.0104, 0.0101) | fail | flat, soft swells |
| 0.3 | L3 | 0.0442 | 0.0134 (0.0142, 0.0139) | pass | flat at a glance, but the low key draws the swells as streaks |
| 0.45 | L0 | 0.0162 | 0.0067 | fail | flat, faint swells |
| 0.45 | L1 | 0.0267 | 0.0113 (0.0119, 0.0117) | pass | flat at a glance, soft wide swells; 12 to 19% over the floor |
| **0.45** | **L2** | 0.0346 | **0.0148 (0.0157, 0.0153)** | **pass** | **flat at a glance; soft, wide swells brighten toward the key and fall off away from it** |
| 0.45 | L3 | 0.0465 | 0.0202 | pass | swells clearly visible, starting to read as a surface |
| 0.6 | L0 | 0.0173 | 0.0089 | fail | the first build's warp 0.6 result (0.0089), soft patches |
| 0.6 | L1 | 0.0285 | 0.0151 (0.0160, 0.0156) | pass | bolder grey patches, toward blotchy |
| 0.6 | L2 | 0.0369 | 0.0198 | pass | grey patches, blotchy |
| 0.6 | L3 | 0.0495 | 0.0270 | pass | strong swells, a crumpled sheet |
| 1 (first build) | L0 | 0.0212 | 0.0150 | pass | blotches the size of the craters: stained or handled paper |

Pick: warp 0.45 with L2. It meets the target (the paper reads flat; relief only where the grazing key catches it)
and passes detail at detail 0 at every seed with room. Warp 0.45 with L1 is a little flatter and also passes, but
sits 12 to 19% over the floor; it is the alternative to show at Task 14 if the swells read too strong.

## Gate (seeds 1, 2, 3)

After fix round 1 (see bar-03-fix1-report.md for the full lines): relight 0.0346 at seed 1 (detail 0: 0.0148);
still rests on the frozen frame at the declared 0.75 s (differ by 0); text-contrast label 10.17:1 light, 9.94:1 dark;
banding runs 3 and 3 px; palette 100% moved.

## Readout for the look review (not a gate)

bar-study-capture.md step 4 asks for `compare --blur 4` and `gl compare` against the reference capture. The
reference capture is a Framer video player page with no GL (study.md, Source), so there are no reference channels
for `gl compare`, and `compare` would score the player page's chrome against this bar. Not run; the look review
compares by eye against `bm-tr.jpg` and `bm-top.jpg`.

Frame time: not measured (headless timing is never reported as speed; the look review measures it).

## Look review (Task 14, 2026-11-14)

Verdict: **keep**. The owner: "Keep". Open points kept as notes, not fixes: dark mode prints a negative moon (its shadow side brightest); the accent only faintly tints the paper (0.0033 / 0.0063 OKLab); the "Printed in one ink" caption stays. Frame time: not measured (the session window was not on screen during the review).

## Look review (Task 19, 2026-11-15)

Verdict unchanged from Task 14: **keep**. Frame time, measured in the Browser pane on the owner's Mac with the pane on screen (requestAnimationFrame cadence over 4 s, dpr 2, 939x959): 240 frames, median 16.7 ms, 95th percentile 17.6 ms, worst 17.7 ms, none over 20 ms (60 fps).

## Phase 2 dark readings (Task 1, 2026-11-16)

Measured before any change with `scripts/measure.mjs` (commit 539073c), seeds 1 / 2 / 3.

- `relight` relief diff, against `relight.reliefDiff` 0.009: light 0.03456 / 0.03698 / 0.03260; dark 0.009175 / 0.009660 / 0.008566. Dark seed 3 fails; seeds 1 and 2 pass by under 0.0007. Dark relief is about a quarter of light.
- `detail` rise, against `detail.minRise` 0.012: light 2.275 / 2.466 / 2.497; dark 0.08867 / 0.07294 / 0.07684. Dark passes.
- Cause to fix in Task 4: weak relief in dark.

## Phase 2 dark fix (Task 4, 2026-11-16)

No paint change. The dark failure recorded above was in the measure, not the page. The relief law counted raw pixel change, and a dark ground reflects less, so the same relief read about 4 times smaller in dark (ground OKLCH lightness 0.95 in light, 0.23 in dark; relief 0.0347 vs 0.0091 at seed 1). The owner ruled, 2026-11-16, "Relative change (Recommended)": relief is now the change relative to the page's brightness (`relight.reliefDiff` 0.013), plus a raw floor against mud on a near-black ground ("Add a raw floor (Recommended)", `relight.reliefRawFloor` 0.002).

Readings after that change, seeds 1 / 2 / 3, relative change against 0.013:

- Own detail: light 0.03929 / 0.04213 / 0.03719; dark 0.06195 / 0.06553 / 0.05798.
- Detail 0: light 0.01667 / 0.01766 / 0.01724 (the weakest kept reading of the kit); dark 0.02687 / 0.02802 / 0.02723.
- Raw change at detail 0, dark seed 1: 0.003856 against the floor 0.002 (the weakest kept raw reading of the kit).
- `relight` and `detail` pass in both schemes at seeds 1 to 3.

The owner re-checks the bar by eye in the wave 0 look review.

## Look review (Phase 2 Task 5, 2026-11-16)

Read live in the browser pane, dark then light, at a build of 1b7db11. No paint change: the old dark relief failure was in the measure (relief now relative to brightness). The paper's dial-driven variation is zero-mean since Phase 2 Task 2c.

- Dark: **keep**. The owner: "Keep (Recommended)".
- Light: **keep**. The owner: "Keep (Recommended)".
