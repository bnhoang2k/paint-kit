# Study: 03 Halftone resolve

Reference for bar 03, "a picture arrives as a halftone grid that steps from coarse to fine and darkens from a pale
dot field": Brandmelder by NEW STANDARD.S (shelf key `60fps.design/motion/brandmelder-by-new-standard-s`), a brand
reel on 60fps.design.

Numbers read off the shelf's frame sheets are tagged `Source: frames`. Numbers from the page capture would be tagged
`Source: page`; there are none (see Source).

## Source

- **The reference is a video, not a live WebGL page.** The page capture (bar-study-capture.md step 1) ran on
  2026-11-14 with `capture --clock virtual --gpu hardware --gl --viewport 1440x900 --trigger none --duration 3000
  --selector body`, out to `<private reference shelf>`.
  `gl summary` reads: "259 frames traced · 0 draw calls per frame"; one 2D canvas, 300 x 150 px at css 0 x 0; no
  programs. `inspect.json` libs: `framer-sites`. The page is a Framer player around one mp4 clip
  (`video.gumlet.io/.../main.mp4`). So the capture gives no fixed uniforms, no animated channels and no pointer lag;
  the mechanism and timing below come from the shelf's report and still sheets.
- Still sheets read for this study (same folder): `bm-tr.jpg` (top-right tile, 0 to 1.6 s at 20 fps),
  `bm-top.jpg` (icon and picture swaps, 1.5 to 5.5 s), `brandmelder-ov.jpg`, `bm-top2.jpg`, `bm-bot.jpg`.
  I cropped `bm-tr.jpg` frames and enlarged them 3x to measure the grid pitch.

## Mechanism

Every picture in the reel is a single-ink halftone: a square grid of round dots whose size is the picture's tone,
printed on a flat colour tile. Two ways a picture arrives:

1. **Coarse to fine.** The tile is empty, then a sparse coarse grid of small dots shows the picture's shape, then a
   grid twice as fine, then the full fine grid; the dots keep growing to full tone and hold.
2. **Pale to dark.** A new picture shows at the fine grid as a pale dot field (small dots everywhere the picture is
   dark) and darkens to full tone.

The grid does not move: the dots are fixed at cell centres and only their radius changes. Light plays no part in
the reference (flat video colour); paint-kit adds paper and a key light under the same print.

## Beats (Source: frames)

| Beat | Time | Read from |
|---|---|---|
| Tile empty | 0 to 0.30 s | bm-tr row 1 |
| Step 1: coarse grid, about 15 cells across the tile, small dots | 0.35 to 0.45 s | bm-tr row 2, frames 1 to 2 (pitch about 16 px on a 243 px tile) |
| Step 2: grid twice as fine, about 29 cells across | 0.50 to 0.55 s | bm-tr row 2, frames 3 to 4 (pitch about 8.4 px) |
| Step 3: full grid, about 58 cells across; dots grow to full tone | 0.60 to 0.75 s | bm-tr row 2, frames 5 to 8 (pitch about 4.2 px) |
| Hold | 0.75 s on | bm-tr rows 3 to 4 |
| Next pictures arrive pale and darken within about 0.2 s | room 2.0 s, smokestacks 3.67 s, wind turbine 5.17 s | shelf report beats, bm-top |
| Loop: ends on a wordmark lockup, empties, restarts | lockup 13.25 s, empty 15.5 s, dots return 16.0 s | shelf report, bm-top2 |

Numbers taken from this table:

- **Pitch ratio 2 per step, three steps** (16 -> 8.4 -> 4.2 px on the tile: ratios 1.9 and 2.0). Source: frames.
- **Fine grid about 58 cells across the picture.** Source: frames.
- **About 0.1 s per step, about 0.4 s from first dots to hold** (0.35 to 0.75 s). The shelf verdict says "about
  0.4 s, not 0.3 s". Source: frames.
- **Empty lead-in about 0.3 s** before the first dots. Source: frames.
- **Pale to dark within about 0.2 s.** Source: frames (shelf report).
- **Picture cadence about 1.5 to 1.67 s** (2.0 -> 3.67 -> 5.17 s). Source: frames.
- **Grid angle 0 degrees** (rows and columns run with the tile's edges in every frame sheet). Source: frames.

## What is asked of the visitor

Nothing. The reel plays on its own; the page has no prompt.

## What the bar keeps and what it changes

- Keeps: the two arrivals (coarse-to-fine steps, pale-to-dark), the pitch ratio, the step and darken timings, the
  cadence, the fixed grid at 0 degrees, a single ink on one ground.
- Changes (copy the feel, not the identity): no coral, sky blue or black; the page's three tokens (ground, ink, one
  accent) colour it. No planet, room, smokestacks or wordmark: the pictures are my own, drawn from page shapes into
  a canvas, and seeded, so two pages at different seeds do not show the same picture. The print sits on paper under a
  key light (paint-kit's relief law), which the flat reference does not have.
- Leaves out: the dot-matrix icon tile, the poster marquee and the warming-stripes band (not this bar's beats).
