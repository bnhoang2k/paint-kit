# Notes: holo sticker on a notebook

A copy of bar 10 (`10-foil-card`). Every number on the page, with its source or "builder" and why. Short-side
units (ss): 1 is the canvas's shorter side. Every builder value was chosen before the first gate run.

## What it copies, and what it adds

Copied from bar 10, unchanged: the paint call's lights (one casting key at `[-0.6, 0.5, 0.62]`, level 0.85, shadow
soft 0.8, ambient 0.15), the materials of slots 0 to 2 (paper page at tone 0, paper at tone 0.25, foil with spacing
1.5 um, orders 2, roughness 0.3, tone 0, pull 0.3 nearest), the sunburst groove pattern, the lift 0.012 and bevel
0.004, the pointer job "both" (tilt max 8 degrees, tau 0.1 s, BIAS 0.12), detail 0.6, the still page warp
(`PAGE`) and the flash pointer path.

Added (a copy may add fields, lights or shapes as long as the bar's lights and materials stay):

- A fourth material slot: `materials.paper({ tone: 0.75 })` for the notebook's margin line.
- In the shape field's page branch: faint ruled lines (picture ink) and the margin line (slot 3).

Changed content (not the mechanism): the card is now a landscape die-cut sticker with a white border and no art
window frame; the sun ring and waves are now a printed star outline; the card's paper text box is now a white
under-print band inside the foil (REFERENCE.md, `materials.foil`: "an opaque white under-print is another slot";
here it reuses slot 1). Words, palette and layout are new.

## Sticker (`STICKER`)

| Number | Value | Source | Why |
|---|---|---|---|
| half | 0.30 x 0.20 | builder | A landscape sticker, 360 x 240 px at 600 px. Its right edge plus bottom edge (the shadow side under the upper-left key) is 1.0 ss, close to bar 10's card (0.96 ss), so the shadow shades about as much as bar 10's (REFERENCE.md warns the shadow floor sits close to bar 10's card) |
| corner | 0.07 | builder | Die-cut stickers have round corners, rounder than a card's |
| lift, bevel | 0.012, 0.004 | bar 10 | Copied, per REFERENCE.md's advice to keep the bar's size and lift; a real vinyl sticker is thinner and would cast no shadow at this scale |
| border | 0.018 | builder | The white die-cut border, about 11 px |
| band | side 0.03, bottom 0.025, height 0.075 | builder | A white under-print band for the word, so the word sits on paper, not on moving colour (bar 10 keeps its words on paper for the same reason) |
| line | 0.004 | bar 10 | Printed line width |
| star | radius 0.07, inner ratio 0.45 | builder | The printed star outline round the burst's centre, in place of bar 10's sun ring |
| burst centre | seeded: x within +-0.125 of the sticker's centre, y within +-0.03 of the foil's middle above the band | builder, seed | The seed moves the burst, as bar 10; the star stays inside the foil |

## Notebook page (`RULE`, `MARGIN`)

| Number | Value | Source | Why |
|---|---|---|---|
| rule pitch | 0.045 ss | builder | 27 px at 600 px: a college-ruled look at this scale |
| rule top | 0.34 ss above centre | builder | Leaves a top margin for the note's title |
| rule width, ink | 0.0025 ss, 0.3 | builder | Faint lines: ink at 30% coverage in the ink token |
| margin | 0.16 ss from the canvas's left edge, 0.005 wide, slot 3 at tone 0.75 (`--margin`) | builder | A notebook's margin line, in the margin accent; tied to the left edge so it stays on screen at any aspect, and just left of the sticker on a square or portrait view |

## Palette (builder)

Light: page `oklch(0.9 0.025 85)` (cream paper), ink `oklch(0.3 0.06 260)` (navy), sticker `oklch(0.98 0.006 100)`
(white), rule `oklch(0.68 0.08 235)` (blue), margin `oklch(0.62 0.15 25)` (red). Dark: page `oklch(0.25 0.015 260)`,
ink `oklch(0.92 0.01 90)`, sticker `oklch(0.37 0.015 260)`, rule `oklch(0.62 0.08 235)`, margin
`oklch(0.66 0.13 25)`. The ramp sorts accents by lightness from the ground toward the ink, so in both schemes the
sticker is stop 1 (tone 0.25), rule stop 2 (0.5) and margin stop 3 (0.75): the margin is darker than the rule in light
and lighter in dark, so its slot's tone 0.75 is the margin colour in both.

## Words

"Tuesday, chemistry notes" (Georgia italic 18 px at 600 px) above the top ruled line, right of the margin; "Well
done" (bold uppercase sans 20 px) on the sticker's white band. Both printed into the sheet (`data-paint-ink`), sized
along bar 10's type scale with `--u`.

## Changes after a gate or sheet result

No look value changed after a result. Run 1 failed `palette` on two wording faults, fixed without touching a pixel:

- The word "white" in JS comments (the gate named `index.html:60`, "named colour white in CSS") counted as a colour
  literal. Every "white" in comments became "pale".
- `uniform vec4 uRule` (ruled-line numbers, not a colour) lacked `// not-colour: <reason>`; it now has one.

Run 2: `passed`. Sheet read by eye: see smoke-record.md.
