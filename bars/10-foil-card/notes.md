# Notes: 10 Foil card

Every number on the page, each with its source or "builder" and why. Read at the gate's 960 x 600 view, dpr 1,
unless named. Short-side units (ss): 1 is the canvas's shorter side (600 px here). Every builder value below was
chosen by look (screenshots at 960 x 600 in light and dark, tilt 0 and +-10 degrees, and a first sheet) before
any gate run, and none was changed after one.

## What it copies, and what it does not

No bar covers a foil surface. The page builds from `REFERENCE.md` and copies bar 07's page structure only: a raised
card on a covering paper page, a key light that casts, a `layout()` that places the printed words over the painted
card, and bar 07's pointer-as-light code for the light job. It copies the study's mechanism: grooves split light by
angle (`materials.foil`), printed ink over foil covers it, the card has its own tone and a shadow. It copies no real
card: no frame, logo, characters, set symbol, layout or colours. The card's name "Low tide", its line "The shore
holds the light.", "No. 04", "Sunburst foil", the sun-and-waves line art and the palette are the builder's.

## Surface (the paint call)

| Number | Value | Source | Why |
|---|---|---|---|
| Slots | 0 page: `paper` tone 0; 1 card face: `paper` tone 0.25; 2 art window: `foil` | brief (paper card face, foil window), builder (paper page) | The page is paper so the detail dial has fibre over most of the frame and the shadow falls on a lit surface, as on bar 07's desk |
| Card tone | 0.25, the `--card` accent (ramp stop 1 in both schemes) | builder | Card stock lighter than the page in light, a little lighter than the page in dark: the card has its own tone (beat 1). The three accents sit at stops 1 to 3, so tone 0.25 is `--card` exactly in both schemes (the ramp sorts accents by lightness, from the ground toward the ink) |
| Foil tone | 0 (the ground) | builder | Foil's body is a dim metal stepped from the ink toward its tone; the ground is the palette's most neutral stop, so the body reads as a dark silver, not a tinted one |
| Detail | 0.6 | bar 07 (bar 03) | The paper pages' detail: fibres show |
| Page warp | `PAGE = { warp: 0.004, freq: 2.2, clear: 0.03 }` | builder | The page is not a perfect plane, as bar 07's low warp. It is a still seeded fbm (no clock), so the page rests. It clears to flat within 0.03 ss of the card, so the card lies flat and every foil texel has the same normal |

## Shadow: covering page material, not bare ground (driver build rule, decided before any gate run)

The card sits on a covering page: the field writes coverage 1 everywhere, slot 0 paper outside the card. So the
key's shadow falls on lit paper, and `shadow.ground` stays off (unset). Why: the page is a sheet of paper the card
lies on, as bar 07's desk; a covered page also gives the detail dial fibre to drive and the relief law a page warp.

## The card (`CARD`, ss about the page centre, y up)

| Number | Value | Source | Why |
|---|---|---|---|
| centre | (0, 0) | builder | The tilt pivots on the canvas centre, so the card sits there: the pointer over the card tips it a little, at the canvas edge it tips by `max` |
| half | 0.20 x 0.28 | builder, from a real card's shape | 63 x 88 mm (a trading card's ratio, 0.716). 240 x 336 px at 600 px, so the page shows round it |
| corner | 0.019 | builder, from a real card | 3 mm on a 63 mm card |
| lift | 0.012 | bar 07 (the stamp) | A raised card that casts a shadow that reads; a real card's 0.3 mm would cast none at this scale |
| bevel | 0.004 | bar 07 | The cut edge rounds over 2 px and catches the key |
| head | 0.012 | builder | The title band's inset from the card's top edge |
| win | side 0.025, top 0.075, height 0.30 | builder | The art window: 210 x 180 px, the card's largest area, as a holo card's art; the title band above it, the text box below |
| line | 0.004 | builder | Printed line width, 2.4 px: thin line art that reads over the foil |
| sun | radius 0.045 | builder | The sun ring round the burst's centre: it marks where the rays start |
| waves | amplitude 0.006, 26 cycles per ss, 0.028 apart | builder | Three wave lines across the window's lower part; each seed shifts their phase |
| burst centre | seeded: across the middle half of the window, in its upper half (0.2 to 0.6 of the half height above the centre) | builder, seed | The seed moves where the burst starts, so seeds differ by the grooves, not by their content |
| text-box insets | 0.03 above the card's bottom edge, 0.02 below the art window (`layout()`) | builder | Layout, not light: they keep the text box's words off the card's edge and the window |
| text padding and gap | 4 px side padding on the printed-word boxes, 6 px gap between the text box's lines, both times `--u` | builder | Layout, not light: they set the words' breathing room and scale with the card |
| waves baseline | `-0.35 * wh.y` (GLSL) | builder | Layout, not light: it puts the first wave line 0.35 of the window's half-height below its centre, the others 0.028 apart below it |

## Groove pattern: sunburst (study.md, "Groove patterns")

The grooves run along rays from the burst's centre (`fieldDir`), length 1 in the window, 0 elsewhere. Why sunburst
and not cracked ice or tinsel: under one key light a sunburst shows every groove angle at once, so the window holds a
turning band of colour and a tilt sweeps the colour round the centre (the study's reading). Tinsel (one direction)
shows one colour per tilt across the whole window, and cracked ice needs shard geometry no source gives. The ink sun
ring sits on the burst's centre so the line art and the grooves read as one picture.

## Foil (`FOIL`, `LOOK`)

| Number | Value | Source | Why |
|---|---|---|---|
| spacing | 1.5 um | study.md (1.0 to 2.0 um, holo film's range; CD 1.6) | The middle of the range, near a CD's track pitch; test/pages/foil.html's default |
| orders | 2 | materials.foil default | Under this key the first order shows across part of the burst and the second across the rest |
| roughness | 0.3 | materials.foil default (builder there) | Not tuned |
| pull | 0.3 | test/pages/foil.html (builder there) | Enough pull that the page's palette shows in the foil without losing the line colour. Kept: the owner, look review, 2026-11-17 |
| pullTarget | `nearest` | test/pages/foil.html | Keeps the palette's several colours. Kept: the owner, look review, 2026-11-17 |

## Light

| Number | Value | Source | Why |
|---|---|---|---|
| Key dir | [-0.6, 0.5, 0.62] | builder | From the upper left, as bar 07's reading light. About 38 degrees up: between bar 07's grazing key (z 0.4) and foil.html's high one (z 0.83). High enough that grooves across a wide part of the burst send a visible order (X.(l + v) up to about 0.78, so 1.5 um shows violet to yellow in order 2 and a full first order nearer the light's heading); low enough that the 0.012 lift casts a shadow (0.012 x 0.78 / 0.62 = 0.015 ss, about 9 px; the first draft of this note said 15 px, an arithmetic slip, corrected here, the value unchanged) |
| Key level | 0.85 | bar 07 | Copied |
| Ambient | 0.15 | bar 07 | Copied |
| Shadow | `{ soft: 0.8 }`, no `ground` | bar 07 (test/pages/shadow.html) | The kit's measured shadow page; the page covers the frame, so `ground` is not needed |
| Lamp vs key | a key | brief, REFERENCE.md | The iridescence law reads the first key light (a lamp is partial), and under a key every point of one groove shows one colour, as the spec's law (b) says |

## Pointer (`LOOK.job`, `TILT`, `BIAS`)

The look review offered three jobs: `tilt` (the pointer tips the card, `tilt.drive: "pointer"`), `light` (the
pointer turns the key, bar 07's code: the light comes from the cursor's side, the shadow falls away from it, no
mirror; the tilt's drive is `"none"`) and `both`.

| Number | Value | Source | Why |
|---|---|---|---|
| Job (paint call) | `both` | the owner, look review, 2026-11-17 | The pointer tips the card and turns the key at once: the foil colour sweeps with the tilt, and the shadow and the card's lit edge answer the light. Tilt turns the card's surface (its normal and grooves); the eye and the lights stay fixed, so a tilt moves the highlight and a held card shows its own sheen |
| Tilt max | 8 degrees | the owner, look review, 2026-11-17 | The turned surface moves the grating angle u about twice as far per degree as the old view-only tilt. At 20 degrees (test/pages/tilt.html's value) u left the visible band past about 10 degrees one way and 15 the other, so the foil went dark over most of the pointer's range (seen in the browser pane, dark scheme, seed 1). At 8 degrees the foil keeps its colour almost everywhere; it may go faint at the far corners, where both axes add |
| Tilt tau | 0.1 s (`pointer.ease = easeOfTau(0.1)`) | test/pages/tilt.html (bar 01's lamp lag) | A tilting page must set an ease under 1; copied |
| Light tau | 0.1 s | builder | The light job eases with the tilt's lag, so the jobs feel the same. Bar 07's 0.05 s was cited from its own study; this study gives no easing time |
| BIAS | 0.12 ss | bar 07 | Over the card's centre the rest heading still leans the light, so it turns smoothly |
| Light height | z 0.62, heading length 0.78 | the key | The pointer turns the heading only |

Under reduced motion the engine settles the tilt with its clock; the light job skips its own easing (the page's
only use of the media query). The leave: the engine eases the tilt back to [0, 0] on a `pointerleave` of the root,
a window `blur` or a move off the canvas; `gate.test.ts` asserts the eased return through the first two.

## Motion: the bar rests

`alive: { rests }`. Nothing moves without the pointer: the page warp is a still noise, not `fields.sheet`'s drift,
and the study gives no reason to move. So the iridescence law's (c) (two frames one second apart) reads a sheet that
holds.

`flash.pointer` (builder): the pointer sweeps from the centre to the right edge in 0.5 s, to the left edge by
1.5 s and back to the centre by 2 s, a quick hand sweep across the full canvas width, so the flash check measures
the tilt's colour sweep. The light job is page code, so the flash check cannot drive it.

## Words and layout

Title "Low tide" and "No. 04" in the title band (Georgia 700 20 px and 600 12 px at a 600 px short side); the line
"The shore holds the light." (italic 14 px, may wrap) and "Sunburst foil" (600 12 px) in the text box under the
window. All are printed into the sheet (`data-paint-ink`) on the card's paper face, not over the foil: the study's
heavy under-print is where text sits. They follow the card's scale (`--u` = side / 600) in steps: each takes the
largest size on the project's type scale (`ui-policy.json`) that fits its 600 px size times `--u`, and never under
12 px (bar 07's floor). Why steps (lint round, before any gate result was read): a smooth scale gave 12.35, 21 and
28.5 px, off the type scale (lintapple, 6 findings). The title was 19 px in the first build; it moved to 20 px, the
scale's size, at the same time. They carry `data-ui-paint-text` (the project policy's mark for text over the canvas,
whose contrast the gate's text-contrast check measures). Limit (measured in the review): the text box fits at 390x844, 375x667, 360x800 and 640x360. It overflows
by 1 px at 344 and by 4 px at 320x568 (still 7.4 px inside the card). The words collide only in the sheet's
~240 px cells (the title runs into "No. 04"). No fix is made. At the gate's 600 px it does not bind.

Palette (builder): light page `oklch(0.86 0.02 160)` (pale sage), ink `oklch(0.27 0.05 285)` (violet black), card
`oklch(0.965 0.012 95)` (cream stock), warm `oklch(0.72 0.11 55)` (amber), cool `oklch(0.56 0.09 215)` (sea blue).
Dark: page `oklch(0.23 0.02 200)`, ink `oklch(0.93 0.012 95)`, card `oklch(0.34 0.02 230)` (raised from 0.31 after
the first dark screenshot, so the card stands off the page), warm `oklch(0.74 0.1 60)`, cool `oklch(0.6 0.08 210)`.
The warm and cool accents are the ramp's stops 2 and 3: what the foil's `nearest` pull lands on besides the ground,
the card and the ink.

## Review mode (removed after the look review)

During Task 16 a `?review=1` panel set the pointer's job, the pull amount and the pull target live, with the pointer
drive paused over it. The owner's kept values are now the paint call's (Look review, below), and the panel, its styles and
its two page tests are gone. `gate.test.ts` instead checks the kept job: the pointer to the right tilts the card and
turns the key toward it.

## Iridescence law on bar 10

Read on the final page (job both, tilt max 8 degrees, the surface turns), at the thresholds in
`src/checks/thresholds.json`. The gate prints seed 1's readings; seeds 2 and 3 pass the same checks.

| Reading (seed 1) | Threshold | Light | Dark |
|---|---|---|---|
| (a) key move, per-point chroma change | over 0.017 | 0.1191 | 0.1107 |
| (a) tilt, per-point chroma change | over 0.017 | 0.0671 | 0.0640 |
| (a) the same two at detail 0 | over 0.017 | 0.1173, 0.0674 | 0.1112, 0.0642 |
| (b) one groove's halves differ | under 0.035 | 0.0000 | 0.0000 |
| (c) one second on | under 0.01 | 0.0000 | 0.0000 |
| (d) two grooves 65 degrees apart | over 0.017 | 0.1533 | 0.1317 |

Law (e) ("within one groove, far-apart u gives different colour") is not read: the art window is flat, so no groove
spans 0.02 in u. The gate line says so.

## Gate (2026-11-17, final page)

`paint-kit gate bars/10-foil-card`: `passed`, all nine checks at seeds 1, 2 and 3, light and dark, in 9 min 7 s.

## Sheet and screenshots (read by eye)

Read at Task 15, before the look review changed the tilt and the pointer's job. The owner's live review below supersedes it.

- No painted-on light: from key A to key B the colour bands rotate round the burst, and the card's lit edge and
  shadow swing with the light. Tilt (+-10 degrees) shifts the bands' colours with the shadow held.
- No sticker: the card stands on the page with its own tone, a lit top-left edge and a shadow to the lower right, in
  both schemes. In dark the card (0.34) sits only a little above the page (0.23): it reads, but quietly.
- Hue soup: the foil is the one saturated thing on the page; yellow and blue bands dominate at pull 0.3 nearest. The
  sage page, cream card and violet ink stay visible round it. The owner sets the pull at the look review.
- Detail: at detail 0 the page and card are plain paper with the card's relief intact; fibre shows from 0.5; the foil
  grain sparkles at 1.
- The seeds differ by the burst's centre and the waves' phase.
- Limit: the words collide only in the sheet's ~240 px cells; no fix is made (Words and layout).

## UI gates

Final page, panel removed: lintapple `Passed: 0 UI findings across 4 page checks.` and `Text edges: 0 near-misses`, at 390
and 1440 px. The lines below are from Task 15, with the panel.

- lintapple 0.1.20 with the project's `ui-policy.json`, 390 and 1440 px, light and dark: `Passed: 0 UI findings
  across 4 page checks.` without and with `?review=1`. First run: 6 font-size findings (12.35, 21, 28.5 px), fixed
  by stepping the words along the type scale.
- Text edges: `Text edges: 0 near-misses` without and with `?review=1`. First run with the panel: 4 near-misses
  (the radios pushed "Tilt" 27 px off the legends' edge), fixed by stacking the options and hanging the radios.
- break-ui, input half, `?review=1`, 960 x 600: 20 rapid clicks on the job radios (last Light), the pull range
  (alternating ends, last right) and the target select (alternating, last nearest); after 1.5 s each control and
  the paint agreed with the last click (job light: tilt drive "none" and the key turned toward the pointer; back to
  Tilt: drive "pointer" and the key at its declared [-0.6, 0.5, 0.62]); 0 running animations, 0 page errors, no
  long task recorded (the observer may not report in headless Chromium: not proven). Pull 0 to 1 changes the frame
  by 0.0083 mean, and back to 0 by 0. The pointer leaving while tilted eases 19.2 to 13.7, 9.8, 7.0 ... 0 over 25
  frames. hover-shift.js: `Hover shifts: 0`, but it hovered 0 elements on this panel, so hover is not checked.

## Look review (Task 16)

Held in the browser pane with `?review=1`, 2026-11-17. The owner's picks:

- Pull amount: keep 0.30 (the owner, look review, 2026-11-17).
- Pull target: nearest stop (the owner, look review, 2026-11-17).
- Pointer job: both, tilt and light (the owner, look review, 2026-11-17).
- Tilt range: 8 degrees, down from 20 (the owner, look review, 2026-11-17): at 20 the turned card's foil went dark over
  most of the pointer's range.
- Tilt feel: turn the card itself, not the view (the owner, look review, 2026-11-17). The engine changed to match
  (f416c5b): a tilt turns the surface normal and the grooves; the eye stays at +z and the lights stay fixed.
  `relight.iridescenceShift` was re-measured for it (1ea667d).
- Verdict: kept in the dark scheme and in the light scheme (the owner, look review, 2026-11-17).
