# Study: 04 Paper shred

Reference for bar 04, "scroll moves a cut line up the paper; below it the page hangs as strips that sway and lift
away to reveal a dark section": Shader (shader.se, shelf key `shader.se`, title "Shader Paper Shred Scroll Parallax
Interaction").

Numbers from the page capture are tagged `Source: page`. Numbers read off the captured frames or the shelf stills
are tagged `Source: frames`. A number the reference cannot give is marked `Not from the reference` with its reason.

## Source

- **Page capture** (bar-study-capture.md step 1), 2026-11-14:
  `capture --url https://shader.se --clock virtual --gpu hardware --gl --viewport 1440x900 --trigger scroll
  --scroll-to 40000 --scroll-steps 160 --scroll-ms 24000 --duration 28000 --fps 10 --seed 1`, out to
  `<private reference shelf>` (frames, `gl/summary.md`,
  filmstrip sheets in `sheets/`). The page is one full-window canvas that scrolls itself on wheel input
  (`document.scrollingElement.scrollHeight` is 900, the window height), so the wheel delta, not `scrollY`, drives it.
  The wheel ran at 40000 px over 24 s, 1.667 px of wheel per ms.
- **`gl summary` and its limit.** The canvas is `webgpu` (three.js r186 `WebGPURenderer`): the trace reads
  "programs: 0" and no channel changes during the shred (6.5 to 9.5 s). The tracer sees WebGPU buffers only as
  `gpu:gb...` floats and none moved in that window, so the shred's own constants (strip count, sway rate) are not in
  the trace. What the summary does give: canvas 1440 x 900 at css 1440 x 900, pixel ratio 1; `outputColorSpace`
  srgb, `toneMapping` 7 (exposure 1), clear colour alpha 0; 47.4 draw calls per frame; loaded models include
  `/models/shredder.glb` (the cut line is a 3D shredder bar). `Source: page`.
- So the strip and timing numbers below are measured on the captured frames (`frames/0072.png` to `0090.png`,
  10 fps, frame i at i / 10 s) with a short script (row autocorrelation for the strip pitch; following one gap line
  down a strip for the sway), plus the shelf's stills (`shred-down.jpg`, the 60fps.design phone clip, and
  `shader-se/scroll.jpg`). Desktop (1440) and phone (390) show the same strip width in CSS px.

## Mechanism

The reference page is printed paper (cream, with a heading and a photo). A shredder bar enters from the bottom of the
window and climbs as you scroll. Everything below the bar hangs as narrow vertical strips with thin dark gaps between
them; each strip is curled across its width, so its centre catches light and its edges fall dark. Further scroll
makes the strips wave (a vertical wave that runs down the strips, larger the more you scroll), then their bottom
ends rise, ragged strip by strip, over a dark navy section with a line of text ("Still not convinced ...") until the
strips leave by the top. The page header stays in place above it all. Scrolling back up brings a whole sheet back
with a corner page curl (not in this bar: the spec's beats stop at the reveal).

Light: the strips read as lit paper (bright crowns, dark curled edges, the gaps darkest). The reference lights a 3D
mesh; paint-kit writes the curl as height and lets the key light shade it.

## Beats

| Beat | When (1440 capture, wheel at 1.667 px/ms) | Phone clip (60fps.design, by time) | Source |
|---|---|---|---|
| Shredder bar enters at the bottom, about 0.85 of the window height down; strips below it | 7.2 to 7.3 s (frames 72 to 73) | 3.5 s, bar below the photo | frames |
| Bar climbs to the header; everything below hangs as strips | 7.3 to 7.7 s (0.4 s, about 0.74 window heights of wheel) | 3.5 to 6.5 s | frames |
| Strips wave, the wave growing with scroll; ends still at the bottom | 7.7 to 8.1 s (0.4 s, about 0.74 window heights) | 6.75 to 7.75 s | frames |
| Strip ends rise, ragged, over the dark section; its text shows from about 8.4 s | 8.1 to 9.0 s (0.9 s, about 1.67 window heights) | 8.0 to 8.75 s | frames |
| Dark section alone, header on top | from 9.0 s | from 8.75 s | frames |

## Numbers

| Number | Value | How measured | Source |
|---|---|---|---|
| Strip pitch | 17 to 18 CSS px (17.5) | row autocorrelation, frame 79 rows 480, 560, 640: 17, 18, 18 px at 1440 css; the phone still shows about 22 strips across 390 css | frames |
| Gap | about 3 CSS px, dark | median dark-run width on frame 79 rows (3.0 px) | frames |
| Bar start | 0.85 of the window height from the top | frame 73 and the first `shred-down.jpg` frame | frames |
| Sway wavelength | about 360 CSS px at a 900 px window (0.4 of the window height) | half-wave lag 122, 184, 220 px following one gap line, frames 78 to 80 | frames |
| Sway amplitude, start of the wave beat | 1.9 px | frame 78, one gap line, half the 5 to 95 % spread | frames |
| Sway amplitude, growth | 1.9, 3.5, 5.4 px at frames 78, 79, 80; 4 to 10 px (mean 7) across the width at frames 81 to 83 | same method, three gap lines per frame | frames |
| Ragged ends | strip ends spread about 0.13 of the window height (median minus 10th percentile 115 to 135 px, frames 81 to 83) | lowest bright row per 18 px column | frames |
| Pixel ratio | 1 at 1440 x 900 | `gl summary` canvas line | page |

## What paint-kit keeps and changes

- Kept: strips about 17.5 CSS px wide with thin dark gaps; a curl per strip read by the light; a cut line that climbs
  with scroll from 0.85 of the height to the header; a wave that runs down the strips and grows with scroll; ragged
  ends that rise over a dark section; a header that stays.
- Changed: no photo, heading or shredder model (the bar is about the paper, and pictures would be copied content);
  the cut line is a raised crease in the paper. The dark section is the page's ink token printed under the strips
  (see notes.md, "Why the gaps are ink"). No page curl on the way back.
- Changed in the rework: the page prints its own heading and one paragraph (own copy, not the reference's) on the
  paper under the header, so words shred with the strips and show that the print rides each strip.
- `Not from the reference`: an idle sway at rest. The capture scrolled without pause, so it cannot say whether the
  strips move when the wheel stops. paint-kit keeps the smallest measured amplitude (1.9 px) moving slowly at rest so
  the hanging strips read as hanging; its period is a Task 19 look-review question (notes.md).
