# Smoke record: holo sticker on a notebook

Request: "A holo sticker on a notebook." Page: `test/smoke/holo-sticker/index.html`.

## 1. Bar picked, and why

Bar `10-foil-card`. The INDEX line I used:

> `10-foil-card` | Holographic foil on a card or sticker (the nearest bar for a holo sticker): a sunburst grating
> window (`materials.foil`) on a raised paper card on a paper page, under one key light that casts.

The surface is the same kind of thing: a raised, thin foil piece lying on paper under one key light. The bar
already solves the hard parts (a grating foil whose colour moves with the light and the tilt, a lift that casts a
shadow that clears the shadow floor, words kept off the moving colour). The notebook is only a different paper page.
So I copied it (AGENTS.md section 2, "Copy"), kept its paint call, and changed the content.

Laws (section 1): relief (the page warp and the sticker's edge), shadow (the raised sticker casts on the page),
iridescence (the foil). The same three as bar 10.

## 2. Where the docs were unclear, wrong or missing a name

1. **`vec4` uniforms need the not-colour note, too.** AGENTS.md says: "A GLSL `vec3` that is not a colour carries
   `// not-colour: <reason>` on its line." The palette check also flagged `uniform vec4 uRule;` ("declares a vec4
   uniform (a colour set from page code) without \"// not-colour: <reason>\""). What I did: added the note to the
   `vec4` line. The doc should say `vec3` and `vec4`.
2. **A colour word in a JS comment fails the palette check, and the gate calls it CSS.** AGENTS.md says "No hex,
   `rgb()`, `hsl()` or named colour in code." It does not say comments count. The gate flagged
   `index.html:60 named colour white in CSS`; line 60 is a JS comment inside the module script (`// the white die-cut
   border round the foil`). Also, only line 60 was flagged, though "white" appeared in other comments (lines 61, 138,
   140, 189 and the HTML comment). What I did: changed every "white" in comments to "pale". The doc should say that
   colour names in comments count, or the check should skip comments; the "in CSS" label is wrong for this line.
3. **Ramp order for an accent lighter than the ground is unclear.** REFERENCE.md: "the accents sorted by lightness
   from the ground's end toward the ink's, so stop 1 is the accent nearest the ground". My sticker accent is lighter
   than the page in the light scheme, so it is not "between" ground and ink. What I did: followed bar 10's notes
   (its card accent is also lighter than its ground and lands on stop 1, tone 0.25), and chose the other two accents
   so their order matches in both schemes. Not measured by me; the gate's palette swap passing is indirect evidence.
4. **`data-ui-paint-text` is not named in AGENTS.md or REFERENCE.md.** The bar's words carry it, and bar 10's
   notes call it "the project policy's mark for text over the canvas, whose contrast the gate's text-contrast check
   measures". The docs only name `data-paint-ink` and `text.always` / `text.lit`. What I did: kept it on both words as
   the bar does. I do not know whether the check needs it.
5. **Minor: the `palette` failure's summary says "1 palette reads"** for the vec4 uniform, while the cause was only a
   missing comment; the wording ("page code reads the palette itself") points the reader at the wrong fault.

## 3. Final gate output (run 2, verbatim)

```
pass    render: passes at seeds 1, 2, 3; at seed 1: luminance std 0.1567, 0 errors; alive half skipped, the page rests: The sticker lies still on a still notebook page: nothing moves without the pointer, and foil colour never moves with the clock (as bar 10)
pass    palette: passes at seeds 1, 2, 3; at seed 1: 98.5% of the frame moved by OKLab 0.02 or more when every token was swapped (ground, ink and 3 accents; needs 49.3%), 0 palette reads and 0 custom lights in page code, 0 colour literals
pass    banding-grain: passes at seeds 1, 2, 3; at seed 1: light run 3 px, grain std 0.01349; dark run 4 px, grain std 0.01063 (run limit 6, grain range 0.004 to 0.018; grain read as the frame at finish grain 0.04 minus the frame at 0)
pass    still: passes at seeds 1, 2, 3; at seed 1: reduced-motion frames 2 s apart differ by 0.000000 (no settle time: it rests on its first frame); 0 frames drawn in 1 s hidden (7 in 300 ms visible)
pass    hygiene: passes at seeds 1, 2, 3; at seed 1: pixel ratio 1.5 at device ratio 3, ground gap 0/255 in fallback, test seam unset
pass    relight: passes at seeds 1, 2, 3; at seed 1: light: relief pass (moving key 0 changes the frame by 0.0535 of its brightness (raw change 0.04261), sheet height range 0.01195); shadow pass (the shadow falls on the far side of the raised region (114.4 and 122.6 px) and moves 128.2 px against the light's move; it covers 0.43% and 0.40% of the frame, its deepest darkening 0.878); iridescence pass (moving key 0 moves the foil's colour 0.0985 per point, tilting it 0.0587, time 0.0000; (e) not read: no groove spans 0.02 in u; one groove's halves differ at most 0.0001, two grooves 40.0 degrees apart 0.1047); dark: relief pass (moving key 0 changes the frame by 0.1508 of its brightness (raw change 0.02670), sheet height range 0.01195); shadow pass (the shadow falls on the far side of the raised region (114.4 and 122.6 px) and moves 128.1 px against the light's move; it covers 0.43% and 0.40% of the frame, its deepest darkening 0.903); iridescence pass (moving key 0 moves the foil's colour 0.0979 per point, tilting it 0.0586, time 0.0000; (e) not read: no groove spans 0.02 in u; one groove's halves differ at most 0.0001, two grooves 40.0 degrees apart 0.1058)
pass    detail: passes at seeds 1, 2, 3; at seed 1: light: high-frequency share (finish grain and screen off) 0.0570 / 0.0716 / 0.1122 at detail 0 / 0.5 / 1, relative rise 0.9668 (minimum 0.02); at detail 0 relight: relief pass (moving key 0 changes the frame by 0.0315 of its brightness (raw change 0.02515), sheet height range 0.01195); shadow pass (the shadow falls on the far side of the raised region (115.0 and 122.5 px) and moves 127.1 px against the light's move; it covers 0.43% and 0.40% of the frame, its deepest darkening 0.864); iridescence pass (moving key 0 moves the foil's colour 0.0987 per point, tilting it 0.0591, time 0.0000; (e) not read: no groove spans 0.02 in u; one groove's halves differ at most 0.0001, two grooves 40.0 degrees apart 0.1047); dark: high-frequency share (finish grain and screen off) 0.0424 / 0.0453 / 0.0540 at detail 0 / 0.5 / 1, relative rise 0.2745 (minimum 0.02); at detail 0 relight: relief pass (moving key 0 changes the frame by 0.1264 of its brightness (raw change 0.02244), sheet height range 0.01195); shadow pass (the shadow falls on the far side of the raised region (115.0 and 122.6 px) and moves 127.3 px against the light's move; it covers 0.43% and 0.40% of the frame, its deepest darkening 0.894); iridescence pass (moving key 0 moves the foil's colour 0.0980 per point, tilting it 0.0590, time 0.0000; (e) not read: no groove spans 0.02 in u; one groove's halves differ at most 0.0001, two grooves 40.0 degrees apart 0.1058)
pass    text-contrast: passes at seeds 1, 2, 3; at seed 1: light: range 0.5811, always p "Well done" (ink) 9.85, always p "Tuesday, chemistry notes" (ink) 7.03; dark: range 0.2402, always p "Well done" (ink) 7.01, always p "Tuesday, chemistry notes" (ink) 8.92
pass    flash: passes at seeds 1, 2, 3; at seed 1: 0.5 general (window at 306, 154 CSS px, 1 s from 0.567 s) and 0 red flashes per s over more than 25% of a 341 x 256 CSS px window; largest share flashing over 3 per s: 0% general, 0% red; 181 frames stepped frozen, 0 to 3.00 s at 60 fps; pointer path: 3 legs, 0.00 to 2.00 s
passed
```

Run 1 (before the two wording fixes) ended `failed: 1` on the `palette` line only; every other line read the same.

Shadow note: the shadow covers 0.43% and 0.40% of the frame, just above the 0.4% floor REFERENCE.md names
(`relight.shadowNone`). It passes, but with little room, as bar 10 does.

## 4. What the sheet shows

`test/smoke/holo-sticker/sheet.png`, 36 cells (seeds 1 to 3, light and dark, detail 0 / 0.5 / 1, key A and B).

- Every cell reads as a notebook: faint ruled lines, a red margin line at the left, the italic title "Tuesday,
  chemistry notes" above the first rule, right of the margin. A landscape die-cut sticker sits in the middle.
- The sticker: a pale border, a foil face with a sunburst of rainbow bands (yellow, green, cyan, blue, a little
  violet) from a point inside a printed star outline, and a pale band at the bottom with "WELL DONE".
- Light moves the picture, not paint: from key A to key B the colour bands rotate round the burst, and the sticker's
  lit edge and shadow swing. No glow stays put.
- Seeds differ by where the burst and star sit (seed 2's burst is right of centre, seed 3's left).
- Detail: at 0 the paper is smooth; at 0.5 fibres show; at 1 the page shows strong diagonal fibre scratches and the
  foil gets a fine sparkle. The relief and shadow are there at detail 0.
- What looks wrong, or weak (for the owner's live look; I changed none of it):
  - **Dark scheme: the sticker reads as a dark grey slab, not a pale sticker.** The `--sticker` token is
    `oklch(0.37 ...)` on a 0.25 page, as bar 10 does for its card. A real holo sticker has a white border at night
    too. Making it light in dark mode would change the ramp order (it would sit near the ink), so it is a palette
    decision, not a fix.
  - **The foil body is a dark navy-grey** where no band falls (most of the face at key B). It reads as dark metal
    more than silver holo film. That is the foil's "dim metal" body (REFERENCE.md) in tone 0, as bar 10.
  - **Detail 1 fibres look scratchy** on the light page, heavier than notebook paper. Detail 0.6 is the page's
    setting, so the live page sits between the 0.5 and 1 cells.
  - The ruled lines run edge to edge with no gap at the margin, which matches real notebook paper.

## 5. Every change to the copied page, and why

From bar 10's `index.html`:

- **Content:** card became a landscape die-cut sticker (`STICKER.half` 0.30 x 0.20, `corner` 0.07, a pale
  `border` 0.018); the art window frame, sun ring and waves became a printed star outline round the burst centre;
  the card's paper text box became a pale under-print band inside the foil carrying "Well done"; the title band
  ("Low tide", "No. 04") became the note title on the page.
- **Added:** ruled lines (picture ink at 0.3) and a margin line (a fourth slot, `materials.paper({ tone: 0.75 })`)
  in the page branch of the shape field, to make the page a notebook. Allowed by section 2 as an added shape, with the
  bar's lights and materials kept.
- **Palette:** new tokens (`--sticker`, `--rule`, `--margin`) and new colours, as the copy rule requires.
- **Burst centre range:** moved to the foil above the band (the window moved).
- **Layout code:** places the band word and the note title; drops `window.__card` and the `look.job` switch (the job
  is fixed at bar 10's kept "both").
- **Kept unchanged:** key, ambient, shadow, foil options and pull, lift, bevel, line width, detail, page warp, tilt
  and pointer code, flash path, seeds, laws.
- **Dropped:** `study.md` and `gate.test.ts`, as section 2 says.
- **After run 1:** "white" in comments became "pale"; `uniform vec4 uRule` got a `// not-colour:` note. No look
  value changed after any result.

Also run (outside AGENTS.md, because a session hook asked for `ui-suite:break-ui`): a quick pointer-spam and fit
check in headless Chromium at 960x600, 320x568, 390x844 and 1440x900. 40 rapid pointer moves; 0 page errors; both
words inside their boxes and the view at every size; 0 running animations after 1.5 s; tilt eased from about 8
degrees back to 0 after a leave and a blur. No fault found, nothing changed.
