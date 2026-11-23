import type { PaintOptions, Painter } from "./types.ts";
export declare const MAX_DPR = 1.5;
/**
 * The test seam's planted faults. Each switches off exactly the one behaviour it names, so a check can be
 * shown to fail: `nofinish` the finish (grain, shoulder, dither), `nopalette` following the page's tokens,
 * `runs-hidden` the pause while hidden, `dpr3` the pixel-ratio cap, `nofallback` the fallback, and
 * `ignores-reduced` the stop under reduced motion, `detail-dead` the detail dial (fields and shade keep the
 * detail the page's code declares; `?detail=` and `setDetail` reach nothing), and `spec-fixed-light` the key's
 * highlight following the key (its specular lobe uses the key's declared direction, test position 0, not its
 * moved one; its diffuse light still moves); `stale-picture` switches off the fields' palette hook (a palette change only
 * re-shades: the halftone's function source is not called again, so its picture keeps the old tokens' tone);
 * `stateless-settle-ignored` reads settle times from stateful fields only, so a stateless timeline field's settle
 * time is dropped and reduced motion rests on its first live frame; `settle-tick-off` puts the settle time one tick
 * early, reported and rested on alike (an engine whose settle drifts while agreeing with itself);
 * `static-caustics` makes `lights.throughWater` draw a caustic baked once: read at t = 0 and laid at each pixel's own
 * point, not at the floor point seen through the water (an overlay), while the surface, its refraction of the
 * floor and its glints still move; `layer-at-floor` reads the water field's lifted layer at the floor's full depth,
 * not its own (the floor less its rise), so its outline ripples as the floor would ripple it; `picture-on-active-unit` uploads a material's picture on the active texture
 * unit (the sheet's) instead of its own, so the first draw after a new material object reads the picture as the
 * sheet and every later draw is right (the frame a reduced-motion user rests on is wrong); `rest-ignored` makes every
 * reader of the rest image (carried fields, the materials' texture) read the screen position while rest writers
 * still write, so a moved surface slides under a texture pinned to the screen; `rest-ignored-<material>` (paper,
 * matte, denim, sheen) does that for the one material's texture only (it reads `s.q` for `s.rest`), while the
 * carried fields and every other material still read the rest position; `detail-tone-shift` restores the matte and
 * paper materials' old dial-driven colour variation, which was not zero-mean (matte mixed toward ramp stop 1 by
 * `detail * 0.1 * v` with v in 0..1, paper by `detail * (0.05 + 0.04 * f0)`), so raising the dial moved the page's mean
 * tone as well as its fine structure (Phase 2 Task 2c); `tone-read-once` resolves the materials against the ramp
 * (their `resolve`: the engine materials' `tone`) once, when they are first drawn, and never again when the ramp
 * rebuilds, so after a palette change every material keeps the colour its tone had under the old tokens while the
 * lights, the ink and the bare ground follow the new ones (Phase 2 Task 6). The shadow faults (Phase 2 Task 7), each on
 * the light that casts: `shadow-baked` casts the shadow from the light's declared place (its test position 0) and
 * holds it there, as a shadow painted into the colour would stay, while the light's own shading still moves;
 * `shadow-same-side` runs the shadow march away from the light (the offset's sign flipped), so the shadow falls on
 * the light's side; `shadow-spec-only` lets the shadow attenuate only the light's highlight, not its diffuse light;
 * `shadow-reads-ink` makes the march read the sheet's ink channel as height, so printed text casts a shadow;
 * `shadow-ground-leak` darkens the bare ground (coverage 0) by the shadow with `shadow.ground` off, so a card on
 * the bare ground casts a shadow the page never asked for.
 * `halftone-lit-fixed` (Phase 2 Task 8) sizes the halftone screen's dots (`finish.halftone`) from the colour before
 * light (the unlit albedo on its ground) while they still print the lit colour, so the dots keep their size whatever
 * the light does: a screen before light dressed as one after it.
 * The tilt faults (Phase 2 Task 11; Task 16): `tilt-surface-fixed` keeps the shade pass's surface unturned (its tilt
 * the identity) on a page that tilts, while `tilt()` still reports the tilt, so the surface never looks turned;
 * `tilt-leave-snaps` puts the tilt at rest the moment the pointer leaves the canvas, instead of easing it there.
 * The iridescence faults (Phase 2 Task 14), each in the foil's grating (glsl/grating.ts, materials/foil.ts):
 * `iridescence-clock` cycles each band's wavelength on the paint clock, a Polychrome-style hue cycle on time;
 * `iridescence-pointer-x` replaces the grating's colour with a rainbow keyed to the engine pointer's x and the pixel's
 * place across the canvas, with no light direction, view or groove in it; `iridescence-no-groove` runs every groove up
 * the sheet whatever the direction image says, so the foil's colour ignores the groove direction;
 * `iridescence-white` flattens each grating band to its own luminance with the same lobe: a groove-aware white
 * highlight, as a metal brushed along the grooves gives, with no colour from the grating; `iridescence-flat-normal`
 * takes the grooves' frame (and so the grating's u) from the flat sheet, ignoring the surface normal;
 * `iridescence-place-hue` adds to each band's centre wavelength an offset that ramps with the pixel's x across the
 * canvas (glsl/grating.ts PLACE_HUE_SLOPE), so foil of one groove and u shows another colour at another place.
 * The film faults (Phase 2 Task 18), in the film's lobe (glsl/film.ts) and its material (materials/film.ts):
 * `film-place-hue` adds to the OPD an offset that ramps with the pixel's x (glsl/film.ts `filmPlaceHueSlope`);
 * `film-clock` cycles the OPD on the paint clock, 120 nm a second; `film-no-thickness` sets the thickness to the range's
 * middle and ignores `param`; `film-no-angle` takes no angle, so the colour comes from `param` alone;
 * `film-view-normal` reads n.v in place of v.h.
 */
export declare const TEST_FAULTS: readonly ["nofinish", "nopalette", "runs-hidden", "dpr3", "nofallback", "ignores-reduced", "detail-dead", "spec-fixed-light", "stale-picture", "stateless-settle-ignored", "settle-tick-off", "static-caustics", "layer-at-floor", "picture-on-active-unit", "rest-ignored", "rest-ignored-paper", "rest-ignored-matte", "rest-ignored-denim", "rest-ignored-sheen", "detail-tone-shift", "tone-read-once", "shadow-baked", "shadow-same-side", "shadow-spec-only", "shadow-reads-ink", "shadow-ground-leak", "halftone-lit-fixed", "tilt-surface-fixed", "tilt-leave-snaps", "iridescence-clock", "iridescence-pointer-x", "iridescence-no-groove", "iridescence-white", "iridescence-flat-normal", "iridescence-place-hue", "film-place-hue", "film-clock", "film-no-thickness", "film-no-angle", "film-view-normal"];
export type TestFault = (typeof TEST_FAULTS)[number];
export declare function paint(canvas: HTMLCanvasElement, opts: PaintOptions): Painter;
