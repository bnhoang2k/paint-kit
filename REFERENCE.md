# paint-kit: reference

Every export of `src/engine/index.ts`, which a page loads as `paint-kit` through an import map
(`{"imports":{"paint-kit":"/dist/src/engine/index.js"}}`). Units: "short-side units" means 1 is the
canvas's shorter side. Page frame: x 0 left to 1 right, y 0 top to 1 bottom, as fractions of the
canvas. Angles in degrees unless stated.

## The call

```js
import { paint, fields, materials, lights, fromPage } from "paint-kit";

const painter = paint(canvas, {
  seed: 7,
  detail: 0.6,
  palette: fromPage({ ground: "--ground", ink: "--ink", accents: ["--accent"] }),
  fields: [fields.sheet({ warp: 0.5 }), fields.text()],
  materials: [materials.paper()],
  lights: [lights.lamp({ at: [0.5, -0.2, 0.6], aim: [0.5, 0.6, 0], cone: 28, soft: 8, level: 1, kelvin: 3200 }), lights.ambient(0.08)],
  finish: { grain: 0.04 },
});
```

### `paint(canvas, options)`

Wires palette, fields, sheet, shade pass and frame loop to one canvas, installs `window.__paint`
and returns a `Painter`. Falls back to the plain ground colour without WebGL2. The pixel ratio is
capped at 1.5. The loop pauses while the tab is hidden and stops on a still frame under reduced
motion. URL overrides: `?seed=`, `?detail=`, `?t=` (start frozen at t seconds), `?nofloat=1`
(act as a device without float render targets).

### `PaintOptions`

- `seed`: number. Required. Every random number in a paint comes from it.
- `detail`: 0 to 1, default 0.5. Changes micro relief and fine colour variation only. The colour variation is
  zero-mean about the ground, so raising the dial adds texture without moving the page's mean tone.
- `palette`: a `PaletteSource` (use `fromPage`). Required.
- `fields`: `Field[]`. Drawn in list order; fields that write `rest` are drawn first.
- `materials`: 1 to 4 `Material`s. The index is the sheet's material slot.
- `lights`: `Light[]`.
- `finish`: `{ grain, halftone }`. Highlight shoulder, sRGB encoding and a half-level dither are always on;
  `grain` is seeded noise, default 0.04. `halftone` (`HalftoneFinish`, below) is the halftone screen after light;
  unset or `null`, no screen. `Painter.set` merges `finish` into the one in force, so `setGrain` keeps the screen and
  `finish: { halftone: null }` removes it.

### `HalftoneFinish`: `finish.halftone = { cell, angle, ground, slots? }`

Halftone after light. After light (shadows included) and before grain, the shade pass screens the lit colour: each
cell of a square grid prints one dot of the lit colour on the `ground` tone (the bed), sized so the cell brightens as
the light grows. With l the lit luminance and g the bed's (Rec. 709 weights on the displayed colour, as
`fields.halftone` reads its source): a lit colour lighter than the bed prints a light dot covering (l - g) / (1 - g)
of its cell, its place between the bed and white; one darker than the bed prints a dark dot covering (g - l) / g, its
place between the bed and black, so it shrinks as the light grows. So brighter lit areas print more light, and moving
a light moves which cells show it. Past an area
of pi / 4 (a radius of half the cell) the dot is cut by its cell's edges, so its area stays exact up to a full cell.
One shading pass: the screen reads each pixel's own lit colour. `fields.halftone` screens a picture before the light;
this screens the lit result.

- `cell`: grid pitch in CSS px; under 1 draws as 1.
- `angle`: grid angle, degrees anticlockwise from the x axis; 45 is the classic single-ink screen.
- `ground`: the bed, a ramp position (0 the ground token to 1 the ink token, `rampAt`). It is read off the ramp at
  each draw, so it follows a palette change. The ramp runs ground to ink in both schemes, so a bed on the ink under
  a surface on the ground prints light dots on dark ink in a light palette and a negative in a dark one: dark dots
  on light ink, which shrink where the light lands.
- `slots`: the material slots the screen prints on (indexes into `materials`), at least one; unset, every slot. A pixel
  of another slot keeps its lit colour, so a print can sit on an unscreened desk. An index that is not a material slot
  throws at `paint()`.

Printed ink (the sheet's ink channel: `fields.text` type and any field's picture ink) is never screened: type in a print
is solid line art. A pixel keeps its lit colour by its ink share, so a glyph's core is unscreened and its anti-aliased
rim blends. The sheet has one ink channel, so the screen cannot tell text ink from picture ink; both print solid.

Turning the screen on or off recompiles the shade pass; `cell`, `angle`, `ground` and `slots` are uniforms.
- `sheetScale`: the sheet's size as a fraction of the drawing buffer, default 1.
- `pointer`: `PointerOptions`, the engine-owned pointer that lights with `follow` read.
- `tilt`: `TiltOptions`, `{ max, drive }`: the pointer tips the surface (see Pointer, below). Unset: no tilt, and
  the page draws as before.

### `Painter`

- `set(partial)`: change any `PaintOptions` part at run time. Changing the material or light list
  recompiles the shade pass; changing a light's numbers should go through its props or a per-frame
  function instead.
- `dispose()`: release the GL resources and listeners.
- `maxTextureSize` (read only): the most pixels the GPU takes on one side of a picture, read once
  from the painter's own context. At least 2048 where WebGL2 runs; 0 on the fallback.

### `PaintStats`

What `__paint.stats()` returns: `p5`, `p50`, `p95`, `p99` (luminance percentiles of the canvas,
0..1), `frames`, `dpr`, `webgl`, `sheetW`, `sheetH`, `compiles` (shade-pass compiles) and `settle`
(the page's settle time in s; 0 for none).

## The sheet

Fields draw into one off-screen image, the sheet. One shade pass then adds material, light,
colour and finish.

| Channel | Meaning |
|---|---|
| height | relief, in short-side units |
| coverage | 0 no surface (a cut, a hole; the page's ground shows there, unlit except for a light that `emits`), 1 surface |
| ink | 0 to 1 printed coverage (text, dots) |
| slot | which material shades this pixel |
| direction | a unit vector (thread angle, strip angle); a shorter length grades it |
| rest | where this point of the surface sat on the flat sheet (a moved surface) |
| param | a free 0 to 1 number per pixel; each material gives it its own meaning |

Blend rule, in field order: height adds, coverage multiplies, ink takes the max, slot, direction
and param overwrite where the field's coverage is above 0.5. A field that does not write coverage
counts as fully covering. Param reads 0 where no field wrote it.

A material reads param as `s.param` (a member of `Surf`, 0 to 1). The channel is the blue component
of the direction image, so a page with no param writer draws as before; a page that writes param
without direction allocates that image for it and still reports no `dir`.

- `Sheet`: the engine's sheet handed to a field's `draw`: the blended image `a`, its `out` layer, an
  optional `dir`, `outDir` and `rest`, `writesDir` (a field writes direction; false where `dir` only
  holds param), and `w`, `h`, `float`.
- `SheetChannel`: `"height" | "coverage" | "ink" | "slot" | "direction" | "rest" | "param"`. A field
  lists the ones it writes.
- `SheetSample`: a read-back of the channels (`height`, `coverage`, `ink`, `slot`, `param`, and `dir`
  when any field writes direction) on a grid or region. `param` is all 0 on a page with no param
  writer. `__paint.sheet()` and `sheetRegion` return it.
- `Target`: a WebGL render target (`tex`, `fbo`, `w`, `h`, `float`, `bind()`, `dispose()`), the
  type of the sheet's images.

A carried field (`fields.sheet`, `fields.twill`, `fields.text`, a shape with `carried: true`) and
every material's texture read the rest position, so texture moves with a moved surface while the
light uses the moved surface's normal.

## Fields

`fields` is `{ shape, sheet, text, twill, halftone, reactionDiffusion, water, burn }`.

### `fields.shape({ glsl, uniforms?, writes, carried? })`

A formula, drawn by a fragment shader. Your GLSL defines `vec4 field(vec2 uv, vec2 q)` returning
(height, coverage, ink, slot): `uv` is 0 to 1, `q` is position in short-side units, centred.
Available: `uTime`, `uDt`, `uDetail`, `uSeed`, `uRes` (the sheet's size in device pixels),
`hash11(float)`, `hash21(vec2)` and `hash22(vec2)` (hashes), `snoise(vec2)` (simplex noise,
about -1 to 1) and `fbm(vec2, int octaves)` (summed noise), `sheetEncode`. `q.y` points up.
Channels the shape does not list in `writes` are ignored, so return 0.0 for them; a slot of -1
means "none". `uniforms` values are set again at every draw, so a change to the object you
passed shows on the next frame. A shape that writes `direction` also defines `vec2 fieldDir(vec2 uv, vec2 q)`. A shape that writes
`rest` (a surface that sways or lifts) also defines `vec2 fieldRest(vec2 uv, vec2 q)`: the uv where
the point now at `uv` sat on the flat sheet. A shape that writes `param` also defines
`float fieldParam(vec2 uv, vec2 q)`: the 0 to 1 value at that point, a fixed number or a per-pixel
formula, clamped to 0 to 1. It is written where the shape's coverage is above 0.5, and not where
`field` discards. `carried: true` draws it at the rest position, so its relief moves with the
surface; default false.

### `fields.sheet({ warp })`

A sheet of paper. `warp` 0 to 1 is a gentle macro warp that drifts slowly; fibre micro relief
scales with detail. Carried. Writes height and coverage.

### `fields.text(options?)` and `TextOptions`

Draws text from HTML elements into the ink channel, at their laid-out place. Writes ink only. Kind `ink`.

- `selector`: which elements. Default the `data-paint-ink` elements.
- `carried`: the words ride the moved surface. Default true. False keeps them at their HTML boxes.

### `fields.twill({ wales, angle, scale })` and `TwillOptions`

Twill cloth. `wales`: diagonal ribs per short side (48 puts one every 12.5 px on a 600 px side).
`angle`: wales' angle on screen, 63 is a right-hand twill. `scale`: 0 flat to 1 deep macro drape.
Writes height and direction (weft is marked with a shorter direction, 0.6).

- `GLSL_TWILL`: the weave as a GLSL chunk for a page's own shape field.
- `TWILL_RATIO`: the weave's aspect ratio (1.5).

### `fields.halftone({ source, cell, angle, grow })` and `HalftoneOptions`

Dots splatted into the sheet. Writes ink, and height (above detail 0.5 each dot adds a faint ink film). Kind `points`.

- `source`: a canvas or `ImageBitmap` whose luminance sets the tone, or a function called with the
  palette as CSS colours (`RampColours`) at init and on every palette change. The tone is coverage;
  dots print in the ink token.
- `cell`: grid pitch in CSS px, or a function of t (a timeline).
- `angle`: grid angle; 45 is the classic single-ink screen.
- `grow`: 0 a pale dot field to 1 full strength; a number or a function of t.

### `fields.reactionDiffusion(options?)` and `ReactionDiffusionOptions`

A Gray-Scott simulation, grown field. Writes height and coverage. Needs float targets; without them it draws nothing.

- `preset`: `"coral" | "cells" | "worms" | "spots"`. Unset, the seed picks one.
- `depth`: height per unit of the simulation's B, in plate texels. Default 18.

Settles after 300 ticks (5 s).

### `fields.water(options)` and `WaterOptions`

A water surface. Writes height only. It refracts what lies under it (`materials.water`) and shapes
caustics (`lights.throughWater`).

- `waves`: base wave crests per short side.
- `speed`: 1 gives a base wave a 2 s period; 0 holds the surface still.
- `depth`: wave height, 0 still to 1.
- `settle`: where the surface holds under reduced motion, in s. Default 1.
- `floor`: depth of the floor, short-side units, or a function of t. Default 1. Sets the caustic focus.
- `ior`: refractive index, default 1.33.
- `shift`: offset of the floor pictures, `[x, y]` or a function of t.
- `rise`: `{ map, height }`: per-pixel floor height from the map's red channel times `height`.
- `layer`: `{ picture, rise, shift? }`: a lifted layer seen through the water at its own depth
  (`floor - rise`). `picture` holds tone in red and coverage in green. A negative rise reads as 0.

### `fields.burn(options)`, `BurnOptions` and `BurnField`

A front that eats the sheet. Writes coverage and param. Each point's arrival is its distance from the
start plus a seeded rag noise; the front stands at speed x the whole 1/60 s ticks since the start, so
it only advances, `?t=` gives the same front, and a resize keeps it. Where the front has passed,
param is the time since it passed over `scorch` (0 at the front, 1 `scorch` seconds later), and the
paper is gone (coverage 0, the page's ground shows) where param reaches 1. So the order from the
paper is: front, scorch band, hole. Paper ahead of the front is untouched. Read the param with
`materials.paper({ scorch: true })`, and light the front with `lights.ember`.

- `from`: `"bottom"` (the bottom edge) or `[x, y]`, a point in page fractions (y down).
- `speed`: short-side units per second, above 0.
- `rag`: 0..1, how ragged the front is. At 1 the front shifts up to 0.08 short-side units (`RAG_AMP`).
- `scorch`: seconds from the front passing to the paper being gone, above 0.
- `startAt`: the paint time in seconds the burn starts at, or `null` to wait.
- `tear`: 0..1, default 0. Adds wide slow layers (up to 0.26 short-side units, `TEAR_WIDE`) and fine ridged layers to the
  arrival, so the front starts in spots, races and stalls, opens holes, leaves islands and has a jagged edge. It still only
  advances, because the arrival map never changes.
- `linger`: short-side units, 0 or above, default 0. How far the front travels after a point's paper is gone while its
  embers still glow (`lights.ember`'s `specks`). The settle time includes it.

`BurnField` is the `Field` plus:

- `start(lead?)`: starts a waiting burn at the paint time of the latest frame. `lead` (short-side
  units, default 0) places the front that far from its start at once; a negative lead places it behind the start. A second `start()` on a
  started burn is ignored. It asks the engine to re-settle (`FieldContext.resettle`), so under
  reduced motion the page rests at once on the end state (the whole card burned).
- `startAt`: the start time, or null while waiting. It is kept on the field, so `setTime` and a
  re-init give the same burn. `Painter.set({ fields })` with a new burn that has a number also starts one.
- `front(t)`: the front's distance from the start at paint time `t`, short-side units (far negative
  before the start). `frontNow()`: the same at the latest frame drawn. `band`: the scorch band's depth, `speed x scorch`. `maxShift`: the front's largest shift
  from the rag and the tear, short-side units. `linger`: as declared. `opts` and `size()`: what `lights.ember` reads for its region.

One burn field per page: its shade chunk's uniform names (`pkBurn*`) are shared. It is not stateful
(the engine does not replay it); it settles, once started, at the tick where the whole sheet has burned and the `linger` has passed.

### Field contract types

For writing a field of your own.

- `Field`: `{ kind: "shape" | "points" | "grown" | "ink", writes, init(gl, ctx), shade? }`. `shade`
  shares GLSL, uniforms and textures with the shade pass so a material or light can evaluate the
  field's own formula at any point.
- `FieldRuntime`: what `init` returns: `draw`, optional `drawRest`, `resize`, `dispose`, `settled`,
  `stateful`, `settleTicks` and `palette`. A stateful field is replayed from its seed by `setTime`.
  A field of your own that writes `param` draws into `sheet.outDir`: blue is the value and alpha is 1
  (alpha 0 means "not written"). If it also writes direction there, it masks each pass to its own
  components (red and green for direction, blue and alpha for param).
- `FieldContext`: what `init` gets: `seed`, `rand()`, live `detail` and `size`, `float`,
  `invalidate()` (redraw after outside input changed), `resettle()` (the field's settle time changed,
  as when a waiting burn starts: under reduced motion the engine rests on the frame at the new settle
  time; otherwise it redraws, as `invalidate`) and `colours()`.
- `RampColours`: `{ ground, ink, stops }` as CSS colour strings. A field that needs the palette
  reads it here, never from the page's tokens.
- `InkSource`: `"text"` (from `fields.text`) or `"picture"` (from any other field).
- `PerFrame<T>`: a value, or a function of the paint's time in seconds. Per-frame change goes
  through these, never through a new material or light.
- `Uniforms`: `Record<string, number | number[]>`.

## Materials

`materials` is `{ matte, paper, denim, sheen, glass, water, foil, film }`. The index in `PaintOptions.materials`
is the slot a field writes.

Every material but water takes `tone` (`ToneOptions`): its colour as a position on the page's ramp,
0..1. 0 is the ground token (the default), 1 the ink token, and between them the ramp's stops (the
accents sorted by lightness from the ground's end toward the ink's, so stop 1 is the accent nearest the ground), mixed in OKLab: the scale of water's `under` and glow's `hues`. With one
accent, 0.5 is that accent. Two materials in two slots with two tones give two surfaces two colours
from one palette (a card on a desk: `test/pages/tone.html`). The tone follows the tokens: the engine
resolves it again whenever the ramp rebuilds. Matte's and paper's fine colour variation (by detail)
moves toward the stop beside the tone that lies farther from it (`rampAway`; stop 1 at tone 0), so
the dial reaches every tone, a stop included. Denim's tone is its undyed yarn: a tone equal to its
dye leaves no weave colour. Sheen and glass build their dim body from the tone and the ink.

- `materials.matte(options?)`: plain diffuse in its tone (default the ground colour), ink printed from the ink token. Law: relief.
- `materials.paper(options?)` and `PaperOptions`: fibre micro relief and soft wrap diffuse. `fibre`
  0..1 (default 1): how strongly fibres tilt the light at detail 1. `translucency` 0..1 (default
  0.3): how much light the sheet lets through. `scorch` (default false): read the sheet's param as
  scorch (`fields.burn`): where it is above 0 the paper's OKLab lightness is scaled down toward 0
  (char) by a fixed curve, half gone by param 0.3 and all gone at 1, in either scheme; the hue stays
  the paper's. Ink follows the fibres at high detail. Law: relief.
- `materials.denim(options?)` and `DenimOptions`: indigo cloth on a twill field. `wear` 0..1
  (default 0.4): how far wear lightens the dye on the highest relief. `dye`: `"ink"` (default) or
  `"accent0"` (the ramp's middle stop). Laws: relief, highlight.
- `materials.sheen(options)` and `SheenOptions`: anisotropic gloss for metal and satin; a Ward
  lobe streaked along the direction image. `roughness` 0..1 (0.1 polished, 0.5 satin).
  `anisotropy` 0..1 (0 round). Law: highlight.
- `materials.glass(options)` and `GlassOptions`: backlit frosted glass. `frost`: short-side units
  over which light from behind spreads (0 clear). `transmit`: share of the light behind that
  passes, default 0.9. `rim`: -1..1, how much more the rim passes than the face, default 0.6.
  `rimWidth`: default 0.008. `gloss`: front sheen, 0..1, default 0.3. `etch`: 0..1, default
  0.15: how unevenly the frost's fine etch passes light, pixel to pixel, at detail 1. It is fine
  structure scaled by the detail dial (none at detail 0). It is the only part of the etch a page lit
  from behind alone shows, and it reads on the dimmer glass: the finish's shoulder flattens it where
  the glass is blown past white. Lit by a light with `behind: true`. Law: transmit.
- `materials.water(options)` and `WaterMaterialOptions`: `{ under }`, a canvas drawn at the canvas's
  aspect, refracted by the water's slope. Its red channel is a position on the page's ramp (0
  ground, 1 ink), so it follows the tokens; draw it with a tone, not a colour. Uploaded once per
  material object. Needs `fields.water`. No law of its own.
- `materials.foil(options)` and `FoilOptions`: holographic foil, a reflection grating. Its grooves
  run along the sheet's direction image, so a field paints the pattern (sunburst, cracked ice,
  stripes) as a direction per point; a direction of length 0 means no grooves (the round highlight
  alone), and a graded one gives the grating that share of the highlight. Its colour is computed per
  light from the grating equation across the grooves (order m shows d |X.(l + v)| / m nm), each
  visible order a band through `pk_spectrum`, pulled toward the ramp, so it moves when a light or the
  tilt moves and never with the clock. `spacing`: groove spacing in um, 1.0 to 2.0 (the range holo
  film is sold at). `orders`: 1 to 7, default 2. `pull` 0..1 and `pullTarget` `"nearest"` or
  `"ground"`: as `pullToRamp`; the pull moves each band's colour and keeps its luminance.
  `roughness` 0..1, default 0.3: the highlight's width along the grooves. Under one directional key
  and no tilt, every point with the same groove shows one colour; a lamp gives each point its own
  light direction, so the colour sweeps in bands. Its body is a dim metal, as sheen's, in its `tone`.
  Printed ink covers the foil by the ink amount (ink is not iridescent); an opaque white under-print
  is another slot. Laws: iridescence, highlight.
- `materials.film(options)` and `FilmOptions`: a thin transparent film on a base, such as the oxide on
  tempered steel. Light reflects off the film's top and off the base under it, and the two reflections
  interfere. The thickness runs along the sheet's `param` channel (a field writes it with `fieldParam`).
  `range`: `[a, b]`, the thickness in nm at param 0 and at param 1; a reversed range is allowed. `ior`:
  the film's index, 1 or more. `base`: `"metal"` (iron, Johnson and Christy 1974) or `"dielectric"` (a
  clear base of index 1.5, glTF's default). `pull` 0..1 and `pullTarget` `"nearest"` or `"ground"`: as
  foil's. `roughness` 0..1, default 0.3: the highlight's width. Its colour is two-beam interference over
  380 to 780 nm through `pk_spectrum`, and it reads the angle between the eye and the half vector. So
  the hue shifts a little when the key's angle off the eye changes, holds when a key swings around the eye or the
  surface tilts (the highlight still moves), and never moves with the clock. Under one directional key,
  one thickness shows one hue wherever it is. A high `ior` nearly hides the shift. Its body is a dim metal,
  as foil's, in its `tone`. Printed ink covers the film by the ink amount. Laws: iridescence, highlight.
- `Material`: the contract: `{ id, glsl, uniforms, laws, frame?, resolve?, textures?, grating?, film? }`. `frame(t)`
  gives per-draw uniforms; `resolve(ramp)` gives uniforms from the palette, laid over `uniforms`, and
  the engine calls it again whenever the ramp rebuilds (as `Light.resolve`); `textures` are pictures
  bound to `u_$_<key>`. Its GLSL starts from `matBase(s, tone)` (a linear colour) or `matBase(s)`
  (the ground). `grating: true` (foil's): the shade pass compiles the grating lobe and the
  spectrum, and every light's highlight (`specColour`) takes the grating's colours where the
  material sets MatOut's `diffract`. `film: { range, ior, base }` (film's): the same for the film lobe,
  where the material sets MatOut's `filmShare`; `__paint.materials()` reports it per slot.
- `ToneOptions`: `{ tone? }`, the ramp position above.
- `Law`: `"relief" | "falloff" | "highlight" | "tint" | "caustic" | "transmit" | "shadow" | "iridescence" | "burn"`.
  burn (the `relight` check, on a page with `fields.burn`; no light or material declares it, so a page lists it in
  `bar.json`): the page is frozen at five times across the bar's `alive` window, else t 1 to 5. (a) The burned share
  (`sheet()` grid cells with coverage under 0.5) never drops between neighbouring times by more than
  `relight.burnJitter`; a share that never changes is partial. (b) The same pixels, at a time their texel has `param`
  0 at full coverage and at the next time with `param` in (0, 0.5), the `lights.ember` at level 0 in both frames, lose
  more than `relight.scorchDrop` relative luminance on average. (c) With the ember on against off, on paper ahead of
  the front, by Euclidean distance to the nearest texel the burn has reached (param above 0; ground and holes are not
  the front): within 0.6 x `reach` the warmth (the OKLab a, b change toward the ember's own hue) is above 0; beyond
  1.2 x `reach` the frames match within `relight.ambientBand`; and the light the ember adds fades: its mean relative
  luminance gain in the outer quarter of `reach` over the inner quarter is under `relight.emberFade`. Under 400 pixels
  near, beyond, in either quarter, or in (b) is partial; a page with no ember reads (c) partial.
  iridescence (the `relight` check, under the first key light, on the pixels of every material that declares it;
  colours compared in the OKLab chroma plane, a and b, so a white highlight that only brightens is not iridescence):
  (a) moving the key between its test positions, and tilting the surface by half its `max` (a page that tilts),
  each move the foil's colour per point (the mean of each pixel's own change) by more than
  `relight.iridescenceShift`; (b) under the key alone at detail 0, foil of one groove, groove share and grating
  u = |X.(l + v)| (0.0025 bins, the check's own geometry) reads one colour (its halves within
  `relight.iridescenceMatch`); (c) one second on, lights held at their place, it changes under
  `relight.ambientBand` where the sheet itself did not change (a surface that moves with the clock everywhere reads
  partial); (d) the two largest groups whose grooves run at least 30 degrees apart (the plan's value, compared on
  5-degree bin centres, so a true difference of about 25 to 35 degrees) differ by more than
  `relight.iridescenceApart`; (e) within one groove, two u bins at least 0.02 apart differ by more than
  `relight.iridescenceSpread`; where no groove spans 0.02 in u (flat foil) the line says "(e) not read: no groove
  spans 0.02 in u" and (a) to (d) decide. A page with no key is partial. Known gap: a grating that ignores its
  declared spacing still makes colour a function of u, so it passes (a) to (e); the fix is a wavelength oracle
  (spacing x u through the CIE 1931 table, against the spacing `__paint.materials()` declares), a later phase.
  Second known gap: two groove groups mirrored about the key's heading have the same u, so a correct foil shows them in one colour and (d) fails with "its colour ignores the groove direction". A groove pattern whose two largest groups mirror at the test key can fail on a correct page (a smoke-test sticker with concentric rings did, at one seed). Copy the bar's own groove pattern, or read the (d) line's two groove angles before you change it.
  Thin film (a material with `film`) has its own branch; a page with both foil and film reads both, and the worse status
  decides. The film is binned by slot and optical path difference (OPD, 5 nm bins) at the key's declared place, and its
  colours are the tint (a / L, b / L in OKLab) of the key's highlight alone. The second key position turns the key 30
  degrees off its place. (a) That turn, and a tilt of half the `max` (a page that tilts), each move the film's colour
  per point by more than `relight.filmShift`; (b) one thickness and angle reads one tint: each bin of at least 400
  pixels is split by column, row and n.v, and each split's tint difference, less what the film's own ramp gives for the
  halves' difference in mean OPD, is within `relight.filmMatch`. The ramp there is the parabola through the bin and two
  neighbouring counted bins of its slot (both neighbours, else two on one side), never across a gap of uncounted bins;
  a bin with no such curve is not read; (c) one second on it changes under `relight.ambientBand` where the sheet, `param`
  included, did not change; (d) film D nm further along in OPD differs in tint by more than `relight.filmApart` (D is
  275 nm, capped at half the slot's OPD span, so a short ramp is compared over half its length); (e)
  the key's turn moves the colour along the film's own thickness ramp: the ratio it leaves undone is under
  `relight.filmSpread`, near 0 for an honest film and 1 for one that ignores the angle. A bin whose new OPD falls in a
  gap of uncounted bins is left out, as the ramp never measured a colour there. (e) reads only when the page's
  own (b) reading over the ramp's move is under `relight.filmSpread`; otherwise the line says "(e) not read: the key's
  turn moves the film along its own ramp too little to tell from the page's own noise" and (a) to (d) decide. A tilt
  does not shift film hue: it turns the surface, so the highlight moves and the hue holds. Known gaps: a film that
  ignores its `ior` or `range` passes (a) to (e); where (e) is not read, a film that ignores the angle passes; a
  reversed range passes the law; a page that drifts only part of its film passes (c) on the part that holds; a film
  whose counted bins lie only in runs of fewer than 3 neighbouring bins (separate uniform patches, say) has no ramp curve,
  so (b) is not read; an error that is a smooth function of thickness alone,
  or the part of a place error that runs along the ramp on the page, is taken for the ramp by (b).

Where coverage is 0 no material draws: the ground token shows, unlit, whatever the tones. Only a light that `emits` (`lights.ember`'s specks) adds to it.

## Lights

`lights` is `{ ambient, key, lamp, glow, throughWater, ember }`.

- `lights.ambient(level)`: even light, colour D65 tinted 30% toward the ground. No law.
- `lights.key(options)`: a directional light. Options: `dir` (a direction from the surface toward the light: x right, y up, z toward the viewer),
  `level` (how bright a flat sheet is), `kelvin` (default 6504), `tint` (0..1 toward the ground's
  hue, default 0.15), `specular` (0..1, default 1; the relight check reads the highlight alone by
  switching it to 0), `follow` (tilt with the eased pointer: direction is `dir` plus follow times
  (pointer x - 0.5, 0.5 - pointer y, 0)), `shadow` (see `ShadowOptions`). Law: relief, and shadow
  with a `shadow`.
- `lights.lamp(options)` and `LampOptions`: a spot. `at` and `aim` in the page frame with z as
  height above the sheet in short-side units. `cone`: half angle. `soft`: the soft edge inside
  `cone`. `level`: brightness of a flat sheet at the aim point. `kelvin`. `tint` (default 0.15).
  `specular` (default 1). Falls off as the inverse square of the distance from the bulb and adds
  nothing outside the cone. `shadow` (see `ShadowOptions`; it falls away from the bulb). Law: falloff,
  and shadow with a `shadow`. A lamp has no `follow`: a lamp that tracks the pointer
  needs the page's own frame loop that calls `painter.set({ lights })` with a new `at` and
  `aim` (bar 01 does this).
- `lights.glow(options)` and `GlowOptions`: a soft coloured area light. `at`: `[x, y]` or a
  function of t. `radius`. `level`: what it adds to a white surface at its centre. `hues`:
  `"accents"` or up to 4 ramp positions 0..1. `tint`: 0..1, default 1. `follow`: sits at
  `at(t)` plus follow times (pointer - [0.5, 0.5]); 0.2 is a parallax shift, 1 puts it under the
  pointer. `behind: true` puts it behind the sheet: it then lights only materials that pass light
  from behind (`materials.glass`), `level` is the light reaching the glass's back at the centre,
  and the law is transmit. Otherwise the law is tint.
- `lights.ember(options)` and `EmberOptions`: the light of a burning front. `field`: the page's
  `fields.burn` (it must be in the page's fields). `kelvin`: `[edge, core]`, each at least 798 (the
  Draper point). `level`: what it adds to a white surface at the front. `reach`: short-side units.
  `pull`: 0..1 toward the nearest ramp stop, default 0.25. `span`: short-side units, the width the tint law's
  circle holds, centred on the page, default the sheet's width. It clips no light, so it must cover all the page's paper. The front glows in the core's heat colour
  (`kelvinToLinear`, pulled to the ramp, scaled to luminance 1, so brightness is `level` alone) and
  lights paper within `reach` of it on both sides, cooling to the edge's colour and falling to 0 at
  `reach` as a glow does. It lights nothing in the hole. Its `region(t)` is the circle that holds
  every pixel it lights. Law: tint. For a front across a whole frame that circle covers the frame,
  so the tint law has nothing beyond it to read and reads partial; a burn from a point, or a card
  narrower than the page that sets `span` to its width, gives it a frame beyond. The burn law's (c) reads the ember by distance from the front instead (see `Law`).
  `rim` (optional): `{ width, gain, kelvin: [edge, core] }`, a thin, hot line on the hole's edge. `width` is in short-side
  units and `gain` multiplies `level`. It is light the edge gives off, so the char's low albedo does not dim it, and it swells and breaks along the edge.
  `specks` (optional, needs the burn's `linger` above 0): `{ gain, density, box: [halfWidth, halfHeight], kelvin: [edge, core] }`,
  glowing points on the bare ground behind the front. `density` is the share of grid cells that hold a speck at detail 1 (above 0, at most 1); specks are fine structure, so detail 0 keeps about a third of them. `box` is
  the area that held paper, in short-side units about the page centre. Each speck cools and rises, and is out when the front has moved `linger` past it.
  Rim and specks scale with `level`, so an ember at level 0 gives no light. The specks use `Light.emits`: the shade pass adds a light's `pkEmit` after the coverage mix, so it shows on the bare ground.
- `lights.throughWater(light, options?)` and `ThroughWaterOptions`: wraps any light (a key, a lamp)
  and filters it through the water field, drawing moving caustic lines on what lies below.
  `caustic` 0..1, default 1. Law: caustic.
- `ShadowOptions`: `{ soft, ground? }` (the shape of a light's `shadow` option; the type is not exported). The light casts
  a shadow from the sheet's height, in the
  shading pass: it falls on the side away from the light, moves against it, and softens with the
  blocker's height above the receiver. `soft`: short-side units of penumbra per unit of that height
  (0 is a hard edge). `ground` (default false): the shadow also darkens the bare ground (coverage 0)
  by a multiply, never lighter; without it the bare ground stays unlit. At most one light per paint
  casts: a second throws at `paint()`, naming both. `lights.throughWater` takes no casting light.
  Text ink is not height and casts nothing. The march reaches 0.0625 short-side units up (the 8-bit
  sheet's height range), so on a float sheet a taller surface casts as if it ended there.
  The shadow law reads partial when the sheet's height shades under 0.4% of the frame at a test position (`relight.shadowNone`, 0.004): a small, thin raised piece leaves no shadow to judge (a round sticker of radius 0.17 and lift 0.008 shaded 0.17%; bar 10's card, lift 0.012, shades about 0.45%, so it sits close to the floor). Keep the bar's size and lift, or make the piece larger or higher, before the first run.
- `Light`: the contract: `{ id, glsl, uniforms, laws, props, resolve?, with?, testPositions?,
  pointer?, frame?, behind?, shadow?, region? }`. `region(t)`: where the light falls at paint time
  `t`, as a circle `{ at, radius }` (`at` in page fractions, y down; `radius` in short-side units),
  for the tint law; unset, the law reads `props.at` and `props.radius` (a glow). The tint law reads
  the first light that declares tint, and is partial when no pixel lies beyond 1.2 x its radius.
  A light's `resolve` result replaces its `uniforms` (it does not merge), so a `resolve` returns
  every uniform. A page never writes its own light: the palette check flags it.
- `lampSheetPoint(lamp, aspect, offDeg?, across?)`: where a ray from the lamp, turned `offDeg`
  degrees off its aim, meets the sheet; a page-frame point or null. Used by checks.
- `lampRingPoint(lamp, aspect, offDeg, azimuthDeg)`: the same for a ray `offDeg` off the aim at
  `azimuthDeg` around it (0 along away from the lamp's foot, 90 across toward screen right, 180
  along toward the foot, 270 across left); at the quarter turns it equals `lampSheetPoint`. Used
  by checks (the falloff law's outside probe).
- `pageToSheet([x, y, z], aspect)` and `sheetToPage([x, y, z], aspect)`: convert between the page
  frame and sheet space (x right, y up, short-side units, centred).

## Pointer

The engine owns a lagged copy of the page's pointer, stepped on fixed 1/60 s ticks so `setTime`
replays it. Lights with `follow` read it.

- `PointerOptions`: `ease` (share of the way to the target per tick, 0..1, default 1 = no lag)
  and `rest` (where it rests before input, default `[0.5, 0.5]`).
- `PointerStop`: `{ t, x, y }`: at time t the pointer is at (x, y).
- `easeOfTau(tau)`: the per-tick ease for a lag with time constant `tau` seconds.
- `pathAt(path, t)`: a path's position at t (straight lines between stops).

### Tilt: `PaintOptions.tilt = { max, drive }`

The eased pointer tips the surface about the canvas centre by up to `max` degrees (0 to 89): the centre is flat, a
canvas edge gives `max`, and past the edge it holds `max`. The shade pass turns the surface itself by that rotation R
(`tiltTurn` in `src/engine/pointer.ts`, the uniform `uTilt`): after the material, the normal (with its micro relief)
turns by R, and so do the grooves where a highlight lays them into 3D (the anisotropic lobe and the foil's grating).
The eye stays at +z (`Surf.view`), the lights stay where they are, and no geometry moves: the sheet, the shadow march
and the text stay put. A card tipped under fixed room lights works this way, so a tilt moves a highlight and a foil's
colour about twice as far per degree as turning the eye alone would, and the diffuse light changes too: the card
brightens as it turns toward a light and dims as it turns away (the owner's pick at bar 10's look review, Phase 2 Task 16;
Task 11 turned only the view). A tilt is `[a, b]` in degrees: `a` about the vertical axis, positive when the right
side goes away from the viewer; `b` about the horizontal axis, positive when the top goes away.

- Sense: the pointer pushes the side it is on away, like pressing one side of a card held in the hand. Pointer right
  tips the right side away, so the card faces right; pointer up tips the top away, so it faces up. R is first `b`
  about the horizontal axis, then `a` about the vertical one: it turns the flat card's normal +z to
  (sin a cos b, sin b, cos a cos b) in the sheet's frame (x right, y up, z toward the viewer), and the eye, held, sits
  at (-sin a, -sin b cos a, cos a cos b) as the card sees it. The sign is one constant, `TILT_SENSE` in
  `src/engine/pointer.ts`.
- Limit: the card turns in its shading only. Its outline, its shadow and its text do not foreshorten or move, and a
  shadow does not follow the turn; at a large `max` a turned card is lit as a turned card but drawn as a flat one.
- Ease: the tilt has its own copy of the engine pointer with the page's `pointer.ease`, resting at the centre, so it
  steps on the same ticks and `setTime` replays it (a frozen page follows `setPointerPath`'s path too). When the
  pointer leaves the canvas (moves off it, leaves the page, or the window loses focus) the tilt eases back to `[0, 0]`
  by the same ease: each tick moves the ease share of what is left, never a jump. A page that tilts with `drive:
  "pointer"` sets `pointer.ease` under 1 (`easeOfTau`): `paint()` throws when it is unset or 1, since at 1 (no lag) a
  leave would snap the surface flat in one tick.
- `drive`: `"pointer"`, the pointer tips it; `"none"`, only the hook's `setTilt` does.
- Reduced motion: the tilt settles with the paint clock. The loop rests on one still frame, and pointer moves after
  that draw nothing.
- Turning tilt on or off recompiles the shade pass (the turn is then a uniform); a page without `tilt` draws as before,
  pixel for pixel, and a tilt of `[0, 0]` turns nothing.

## Colour

Every colour the engine paints comes from the page's tokens. All colours are linear sRGB triples
(`Vec3`). Mixing is in OKLab; gamut clipping reduces chroma at fixed lightness and hue.

- `fromPage({ ground, ink, accents? }, el?)` and `PaletteSpec`: custom property names (`--name`,
  at most 3 accents). Returns a `PaletteSource`. Throws on a token that is unset, not a colour or
  not opaque. The engine rebuilds the ramp when the tokens change (dark mode, a theme switch).
- `PaletteSource`: `{ read(), watch(onChange), tokens? }`.
- `PaletteTokens`: `{ ground, ink, accents }` as property names.
- `Ramp`: `{ ground, ink, stops }`: five stops; stop 0 the ground, stop 4 the ink, stops 1 to 3 the
  accents by lightness (empty stops are OKLab mixes).
- `Vec3`: `[number, number, number]`.
- `buildRamp(ground, ink, accents)`: builds a `Ramp`.
- `rampColours(ramp)`: the ramp as CSS colour strings.
- `linearToCss(c)`: a linear colour as a CSS `rgb()` string.
- `parseCssColor(computed)`: a computed CSS colour to linear.
- `linearToOklab(c)`, `linearToOklch(c)`, `oklchToLinear(L, C, h)`: colour space conversions.
- `mixOklab(a, b, t)`: mix in OKLab, with chroma-reducing gamut clip.
- `rampAt(ramp, t)`: a ramp position (0 ground .. 1 ink) as a linear colour, exact on the five
  stops; the CPU side of the GLSL `ramp(t)` (between stops it may differ slightly: the GPU does not
  reduce chroma).
- `rampAway(ramp, t)`: the stop beside ramp position `t` that lies farther from it in OKLab (stop 1
  at 0): what a toned material's fine variation moves toward.
- `tintToward(c, target, amount)`: tint a computed colour toward a palette colour.
- `kelvinToLinear(k)`: the colour of light at `k` kelvin (798 to 25000), largest channel 1. Below
  1667 K it is Planck's law summed against the CIE 1931 observer: heat colour, from a dull red at
  798 K (the Draper point). It gives only the hue; a glow's brightness comes from its level.
- `xyzToLinear(c)`: CIE XYZ to linear sRGB, unclipped.
- `GLSL_OKLAB`: the OKLab functions as a GLSL chunk.

Page code may not read tokens or call these helpers (except `fromPage`): the `palette` check's
static rule. They are for the engine and the checks.

### Spectrum and pull

Light that physics colours, for a material that splits light into wavelengths (foil, thin film) or
glows with heat. The engine never invents a hue: a spectral colour reaches the page's palette only
through the pull, by a declared amount.

- `CIE_1931_2DEG`: the CIE 1931 2-degree colour-matching functions, 380 to 780 nm at 5 nm, as
  `[nm, x, y, z]` rows (CIE 018:2019 dataset, the data of CIE 015:2018).
- `wavelengthToLinear(nm)`: linear sRGB of a unit-power line at `nm`, unclipped (spectral colours
  lie outside sRGB, so a channel can be negative); black outside 380 to 780 nm.
- `spectrumLut()`: the 81 table wavelengths as linear RGB, a `Float32Array` of 243 floats.
- `blackbodyXyz(k)`: a blackbody's colour at `k` kelvin as XYZ with Y = 1.
- `pullToRamp(c, ramp, amount, target)`: mixes `c` in OKLab toward the ramp by `amount` 0..1 (0
  returns `c`). `target` `"nearest"` goes to the nearest ramp stop (keeps the palette's several
  colours); `"ground"` goes to the ground's hue at `c`'s own lightness (as `lights.key`'s `tint`).
- `GLSL_SPECTRUM`: the GPU side. `vec3 pk_spectrum(float nm)` (the table is baked into the chunk;
  nothing to bind) and `vec3 pk_pull(vec3 c, float amount, int target)` (target 1 ground, with
  the lightness held to 0..1; 0, or any other value, nearest), which reads the ramp uniforms the
  shade pass sets. Put it at the top of a material's
  `glsl`; an include guard keeps one copy when two slots carry it.

A page sets a material's pull amount and target, never calls these itself.

## Water GLSL

- `GLSL_WATER`: the water surface as a GLSL chunk; `fields.water` builds from it.
- `GLSL_WATER_OPTICS`: the water's refraction and caustic optics as a GLSL chunk.

Both are for a field or light of your own that must evaluate the water at a point.

## The debug hook: `window.__paint`

Installed by `paint`; the latest painter on a page owns it. The checks drive a page only through
this hook and the URL. A page without it can get no better than `partial`. Type: `PaintHook`.

- `ready`: false until the first frame is drawn.
- `setTime(t)`: freeze at t seconds; stateful fields replay from their seed.
- `setPointerPath(path | null)`: the path the eased pointer follows on a frozen page, in viewport
  fractions; null for the rest point.
- `setTilt([a, b] | null)`: hold the surface's tilt at `[a, b]` degrees (each -89 to 89, not held to `max`) at once,
  over the pointer, and redraw; null hands the tilt back to the eased pointer. Throws on a page with no `tilt` option.
  `tilt()`: the tilt as drawn now, `[0, 0]` on a page with no `tilt` option. `tiltOptions()`: the page's tilt option
  `{ max, drive }`, or null on a page with no `tilt` option.
- `setLight(i, props)`: change light i's props. `moveLight(i, 0 | 1)`: move it to a test position.
- `setPalette(tokens)`: set custom properties on the root and re-read the palette. `tokens()`:
  the palette's token names, or null.
- `setDetail(d)`. `detail()`: the detail dial as drawn now, 0 to 1 (`?detail=`, the page's `detail`, the
  default 0.5, or the last `setDetail`; 0 in the fallback). `setInk(on, source?)`: show or hide printed ink; with a source (`"text"` or
  `"picture"`) only that ink; anything else throws.
- `grain()`, `setGrain(g)`: read, or redraw with a different finish grain.
- `screen()`, `setScreen(on)`: whether the finish's halftone screen draws now, or show or hide it and redraw,
  keeping its options (nothing on a page without one). The detail check reads its shares with the screen off.
- `stats()`: `PaintStats`. `sheet()`: a 64 x 64 `SheetSample`. `sheetRegion(x, y, w, h)`: a region
  in CSS px at the sheet's full resolution.
- `laws()`: the laws the page declares. `lights()`: id, laws and props of each light as declared
  now, and `region` (`{ at, radius }` at the paint's current time) for a light that has one
  (`lights.ember`). `materials()`: id and laws of each material, by slot.
- `motion()`: `Motion`.
- `Motion`: `"live" | "still" | "paused"`: whether the loop runs, rests under reduced motion, or
  is paused (hidden tab or frozen).

## Lab pages, not gated

`test/pages/` holds one-rule sample pages. Each shows one rule. None is a bar, and `gate` does not run them: only vitest
files under `test/pages/` open them. Read one to see a rule at work. Do not copy one as a page.

- `blend.html`: the sheet's blend rule, with known values in each quadrant (height adds, coverage multiplies, ink takes
  the max, slot and direction overwrite).
- `rest-order.html`: slot and direction go to the last writer in field order, whether or not that writer also writes
  `rest`. `?order=RD` or `?order=DR` sets the order.
- `islands.html`: a grid of glossy discs with bare ground between them, so the page ground stays unlit where coverage
  is 0 and the highlight law must read the discs.
- `carry.html`: a surface moved by a known offset carries its fine texture with it (`rest` writers; `?mat=` picks paper,
  matte, denim or sheen).
- `ink-cases.html`: edge cases for `fields.text`: author colours, capitalised and uppercased text, and a
  `data-paint-ink` element the field's selector does not match.
- `lights-overhead.html`: a lamp straight above its aim, the geometry for the falloff law's widened fit.
