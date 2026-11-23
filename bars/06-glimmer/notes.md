# Notes: 06 glimmer

Measured numbers for bar 06, each with its source and why. "ss" is short-side units (1 is the canvas's shorter
side). Study: `study.md` (Agentic UI's Unicorn Studio scene, captured 2026-11-13). Frame time: not measured (it is
read by eye in the browser pane at the look review; a headless timing is never reported as speed).

This is the backlit-glass rebuild (2026-11-14, after the Task 19 look review), with its final round (2026-11-15):
brighter tiles, a cooler palette and the review fixes; then the deeper-dims round (2026-11-15, after the owner's second
look; see "Deeper dims" below). The first build (brushed-metal tiles lit from the front, a
cushion, a tilting key light) is in git history up to 048aca8; its sweeps no longer apply.

## Look target (written before any number was set)

Read from the reference's idle frames 0060, 0150 and 0270 (`agenticui-net/idle/frames/`).

**The reference's core look, in one line:** a small cluster of frosted panels on black, glowing near-white from
behind. Their cool tint (ice blue, blue, lilac) shows toward the edges and in the one or two dimmer tiles, and the
light stays inside each tile. Measured: the tile-centre luma median is 0.963, 1.000 and 0.744 in 0060, 0150 and 0270,
and 5, 9 and 4 of the 10 tiles read 0.95 or more. The dimmest tile reads 0.738, 0.926 and 0.252, and the lower
quartile 0.820, 1.000 and 0.411: the light moves widely, so at some moments nearly every tile is white and at others
four tiles fall to a deep blue or teal (0.25 to 0.42). (Method: a 9 x 9 px patch mean at each tile centre, Rec. 709
weights on the encoded values. The earlier report read 0.87 for 0270; its method was not recorded.) Every look change below was
judged with a reference frame beside a bar frame.

- **The tiles glow from inside.** Each tile is a frosted light panel lit from behind. The light is inside the tile
  and stops at its rounded edge. It is not a glint on the tile's face, and it never spills onto the page.
- **Several tiles blow to white; the others fall dimmer, down to nearly dark.** At any moment a few tiles sit at
  pure or near white, with a slow gradient across the face, and the tiles the light misses fall to a dim blue glass.
  Which tiles are dim changes as the light drifts. The swell carries one tile to pure white and back over about
  1.2 s (study, Beats: the left square rose from 0.11 to 1.00 in about 1.2 s and fell back over the same). (Revised
  2026-11-15 twice: the first target said "a soft pastel", which read about 0.69 against the reference's near-white
  tiles; the second said "most tiles near white", which kept every tile at 0.77 or more, and the owner's second look
  asked for the dim tiles to fall much darker.)
- **The tiles hold still.** Only the light behind them moves.
- **The pointer steers where the light sits,** through the engine's eased pointer (25% of the way per frame). Move
  the pointer to one side and the light leans that way. It steers light that is already there; it does not switch
  it on (study, Pointer).
- **The ground stays dark and unlit.** Between the tiles and around the cluster the page shows its own ground token.
- **The edges read as frosted glass:** a slightly brighter rim where the light crosses more glass, and a soft frost
  that spreads the light over about one tile (revised by the frost sweep), so a lit tile never shows a hard spot.
- **Light scheme:** the same panels on a pale slate ground, darker than the lit tiles, so they still read as light
  sources. A lit tile rises to a pale accent and then to white. The ground itself never lights up. The reference has no light scheme; see "Frames read next to the reference" for how
  far this holds.

### The cluster: a stepped checkerboard of 11 large tiles

Decision: leave the seeded 50-tile mosaic and move near the reference's scale, about 11 tiles across about 0.46 ss.

- Why: the look is single tiles swelling to white. A backlit tile needs room for its own gradient and frost, and the
  swell must read as "this tile", not as a moving spot sliding across many small tiles. On the old 35 px tiles the
  frost (about one tile) would be under 35 px, and a tile-sized light would light four tiles at once.
- Not copied: the reference's layout. Ours is a 5 x 5 checkerboard (cells where i + j is even, 13 of them), with two
  of the eight outer cells dropped by the seed, so the outline changes with the seed. Tiles shrink toward the edge
  (largest at the centre), as the reference's do, by our own sizes.

## Layout (`GLIMMER`, the tile field)

| Number | Value | Source | Why |
|---|---|---|---|
| Grid | 5 x 5 checkerboard, 13 cells, 2 outer cells dropped by the seed: 11 tiles | Source: frames (study: 11 squares in a stepped cluster) | The reference's count; the layout is our own (see the cluster decision above) |
| `pitch` | 0.1 ss | Source: frames, scaled | The reference cluster is about 430 x 430 px of 900 (0.48 ss) across about five steps. Five cells at 0.1 give about 0.476 ss with the outer tiles' half-width and jitter. Diagonal neighbours sit 0.1 apart on each axis, so their corners nearly meet, as in the reference |
| `sizes` | 0.094, 0.088, 0.072, 0.056 ss | builder, from frames | Largest at the centre, smaller outward, as the reference's squares are (about 95, 70 and 48 px of 900, so 0.105, 0.078, 0.053 ss). Ours are a little smaller so the diagonal gap (0.006 to 0.012 ss, 4 to 7 px) stays open |
| `jitter` | 0.004 ss | builder | A seeded change of under 5% of a side, so the tiles are not stamped |
| `corner` | 0.14 of the side | Source: frames | The reference's corner radius is about 13 px on a 95 px square |
| `bevel`, `bevelDrop` | 0.007, 0.003 ss | builder | The test page's rounded edge (0.01, 0.004 on a 0.13 tile), scaled to these tiles. No law reads the height; it only shapes the faint front sheen |
| `lift` | 0.035 ss | Source: page (study: mask centred at y 0.4647 of the height) | 0.5 - 0.4647 = 0.035 of the height, which is short-side units on a landscape canvas |

## Palette (tokens only)

| Token | Light / dark | Source | Why |
|---|---|---|---|
| `--accent` (ramp 0.25) | oklch(0.60 / 0.64, 0.14, 250) | Source: frames (the reference's blue tile edges and dim tiles) | Blue |
| `--accent-2` (ramp 0.5) | oklch(0.84 / 0.88, 0.05, 225) | Source: frames (the reference's cool white) | Ice: a near-white with a little cyan-blue |
| `--accent-3` (ramp 0.75) | oklch(0.68 / 0.72, 0.10, 295) | Source: frames (the lilac in 0060) | Lilac |
| `--ground` (light) | oklch(0.84 0.012 250), a pale slate | Source: the render check, then frames | On the old cream (0.95) the near-white tiles sat at the paper's own lightness: the render check read the frame's luminance std at 0.0166, under its 0.02 floor (gate, 2026-11-15). At 0.84 the gate reads 0.0317, 0.0316 and 0.0322 at seeds 1 to 3 (per-seed numbers from the gate run on bdb3848), and the lit tiles stand above the paper. Cream at 0.84 read the same (0.0318); slate matches the cool palette. 0.88 read 0.0248, a thin margin |
| `--ground` (dark), `--ink` | unchanged | first build | Not part of this round |

The glows drift through the accents in ramp order (the hue noise mixes neighbours in OKLab), so the ice sits in the
middle: blue and lilac then pass through a pale tint, not a grey violet. A first try with lilac in the middle
(blue 255, lilac 295, cool white 230 last) made the mid tiles read greyish lilac against the reference's cool white.
The old teal tokens (hues 215, 190, 165) made the mid tiles lean green.

## Material (`materials.glass`)

| Number | Value | Source | Why |
|---|---|---|---|
| `frost` | 0.094 ss | frost sweep below | One centre tile wide: a lit tile fills almost evenly, as the reference's blown tiles do. Under the swell's radius (0.1); see the limit below |
| `transmit`, `rim`, `rimWidth`, `gloss` | engine defaults 0.9, 0.6, 0.008, 0.3 | engine | The default rim gives the frosted edge the target asks for; nothing here needed a change |
| Bar `detail` | 0.6 | builder | Wave 1's default. At detail the frost's etch shows in the lit tiles |

## Lights

| Number | Value | Source | Why |
|---|---|---|---|
| Pointer `ease` | 0.25 per 1/60 s tick | Source: page (study: k 0.25 per frame) | 95% of a jump in about 10.4 ticks (174 ms), 99% in 16 (267 ms), as the reference |
| Swell (light 0, behind) `radius` | 0.1 ss | builder, from the look target | About one centre tile, so one tile (at most two) blows out at a time |
| Swell `level`, `tint` | 6, 0.6 | backlit-glass report | Level 6 drives the tile it sits under into the finish's shoulder, to white (tile centres read 0.96 to 0.995 at the swell). Tint 0.6 keeps the swell's edges pale, not saturated |
| Swell, wash and fill `follow` | 0.2 x min(1, width / height, 1.6 / (width / height)) | Source: page (study: the light camera shifts by 0.20 x the pointer's offset) | The reference's parallax. Caveat: the study's 0.20 moves a raymarch camera in scene units; reading it as 0.2 of the page is an assumption, not a measurement. The engine applies `follow` in page fractions, and a page fraction of height on a portrait canvas is height / width short-side units. So the bar scales the follow by width / height there (break pass row 3), and remakes the lights once when a resize changes that scale. A canvas wider than 16:10 is scaled by 1.6 / (width / height) (`followAspect`), so the sideways shift in short-side units never exceeds the 960 x 600 one (break pass row 5). 960 x 600 and anything between 1:1 and 16:10 keep 0.2 |
| Swell path | x 0.19 sin(2 pi t / 16), y 0.18 sin(2 pi t / 13 + 1.1), short-side units about the cluster's centre (`fromCluster`, through the engine's `sheetToPage`, turns them into page fractions per draw) | Source: frames (study: rise and fall about 1.2 s each) | Peak speed: x 2 pi x 0.19 / 16 = 0.075 ss/s, y 2 pi x 0.18 / 13 = 0.087 ss/s. From the glow's edge to a tile's centre is its radius, 0.1 ss: 1.1 to 1.3 s at those speeds, so a tile swells over about 1.2 s and fades over the same. The amplitudes keep the path inside the cluster (0.19 and 0.18 ss each way). The periods share no short multiple, so the path does not visibly repeat |
| Wash (light 1, behind) `radius` | 0.32 ss | deeper-dims sweep below | A few tiles wide: the falloff keeps (1 - (0.141 / 0.32)^2)^2 = 0.65 at a diagonal neighbour and 0 at an outer corner when the wash is centred, so the tiles it misses fall dark. 0.6 (the round before) kept 0.60 at the corners, and every tile stayed at 0.77 or more |
| Wash `level` | 2 | deeper-dims sweep below | Drives the tiles under it into the finish's shoulder, to white. Lower (1.6) let the white face fall to 0.989 at some moments, near the law's 0.988 |
| Wash `tint` | 1 | deeper-dims sweep below | The full accent hue, so the tiles at the wash's edge carry blue and lilac as they dim |
| Wash path | x 0.09 sin(2 pi t / 11), y 0.09 sin(2 pi t / 7 + 0.6), short-side units about the cluster's centre | deeper-dims sweep below | The reference's light moves widely: some frames have every tile white (0150), others four dim tiles (0270). A centred, still wash dimmed the same three corner tiles at every moment. The drift moves which tiles are dim. Peak speed 2 pi x 0.09 / 7 = 0.081 ss/s, near the swell's |
| Fill (light 2, behind) | radius 0.6, level 0.1, hue ramp 0.25 (`--accent`, blue), tint 1, centred | deeper-dims sweep below | Without it, a tile the wash misses is lit by the ambient alone and reads neutral grey. The fill turns it into a dim blue glass, nearer the reference's deep blue tiles. Level 0.2 lifted the dimmest tile to 0.39 to 0.58; 0.3 to 0.45 to 0.62 |
| `ambient` | 0.1 | deeper-dims sweep below | The glass's dim front body. At 0.3 the ambient alone read 0.268 on every tile, a grey floor under the dims; at 0.1 the fill carries the dim tiles |

## Sweeps (numbers set after a failed check or a review note; look target first, as above)

Steps for both: seed 1, 960 x 600, dpr 1, detail 0.6, dark scheme, crops of the cluster read beside a reference
frame. The wash sweep was run through `__paint.setLight(1, ...)` on the page.

### Wash level and radius (after the look review: tiles too dim against the reference; superseded by "Deeper dims")

Times t 2, 5 and 9 (three idle frames, read beside 0060, 0150 and 0270), pointer at rest, the cool palette above,
tint 0.8. "Median" is the tile-centre luma median (method as in the look target). "Min" is the dimmest tile at t 2.
"At 0.95+" counts the tiles at 0.95 or more at t 2, 5, 9. The reference reads medians 0.963, 1.000 and 0.744.

| Wash level, radius | Median at t 2 / 5 / 9 | Min | At 0.95+ | What the frames show |
|---|---|---|---|---|
| 0.5, 0.5 (the rebuild, teal tokens) | 0.683 / 0.681 / 0.683 | 0.541 | 1 / 1 / 1 | Green-teal panels, well under the reference |
| 0.7, 0.5 | 0.774 / 0.772 / 0.772 | 0.608 | 1 / 1 / 2 | Pale lilac-grey; still dimmer than the reference |
| 0.9, 0.5 | 0.851 / 0.845 / 0.850 | 0.669 | 1 / 1 / 2 | Near the reference's lower bound; the outer corners stay grey-lilac |
| 1.0, 0.5 | 0.886 / 0.864 / 0.884 | 0.697 | 2 / 1 / 3 | In the range; corners still dim |
| 1.1, 0.5 | 0.917 / 0.881 / 0.916 | 0.723 | 3 / 2 / 3 | Bright; three tiles read white at once |
| 1.2, 0.5 | 0.942 / 0.898 / 0.940 | 0.748 | 3 / 2 / 3 | Closest to 0150; the swell is hard to pick out |
| 0.9, 0.6 | 0.874 / 0.871 / 0.871 | 0.745 | 2 / 1 / 2 | Even, a touch dim |
| **1.0, 0.6** | **0.909 / 0.906 / 0.906** | **0.775** | **2 / 1 / 3** | **Near-white panels with an ice and lilac tint, the corners lit, and the swell's tile the purest white. Meets the target** |

Pick: level 1.0, radius 0.6. It sits inside the reference's range at every idle time, and the swell still stands
apart. The transmit law: the old law read only the first light behind and failed any wash above about 0.52. The
check branch (checks-scope round) counts every light behind. On this page at wash 1.0, with that branch and check
round 2 merged, the gate read share 0.951 at seeds 1 to 3, and the mud range over the paint 0.2129, 0.2070 and
0.2158 (light) and 0.2051, 0.2002 and 0.2012 (dark) at seeds 1 to 3, against the 0.07 floor (gate run of
2026-11-15 on bdb3848, after the slate ground; the run before check round 2 read 0.2061 dark at seed 1).

### Deeper dims (after the owner's second look, 2026-11-15)

The owner's verdict, in their words (the option they picked): "Close: deeper dim tiles (Recommended)": "Keep the look, but
let tiles like B fall much darker, so A pops the way the reference does." A was the tile the light behind blows to
white; B was a small dim corner tile.

Core look, named before the sweep: frosted panels on black glowing from behind, a few blown to near white, the
others dimmer down to nearly dark, a cool tint at the edges. Every row was read with a reference frame beside it.

Steps: seed 1, 960 x 600, dpr 1, detail 0.6, dark scheme, pointer at rest, lights set through `__paint.setLight`.
Numbers are tile-centre luma (method as in the look target): brightest, median, lower quartile ("q25") and dimmest
tile. The reference reads, at 0060 / 0150 / 0270: brightest 1.000 / 1.000 / 1.000, median 0.963 / 1.000 / 0.744,
q25 0.820 / 1.000 / 0.411, dimmest 0.738 / 0.926 / 0.252.

Centred, still wash (t 2 / 5 / 9; ambient 0.3, wash tint 0.8 unless named):

| Wash level, radius | Median | q25 | Dimmest | What the frames show |
|---|---|---|---|---|
| 1.0, 0.6 (before) | 0.909 / 0.906 / 0.906 | 0.833 / 0.868 / 0.870 | 0.775 / 0.785 / 0.775 | Every tile pale; nothing dim for the blown tile to stand against |
| 1.5, 0.40 | 0.962 / 0.892 / 0.961 | 0.779 / 0.853 / 0.825 | 0.649 / 0.666 / 0.649 | Corners a little greyer; no tile reads dark |
| 1.5, 0.35 | 0.937 / 0.824 / 0.937 | 0.685 / 0.780 / 0.740 | 0.532 / 0.538 / 0.532 | Corners grey |
| 1.5, 0.30 | 0.886 / 0.722 / 0.883 | 0.566 / 0.693 / 0.640 | 0.397 / 0.397 / 0.410 | Dims in range, grey |
| 2.5, 0.30 | 0.968 / 0.879 / 0.985 | 0.680 / 0.787 / 0.736 | 0.460 / 0.460 / 0.478 | The five centre tiles all white at every moment |
| 3, 0.26 | 0.939 / 0.804 / 0.982 | 0.586 / 0.720 / 0.660 | 0.346 / 0.346 / 0.378 | As above, corners darker |
| 4, 0.24 | 0.938 / 0.811 / 0.989 | 0.566 / 0.710 / 0.651 | 0.315 / 0.315 / 0.340 | As above |

A centred, still wash misses the point: it makes a fixed vignette. The same five centre tiles stay white and the same
three corners stay grey at every moment, so the swell's tile no longer stands apart. The dims are a neutral grey
(the ambient alone reads 0.268 on every tile), where the reference's are deep blue and teal. Ambient 0.15 with tint 1
moved the dims by only 0.02 to 0.04 and left them grey.

A wash held toward the top left (level 2, radius 0.3, ambient 0.15) read like 0270 on one side (median 0.865,
dimmest 0.33), but it was fixed. So the wash drifts, and a faint blue fill colours the tiles it misses. Each row
below is 12 frames, t 1 to 12 (wash level 2, radius 0.32, tint 1, the drift in the lights table, ambient 0.1 unless
named). "Median" is the median of the 12 frame medians, with its range; the other two give each one's range over
the frames:

| Fill level (blue, radius 0.6) | Median (range) | q25 range | Dimmest range | What the frames show |
|---|---|---|---|---|
| none, ambient 0.15 | 0.909 (0.637 to 0.967) | 0.435 to 0.838 | 0.189 to 0.480 | Range like the reference's, and the dim tiles change. The dimmest read near-black grey, as if switched off |
| 0.3 | 0.954 (0.779 to 0.982) | 0.615 to 0.909 | 0.454 to 0.619 | Dims blue but too light |
| 0.2 | 0.944 (0.736 to 0.979) | 0.563 to 0.888 | 0.386 to 0.575 | Lighter than needed |
| 0.15 | 0.936 (0.712 to 0.976) | 0.535 to 0.876 | 0.345 to 0.551 | Close |
| 0.15, ambient 0.05 | 0.933 (0.706 to 0.976) | 0.525 to 0.871 | 0.327 to 0.541 | The same as ambient 0.1 by eye |
| 0.1, wash level 1.6 | 0.876 (0.636 to 0.935) | 0.474 to 0.806 | 0.297 to 0.490 | Fewer white tiles; white face down to 0.989 at one moment |
| **0.1** | **0.927 (0.686 to 0.973)** | **0.505 to 0.863** | **0.298 to 0.525** | **A few tiles white, the tiles the light misses a dim steel blue, and which ones changes as the light drifts. Meets the target** |

Pick: the drifting wash (level 2, radius 0.32), the blue fill at 0.1, ambient 0.1. At the three idle moments (t 2 /
5 / 9): brightest 0.994 / 0.995 / 0.993, median 0.885 / 0.777 / 0.933, q25 0.622 / 0.658 / 0.610, dimmest 0.301 /
0.308 / 0.399; 4, 5 and 5 tiles read 0.95 or more (the reference: 5, 9, 4). The dimmest tile sits at 0.30 to 0.41
at most moments; in 2 of the 12 frames it rises to 0.50 and 0.53, when the wash crosses the cluster's middle and
every tile is lit (as in 0150). Seeds 2 and 3 read the same (dimmest 0.29 to 0.52, median 0.79 to 0.98 at t 1, 2,
3, 5, 9).

### Tile variation (relight transmit (d), checks round 2)

The law reads each tile's face (a 9 x 9 px centre patch, encoded Rec. 709 luma, light scheme). Since check round 3
it reads t 1, 2 and 3 and decides on the first moment where some tile's white face (its dimmest channel) reaches
252 / 255 and the brightest minus the lower-quartile face reaches 0.07.

After the deeper dims (gate run of 2026-11-15, deciding moment t 1 at every seed):

| Seed | Tiles | White face | Brightest | Lower quartile | Spread |
|---|---|---|---|---|---|
| 1 | 11 | 0.9927 | 0.9940 | 0.6236 | 0.3704 |
| 2 | 11 | 0.9914 | 0.9919 | 0.6239 | 0.3680 |
| 3 | 11 | 0.9924 | 0.9934 | 0.7195 | 0.2738 |

The spread is now 0.27 to 0.37, four to five times the floor (it was 0.137 to 0.215). Before (gate run on bdb3848,
read at t 2): brightest 0.9927 / 0.9921 / 0.9937, lower quartile 0.7841 / 0.8551 / 0.7788.

### Frost (after the backlit-glass review: half-lit tiles look like windows onto a round spotlight)

Frames at t 1 and t 2 with the pointer at rest, and t 2 with the pointer at (0.1, 0.2), where the swell sits between
four tiles and half-lights each.

| frost | What the frames show |
|---|---|
| 0.045 (half a tile) | Half-lit tiles show a hard, curved bright region with a crescent edge inside the tile: a spotlight seen through a window. Misses |
| 0.07 | Softer; a darker band still crosses the half-lit tiles' far side |
| **0.094 (one tile)** | Lit tiles fill almost evenly, white toward the light and pale away from it, like a lit panel. No ghost: tiles next to a lit one show no tap spots or copies of the light. Meets the target |

Pick: 0.094.

Limit (engine, 2026-11-14): frost much wider than the light's radius shows the 9 frost taps as ghosts. Keep frost
under the swell's radius (0.1 ss). 0.094 is one tile here because these tiles are 0.094 wide; it sits just under the
radius. The wash's radius (0.32) and the fill's (0.6) are far wider than the frost, so they add no ghost. If the swell's radius ever drops
below 0.094, lower the frost with it.

## Pointer test (`gate.test.ts`, "the pointer moves the light toward it")

The test holds the pointer at (0.3, 0.3) at t 2 (seed 1, 960 x 600, dpr 1). It reads each light behind on its own
(the other at level 0) and then both together. It logs two numbers for each:

- **diff:** the mean 8-bit RGB change over the cluster's box (x 300..660, y 100..460). The box is 22.5% of the frame,
  and its ground does not change, so the number is diluted about four times against the tiles alone.
- **lean:** how far, in px, the light's centroid moves toward the top left. The centroid is the luma the lights
  behind add over the frame with both at level 0. For the engine's (1 - r^2)^2 falloff it moves with the glow
  whatever tiles mask it. A first design compared the box's upper-left half with its lower-right half; it read the
  swell as leaning the wrong way (-4.5), because the swell moved within one half from a gap onto a tile.

Measured (2026-11-15):

| Light | diff | lean (px) | Floor: diff / lean |
|---|---|---|---|
| Swell alone | 2.85 | 18.87 | 1.4 / 9.4 |
| Wash alone | 1.027 | 3.287 | 0.51 / 1.6 |
| Both | 0.828 | 1.453 | 0.41 / 0.72 |

The floor's rule: half of each reading, rounded down to two figures. A light that does not follow reads exactly 0 on
both numbers, and a light that follows the wrong way reads a negative lean, so half the reading leaves room for
small engine drift while every fault stays far below it. The old single floor (diff over 1, both lights) would now
fail the real page (0.828), since the brighter wash lifts the frame at rest.

Planted faults, each run once in a temporary copy of the page and then reverted (all three fail):

| Fault | Readings | Fails on |
|---|---|---|
| Swell follow sign flipped | swell diff 3.903, lean -11.995; both lean +4.083 | swell lean -11.995, under 9.4 |
| Both follows flipped | swell lean -11.995, wash lean -3.494, both lean -1.868 | swell lean (and the wash and both leans) |
| Swell follow lost, wash keeps it | swell diff 0, lean 0; both diff 0.724, lean 1.848 | swell diff 0, under 1.4 |

The swell-flip fault still reads a positive lean for both lights together, so only the per-light readings catch it.

The test opens the page in the light scheme. After the light ground moved to slate (same day, after the faults
above), it read swell diff 3.091, lean 19.151; wash diff 1.102, lean 3.283; both diff 0.91, lean 1.439. The floors
were kept: each reading is still at least about twice its floor (both lean 1.439 against 0.72).

After the deeper dims (gate.test.ts run of 2026-11-15): swell diff 2.833, lean 23.655; wash diff 3.575, lean 15.976;
both diff 2.759, lean 8.542. The steeper wash moves more of its light with the pointer, so the wash and both
readings rose five to twelve times. The floors were kept: the lowest margin is the swell's diff, 2.833 against 1.4
(about twice). Raising the floors by the rule would make the test stricter; that is left for the next review.

## Break pass (ui-suite:break-ui, 2026-11-14 and 2026-11-15)

The page has no data; its worst cases are the viewport, the seed and the pointer.

| # | Case | What broke | Fix |
|---|---|---|---|
| 1 | Portrait phone, 390 x 844 | The swell's path was in page fractions, so its y swing (0.18 of 844 px = 0.39 ss) left the cluster: no tile blew out at t 2 | The path is now in short-side units about the cluster's centre (`fromCluster`). After: a tile blows out at t 2 and t 5 |
| 2 | Wide window, 1600 x 500, pointer at (0.95, 0.1) | The wash's follow 0.5 moved it 0.72 ss right: every tile went dead grey, so the pointer switched the light off | Wash follow 0.2 (the reference's parallax). After, at wash 1.0 and radius 0.6: the right side is near white, and the far-left tiles go a dim grey-lilac but stay lit. Fragile on very wide windows |
| 3 | Portrait phone, 393 x 852, pointer held at (0.5, 0.95), t 1 to 12 | The follow, in page fractions, moved both lights 0.195 ss down: at t 1 to 4 no tile blew out (brightest tile centre 0.946, the wash alone) | Follow x min(1, width / height). After: a tile reads 0.96 or more at every t from 1 to 12, and every frame matches the 960 x 600 run with the pointer at the bottom (median 0.865 against 0.864 at t 1, 0.927 against 0.926 at t 8) |
| 4 | Turning the page: open at 960 x 600, resize to 393 x 852, then 20 resizes back and forth with no waits | Nothing. The follows go from 0.2 to 0.0923 on the turn. The turned frame and the frame after the 20 turns match a page opened portrait exactly (mean diff 0.000000). The shader compiled once, with 0 errors and 0 running animations | None needed |
| 5 | Wide window, 1600 x 500, pointer at (0.95, 0.1), after the deeper dims (steep wash, radius 0.32) | Row 2 came back: the follow, in page fractions of a 3.2 : 1 width, moved the lights 0.29 ss right, off the steep wash's reach. At t 2 and t 5 no tile blew out (brightest 0.93 and 0.735, white face 0.87 and 0.68) | Follow x min(1, 1.6 / (width / height)) on canvases wider than 16:10 (`followAspect`). After: brightest 0.989, 0.989 and 0.995 at t 2, 5, 9; the far side falls to 0.23, as dims do. The 960 x 600 frame is byte-identical (max diff 0) |

Held up: a 320 x 240 window (the cluster fits under the name), seeds 2 and 3 (two different outer cells dropped
each), and the light scheme on a phone. After the deeper dims, row 3 still holds: on the 393 x 852 phone with the
pointer held at the bottom, the brightest tile reads 0.992 or more at every t from 1 to 12 (dimmest 0.26 to 0.37).

## Frames read next to the reference

Final round (2026-11-15): wash level 1.0, radius 0.6, follow 0.2, frost 0.094, the cool palette. Reference 0060,
0150 and 0270 beside the bar before (the rebuild) and after, at t 2, 5 and 9 (seed 1, dark, pointer at rest). Then
the pointer at (0.1, 0.2) and (0.9, 0.8) at t 2, the light scheme at t 5, seeds 2 and 3, and a phone in the light
scheme. Deeper-dims round (same day): reference, before and after at t 2, 5 and 9 in each scheme.

- **Matches:** the tiles hold still and glow from inside, cut at their rounded edges, and the ground stays dark and
  unlit. Most tiles now read near white with an ice-blue or lilac tint, as the reference's do; the swell's tile is
  the purest white and moves from tile to tile. A blown tile carries a gradient, white toward the light. The pointer
  steers: at (0.1, 0.2) the top-left tiles go white and the far corner dims; at (0.9, 0.8) the light leans to the
  lower right.
- **Deeper dims:** a few tiles now blow to white and the tiles the light misses fall to a dim steel blue, 0.30 to
  0.41 at most moments, so the white tiles pop as in 0270. Which tiles are dim changes as the wash drifts: some
  moments have nearly every tile lit (as 0150), others four dim (as 0270).
- **Does not match:** the reference has god rays on the black ground and red / blue fringes on the tile edges (out
  of scope: lens effects). Its dim tiles are a more saturated blue and teal (the scene's colour boost); ours are a
  greyer steel blue, since the glow's colour is the accent token's, at most chroma 0.14. Its tiles are a little larger (0.105 ss at the centre against 0.094), and
  pure black surrounds them; ours sit on a near-black blue with the finish's grain.
- **Light scheme:** on the old cream the pale ice and lilac tiles sat at the paper's own lightness, and the render
  check failed (see the palette table). On the slate ground (0.84) the tiles read as lit glass above the paper, and
  the blown tile as white. After the deeper dims the slate ground stays (the render check reads a luminance std of
  0.0432, up from 0.0317). The dim tiles (about 0.30) now sit well under the paper (0.793), so in the light scheme they
  read as dark, smoked glass on pale slate rather than as faint light: lit tiles are lights, unlit ones are dark
  panels. A look-review question; the reference has only a dark scheme.

## What is copied and what is not

- **Copied (the feel and the mechanism):** frosted tiles lit from behind, with the light inside them and the ground
  unlit; the tiles hold still and the light behind them drifts, so single tiles swell to white and fade over about
  1.2 s; the pointer steers the light through a lagged pointer (25% of the way per frame) by 20% of its offset (the
  reference's camera parallax); about 11 tiles across about 0.46 ss, largest at the centre; a few white tiles and
  dim ones down to nearly dark, with a cool tint.
- **Not copied:** the reference's stepped layout (ours is a seeded checkerboard), its exact colours (ours are the
  page's tokens), its raymarched noise volume (here three engine glows behind the sheet), and the scene's post passes:
  chromatic aberration, god rays, vignette, the colour boost, the load mosaic and the fake tracking boxes. The rays
  and fringes are lens effects, outside Phase 1 (the owner, Task 19 look review); the load mosaic is the one part the
  study found could flash.

## Flash (check 9)

`bar.json` `flash.pointer` replays the study's fast sweep, the fastest pointer motion it measured: its five points
(0.30, 0.30), (0.65, 0.25), (0.40, 0.55), (0.70, 0.65), (0.50, 0.45), 150 ms per leg, run twice from 0.2 s (9
legs to 1.55 s), so a whole 1 s span holds sweeping. The centre tile is about 4% of the flash window (341 x 256 px;
56 px square at 960 x 600). A swell that blows out two tiles stays under 10%, well under the 25% rule, and both
lights move by only 20% of the pointer's offset. After the deeper dims the swing on a tile is larger (a dim tile can
rise from about 0.3 to 1.0), but the wash drifts slowly (periods 7 and 11 s) and moves by only 20% of the pointer's
offset, so the check still reads 0 general and 0 red flashes (gate run of 2026-11-15).

## Texture travels with the surface

The tiles never move: nothing in the tile field reads time. Only the lights behind them move. The frost etch is
read at the rest position, so it stays on its tile.

## White rule (the tile law's white face, measured at 767d52d)

The law (relight transmit (d1)) wants some tile's white face at or over 252/255 = 0.98824. The bar's page reads 0.9925 /
0.9934 / 0.9936 at t 1 (the deciding moment) for seeds 1 / 2 / 3: margins 0.0043 / 0.0052 / 0.0054, which is 1.1 /
1.3 / 1.4 levels of 255. Under the 2-level target (0.0078).

Sweep 1, the swell's level (page default 6; all else fixed). Worst white face over seeds and t 1-3:
- level 6: 0.9918 (seed 2, t 2)
- level 7: 0.9921
- level 8: 0.9922
- level 10: 0.9923
- level 14: 0.9923 (seed 1 whitest 0.9929)

The swell cannot buy the margin: the tile is already fully blown (the face is the shoulder's ceiling minus the grain's
clipped half), and the level moves it by 0.0005 across a 2.3x range. Whiteness here is limited by the finish grain, not
by the light.

Sweep 2, the page's finish grain (`finish: { grain }`, default 0.04), seed 1 t 1 white face (worst over all seeds
and moments in brackets), and the banding-grain check's dark-frame grain std (limit 0.005 to 0.016; 0.00928 at the
default, scaling with the grain):
- 0.040 (default): 0.9925 (0.9918); dark std 0.00928
- 0.030: 0.9943 (0.9937)
- 0.025: 0.9949 (0.9949): 1.7 levels at seed 1 t 1; dark std about 0.0058
- 0.020: 0.9961 (0.9955): about 2.0 levels; dark std about 0.0046, under the floor
- 0.018: 0.9965 (0.9960): 2.1 levels; gate run: banding-grain FAILS at all seeds, dark high-pass std 0.00431 under 0.005
- 0.015: 0.9969 (0.9966)

The two laws leave no overlap: 2 levels of white margin needs a grain of about 0.020 or less, and the banding-grain
check needs about 0.0216 or more (dark frame). Neither knob in the page can close the gap, and a check was not
changed. No page change was committed. The page stays at its tested state; the white margin is 1.1 to 1.4 levels.

## Look review (Task 19, 2026-11-15)

First look: rebuild as backlit frosted glass. The owner: "Yes, backlit glass (Recommended)"; rays and colour fringes are lens effects, out of scope. Second look: "Close: deeper dim tiles (Recommended)". Third look, after the deeper-dims round, with a blown tile and a dim corner tile ringed: **keep**. The owner: "Keep (Recommended)". Open notes, not fixes: dim tiles are a greyer steel blue than the reference's saturated blue; in the light scheme the dim tiles read as smoked panels on the slate ground. Frame time, measured in the Browser pane on the owner's Mac with the pane on screen (requestAnimationFrame cadence over 4 s, dpr 2, 939x959): 240 frames, median 16.7 ms, 95th percentile 17.6 ms, worst 17.7 ms, none over 20 ms (60 fps).

## Phase 2 dark readings (Task 1, 2026-11-16)

Measured before any change with `scripts/measure.mjs` (commit 539073c), seeds 1 / 2 / 3.

- `detail` rise, against `detail.minRise` 0.012: light 0.02729 / 0.02713 / 0.02553; dark 0.006939 / 0.006626 / 0.006069. Dark fails at every seed: the detail dial barely changes the dark picture.
- `relight` (transmit law) reported no dark failure.
- Cause to fix in Task 4: the detail dial barely changes the picture in dark.

## Phase 2 dark fix (Task 4, 2026-11-16)

Status: settled. The owner set `etch` to 0.45 by eye at the Task 5 look review (see "Look review (Task 5)" below);
`GLIMMER.etch` is 0.45, "Source: the owner, by eye". At 0.15, the engine default this bar kept until then, it drew exactly
the pixels it drew before Task 4 (pixel digests at seed 1, t 2, detail 0.6 and 1, light and dark, matched).

**Cause.** The only part of the detail dial that reaches this page is the glass's transmit etch: up to 15% of the
light passed, pixel to pixel, at detail 1. The other two parts of the glass's etch do nothing here. The micro relief
in the normal needs a front light, and this bar has none by design. The body unevenness sits under `ambient` 0.1 and
moves a pixel by under 0.01 linear. The finish's shoulder flattens the transmit etch on the blown tiles, so it shows
only on the dim and mid tiles as a faint mottle. In absolute terms the dial adds the same fine energy in both schemes
(about 4 to 5 units at seed 1, t 2). In dark, though, the tile outlines on a near-black ground make the detail-0 fine
energy about 819, against about 174 in light. The same etch is a relative rise of 0.0069 in dark and 0.027 in light.

**Change.** The engine's glass now takes `etch` (0..1, default 0.15; `REFERENCE.md`, `materials.glass`). The bar
passes `GLIMMER.etch`, set to 0.15. A front key light was rejected: it reverses "No key light", its diffuse lifts the
dims that "Deeper dims" darkened, and it brings in the relief law. A higher `ambient` was rejected for the same dims.

**Review control (removed).** For the Task 5 look review only, `?review=1` showed a slider that set `etch` from 0.15
to 0.45 in steps of 0.01, live. It and its CSS were removed once the owner picked a value.

**Readings, not a pick.** These are the `detail` relative rise at seeds 1 / 2 / 3, read through the slider as the
check reads it (t 2, text hidden, ink off). Detail 0 is the same at every etch, and the shares rise strictly at every
value.

Re-read in Phase 2 Task 2c (2026-11-16), when the check began reading its shares with the finish grain off (the
grain does not depend on the dial and set the share's baseline) and `detail.minRise` was re-derived with this bar
left out of the kept side while its etch is open: 0.042, then 0.020 in fix round 1 (half glass.html's light rise,
0.04169, once the test pages whose tests assert detail passes joined the honest side). Every reading moved up; the
order of the rows did not.

| etch | Light rise | Dark rise | By eye at detail 1 (sheet crops, seed 1) |
|---|---|---|---|
| 0.15 (before Task 5) | 0.09032 / 0.09539 / 0.08086 | 0.00734 / 0.00704 / 0.00639 | A faint mottle on the dim tiles only |
| 0.225 | 0.20385 / 0.21595 / 0.18360 | 0.01607 / 0.01587 / 0.01424 | Not rendered as a sheet |
| 0.30 | 0.34366 / 0.36460 / 0.31169 | 0.02710 / 0.02669 / 0.02413 | A clear fine frost grain on the dim and mid tiles; blown tiles stay white |
| 0.45 (the owner, Task 5) | 0.78520 / 0.83457 / 0.72492 | 0.06215 / 0.06173 / 0.05640 | A coarse, sandblasted grain on every tile not fully blown |

Before Task 2c (grain on, against the then `detail.minRise` 0.012), the same rows read: 0.15, light 0.02729 /
0.02713 / 0.02553, dark 0.00694 / 0.00663 / 0.00607; 0.225, light 0.06169 / 0.06196 / 0.05823, dark 0.01520 /
0.01499 / 0.01362; 0.30, light 0.10388 / 0.10474 / 0.09883, dark 0.02547 / 0.02527 / 0.02290; 0.45, light 0.23728 /
0.24038 / 0.22980, dark 0.05848 / 0.05838 / 0.05346.

The rise grows about with the square of `etch`. The bar's own detail is 0.6, so on the live page the etch moves the
light by at most 0.6 x `etch`. The 0.15 row matches the gate's own `detail` reading at seeds 1 to 3 (Task 2c survey).

## Look review (Phase 2 Task 5, 2026-11-16)

Read live in the browser pane at a build of 1b7db11, with `?review=1`. Before the owner moved the slider, the driver told
them that the first Chunk A driver had once named where the dark `detail` check passes, that they should ignore it, and
that their eye decides; no value was named as a target. The slider opened at 0.15 (its lowest stop).

- Etch, dark: the owner moved the slider by eye to 0.45, the slider's top stop.
- Etch, light: shown at the same 0.45 and asked whether to keep it, widen the slider, or set another value. The owner:
  "0.45 in both".
- Verdict, both schemes: **keep**. The owner: "Keep (Recommended)".

`GLIMMER.etch` is now 0.45 and the review slider is removed.

Gate after the pick (`node dist/src/cli/paint-kit.js gate bars/06-glimmer`, build of df6783e plus this change):
`passed`, all nine checks at seeds 1, 2 and 3. `detail` at seed 1: light rise 0.7852, dark rise 0.0622 (minimum
0.02); dark shares 0.0505 / 0.0512 / 0.0536 at detail 0 / 0.5 / 1, finish grain off.
