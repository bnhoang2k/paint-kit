# Study: 06 Glimmer

Reference for bar 06, "light glimmers on the surface under the pointer": Agentic UI (agenticui.net, shelf title "Agentic UI Logo Glitch Spin Animation", 5 stars: "move your mouse around and stuff glimmers").

All numbers are CSS px on a 1440 x 900 viewport. Times are ms. "Frame" means one requestAnimationFrame tick at 60 Hz (16.7 ms). Every capture ran on the virtual clock, so frame k is the page at exactly t = k/60 s.

## Source

- **The live site no longer has the effect.** On 2026-11-13, agenticui.net redirects to agenticui.dev, a light design-system site with a blueprint loader and a page-peel corner. It has no canvas and no glow (capture `inspect/`, `probe-load/`).
- The glimmer lived on the Framer site that agenticui.net served from about September to October 2026. The shelf's own clip (`media/captures/agenticui-net/normal/clip.webm`, recorded 2026-10-16, 960 x 600 at 25 fps) shows it: a black console-style page with a cluster of glowing squares behind the "Agent\c" wordmark.
- The Wayback Machine copy of that page (snapshot 2026-09-02) loads its HTML and text, but not the scene (`probe-wayback/`). Its page module names the scene. It is a Unicorn Studio embed (a hosted WebGL scene editor): project `sL14RZnV8QWamuCvfpAi`, SDK 2.0.2, dpi 1.5, scale 1, fps 60, lazy load on, in a box that fills the viewport.
- Unicorn's CDN still serves that project. I hosted it in a one-file harness page (`harness/index.html`: a black body and a full-viewport box) and captured the harness. **Every capture below is the original scene. The page's HTML layer is missing**: the console text, grid lines, wordmark and buttons. The only overlay is the scene's own tracking boxes.
- The "Logo Glitch Spin Animation" in the shelf title is a 60fps.design phone recording of an older version of the site: a scanline hexagon logo above "Coming Q1 2026" (`media/sixty/appsites-agentic-ui-logo-glitch-spin-animation.png`). That version was not captured. The Wayback snapshots from January 2026 may hold it. The glitch measured here is the scene's own load intro, a pixel mosaic that resolves.
- Captures are in `<private reference shelf>`. Frame sheets I read are in its `sheets/` folder.

## Mechanism

A WebGL2 canvas fills the viewport (2160 x 1350 px drawing buffer, pixel ratio 1.5). Each frame runs 11 full-screen passes; each pass reads the previous pass's texture:

1. **Light volume.** A short raymarch through a 3D noise density, with absorption and a two-colour palette, then ACES tonemapping. Time drifts the volume. The pointer moves the camera by 20% of its offset from the centre, so the light shifts with parallax. The pass also computes a glow term from the pointer's distance.
2. **Mask by an image.** A picture of 11 rounded squares (about 429 px wide, centred, top at 46% of the height) cuts the light. The light shows only inside the squares; everything else is black.
3. **Chromatic aberration.** The red channel samples one way and blue the other, so warm and cool fringes show on opposite edges of each square. The offset direction turns slowly with time. The effect is strongest at the centre and fades to zero about half a screen height out.
4. **God rays.** A 32-step radial blur streams the bright squares outward from the centre, with a pale cool tint. The pointer shifts the rays' centre by 8% of its offset.
5. **Colour.** HSL saturation is doubled and contrast raised by 1.16.
6. **Vignette.** An ellipse fades to black from 0.125 to 0.375 of the screen.
7. **Intro mosaic.** The image is pixelated into large cells that shrink to nothing over 1 s after load. This is the "glitch".
8. to 11. **A fake computer-vision overlay.** One pass detects where luminance changed since the last frame. It rises fast and decays over about 240 ms. Further passes fill and peak-find that change and track up to 6 blobs. The last pass draws a corner-bracket box over each blob with a 4-digit readout (0.xxxx), from a font atlas.

The glimmer is passes 1 to 4 together. The squares hold still. The light inside them drifts, so each square slides between mid blue, pastel and clipped white. The rays swing a little with the pointer. Wherever the light changes, the tracking boxes pop up and fade.

## Beats

Load (capture `load-intro`, t = 0 at navigation):

- 17 ms: first frame. The squares show as a coarse mosaic of cells about 70 to 75 px across. Cells take white, black and saturated colours (red, yellow, cyan, violet).
- 517 to 1500 ms: the mosaic resolves. Cell size follows uAmount = (1 - k/60)², from 1 to 0 over 60 frames: fast at first, with fine detail last. Each frame re-samples the cells, so many cells jump between white and black from frame to frame.
- 1500 ms: the image is sharp. Idle running begins.

Idle (capture `idle`, 5 s, pointer at rest):

- The light drifts the whole time. The volume moves 0.9 noise units per second. Single squares brighten to clipped white and fall back with no fixed rhythm. The left square rose from luminance 0.11 to 1.00 in about 1.2 s, held, and fell back over about 1.2 s. At idle, no measured square changed by more than 0.085 in 50 ms.
- The fringe direction turns through a full circle every 4.17 s.
- Tracking boxes appear over squares whose light is changing. Each box has corner brackets, a dashed diagonal and a readout. A box holds while the change lasts and fades over about 240 ms.

Pointer (captures `slow-sweep`, 1200 ms per leg, and `fast-sweep`, 150 ms per leg, over 5 points on the cluster):

- The scene follows a lagged copy of the pointer. Each frame it moves 25% of the way to the true pointer. It reaches 95% of a jump in 10 frames (174 ms) and 99% in 16 frames (267 ms).
- Moving the pointer re-angles the light inside the squares (camera parallax) and swings the rays' centre a little. The pointer makes changes faster than idle drift does. In the slow sweep, the left square's luminance moved up to 0.45 in 50 ms, against 0.085 at idle. Part of that is the tool's opening jump from (1, 1). The pointer steers light that is already there; it does not switch it on.
- On the fast sweep, the lag smooths the whole 600 ms path into one glide that ends about 300 ms after the pointer stops.

## Asked of the visitor

Nothing. The scene runs on its own from load. Moving the pointer anywhere on the page tilts the light and the rays. There is no click, hover target or scroll response.

## What the light does on which surface

- The **squares** are the only lit surface. Light lives inside them and is cut at their rounded edges, so each square reads as a lit glass tile, not a glow on the page.
- The **edges** of the squares carry the colour: warm on one side, cool on the other, from the aberration pass.
- The **black ground** gets light only from the rays: soft beams 150 to 250 px long that fan out from the cluster. The vignette keeps the outer page black.
- The **tracking boxes** are a separate grey overlay. They are not light.

## Frames read

From `sheets/montage-1.png`, `montage-2.png` and `montage-load.png`:

- `slow-sweep` 0012 (t 0): mixed squares, two bright and the rest pastel blue. One tracking box is at the top right.
- `slow-sweep` 0048 (0.6 s, first leg): the centre and right squares are clipped white. Boxes cover the middle row.
- `slow-sweep` 0087 (1.25 s, pointer at the top right): the upper left square has warm and violet bands; the centre is white.
- `slow-sweep` 0156 (2.4 s): most of the top two rows are clipped white, with the rays at their longest.
- `slow-sweep` 0300 (4.8 s): the right column is dim teal and the left side bright, so the light has moved across the cluster.
- `fast-sweep` 0033 and 0084: the same kinds of states as the slow sweep. The fast sweep adds no new effect.
- `idle` 0162 (2.5 s): bright top rows and two boxes. Idle looks the same as a pointer pass.
- `load-intro` 0036, 0040, 0044, 0048 (0.58 to 0.78 s): a coarse mosaic. Neighbouring cells change between white, black and saturated red and yellow from one sampled frame to the next.

## Numbers

| What | Value | Source |
|---|---|---|
| Canvas | WebGL2, 2160 x 1350 px drawing buffer for a 1440 x 900 box, pixel ratio 1.5; antialias off, alpha on, premultiplied alpha | Source: page (gl summary) |
| Scene embed settings | Unicorn Studio SDK 2.0.2, dpi 1.5, scale 1, fps 60, lazy load on | Source: page (Framer page module) |
| Passes | 12 programs, 11 draws per frame: 10 to offscreen targets, 1 to the screen. All use blend ONE, ONE_MINUS_SRC_ALPHA. One more program draws once, at about 0.02 per frame | Source: page (gl summary) |
| Light volume clock | uTime +0.3 per frame (18 per s). Volume time = uTime x 0.05, so 0.9 noise units per s. It is a per-frame step, so it depends on frame rate | Source: page (gl-track, shader) |
| Aberration clock | uTime +0.08 per frame (4.8 per s). Direction = 0.25 + uTime x 0.05 turns, so 0.24 turns per s, a full circle every 4.17 s | Source: page (gl-track, shader) |
| Aberration size | 0.22 x 0.03 = 0.0066 of the screen (about 6 px at 900 px tall) at the centre, falling linearly to 0 at an aspect-corrected distance of 0.52 | Source: page (shader constants) |
| Pointer lag | k = 0.25 per frame (x += (target - x) x 0.25). Fitted from the first lagged step (0.5 to 0.3752 toward 0.0007, so k = 0.250) and the steady-motion gap. 95% in 174 ms, 99% in 267 ms | Source: page (gl-track) |
| Pointer users | The lagged pointer drives the light volume and the god rays. The raw pointer reaches the mask, aberration and mosaic passes, but each multiplies it by 0 | Source: page (gl-track, shader) |
| Light camera parallax | Camera shifts by 0.20 x (pointer - centre) | Source: page (shader constant) |
| God rays | 32 steps, decay 0.9275 per step, intensity 1.96. Centre shifts by 0.08 x the pointer offset | Source: page (shader constants) |
| Colour pass | Saturation x 2, contrast x 1.16 about mid-grey | Source: page (shader constants) |
| Vignette | Elliptical. Fades to black from radius 0.125 to 0.375 of the screen | Source: page (shader constants) |
| Mask image | 428.6 px wide, aspect 1.0095, centred on x 0.5 and y 0.4647 of 1440 x 900 | Source: page (fixed uniforms) |
| Intro mosaic | Cell = (uAmount + 0.01) x 0.083 of the screen. uAmount goes 1 to 0 as (1 - k/60)² over 1000 ms, from 517 to 1500 ms after the first frame | Source: page (gl-track, load-intro) |
| Mosaic cell size at its start | About 70 to 75 px | Source: frames (load-intro 0036) |
| Change detector | Fires on a luma change of 0.10 to 0.25 per frame. Rises 60% of the way per frame. Decays x 0.81 per frame, about 240 ms to 5% | Source: page (shader constants) |
| Tracking boxes | Up to 6 at once, an 8-cell search grid, a 4-digit readout | Source: page (shader constants) |
| Lit squares | 11 rounded squares in a stepped cluster, about 430 x 430 px, centred | Source: frames |
| Ray length | About 150 to 250 px past the cluster | Source: frames |
| Square luminance swing | Idle: 0.11 to 1.00, rise and fall about 1.2 s each, at most 0.085 per 50 ms. Slow sweep: up to 0.45 per 50 ms | Source: frames (three square boxes, every 3rd frame) |
| Largest share of a 341 x 256 window changing in one direction within 100 ms | slow sweep 25.1%, fast sweep 25.6%, idle 15.6%, load intro 49.1% | Source: frames (flash script) |
| Determinism | Two slow-sweep captures at seed 1: 403 of 403 frames compared, offset 0, mean mismatch **0.00%** | Source: frames (compare) |

## Flash safety

Measured against WCAG 2.3.1 on every 60 fps capture. A general flash is a pair of opposing changes in relative luminance of 0.10 or more, where the darker state is below 0.80. A red flash is a pair of opposing changes in saturated red. A window of 341 x 256 CSS px was scanned over the whole viewport with a quarter-window stride (154 windows per capture). A window makes a transition when at least 25% of its area moves the same way. Transitions are then counted in every 1 s span. Script: `<private reference shelf>` (kept with the captures). It was checked on planted flashes first: 2 Hz and 5 Hz white gave 2.0 and 5.0, 5 Hz red gave 5.0 red, and a 40 px patch gave 0.

| Capture | General flashes per s (max over windows) | Red flashes per s |
|---|---|---|
| slow sweep (6.7 s) | 0 | 0 |
| fast sweep (3.7 s) | 0 | 0 |
| idle (5.2 s) | 0 | 0 |
| shelf clip of the real page, 2026-10-16 (64.8 s, 25 fps) | 0.5 (one transition, the page appearing at load) | 0 |
| **load intro mosaic** (3 s) | **0 to 17.5, depending on the concurrency rule** (below) | 0 (red covers at most 19% of a window) |

- **The pointer glimmer and the idle light do not flash.** Bright squares fade up and down over about 1.2 s, and the largest square is about 10% of a window. In no window does a quarter of the area swing back and forth.
- **The load mosaic is a borderline case.** For about 1 s, cells about 70 px across jump between white, black and saturated colour on many frames. The mean luminance of the worst window stays between 0.23 and 0.31, because cells brighten and darken at once. Whether this counts as flashing depends on how close in time the changes must be to count as one flash:
  - same frame only: 0 flashes per s;
  - within 50 ms: 2.5 flashes per s, window at (588, 192), frames 1 to 56;
  - within 100 ms: **17.5 flashes per s**, window at (588, 256) to (929, 512), frames 35 to 70 (0.57 to 1.15 s).
- **Can the glitch exceed 3 flashes per second? Yes, under the looser reading.** Under the strict same-frame reading it does not. The pointer-driven glimmer, which is what bar 06 copies, never flashes.
- For bar 06, do not copy the mosaic's re-sampling of cells every frame. Any resolve or glitch effect should change a given area at most 3 times per second, or keep each changing patch under 25% of a 341 x 256 window.

## Capture commands

Run from `<private reference shelf>`, with `R=<private reference shelf>`. For the Match step on bar 06, change only `--url` (the bar page) and `--out`, and point `--target` at the bar's full-viewport surface.

```bash
COMMON="--viewport 1440x900 --clock virtual --gpu hardware --gl --assets --fps 60 --seed 1 --wait-before 3000"
P="0.30,0.30;0.65,0.25;0.40,0.55;0.70,0.65;0.50,0.45"
node $R capture --url harness/index.html --out slow-sweep   $COMMON --trigger move --target "#scene" --path "$P" --path-ms 1200 --duration 6500
node $R capture --url harness/index.html --out slow-sweep-2 $COMMON --trigger move --target "#scene" --path "$P" --path-ms 1200 --duration 6500
node $R capture --url harness/index.html --out fast-sweep   $COMMON --trigger move --target "#scene" --path "$P" --path-ms 150  --duration 3500
node $R capture --url harness/index.html --out idle         $COMMON --trigger none --duration 5000
node $R capture --url harness/index.html --out load-intro   --viewport 1440x900 --clock virtual --gpu hardware --gl --assets --fps 60 --seed 1 --trigger load --duration 3000
node $R compare --ref slow-sweep/frames --clone slow-sweep-2/frames --out compare-slow-repeat
node $R gl summary slow-sweep
python3 -I flash.py frames <capture>/frames 60 1.0            # FLASH_LOOKBACK=1|3|6 frames sets the concurrency rule
```

In zsh, split `$COMMON` with `${=COMMON}`, or run the commands from bash. The harness needs two outside hosts: jsDelivr for the SDK, and Unicorn Studio's CDN for project `sL14RZnV8QWamuCvfpAi`. If either drops it, these captures are the only record. Each move capture starts with the tool's pointer at (1, 1). That pulls the lagged pointer 25% toward the top left on the first frame, before the path begins.

## Copyright

The trace contains the scene's shader source. This study describes the mechanism and its constants only. paint-kit writes its own shaders from scratch. Colours come from the page's tokens. The squares' layout and the scene's palette are not copied.
