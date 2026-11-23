// `ember`: the light of a burning front (`fields.burn`). The front glows in heat colour and lights the paper within
// `reach` of it, on both sides: the paper ahead, and the scorch band behind it (where the paper is still light, so the
// light reads as an orange rim that fades into the char), but not the hole, where the paper is gone. It is strongest
// at the front and falls smoothly to exactly 0 at `reach`, as `lights.glow` does (the same (1 - r^2)^2 shape).
//
// Colour: blackbody colour from `kelvinToLinear`, the hot core's at the front cooling to the edge's at `reach`, each
// pulled toward the page's ramp by `pull` (`pullToRamp`, to the nearest stop) and scaled to luminance 1. So the
// colour is hue only, and how bright the glow is comes from `level` alone. Its law is tint.
//
// Rim: `rim` adds a thin, hot line on the hole's edge. It is light the burning edge gives off, so it does not depend on the
// char's albedo, which is near 0 there. Its width and strength swell and break along the edge. Specks: `specks` adds small
// glowing points on the bare ground behind the front; each cools and rises until the front has moved the burn's `linger`
// past it. Both scale with `level`, so an ember at level 0 gives no light at all.
//
// The tint law reads a light by a circle. The ember lights a band along the whole front, so `region(t)` gives the
// circle that holds every pixel it lights at t: centred on the front's middle, with the radius to the band's far
// corners (a bottom burn) or the front's radius plus the reach (a burn from a point).
import { kelvinToLinear, type Ramp, type Vec3 } from "../palette.ts";
import { pullToRamp } from "../spectrum.ts";
import type { BurnField } from "../fields/burn.ts";
import type { Light, Uniforms } from "../types.ts";

export type EmberOptions = {
  /** The burn whose front glows. It must be in the page's fields. */
  field: BurnField;
  /** Kelvin at the edge of the glow (at `reach`) and at its hot core (the front). Each at least 798 (the Draper point). */
  kelvin: [number, number];
  /** How much the glow adds to a white surface at the front. */
  level: number;
  /** How far the glow reaches from the front, short-side units. */
  reach: number;
  /**
   * 0..1, how far the heat colour is pulled toward the page's nearest ramp stop. Default 0.25. Builder: enough to lean
   * the orange into the page's palette while a dull red still reads as heat; picked before any check ran.
   */
  pull?: number;
  /**
   * Short-side units: the width of the band the glow lights across the sheet, centred on the page. Default the
   * sheet's width. A card narrower than the page sets its own width, so the tint law's circle (`region`) holds the
   * lit band and no more: with the page's width the circle would hold the whole frame and the law could not read what
   * lies beyond it. It sets that circle only and clips no light, so it must cover all the page's paper.
   */
  span?: number;
  /** A thin, hot line on the hole's edge. Unset, there is none. */
  rim?: EmberRim;
  /** Glowing specks on the bare ground behind the front. They need the burn's `linger`. Unset, there are none. */
  specks?: EmberSpecks;
};

export type EmberRim = {
  /** The line's width, short-side units, above 0. */
  width: number;
  /** How much brighter than `level` the line is, above 0. */
  gain: number;
  /** Kelvin at the line's outer edge and at its hot core. Each at least 798. */
  kelvin: [number, number];
};

export type EmberSpecks = {
  /** How much brighter than `level` a speck is, above 0. */
  gain: number;
  /** 0..1: the share of grid cells that hold a speck at detail 1. Specks are fine structure: detail 0 keeps `SPECK_DETAIL_FLOOR` of them. */
  density: number;
  /** Half the width and height of the area that held paper, short-side units about the page centre. No speck starts outside it. */
  box: [number, number];
  /** Kelvin of a cooling speck and of a fresh one. Each at least 798. */
  kelvin: [number, number];
};

/** The specks' grid cell, short-side units. Builder: a speck every 10 px or so at a 600 px short side, as in the reference. */
const SPECK_CELL = 0.018;
/** A speck's radius, short-side units. Builder: about a pixel at a 600 px short side. */
const SPECK_RADIUS = 0.0013;
/** The share of the specks that stay at detail 0. Builder: enough to read as embers on a flat page. */
const SPECK_DETAIL_FLOOR = 0.35;
/** How far a speck rises before it goes out, short-side units. Under one cell, so the 3 x 3 search still finds it. */
const SPECK_RISE = 0.014;

const DRAPER = 798;
const PULL = 0.25;
const luminanceOf = (c: Vec3) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/** Heat colour at `k` kelvin, pulled toward the ramp by `pull` and scaled to luminance 1. */
export function emberColour(k: number, ramp: Ramp, pull: number): Vec3 {
  const c = pullToRamp(kelvinToLinear(k), ramp, pull, "nearest");
  const y = luminanceOf(c);
  return y > 0 ? (c.map((v) => v / y) as Vec3) : c;
}

/** The circle holding every pixel the ember lights at `t`, in the glow's frame: `at` page fractions, `radius` short-side units. */
export function emberRegion(field: BurnField, reach: number, t: number, span?: number, behind?: number): { at: [number, number]; radius: number } {
  const s = field.size() ?? { w: 1, h: 1 };
  const short = Math.min(s.w, s.h);
  const sc = [s.w / short, s.h / short] as const;
  const rag = field.maxShift;
  const d = field.front(t);
  const from = field.opts.from;
  if (from !== "bottom") return { at: [from[0], from[1]], radius: Math.max(reach, d + reach) + rag };
  // A bottom burn: the lit band runs from the hole's edge (or reach behind the front) to reach ahead, across the sheet.
  const lo = Math.min(sc[1], Math.max(0, d - (behind ?? Math.min(reach, field.band)) - rag));
  const hi = Math.min(sc[1], Math.max(0, d + reach + rag));
  const mid = (lo + hi) / 2;
  return { at: [0.5, 1 - mid / sc[1]], radius: Math.hypot(Math.min(sc[0], span ?? sc[0]) / 2, (hi - lo) / 2) };
}

const RIM_UNIFORMS = /* glsl */ `
uniform vec3 u_$_rimEdge, u_$_rimCore;
uniform float u_$_rimWidth, u_$_rimGain;
`;

// e: distance from the hole's edge in rim widths, 0 on the edge. The noise swells the line and breaks it, and drifts with
// the front, so the line works along the edge instead of sitting still. Added as spec: the light is the edge's own.
const RIM_GLSL = /* glsl */ `
  float e = (a - (pkBurnD - pkBurnBand)) / u_$_rimWidth;
  if (e > -1.0 && e < 4.0) {
    float n = 0.5 + 0.5 * snoise(s.q * 19.0 + vec2(uSeed * 0.37, pkBurnD * 7.0));
    float w = 0.6 + 1.1 * n;
    float g = exp(-2.0 * (e / w) * (e / w)) * (0.3 + 0.7 * smoothstep(0.2, 0.75, n));
    r.spec += mix(u_$_rimCore, u_$_rimEdge, clamp(abs(e) / w, 0.0, 1.0)) * (u_$_level * u_$_rimGain * g);
  }
`;

// One speck per chosen grid cell. A speck lights when the hole's edge has passed its cell, then cools and rises until the
// front has moved `linger` further. Only bare ground shows them: a speck over paper is hidden by (1 - coverage).
const SPECKS_GLSL = /* glsl */ `
uniform vec3 u_$_speckEdge, u_$_speckCore;
uniform float u_$_speckGain, u_$_speckDensity;
uniform vec2 u_$_speckBox;
void specks_$(Surf s, float a) {
  if (s.coverage >= 1.0 || a > pkBurnD + ${SPECK_CELL.toFixed(4)}) return;
  vec2 id0 = floor(s.q / ${SPECK_CELL.toFixed(4)});
  vec3 sum = vec3(0.0); // not-colour: empty light sum
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 id = id0 + vec2(float(x), float(y));
    vec2 h = hash22(id + uSeed * 0.73);
    if (h.x > u_$_speckDensity * mix(${SPECK_DETAIL_FLOOR.toFixed(2)}, 1.0, uDetail)) continue;
    vec2 h2 = hash22(id * 1.7 + uSeed * 1.31 + 5.0);
    vec2 c = (id + 0.5 + (h2 - 0.5) * 0.8) * ${SPECK_CELL.toFixed(4)};
    if (abs(c.x) > u_$_speckBox.x || abs(c.y) > u_$_speckBox.y) continue;
    float age = (pkBurnD - pkBurnBand - pkBurnCoarse(c, uSheetSize)) / pkBurnLinger;
    if (age < 0.0 || age >= 1.0) continue;
    vec2 p = c + vec2((h.y - 0.5) * ${SPECK_RISE.toFixed(4)} * age, ${SPECK_RISE.toFixed(4)} * age);
    float d = length(s.q - p) / (${SPECK_RADIUS.toFixed(4)} * (0.6 + 0.9 * h2.x));
    float flick = 0.6 + 0.4 * sin(pkBurnD * (30.0 + 40.0 * h2.y) + h.y * 6.283);
    float cool = (1.0 - age) * (1.0 - age);
    sum += mix(u_$_speckEdge, u_$_speckCore, cool) * exp(-d * d) * flick * cool;
  }
  pkEmit += sum * (u_$_level * u_$_speckGain * (1.0 - s.coverage));
}
`;

export function ember(opts: EmberOptions): Light {
  const { field, kelvin, level, reach } = opts;
  if (!(Array.isArray(kelvin) && kelvin.length === 2 && kelvin.every((k) => Number.isFinite(k) && k >= DRAPER)))
    throw new RangeError(`paint-kit: ember kelvin is [edge, core], each at least ${DRAPER}, got ${JSON.stringify(kelvin)}`);
  if (!(Number.isFinite(reach) && reach > 0)) throw new RangeError(`paint-kit: ember reach is above 0, got ${reach}`);
  const hot = (name: string, k: unknown) => {
    if (!(Array.isArray(k) && k.length === 2 && k.every((v) => Number.isFinite(v) && v >= DRAPER))) throw new RangeError(`paint-kit: ember ${name} kelvin is [edge, core], each at least ${DRAPER}, got ${JSON.stringify(k)}`);
  };
  const { rim, specks } = opts;
  if (rim) {
    if (!(Number.isFinite(rim.width) && rim.width > 0)) throw new RangeError(`paint-kit: ember rim width is above 0, got ${rim.width}`);
    if (!(Number.isFinite(rim.gain) && rim.gain > 0)) throw new RangeError(`paint-kit: ember rim gain is above 0, got ${rim.gain}`);
    hot("rim", rim.kelvin);
  }
  if (specks) {
    if (!(Number.isFinite(specks.gain) && specks.gain > 0)) throw new RangeError(`paint-kit: ember specks gain is above 0, got ${specks.gain}`);
    if (!(Number.isFinite(specks.density) && specks.density > 0 && specks.density <= 1)) throw new RangeError(`paint-kit: ember specks density is above 0 and at most 1, got ${specks.density}`);
    hot("specks", specks.kelvin);
    if (!(Array.isArray(specks.box) && specks.box.length === 2 && specks.box.every((v) => Number.isFinite(v) && v > 0))) throw new RangeError(`paint-kit: ember specks box is [half width, half height], each above 0, got ${JSON.stringify(specks.box)}`);
    if (!(field.linger > 0)) throw new RangeError("paint-kit: ember specks need the burn's linger above 0");
  }
  const pull = Math.min(1, Math.max(0, opts.pull ?? PULL));
  // Props hold the settings only: the field is not plain data (the hook clones props), so `with` carries it.
  if (opts.span !== undefined && !(Number.isFinite(opts.span) && opts.span > 0)) throw new RangeError(`paint-kit: ember span is above 0, got ${opts.span}`);
  const props = { kelvin: [kelvin[0], kelvin[1]], level, reach, pull, ...(opts.span !== undefined ? { span: opts.span } : {}), ...(rim ? { rim } : {}), ...(specks ? { specks } : {}) };
  // How far behind the front this ember lights: the hole's edge for a rim, the last ember for specks.
  const behind = specks ? field.band + field.linger + SPECK_RISE : rim ? field.band + rim.width : undefined;
  const extra = { ...(rim ? { rimWidth: rim.width, rimGain: rim.gain } : {}), ...(specks ? { speckGain: specks.gain, speckDensity: specks.density, speckBox: specks.box } : {}) };
  return {
    id: "ember",
    laws: ["tint"],
    props,
    ...(specks ? { emits: true } : {}),
    uniforms: { level, reach: Math.max(reach, 1e-4), edge: [1, 1, 1], core: [1, 1, 1], ...extra, ...(rim ? { rimEdge: [1, 1, 1], rimCore: [1, 1, 1] } : {}), ...(specks ? { speckEdge: [1, 1, 1], speckCore: [1, 1, 1] } : {}) },
    // The engine takes a light's resolved uniforms in place of `uniforms` (paint.ts resolveLights), so all of them.
    resolve: (ramp): Uniforms => ({
      level,
      reach: Math.max(reach, 1e-4),
      edge: emberColour(kelvin[0], ramp, pull),
      core: emberColour(kelvin[1], ramp, pull),
      ...extra,
      ...(rim ? { rimEdge: emberColour(rim.kelvin[0], ramp, pull), rimCore: emberColour(rim.kelvin[1], ramp, pull) } : {}),
      ...(specks ? { speckEdge: emberColour(specks.kelvin[0], ramp, pull), speckCore: emberColour(specks.kelvin[1], ramp, pull) } : {}),
    }),
    with: (p) => ember({ ...opts, ...(p as Partial<EmberOptions>), field }),
    region: (t) => emberRegion(field, reach, t, opts.span, behind),
    glsl: /* glsl */ `
uniform vec3 u_$_edge, u_$_core;
uniform float u_$_level, u_$_reach;
${rim ? RIM_UNIFORMS : ""}${specks ? SPECKS_GLSL : ""}
LightSum light_$(Surf s, MatOut m) {
  float a = pkBurnArrival(s.q, uSheetSize);
  // Distance from the front, and nothing in the hole (the paper is gone there).
  float k = abs(a - pkBurnD) / u_$_reach;
  float f = a > pkBurnD - pkBurnBand && k < 1.0 ? (1.0 - k * k) * (1.0 - k * k) : 0.0;
  LightSum r;
  r.diffuse = mix(u_$_core, u_$_edge, min(k, 1.0)) * (u_$_level * f);
  r.spec = vec3(0.0); // not-colour: an ember has no highlight
${rim ? RIM_GLSL : ""}${specks ? "  specks_$(s, a);\n" : ""}  return r;
}
`,
  };
}
