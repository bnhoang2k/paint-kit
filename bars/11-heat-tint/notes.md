# Notes: 11 Heat tint

Every number on the page, each with its source or "builder" and why. Read at the gate's 960 x 600 view, dpr 1.
Short-side units (ss): 1 is the canvas's shorter side (600 px here). Every builder value below was chosen before any
check reading, and none was changed after one.

**Status:** the bar passes its gate. Every gate.test.ts row passes after the film law's (b) fix (f8ce8df), with the
page unchanged since its first reading. Before that fix the law blocked this bar; "The iridescence law on this bar"
keeps that history.

## Gate

`paint-kit gate`: passed, all nine checks, at seeds 1 to 3 (run by the driver, 8 min 28 s). text-contrast does not
apply (the page has no text). Readings at seed 1, from the gate rows:

- relight: highlight pass; the specular highlight's centroid moves 71.9 px with the key (light scheme). Iridescence
  passes, with (e) read.
- detail: the high-frequency share rises 0.0350 from detail 0 to 1 (minimum 0.02).

## Copy or build

Build. No bar has a thin film, and no bar's shape fits: bar 10's card tilts (a tilt does not shift film hue) and its
key keeps one angle off the eye (film hue would not move). The page builds from `REFERENCE.md` and copies two
mechanisms: bar 10's pointer-as-light code (easing toward the pointer, set only after a pointer move), and
`test/pages/film-metal.html`'s steel film call and key. It does not copy that page's panel edge (its height steps at the
panel's ends, which makes rim marks): the bar's height falls to 0 at every side.

## Surface (the paint call)

| Number | Value | Source | Why |
|---|---|---|---|
| Slots | 0 desk: `matte` tone 0; 1 bar: `film` | brief | A plain desk; the bar is the film |
| Film range | [26, 54] nm, param 0 to 1 | the owner's pick (Fujimura 1972) | Settled value |
| Film ior | 2.343 | The driver's ruling (Querry, bulk Fe3O4: the only measured source opened) | Settled value |
| Film base | `"metal"` | brief | Iron under the oxide |
| Pull, target | 0.3, `nearest` | film-metal.html (the engine's steel page) | The brief: the engine's pull, as on film-metal.html |
| Roughness | 0.3 (default) | materials.film default | Not tuned |
| Detail | 0.6 | bar 10 (bar 07, bar 03) | The kit's bars' detail |
| Palette | film-metal.html's four tokens, renamed `--accent-warm`, `--accent-cool` | film-metal.html | The pull moves the film toward the nearest ramp stop, so the palette changes the bands. The owner's 38 nm ruling was made on film-metal.html with this palette and pull, so the bar shows the colours they ruled on |

## The bar (`BAR`, ss about the page centre, y up)

| Number | Value | Source | Why |
|---|---|---|---|
| Orientation | vertical | builder (from the law's geometry) | The law turns the key 30 degrees in the x-z plane, and a pointer moved across the page does the same. The face's crown runs across x, so the highlight can follow the key across the bar. A bar lying along x has no normal with an x part and its stripe would fade at the turned key |
| half | 0.1 x 0.4 | builder | 120 x 480 px: a bar stock about 1:4, with 60 px of desk above and below |
| crown | 0.034 | film-metal.html's edge slope | Parabolic crown across the width: edge slope 2 x 0.034 / 0.1 = 0.68 (34 degrees), film-metal.html's. The lobe finds normals at the half vector: about 17 degrees off the eye at the key's rest place, 32 after the law's 30-degree turn. Height stays inside the 8-bit sheet's +-0.0625 |
| cap | 0.03 | builder | Each end rounds down to the desk over 18 px, so the height never steps at the outline (no rim marks). Each cap keeps its end's thickness |
| Hot end | top (param 1) | builder | Bands read top to bottom: blue, purple, brown, straw |
| Falloff | linear in position along the body, between the caps | builder | No source gives the bar's temperature profile or oxide growth along it. Linear gives each nm of oxide the same length, so each band's share of the bar is its share of the thickness range |
| Desk | `DESK = { warp: 0.004, freq: 2.2, clear: 0.03 }` | bar 10's page | A still seeded fbm (no clock), flat within 0.03 ss of the bar so the bar meets it at height 0 |

## Brushed grain (`GRAIN`, second field)

A `fields.shape` drawn after the bar. It writes height and direction only, never param, so the bar's thickness stays
(Task 17's carry-forward; the row "the brushed-grain direction field ... leaves the bands' thickness intact" asserts it).

| Number | Value | Source | Why |
|---|---|---|---|
| amp | 0.0005 ss at detail 1 | builder | About one 8-bit height level. Scratch slope about 0.2 at detail 1 (0.12 at 0.6): it smears the lobe across the grain, as brushed steel streaks its highlight |
| across, along | 200, 6 cycles per ss | builder | Scratches about 3 px across and about 100 px long, along the bar |
| direction | (0, 1) on the bar, 0 on the desk | builder | The grain runs along the bar. `materials.film` does not read direction (its `aniso` is 0); the channel records the grain's angle |

The grain scales with `uDetail`, so at detail 0 (the law's (b), (d) and (e) frames) it is gone. It fades to 0 at the
bar's sides with the crown, so it adds no step at the outline.

## Light

| Number | Value | Source | Why |
|---|---|---|---|
| Key dir at rest | [0.55, 0.05, 0.83] | film-metal.html | The steel page's key: 33.6 degrees off the eye. The law reads this as position A |
| Key level | 0.85 | film-metal.html | Copied |
| Ambient | 0.25 | film-metal.html | Copied |
| Shadow | none | builder | Laws are highlight and iridescence (spec). The owner kept the bar with no shadow (Task 24) |
| LAMP | 0.5 ss | builder | The key comes from a point 0.5 ss above the pointer, so the pointer changes the key's angle off the eye (film hue follows it). Over the bar the key is at the eye (0 degrees); at the canvas's side edges 56.9 degrees (measured, gate.test.ts pointer row); at a far corner about 62. At 960 x 600 the half vector stays under 32 degrees, within the crown's 34. On a wider view it does not: at 1920 x 600 the pointer at a side edge puts the key 72.5 degrees off the eye, and the stripe leaves the bar (break-ui run, Task 19). The owner kept the physics, with no clamp on the lamp point's reach (Task 24) |
| TAU | 0.1 s | bar 10 (bar 01's lamp lag) | The key eases toward the pointer; under reduced motion it goes straight there (the page's only use of the media query) |

The key holds its declared direction until the pointer moves (asserted). The rest point is the pointer place that
gives the declared key, so the first move eases from there with no jump.

Physical limit seen in the screenshots: moving the pointer far along the bar (up or down) lights the bar from along
its length. The face has no normal with a y part except at the caps, so the stripe dims to the caps. This is what a
straight bar does; the owner kept it (Task 24).

## Motion

`alive: { rests }`. Nothing moves without the pointer. `flash.pointer` is bar 10's sweep (centre, right edge, left
edge, centre over 2 s). The flash check replays that path through the engine's pointer. The engine's pointer moves
only a tilt or a key with `follow`, and this bar has neither. So the path moves nothing here. The key's sweep is page
code, so no flash check covers it. As bar 10's notes say of its own key: the flash check cannot drive the light job.
The path stays in `bar.json` so a later engine-driven pointer is measured.

## Readings (gate.test.ts rows, before any change)

Bands at the key's rest place, highlight alone, detail 0, seed 1, every 2 nm from the hot end (light; dark is within
0.5 degrees): 54 to 44 nm blue (hue 256 to 285), 42 to 40 nm purple (306, 330), 38 to 34 nm brown (5, 51, 69), 32 to
26 nm straw (77 to 84). Runs: blue, purple, brown, straw. The 38 nm stop reads brown (hue 5.4), reddish, as the owner
allowed; it is logged, not asserted.

Param over the body after the grain field: worst gap from the linear ramp 0.0002 (one 8-bit level is 0.0039), 444 x
120 texels. The test browser's sheet keeps param finer than 8 bits, so no steps came from param here. On an 8-bit sheet
each level is 0.11 nm of oxide, about 1.7 rows; at the steepest point (brown to purple, about 25 degrees of hue per nm)
one level would be about 2.6 degrees of hue. Not seen in the screenshots, where the grain streaks dominate.

Detail check (gate rows, seeds 1 to 3): high-frequency rise 0.035 to 0.039 from detail 0 to 1 (minimum 0.02). The
fine structure is the grain and the desk's matte variation; the margin is under 2x. The owner kept the look (Task 24).

## OPD arcs the law's bins cover (light and dark, seed 1, identical; re-read after f8ce8df, unchanged)

The law bins the film by OPD at key A (the rest place, [0.552, 0.050, 0.833]) and turns the key 30 degrees to B
([0.894, 0.050, 0.445]). 27 bins, OPD 121 to 250 nm.

- Counted at A: OPD 121 to 175 nm (oxide 26.0 to 37.6 nm) and OPD 225 to 250 nm (oxide 48.4 to 53.8 nm).
- Counted at B: OPD 121 to 170 nm (oxide 26.0 to 36.6 nm) and OPD 230 to 250 nm (oxide 49.5 to 53.8 nm).
- Gap of uncounted bins: OPD 180 to 220 nm at A (oxide 38.7 to 47.3 nm), each under `FILM_SPEC_MIN` (mean highlight
  0.0019 to 0.0039 linear). This is the purple to mid-blue arc, the same gap as film-metal.html's steel page. (b), (d)
  and (e) say nothing there.

## Hue shift per band at the law's 30-degree key turn (seed 1, light; dark within 0.6 degrees)

From each bin's hue at A to its hue at B: straw (26 to 31 nm) 0 to 1.7 degrees; straw into brown (32 to 34 nm) 2.0 to
3.0; brown (35.5 to 37.6 nm) 6.3 to 17.2; purple (38.7 to 41.9 nm, uncounted) 8.9 to 15.0; mid blue (43 to 47 nm,
uncounted) 2.1 to 8.7; thick blue (48 to 54 nm) 0.7 to 1.4. So the shift is close to invisible at the straw end and the
thick-blue end and clear from brown to mid blue, as Task 18 found. The owner kept it (Task 24).

## The iridescence law on this bar

### History: what failed before the film law's (b) fix (f8ce8df)

This subsection is a record, not the current state. Before f8ce8df, all four cases read (light seeds 1 to 3, dark seed 1; dark seeds 2 and 3 not run) give the same line (dark seed 1:
0.0463 in place of 0.0448):

> iridescence FAIL ((b) film of one thickness and angle (OPD 175.0 nm, slot 1) differs 0.0448 in tint between its
> halves by row, at or over 0.01 ...; (e) not read: the key's turn moves the film along its own ramp too little to tell
> from the page's own noise)

(a) key 0.0104 (limit 0.005), (c) 0, (d) 0.377. (e)'s denominator is 0.0125 and its noise is (b)'s 0.0448, so the
noise over the denominator is 3.6 and (e) is not read.

Likely cause (geometry, not tested by a planted page): the OPD 175 bin (oxide 37.1 to 38.2 nm) sits at the edge of the
gap, where the hue moves about 26 degrees per 5 nm bin (bin 170: 39.6, bin 175: 13.5, bin 180: 349). On this bar the
thickness runs one way along the rows, so the bin's top half is thicker than its bottom half and (b)'s row split reads
that gradient as a colour mismatch. On film-metal.html the two panels run param in opposite directions, so each row half
holds both ends of the bin and the gradient cancels. The film code is the same on both pages.

Per the brief, the key, its level and the page were not changed to make (e) read or (b) pass.

### After the law fix (f8ce8df)

The fix reads (b) on the 5 nm bins less the ramp's own curve: each half keeps its mean OPD, and the split's tint
difference is compared with the difference the parabola through neighbouring counted bins predicts. The page is
unchanged. The (e) rows at seeds 1 to 3 in both schemes:

| Scheme | (b) worst | (e) ratio | (a) key | (d) apart |
|---|---|---|---|---|
| light | 0.0027 to 0.0028 | 0.0756 to 0.0764 | 0.0104 to 0.0105 | 0.3769 |
| dark | 0.0018 (OPD 165) | 0.0643 to 0.0644 | 0.0107 to 0.0108 | 0.3779 |

The limits are 0.01 for (b) (`relight.filmMatch`) and 0.496 for (e) (`relight.filmSpread`). Bins counted: 18 at A and
16 at B, in both schemes.

Two facts from the law fix:

- On this bar the column split of (b) never reads. At the rest key the highlight stripe sits right of the crown (seen in
  the screenshots), so a bin's left half has no highlight to read. (b) rests on its n.v and row splits.
- film-place-hue's Task 25 copy on bar 11 may not fail (b). The new (b) fits the ramp's curve through neighbouring bins,
  and the law header logs that "an error along the ramp is taken for the ramp". A place-hue fault that runs along the
  bar's one-way ramp may be read as part of the ramp. Task 25 must check which condition catches it here.
