# Smoke record: holo sticker on a notebook

## 1. Bar picked, and why

Bar `10-foil-card`. Its INDEX line names this exact case:

> `10-foil-card` | Holographic foil on a card or sticker (the nearest bar for a holo sticker): a sunburst grating
> window (`materials.foil`) on a raised paper card on a paper page, under one key light that casts.

A holo sticker is a foil surface on a raised, thin paper-backed piece lying on paper, under a light that moves. That
is bar 10's mechanism: paper page, raised paper face, foil slot, one key that casts, a pointer that tilts and turns
the key. I copied its paint call and changed the content (round die-cut sticker, ruled notebook page, concentric
grooves, star line art, its own palette and words). No other bar has foil.

Surface and laws (AGENTS.md step 1): a thin round holo sticker (paper border round a foil disc) on a ruled paper
notebook page, under one directional key from the upper left plus ambient. Laws: relief, shadow, iridescence.

## 2. Where the docs were unclear, wrong or missing a name

1. **Copy versus build for a changed groove pattern.** AGENTS.md section 2: "Adding a field, a light or a shape to
   the copied paint call is still a copy, as long as the bar's lights and materials stay". It does not say whether
   replacing the bar's own shape (card to circle) and its groove pattern (sunburst to concentric rings) inside the one
   `fields.shape` is still a copy. I treated it as a copy, since lights and materials are unchanged, and listed every
   change in notes.md.
2. **The iridescence law's (d) misreads mirror-symmetric grooves.** REFERENCE.md: "(d) the two largest groups whose
   grooves run at least 30 degrees apart ... differ by more than `relight.iridescenceApart`". The grating colour
   depends on u = |X.(l + v)|, so two groove angles mirrored about the key's heading get the same u and the same
   colour by physics. At seed 3 the two largest groups (15 and 85 degrees) sit mirrored about the key's heading
   (about 140 degrees for X, so 50 degrees for grooves): |cos(105 - 140.2)| = 0.817 and |cos(175 - 140.2)| = 0.821.
   The gate prints "its colour ignores the groove direction", which is the wrong diagnosis for this page. The docs
   name no route for a check that misreads a correct page: changing the seed or the pattern would be choosing after a
   result, and editing the check is forbidden. I changed nothing and report it.
3. **The shadow law's area floor is not in REFERENCE.md.** The gate says "its height shades 0.17% and 0.19% of the
   frame, under 0.004", but REFERENCE.md's `ShadowOptions` and `Law` sections give no minimum shadow area. So a
   builder cannot know, before the run, that a small thin sticker (lift 0.008 ss, radius 0.17 ss) will read partial.
   AGENTS.md says "If a law check cannot read the page ... stop and tell the person what is missing": done here. The
   lift was a builder value set before any run, so I did not raise it.
4. **No name for the canvas aspect in a shape.** REFERENCE.md gives `uRes` ("the sheet's size in device pixels") and
   `q` in short-side units, but not the page edge in `q`. I derived the left edge as `-0.5 * uRes.x / min(uRes.x,
   uRes.y)`, assuming the sheet keeps the canvas's aspect (`sheetScale` default 1).
5. **`data-ui-paint-text` is not documented.** Bar 10 puts it on every word, and its notes say it is "the project
   policy's mark for text over the canvas", but neither AGENTS.md nor REFERENCE.md names it. I copied it.
6. **Accent order when an accent is lighter than the ground.** REFERENCE.md: "stops 1 to 3 the accents by
   lightness". It does not say in which direction. Bar 10's notes settle it ("from the ground toward the ink"), so my
   `--sticker` accent is the one nearest the ground in each scheme and sits at tone 0.25.
7. **`window.__card` and the type scale.** Bar 10 sets `window.__card` and steps type along "the project's
   `ui-policy.json`". Neither is in the docs. I dropped `__card` (only bar 10's own test reads it) and kept the type
   scale list as copied.

## 3. Final gate output (verbatim)

```
pass    render: passes at seeds 1, 2, 3; at seed 1: luminance std 0.1201, 0 errors; alive half skipped, the page rests: The sticker lies still on a still notebook page: nothing moves without the pointer, and foil colour never moves with the clock (bar 10's reason, copied)
pass    palette: passes at seeds 1, 2, 3; at seed 1: 100.0% of the frame moved by OKLab 0.02 or more when every token was swapped (ground, ink and 3 accents; needs 49.3%), 0 palette reads and 0 custom lights in page code, 0 colour literals
pass    banding-grain: passes at seeds 1, 2, 3; at seed 1: light run 3 px, grain std 0.01136; dark run 4 px, grain std 0.01051 (run limit 6, grain range 0.004 to 0.018; grain read as the frame at finish grain 0.04 minus the frame at 0)
pass    still: passes at seeds 1, 2, 3; at seed 1: reduced-motion frames 2 s apart differ by 0.000000 (no settle time: it rests on its first frame); 0 frames drawn in 1 s hidden (6 in 300 ms visible)
pass    hygiene: passes at seeds 1, 2, 3; at seed 1: pixel ratio 1.5 at device ratio 3, ground gap 0/255 in fallback, test seam unset
FAIL    relight: fails at seed 3 of 1, 2, 3; at seed 3: light: relief pass (moving key 0 changes the frame by 0.0313 of its brightness (raw change 0.02766), sheet height range 0.00800); shadow PARTIAL (nothing on the sheet blocks the light at either test position (its height shades 0.17% and 0.19% of the frame, under 0.004), so there is no shadow to judge; the light's shadow darkens 0.16% of the frame by more than 0.402); iridescence FAIL ((d) the two largest foil groups whose grooves run 70.0 degrees apart (15 and 85) differ 0.0057 in OKLab chroma, at or under 0.017: its colour ignores the groove direction); dark: relief pass (moving key 0 changes the frame by 0.0896 of its brightness (raw change 0.01488), sheet height range 0.00800); shadow PARTIAL (nothing on the sheet blocks the light at either test position (its height shades 0.17% and 0.19% of the frame, under 0.004), so there is no shadow to judge; the light's shadow darkens 0.16% of the frame by more than 0.402); iridescence FAIL ((d) the two largest foil groups whose grooves run 70.0 degrees apart (15 and 85) differ 0.0061 in OKLab chroma, at or under 0.017: its colour ignores the groove direction)
pass    detail: passes at seeds 1, 2, 3; at seed 1: light: high-frequency share (finish grain and screen off) 0.0367 / 0.0613 / 0.1349 at detail 0 / 0.5 / 1, relative rise 2.6739 (minimum 0.02); at detail 0 relight: relief pass (moving key 0 changes the frame by 0.0140 of its brightness (raw change 0.01238), sheet height range 0.00800); shadow PARTIAL (nothing on the sheet blocks the light at either test position (its height shades 0.17% and 0.19% of the frame, under 0.004), so there is no shadow to judge; the light's shadow darkens 0.16% of the frame by more than 0.402); iridescence pass (moving key 0 moves the foil's colour 0.1119 per point, tilting it 0.0732, time 0.0000; (e) not read: no groove spans 0.02 in u; one groove's halves differ at most 0.0001, two grooves 75.0 degrees apart 0.0757); dark: high-frequency share (finish grain and screen off) 0.0147 / 0.0186 / 0.0306 at detail 0 / 0.5 / 1, relative rise 1.0797 (minimum 0.02); at detail 0 relight: relief pass (moving key 0 changes the frame by 0.0641 of its brightness (raw change 0.01069), sheet height range 0.00800); shadow PARTIAL (nothing on the sheet blocks the light at either test position (its height shades 0.17% and 0.19% of the frame, under 0.004), so there is no shadow to judge; the light's shadow darkens 0.16% of the frame by more than 0.402); iridescence pass (moving key 0 moves the foil's colour 0.1158 per point, tilting it 0.0765, time 0.0000; (e) not read: no groove spans 0.02 in u; one groove's halves differ at most 0.0000, two grooves 75.0 degrees apart 0.0807)
pass    text-contrast: passes at seeds 1, 2, 3; at seed 1: light: range 0.2041 over the paint (0.995 of the frame; whole frame 0.2031), always p "Field notes" (ink) 8.56, always p "Nov 18" (ink) 7.08, always p "Low tide at six, then ra" (ink) 7.15, always p "The sticker came with th" (ink) 7.29; dark: range 0.1611 over the paint (0.995 of the frame; whole frame 0.1611), always p "Field notes" (ink) 10.31, always p "Nov 18" (ink) 8.99, always p "Low tide at six, then ra" (ink) 8.86, always p "The sticker came with th" (ink) 9.03
pass    flash: passes at seeds 1, 2, 3; at seed 1: 0 general and 0 red flashes per s over more than 25% of a 341 x 256 CSS px window; largest share flashing over 3 per s: 0% general, 0% red; 181 frames stepped frozen, 0 to 3.00 s at 60 fps; pointer path: 3 legs, 0.00 to 2.00 s
failed: 1
```

The first run gave the same lines. The only change between the two runs was a layout fix that leaves the 960 x 600
view unchanged.

## 4. What the sheet shows

`sheet.png`: 36 cells (seeds 1 to 3, light and dark, detail 0 / 0.5 / 1, key A and key B).

- **Page:** a cream ruled page in light and a navy ruled page in dark, with faint rules, a margin line, and the
  words on the rules at the upper left. Paper fibre appears at detail 0.5 and is strong at 1. At detail 0 the page is
  plain. That is correct.
- **Foil:** the disc shows a two-lobed rainbow (yellow, green and blue bands on dark silver), like a CD. From key A to
  key B the bands rotate round the disc, so the light is not painted on. The printed star and edge ring stay readable
  over it. At detail 1 the foil gets fine sparkle grain.
- **Seeds:** they differ only a little (star rotation and band centre). The page content is the same at every seed.
- **What looks wrong:**
  - The sticker barely reads as raised. Its shadow is a thin dark sliver at the lower right, much weaker than bar
    10's card shadow in bar 10's sheet (rendered to a scratch path to compare). This matches the shadow PARTIAL line.
  - The punched holes almost vanish. The unlit ground is near the paper's own colour, so they show as faint arcs at
    the left edge.
  - In the sheet's small cells (about 390 px wide), the second note line runs into the sticker's left edge, because
    the 12 px type floor keeps the words larger than the cell's scale. This is the same limit bar 10 records for its
    sheet. At 960 x 600 the column ends 0.05 ss before the sticker.
  - In dark mode the sticker's border is a dark slate, not a white rim. This follows from the tone rule (the border
    accent must be the stop nearest the ground), so it reads as a negative.

## 5. Changes to the copied page, and why

- I replaced the card shape with a round die-cut sticker (radius 0.17, border 0.022, lift 0.008, bevel 0.003, all
  builder). The person asked for a sticker.
- I replaced the sunburst grooves with concentric rings about a seeded centre: the common rainbow-ring holo look.
- I replaced the sun ring and waves line art with a foil edge ring and a 5-point star turned by the seed.
- I replaced the warped paper page with a ruled notebook page: rules (ink 0.28), a margin (ink 0.4) and punched
  holes (coverage 0). The person asked for a notebook.
- I replaced the card words with notebook words on the rules ("Field notes", "Nov 18", two note lines).
- I replaced the palette: a cream or navy page, a blue-black or cream ink, a sticker accent, and pink and teal
  accents. The bar's colours may not be copied.
- I removed `window.__card`, the `LOOK.job` switch (fixed at "both") and `gate.test.ts` / `study.md`, as AGENTS.md
  says.
- Break-ui pass (after the first gate, layout only): the margin, the holes and the words' column now start from the
  canvas's left edge. In fixed units, a portrait view put the column's left edge at about -22 px, off screen. At
  960 x 600 the positions are the same as before.
- Unchanged from bar 10: the key (dir, level 0.85, shadow soft 0.8), the ambient 0.15, the foil (spacing 1.5, orders
  2, roughness 0.3, pull 0.3 nearest, tone 0), the tilt (max 8, tau 0.1), the bias 0.12, detail 0.6, the flash path
  and the light-job code.
