# 05 Pool light: study

Reference: Pool importing screenshots, shelf key `60fps.design/shots/pool-importing-screenshots-animation` (not
`pool.day`). The reference is a video clip (19.5 s, a phone render), so this study reads its frames only: the shelf's
report and its still sheets under `<private reference shelf>`:
`clip-overview.jpg` (2 fps), `crop-4-19s-1fps.jpg` (the card's climb, 1 fps), `card-10-11.6s-10fps.jpg` (the card's
ripple close up, 10 fps). No shader or colour is taken from it; paint-kit draws the pool from its own water field, and
every colour comes from the page's tokens.

## Mechanism

The whole import screen is one pool of water seen from above, and the screenshot card lies under its surface. One
moving refraction bends both the floor's caustic light lines and the card, so the card's outline ripples frame to
frame and the light lines play across its face (shelf report, "mechanism" and "missed").

## Beats (Source: frames, shelf report)

- 0.0 to 1.8 s: a white permission sheet over dimmed water, then the sheet goes and the water brightens. The line
  "Importing your screenshots..." is in by 1.6 s, white serif, two lines, centred near the top.
- 2.2 s: a dark sliver of the card shows at the bottom edge.
- 3 to 19 s: the card rises up the screen slowly and steadily. Its outline ripples, the whole card rocks between a
  left and a right tilt, and soft light streaks cross its white area.
- 18 s: the first card is about half way up; a second, different screenshot starts to rise at the bottom (a queue).
- A rubber duck floats down the left edge from 4 s to 17 s, the opposite way (a progress marker, inferred).

## What is asked of the visitor

Nothing. The animation runs by itself while the import works.

## Numbers read off the frames (Source: frames)

Measured on `crop-4-19s-1fps.jpg`: the phone's screen is about 290 px wide and 620 px tall in that sheet.

| What | Reading | In this bar's units |
|---|---|---|
| Card's top edge, 4 s to 18 s | 565 px to 205 px from the screen top, at a near-even step each second (565, 545, 513, 485, 462, 438, 415, 383, 355, 327, 305, 275, 253, 230, 205) | 25.7 px/s = 0.041 screen heights/s = 0.089 short sides/s |
| Card enters | its top crosses the bottom edge at 2.2 s (shelf report) | the climb starts at 2.2 s |
| Card width | about 170 px at 4 s, 175 px at 18 s | 0.59 short sides; it grows by about 3%, so its depth hardly changes |
| Card shape | a full phone screenshot: dark frame, white content panel in the upper part, dark lower part with light text lines | height 2.17 x width (852 / 393, a phone screen) |
| Card tilt | the top edge leans about 4 to 6 degrees, one way then the other, over several seconds | rocking, about +-5 degrees |
| Outline ripple | the card's edges bend by 5 to 10 px on a card about 250 px wide in the 10 fps close-up | 2 to 4% of the card's width |
| Caustic net | thin bright lines around darker cells; cells about a sixth of the screen width across in the lower water | 5 to 7 cells per short side |
| Light on the card | broad, soft streaks across the white panel, wider than the floor's lines (10 fps close-up) | soft, not a sharp net |
| Floor | a saturated mid blue, with large soft darker shapes about a third of the screen across, still under the moving lines | a mid accent tone |
| Heading | white serif, about 7% of the screen width per letter height, two lines, top 10% of the screen | large text |

## What this bar takes, and what it leaves

Takes: the pool over the whole page (`fields.water`, `materials.water`, `lights.throughWater`); the card as the
field's lifted layer (`layer`, fix round 2), a picture of its own under the water, entering at the bottom edge at
2.2 s and climbing at 0.089 short sides/s through the layer's `shift`; the card coming up off the floor as it climbs
(the layer's `rise`), so it is seen at its own, shallower depth: its outline wobbles less than the floor's lines bend,
and the lines on its face go soft, as streaks, as the close-up shows; the heading at the top.

Leaves, with the reason:

- The rocking tilt. The layer's `shift` is a translation only; a turn is an engine change (a per-frame rotation of
  the layer's picture). Not one of the plan's beats.
- The large still darker shapes on the floor. The floor is one even tone and the caustic net is its texture. Since
  fix round 2 the card is its own layer and the floor no longer moves, so these shapes could now go in the floor
  picture without travelling with the card; not done, as the round kept the bar's look apart from the card.
- The queue (a second card at 18 s): the layer's picture holds one card at a time, drawn inside the page's own area.
  The bar loops one card: it leaves at the top, and the next climb starts at the bottom.
- The permission sheet and the duck: page UI and a sprite, not the pool's light.
