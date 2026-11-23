# Notes: holo sticker on a notebook

Copies bar 10 (`bars/10-foil-card`). Same paint call: three slots (paper page at tone 0, paper face at tone 0.25,
foil), one key that casts plus ambient, tilt driven by the pointer and the key turned toward the pointer. Same
foil options, key, ambient, shadow, tilt max and ease, bias and flash path. Every number below that is not copied is
"builder", chosen by intent before any gate run.

## Surface and laws

A thin round holographic sticker (a paper border round a foil disc) stuck on a ruled paper notebook page, under one
directional key light from the upper left and a little ambient. Laws: relief (the page warp and the sticker's raised
edge), shadow (the sticker stands off the page), iridescence (the foil).

## What was added or changed against bar 10

| Item | Value | Source | Why |
|---|---|---|---|
| Raised shape | circle, radius 0.17 ss, centre (0.28, 0.02) | builder | A round die-cut sticker; off centre so the notes sit left of it |
| Border | 0.022 ss | builder | The white paper rim die-cut stickers have round their foil |
| Lift | 0.008 ss | builder | A sticker lies flatter than bar 10's card (0.012), but a real 0.1 mm would cast nothing at this scale (bar 10's note) |
| Bevel | 0.003 ss | builder | Thinner stock, a slightly tighter round-over than bar 10's 0.004 |
| Groove pattern | concentric rings about a seeded point inside the inner half of the disc | builder | A rainbow-ring holo, the common sticker look; the seed moves the ring centre, so seeds differ by grooves |
| Line art | foil edge ring and a 5-point star (outer 0.07 ss, inner ratio 0.45), turned by the seed; line 0.004 ss | builder (star SDF: Inigo Quilez's sdStar5) | Printed art over the foil, as bar 10's sun ring |
| Rules | every 0.05 ss (30 px at 600), ink coverage 0.28, width 0.0025 ss, none above y 0.32 | builder | Faint ruled lines in the ink token; a header gap at the top as on a real page |
| Margin | x -0.6 ss, ink coverage 0.4 | builder | The notebook's margin line, in ink (no other colour is allowed) |
| Holes | x -0.71 ss, radius 0.017, every 0.12 ss, coverage 0 | builder | Punched holes: the page's ground shows, unlit |
| Words | "Field notes" 24 px, "Nov 18" 13 px, two lines at 16 px italic, each row sitting on a rule, from margin + 0.04 to x 0.06 ss | builder | Text on the paper page, not over the foil; sizes on bar 10's type scale |
| Palette | light: cream page, blue-black ink, near-white sticker, pink and teal accents; dark: navy page, cream ink, slate sticker | builder | Its own colours, not bar 10's |
| Removed | `window.__card`, the `look.job` switch (fixed at both) | builder | Bar 10's own gate.test.ts used `__card`; this page has no test file |

Layout fix (break-ui pass, made before the second gate run, no light or law value changed): the margin (0.2 ss), the
holes (0.09 ss) and the words' column start (margin + 0.04) are measured from the canvas's left edge, so a portrait
view keeps them on screen. At 960 x 600 they land where the first build put them (-0.6, -0.71, -0.56 ss). Limit: in a
portrait view the words' column is narrow and the longer note lines (no wrap) can run under the sticker. Not fixed.

## Gate findings not fixed (see smoke-record.md)

- Shadow law reads partial: the sticker's height shades 0.17% of the frame, under the check's 0.4%. The lift (0.008)
  was a builder value set before any run; raising it now would be choosing a look value after a check result, so it
  stays and the person decides.
- Iridescence (d) fails at seed 3: the two largest groove groups (15 and 85 degrees) lie mirror-symmetric about the
  key's heading, so the grating gives them the same u and the same colour. Neither the seed nor the pattern was
  changed to dodge it.
