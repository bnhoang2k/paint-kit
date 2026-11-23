# Study: 01 lamp on paper (from Platen)

Reference: `60fps.design/shots/platen-typewriter-intro-how-to-interaction` (shelf key), "Platen Typewriter Intro
How to Interaction". The shelf entry is in `<private reference shelf>`; its stills are in
`<private reference shelf>`.

## Mechanism

A typewriter app's intro screen. The page is paper with typed words on it. A capsule sits on a black rail near
the bottom, with a T-shaped lamp head on top. A hold on the capsule switches the whole screen from day to night
(the shelf infers the hold: no finger shows in the clip, but the screen says "Hold either side of the capsule to
turn on night mode"). Night is the same paper with the room light turned down: the paper goes dark grey, the
typed ink stays the ink. The lamp then throws a cone of warm white light up the page. The cone is the only thing
that makes the typed words readable; words outside it sink into the dark. The capsule slides along the rail and
the cone travels with it, so moving the lamp chooses which words you can read. A second hold puts the lamp out and
the page goes back to day.

What the light does on which surface: a spot light standing just off the paper, aimed up the page at a grazing
angle, so its pool is a wide fan that is brightest just above the lamp head and fades with distance. Nothing is
lit below the rail (the cone points up). The paper's fibre texture shows inside the pool. The UI labels ("Turn
on the lamp", "Skip introduction") are screen text, not paper: they turn bright in night mode and do not take
the lamp's light.

What is asked of the visitor: hold the capsule (either side) to switch day and night; then slide it along the
rail to read.

## Beats (Source: frames, the shelf's 10 fps and 5 fps still sheets of the 8.3 s clip)

| Time | Beat |
|---|---|
| 0.0 s | Day: light paper, pale capsule on a black rail, lamp head on top, hand-drawn arrow at the capsule |
| 0.1 to 0.5 s | The page dims to dark grey; the capsule turns dark; the "Turn on the lamp" label turns bright |
| 0.5 to 1.0 s | A warm white cone grows up and out from the lamp head |
| 1.5 to 1.9 s | The hand-drawn arrow fades out |
| 2.3 to 4.3 s | The capsule slides left to the rail's end; the cone goes with it; words away from the cone fade |
| 4.3 to 7.0 s | It slides back right past centre, then settles left of centre |
| 7.0 to 7.4 s | The cone goes out; the page brightens back to day paper; the capsule turns pale |

Numbers taken from these (Source: frames):
- Day to night dim: 0.4 s (0.1 to 0.5 s).
- Cone growth after the dim: 0.5 s (0.5 to 1.0 s).
- Night to day (cone out and brighten): 0.4 s (7.0 to 7.4 s).
- Lamp travel: centre to the rail's left end in about 2.0 s (2.3 to 4.3 s). The finger is not shown, so this is
  the drag's speed, not a lag behind a pointer. The clip gives no pointer lag.
- Rail: spans the screen's width with end caps; the capsule's travel reaches about 22% of the width from the left
  edge at its left end.

## Page capture (bar-study-capture.md)

Command: `node <private reference shelf> capture
--url https://60fps.design/shots/platen-typewriter-intro-how-to-interaction --out
<private reference shelf>
--clock virtual --gpu hardware --gl --viewport 1440x900 --trigger none --duration 9000 --fps 10`.

The reference is a video clip on a gallery page, not a live WebGL site. `gl summary` read:
"601 frames traced · 0 draw calls per frame", one 2D canvas of 300 x 150 px at css 0 x 0, no programs. So there
are no shader uniforms to copy (no noise scale, falloff or grain constants): the trace has nothing to give for this
reference. The numbers below are read off the capture's final frame instead (`page-capture/final.png`, 1440 x 900,
the phone screen about 300 px wide, mid-clip with the lamp on at the centre).

Light profile (Source: page, `final.png`, 7 x 7 px mean luma on encoded 0..255 values; the lamp head at y 517):
- Along the cone's axis (x 718): 197 at 12 px above the head, peak 213 at 27 px, 161 at 57 px, 123 at 87 px,
  100 at 117 px, 85 at 147 px, 73 at 192 px, 66 at 237 px, 64 at 267 px. The peak (213) stays under the 8-bit
  knee of a soft shoulder (231): the pool is not clipped.
- Unlit paper: 53 below the rail, about 64 far up the page. Peak to unlit, encoded: about 3.4 to 1; in linear
  light about 13 to 1.
- Across the pool at 47 px above the head (y 470): peak 182 at the axis; half-height (124) at x 630 and x 795, a
  width of 165 px, 0.55 of the screen's width.
- The pool's light falls to half its peak (encoded) about 115 px (0.38 of the screen's short side) above the head
  and is close to the unlit level by 265 px (0.88 of the short side).
- The lamp's light is warm white: the hottest pixel is a little warmer than neutral. Its colour is not copied;
  paint-kit takes light colour from a kelvin tinted toward the page's tokens.

## What the bar keeps and what it drops

Keeps: one paper sheet with gentle macro relief and fibre micro relief; typed words drawn into the sheet's ink so
the lamp's light falls on them; a lamp on a rail near the bottom aimed up the page at a grazing angle, with
inverse-square falloff and a pool that does not clip; day and night as the room light (ambient) and the lamp, not
a palette swap; a hold on the capsule to switch; the lamp following the pointer along the rail.

Drops: the hand-drawn arrow, the "Skip introduction" link, the status lights' exact colours (one accent token
marks the lamp's on light), and the clip's opening in day mode (see Open questions).

## Open questions for the look review

- The bar opens in night mode with the lamp on, where the clip opens in day. The checks open the page frozen with
  no pointer, and the falloff law needs a lit lamp; a page that opened in day would need a hold before any light
  shows.
- The hold time (how long a press must last to switch) is not visible in the clip. The bar uses a builder's value.
- The lamp's lag behind the pointer is not in the clip (no finger shows). The bar uses a builder's value.
