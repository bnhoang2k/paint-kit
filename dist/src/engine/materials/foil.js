import { TONE_GLSL, resolveTone, tonePosition } from "./tone.js";
/** Groove spacing range in um: holo film is sold at 500 to 1000 lines per mm (bars/10-foil-card/study.md, "The grating mechanism"). */
export const FOIL_SPACING = { min: 1.0, max: 2.0 };
/** Orders a foil may sum: 1 up to Stam's 7 (GPU Gems chapter 8). */
export const FOIL_ORDERS = { min: 1, max: 7, default: 2 };
/**
 * The default `roughness`: how far the grooves wander from straight and the film from flat, as the width of the lobe
 * along the grooves. Builder: 0.3 is `sheen`'s satin end, wide enough that a key light off the grooves' square still
 * finds colour on a laid-on foil (an ideal grating shows colour only exactly square to the light); no source gives it.
 */
export const FOIL_ROUGHNESS = 0.3;
/**
 * The film's grain, the fine structure the detail dial draws: laminated holo film is not glass-flat. Up close it shows
 * an orange-peel waviness from the board under it, and that waviness breaks a band of colour into a fine sparkle. It is
 * drawn as a micro-slope on the foil's normal, two seeded noises (one per slope axis, zero-mean) at the rest position,
 * scaled by `uDetail`: none at detail 0, so a point's colour there is its groove's and its tilt's alone.
 * - `cycles`: noise cycles per sheet texel, 1 / 3. Builder: features about 3 texels across, the size film's orange peel
 *   shows at on a card drawn a few hundred px wide (a few tenths of a mm); finer than sheen's brushing along the grain
 *   (0.015 cycles per texel), coarser than its 0.9 across, as the grain is round, not streaked.
 * - `slope`: the micro-slope at detail 1, 0.025. Builder: tipping the normal by s moves X.(l + v) by up to about
 *   1.8 s, so 0.025 moves it by up to 0.045, within one band's spread (`GRATING_SPREAD`, 0.05, which already counts the
 *   film's waviness). The sparkle then stays inside each band's colour family; it never jumps a pixel to another hue.
 *   Sheen's brush is 0.12, but a metal's white highlight can take that; a grating's hue would scatter across the
 *   spectrum (hue soup).
 */
export const FOIL_GRAIN = { cycles: 1 / 3, slope: 0.025 };
const bad = (what, v) => {
    throw new RangeError(`paint-kit: materials.foil ${what}, got ${String(v)}`);
};
export function foil(opts) {
    const spacing = opts.spacing;
    if (!(Number.isFinite(spacing) && spacing >= FOIL_SPACING.min && spacing <= FOIL_SPACING.max))
        bad(`spacing is the groove spacing in um, ${FOIL_SPACING.min} to ${FOIL_SPACING.max} (the range holo film is sold at)`, spacing);
    const orders = opts.orders ?? FOIL_ORDERS.default;
    if (!(Number.isInteger(orders) && orders >= FOIL_ORDERS.min && orders <= FOIL_ORDERS.max))
        bad(`orders is a whole number ${FOIL_ORDERS.min} to ${FOIL_ORDERS.max}`, orders);
    if (!(Number.isFinite(opts.pull) && opts.pull >= 0 && opts.pull <= 1))
        bad("pull is an amount 0..1", opts.pull);
    if (opts.pullTarget !== "nearest" && opts.pullTarget !== "ground")
        bad('pullTarget is "nearest" or "ground"', JSON.stringify(opts.pullTarget));
    const rough = opts.roughness ?? FOIL_ROUGHNESS;
    if (!(Number.isFinite(rough) && rough >= 0 && rough <= 1))
        bad("roughness is 0..1", rough);
    return {
        id: "foil",
        laws: ["iridescence", "highlight"],
        grating: true,
        uniforms: {
            // In nm, as the grating equation's wavelengths are.
            spacing: spacing * 1000,
            orders,
            pull: opts.pull,
            target: opts.pullTarget === "ground" ? 1 : 0,
            rough: Math.max(0.03, rough),
        },
        resolve: resolveTone(tonePosition(opts)),
        // The grating itself (and GLSL_SPECTRUM) is the shade pass's, compiled in because `grating` is set: the colour
        // depends on each light's direction, which a material does not see.
        glsl: TONE_GLSL +
            /* glsl */ `
uniform float u_$_spacing, u_$_orders, u_$_pull, u_$_target, u_$_rough;
MatOut mat_$(Surf s) {
  MatOut m = matBase(s, u_$_tone);
  // The film's grain (FOIL_GRAIN), by detail, at the rest position (it moves with the surface). Off at detail 0: the
  // normal is then the sheet's exactly.
  if (uDetail > 0.0) {
    float side = min(uSheetSize.x, uSheetSize.y);
    vec2 p = s.rest * side * ${FOIL_GRAIN.cycles.toFixed(6)};
    vec2 grain = vec2(snoise(p + uSeed * 0.37), snoise(p.yx + vec2(17.3, -9.1) + uSeed * 0.53)); // not-colour: noise offsets
    m.n = normalize(s.n + vec3(grain * ${FOIL_GRAIN.slope.toFixed(4)} * uDetail, 0.0)); // not-colour: a normal vector
  }
  // A metal returns most of its light in its highlight: its body is dim, as sheen's.
  bool inkDark = dot(uInk, vec3(0.2126, 0.7152, 0.0722)) < dot(u_$_tone, vec3(0.2126, 0.7152, 0.0722)); // not-colour: Rec. 709 luminance weights
  m.albedo = 0.6 * mixOklab(inkDark ? uInk : u_$_tone, inkDark ? u_$_tone : uInk, 0.3);
  m.spec = 0.9;
  m.rough = u_$_rough;
  m.aniso = 0.0;
  // The grooves run along the direction image; its length is the grating's share of the highlight (0: no grooves).
  m.tdir = s.dir;
#ifdef PK_FAULT_IRIDESCENCE_NO_GROOVE
  // The planted fault iridescence-no-groove (paint.ts TEST_FAULTS): the grooves ignore the direction image and all
  // run up the sheet, so every groove region shows one colour.
  m.tdir = vec2(0.0, 1.0); // not-colour: a groove direction
#endif
  m.grating = vec4(u_$_spacing, u_$_orders, u_$_pull, u_$_target); // not-colour: spacing nm, orders, pull, target
  m.diffract = s.dirLen;
  m = printInk(m, s, 0.0, s.dir);
  // Ink over foil: the ink covers the grating by its amount.
  m.diffract *= 1.0 - clamp(s.ink, 0.0, 1.0);
  return m;
}
`,
    };
}
