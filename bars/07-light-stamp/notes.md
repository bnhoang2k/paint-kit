# Notes: 07 Light stamp

Every number on the page, each with its source or "builder" and why. Read at the gate's 960 x 600 view, dpr 1,
unless named. Short-side units (ss): 1 is the canvas's shorter side (600 px here). Builder values were chosen by
look before any gate run. The one change after a run (the `not-colour` tags) is a rule fix, not a look value.

## What it copies, and what it does not

It copies the study's mechanism (study.md). An embossed print lies under a key light that the pointer turns. Which
way the pointer turns it is the owner's call from the look review, not the study's (see Pointer). The lit
result is then screened into one-ink dots, so brighter faces print larger light dots. It does not copy the
reference's identity: it has no "Replay" title, no arches, no stamp stack and no navy and cream. The relief motif,
the words, the layout and the palette are the builder's.

## Surface (the paint call)

| Number | Value | Source | Why |
|---|---|---|---|
| Materials | 0 desk: `paper` tone 0; 1 printed area: `matte` tone 0.8; 2 stamp margin: `paper` tone 0.5; 3 scraps: `paper` tone 0.25 | plan (desk paper at tone 0, stamp matte) and builder (margin, scraps) | The desk is paper so the dial has fibre to drive over most of the frame (driver ruling 5). The stamp's paper margin is the accent, lighter than the desk: the stamp has its own tone. The scraps sit halfway, so they read as paper on the desk without competing with the stamp. A first build had the scraps at the accent too, and they drew the eye from the stamp |
| Printed area tone | 0.8 | builder | Between the accent and the ink, near the ink. On the ink bed, a face lit flat prints medium light dots, lit faces print large ones, and faces turned away fall to about the bed (bare ink), as the study reads (lit luma up to 207, dark 31 to 88) |
| Desk warp | `fields.sheet({ warp: 0.15 })` | builder | A desk reads flat. The low warp only keeps the paper from being a perfect plane. The stamp and scraps carry the macro relief. Bar 03's 0.45 is a free sheet. Its swells would rise as high as the stamp's lift and blur what is raised |
| Detail | 0.6 | bar 03 | The paper pages' detail: fibres show |

## The stamp (`STAMP`, in ss about the page centre, y up)

| Number | Value | Source | Why |
|---|---|---|---|
| centre | (0.06, 0.02) | builder | A little right of centre, so the scraps on the left have room |
| half | 0.23 x 0.30 | builder | A portrait stamp, 276 x 360 px at 600 px: the subject, large enough that the 6 px screen reads in rings |
| margin | 0.028 sides and top, 0.1 bottom | builder | A postage stamp's white margin. The bottom one holds the two lines of words (60 px at 600) |
| lift | 0.012 | builder | The stamp stands off the desk. Under the grazing key its shadow is about 2.3 x the lift (17 px) plus the penumbra. That makes a shadow that reads as a raised card, not a sticker. A real stamp's 0.1 mm would cast none at this scale. The reference's wide shot shows the stamps casting visible shadows |
| bevel | 0.004 | builder | The cut edge rounds over 2 px, so the edge has no stair and catches the key |
| hole, pitch | 0.009, 0.034 | builder, from a real stamp | Perforation hole about 4% of the stamp's width (1 mm holes on a 25 mm stamp). Holes sit on the outline, corners included |
| ring | 0.07, seeded x 0.92 to 1.08 | builder | Ring pitch about 42 px: about 7 screen cells per ring, so each face spans several dots and the dot size can grade across it |
| emboss | 0.016 | builder | Crest over trough. The steepest face slopes about 0.7 (35 degrees), so the grazing key lights one face and leaves the other near bare ink. Embossing stands higher than the paper is thick, as in print |
| reach | 0.35 | builder | The rings fade with distance from their seeded source, so the relief has a centre, like a drop's ripples |
| fade | 0.02 | builder | The relief eases flat over 12 px inside the printed area's edge, so the frame casts no cliff shadow |
| ripple source | seeded, within 40% of the printed area's half size from its centre | seed | The seed moves the rings' centre and pitch, so the seeds differ by the relief, not by their content |

The motif replaces the spec's "arches" (driver ruling 1). Concentric ripple rings have faces that slope every way
round their source. So as the light turns, the lit side of every ring turns with it, and dark faces read opposite.

## Scraps (`SCRAPS`, `SCRAP`)

Three torn paper scraps, builder placed, sizes 0.26 to 0.40 ss, turned 12, -8 and 18 degrees, each nudged up to 8.6
degrees by the seed. `lift` 0.005 (builder): the scraps cast small shadows, so they read as paper lying on the desk.
At the first build's 0.003 their shadows barely showed. `tear` 0.004 (builder): fbm noise roughens the edges by up
to 2 px. `bevel` 0.003.

## Light

| Number | Value | Source | Why |
|---|---|---|---|
| Key | dir [-0.7, 0.6, 0.4], level 0.85 | bar 03 | The nearest kept bar on the same surface (dots on paper under a grazing key): copied, not tuned |
| Ambient | 0.15 | bar 03 | Copied with the key |
| Shadow | `{ soft: 0.8 }`, no ground | test/pages/shadow.html | The kit's measured shadow page. The desk covers the frame, so `ground` is not needed (the shadow oracle's coverage gap is not hit) |

## Pointer (`POINTER`)

The page drives the light itself, as bar 01 does. Each pointer move sets a target offset from the stamp's centre in
ss (x right, y up). A frame loop eases toward it and calls `painter.set({ lights })`. With no input the page never
calls `set`, so the light is the declared key and the checks' own light changes stand.

| Number | Value | Source | Why |
|---|---|---|---|
| Side | the light comes from the cursor's side, in both axes | the owner, look review (Task 10): "Mouse is the light (Recommended)" | Described to them as "light comes from the cursor's side: ring faces facing the cursor bloom into light dots, and the stamp's shadow falls away from the cursor". The first build mirrored x, following the study's two cursor reads (cursor right gave a bright left side). That was a weak reading of 3 cursor positions, and on the live page the owner asked "is the mouse supposed to be the lighting? isn't the shadow off?" |
| tau | 0.05 s (95% of a move in 0.15 s) | study.md, Feel numbers | A lit face goes from lit to dark within 0.2 s, so the light must arrive inside it. bar.json `motion` cites it |
| bias | 0.12 ss | builder | The rest direction's heading leans the light, so over the stamp's centre the light turns smoothly, not abruptly. Far from the centre the pointer sets the heading alone |
| Height | z 0.4, heading length 0.922 | bar 03's key | The pointer turns the light's heading only. Its height above the desk stays the key's, so the relief always reads |

Under reduced motion the light goes straight to the pointer (no easing). That is the only use of the media query
(AGENTS.md: page code may skip its own motion). The engine's pointer and `follow` are not used, because under
reduced motion the engine rests and live input does not reach it, so the beat would be lost.

## Screen (`SCREEN`)

| Number | Value | Source | Why |
|---|---|---|---|
| cell | 6 CSS px | study.md, Feel numbers | The close-up's pitch is about 6 px of a 720 px frame. This page shows the stamp at a similar share of the frame |
| angle | 45 degrees | builder | The classic single-ink screen (halftone-lit.html's). The study does not give an angle |
| ground | 1 (the ink) | spec | "Dark faces fall back to bare ink": the bed is the ink |
| slots | [1] | driver ruling 2 | The print only. The desk, scraps and margin stay paper |

The words are printed ink, so the screen leaves them solid (the engine skips sheet ink).

## Words and layout

Title "First rain", issue line "Pond series, No. 7" (builder), Georgia 700 and 600, centred in the bottom margin.
They are printed into the sheet (`data-paint-ink`) and scale with the stamp: 20 px and 12 px at a 600 px short side
(`--u` = side / 600). Off the lint type scale on purpose: they are part of the printed picture. At fixed sizes the sheet's
400 x 250 cells showed them running off the stamp (first sheet), so they now scale. Neither line goes under 12 px (break-ui,
fix round 1). Scaled alone, the issue line read 7.5 px on a 375 px phone and 6 px at 200% zoom. The floor keeps both
inside the margin down to a 320 px short side (issue line 119 of 129 px there). It does not bind at 600 px or more,
so the gate's view is unchanged. Below a 320 px short side (the sheet's 250 px tall cells), the two lines are 3 px
taller than the margin.

Palette (builder): light desk `oklch(0.84 0.03 70)` (kraft), ink `oklch(0.36 0.12 25)` (oxblood), accent
`oklch(0.95 0.02 90)` (stamp paper, lighter than the desk). Dark: desk `oklch(0.22 0.015 60)`, ink
`oklch(0.88 0.05 75)`, accent `oklch(0.32 0.025 70)`.

## Gate (2026-11-17, at 14d50ff's page, dist from 759784f)

Run per seed with `gate()` (every check, both schemes), each under 75 s.

- Seed 1: all nine pass. relight light relief 0.0600, shadow side 76.0 / 66.9 px, shift 96.8 px, cover 1.81% /
  1.71%, depth 0.902; dark relief 0.0870, shift 85.6 px, cover 2.11% / 2.00%. detail rise 1.7724 light, 0.6869
  dark (detail 0 relief 0.0266 / 0.0590). text-contrast "First rain" 7.71 / 7.32, issue line 6.23 / 6.33 (light /
  dark). palette 100.0% moved.
- Seed 2: all nine pass. relight relief 0.0626 / 0.0880, shadow shift 85.6 / 76.2 px. detail rise 1.6128 / 0.6447.
- Seed 3: all nine pass. relight relief 0.0558 / 0.0776, shadow shift 90.0 / 83.8 px, smallest side 46.4 px. detail
  rise 1.3780 / 0.5819. text-contrast 7.64 / 7.27, 6.27 / 6.44.

The shadow law reads well over its floors on this stamp: shift 76 to 97 px against `relight.shadowShift` 29, cover
1.71 to 2.19% against `relight.shadowNone` 0.4%. Those floors were measured on one card (Task 25 reads this bar
against them).

## Sheet (read by eye, against bar 03's)

- The light is not painted on: from key A to key B the lit side of every ring turns, and the stamp's and scraps'
  shadows swing from the lower right toward the right and top.
- No sticker: the stamp stands on the desk with a perforated shadow and its own tone. The scraps cast small shadows.
- No gradient wash or smooth plastic on the desk. The printed area is matte, so it is smooth between dots; the dots
  and relief carry it.
- Detail: at detail 0 the desk is plain paper with the macro relief intact. Fibre shows on the desk, scraps and
  margin from 0.5. Bar 03's sheet shows the same pattern on its paper.
- The dial does not show through the screen by eye: the printed area is the same at detail 0, 0.5 and 1, because
  matte has no fine structure and the dots are the screen's, not the dial's. The detail check no longer measures
  this (Task 8 ruling 2), so it is recorded here.
- Dark prints a negative on the stamp: cream bed with dark dots that shrink where the light lands, as bar 03's dark
  moon. Accepted for now (Task 8). The owner judges it at the look review.

## Look review (Task 10, 2026-11-17)

- Dark: **keep**. The owner: "Keep (Recommended)". This keeps the negative print on the stamp.
- Light: **close**. The owner: "close, is the mouse supposed to be the lighting? isn't the shadow off?". Asked how the
  mouse should drive the light, they chose "Mouse is the light (Recommended)".
- Fix round 1: the x mirror is gone. The key now comes from the cursor's side in both axes, so with the cursor at the
  upper right the light comes from (0.70, 0.60) and the stamp's and scraps' shadows fall lower left (checked in
  light and dark). The pointer's easing (tau 0.05 s) and its reduced-motion skip are unchanged. The gate does not move
  the pointer, so its readings are the same as before the fix, at seeds 1 to 3 in both schemes. The relief is still
  ripple rings, not arches (ruling 1); the owner raised no point about it.
- Light after the fix: **keep**. The owner: "Keep (Recommended)". So the bar is kept in both schemes.
- The stamp's two lines gained a 12 px minimum in the same round (a break check measured 7.5 px on a 375 px phone);
  at the gate's 960 x 600 view they are unchanged (20 and 12 px). The owner was told before their light verdict.
- Break pass: the owner "Skip break" (the check above ran anyway, from a session hook).
- Frame time: not measured (headless timing is not speed).
