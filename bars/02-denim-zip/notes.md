# 02 Denim zip: notes

One file: `index.html`. It loads the engine through the import map; no build step in the bar.

A zipper closes a phone screen of denim. Drag the pull down: a V-gap opens above it and the screen behind shows
through. A short pull springs back shut; a pull past the middle commits, the halves leave and the header builds.

## Where it comes from

- Motion: motion-kit's bar 13, `$PROJECTS_ROOT/motion-kit/bars/13-drag-past-a-threshold/index.html`. The `MOTION`
  block is copied byte for byte (checked with `diff` against that file), and so are the drag, spring, swing,
  run-on, header build, the `__seek` fixed clock, `__state()` and `__zip`. Every motion number and its trace row is
  in that bar's `notes.md` ("MOTION values"). Nothing here retunes them.
- Surface: paint-kit. `makeTexture()`, `drawCloth()` and `drawSlider()` are gone. One `fields.shape` field
  (`ZIP_GLSL`) writes the cloth, tape, stitches, teeth and slider into the sheet. Its weave is the engine's twill,
  not a copy: the field includes `GLSL_TWILL` (from `paint-kit`, the chunk `fields.twill` builds from) and reads it
  at the unslid cloth point, because `fields.twill` itself cannot follow each row's slide; `materials.denim` (slot 0),
  `materials.sheen` (slot 1) and a second `materials.denim` dyed with the ink (slot 2, the tape) shade it under a
  key light and ambient.

## How the cloth follows the motion

- Each frame the page samples bar 13's `slide(y, A)` every 4 px of screen y into the field's `uSlide` uniform
  (220 values), plus the slider top `uS` and the tab angle `uTab`. The shader reads `uSlide` back with linear steps,
  so the weave, tape, stitches and teeth ride on the same shift as bar 13's drawn rows: a point of the left half
  at screen x comes from cloth x + slide (the right half, x - slide).
- The V-gap is a coverage cut: where neither half (cut at 3.5 px inside each edge, bar 13's `TOOTH_IN`), nor a
  tooth, nor the slider reaches, coverage is 0. The screen behind (`#behind`, plain DOM) sits above the canvas,
  clipped to a polygon through the same 220 edge points, so the DOM shows exactly where the cut is.
- While the engine's loop runs it draws the new uniforms next frame; when it is still (frozen by `?t=`, or
  resting), the page asks for one redraw through the field's `invalidate`.

## Measured numbers, each with a why

- Weave: 96 wales per short side (one every 4.1 px on the 393 px screen). Why: the reference's weave reads as a
  heathered texture near the pixel at phone size (Source: frames); 64 wales (6 px) read as a coarse carbon-fibre
  pattern in the first screenshot. Twill angle 63 degrees, as `test/pages/cloth.html` (a right-hand twill).
- Folds: 0.016 short-side units deep, stretched 6.4 to 1 down the screen. Why: the reference shows soft vertical
  folds a few tens of px wide (Source: frames); this depth gives the relief law 0.0523 frame change at the phone
  view, over the relief floor, with the folds still soft in the screenshots.
- Tape 36 px each side (3.5 in, 32.5 out), teeth 13.5 x 5.5 px every 18 px per side, stitch at 24.5 px, slider
  32 x 40 px, tab 26 x 63 px with a 7.2 px ring: bar 13's drawing sizes (`TAPE_HALF`, `TOOTH_*`, `STITCH`, its
  `drawSlider`), so the gap and `__state().gap` stay as bar 13 measures them.
- Heights: tape 1.65 px, cloth beside the tape rises 1.4 px over 12 px, teeth 2.2 + 2.6 px crown, slider body 3 to
  6 px domed, tab 7 to 9.2 px across. Why: the highlight law needs a convex carrier (Task 7 ruling); the domed pull
  and the crowned teeth are those carriers. The first teeth (1.6 + 1.6 px) caught almost no light under the sheen's
  9 px plane fit; at these heights each tooth shows its own highlight.
- Status band: under the top 52 px (`MOTION.statusBlurBand`, the band bar 13 blurs), the cloth keeps a third of its
  weave relief and only the dye colour, fading in over 24 px. Why: with the full weave the status time reached 4.33:1
  at seed 3 (under 4.5); with the soft band it reaches 7.11:1 at seed 1 (phone view).
- Palette: ground oklch(0.66 0.03 85) (the weft), ink oklch(0.2 0.025 255) (tape, metal base), accent
  oklch(0.3 0.065 250) (the indigo dye). Why: the reference's denim is a dark slate blue (Source: frames); the first
  values (ground 0.84, accent 0.4) painted a pale denim, and the status text reached 3.99:1 on it.
- Key light dir (-0.45, 0.55, 0.7), level 0.9, ambient 0.3: as `test/pages/cloth.html`. The reference's light is
  fixed, from the upper left (Source: frames).
- Detail 0.6 (bar.json). High-frequency share 0.227 / 0.232 / 0.246 at detail 0 / 0.5 / 1 (phone view).

## Colours that became tokens

Every bar 13 colour is now a custom property in `:root`: the five rainbow bands (`--band-1` to `--band-5`), the home
bar's two greys (`--homebar` 240, `--homebar-dim` 16; Row 20's grey level is drawn as an sRGB `color-mix` of the two,
which is exactly `rgb(g, g, g)` for g from 16 to 240), the sky, cream, island, bezel and text colours. SVG fills and
gradient stops use CSS classes. The bands are DOM tokens, not palette accents: the engine never draws them, and
`fromPage` takes at most 3 accents.

## Limits

- The page is a portrait phone screen, laid out at 393 x 852 and scaled to fit (motion-kit bar 13:
  `$PROJECTS_ROOT/motion-kit/bars/13-drag-past-a-threshold/index.html`, "always laid out at 393 x 852"; its notes.md
  Geometry line). So bar.json declares `"view": { "width": 393, "height": 852 }` and the checks and sheet frame the
  phone screen, not the gate's default 960 x 600, where the phone was 29% of the frame (see bar-02-report.md).
- The cloth does not drift (no `uTime` in the field): a phone splash holds still until touched.
- The cloth halves are not shaded by the pull (no cast shadow): the engine has no shadow pass.
- Frame time: not measured (the Task 14 look review measures it on real hardware).

## Look review (Task 14, 2026-11-14)

Verdict: **keep**. The owner: "Keep". Open points kept as notes, not fixes: no dark-mode tokens, so light and dark look the same; the pull casts no shadow (the engine has none); the lint round moved the step descriptions 30 px right in the traced replica. Frame time: not measured (the session window was not on screen during the review).
