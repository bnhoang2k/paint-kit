// The colour layer. Every colour the engine paints comes through here, from the page's CSS tokens.
// All colours are linear sRGB triples. Mixing happens in OKLab; gamut clipping reduces OKLCH chroma
// at fixed lightness and hue, so a vivid token never clips to a wrong hue.
// OKLab matrices: Björn Ottosson, "A perceptual color space for image processing" (2020),
// ported from lab/2026-11-wild-sampler/lib.js.

import { blackbodyXyz } from "./spectrum.ts";

export type Vec3 = [number, number, number];

export type Ramp = {
  ground: Vec3;
  ink: Vec3;
  /** Stop 0 is the ground, stop 4 the ink, stops 1 to 3 the accents by lightness. */
  stops: [Vec3, Vec3, Vec3, Vec3, Vec3];
};

export type PaletteSource = {
  /** Reads the tokens as the browser resolves them now, and builds the ramp. */
  read(): Ramp;
  /** Calls `onChange` when the colour scheme or the `style`/`class` of `<html>` or `<body>` changes. Returns the unsubscribe. */
  watch(onChange: () => void): () => void;
  /**
   * The custom property names this source reads, as `--name` (`fromPage` sets it). `__paint.tokens()` lists them, so
   * the palette check can swap every token, accents included, on a page with no bar.
   */
  readonly tokens?: PaletteTokens;
};

/** A palette's token names, each a custom property name `--name`. */
export type PaletteTokens = { ground: string; ink: string; accents: string[] };

export type PaletteSpec = {
  /** Custom property names, as `--name` or `var(--name)`. */
  ground: string;
  ink: string;
  accents?: string[];
};

// Linear channels may sit this far outside [0, 1] and still count as in gamut (then they are clamped).
const GAMUT_EPS = 1e-5;
// Halvings of chroma in the gamut search: 0.4 / 2^30 is far below one 8-bit level.
const GAMUT_STEPS = 30;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const inGamut = (c: Vec3) => c.every((v) => v >= -GAMUT_EPS && v <= 1 + GAMUT_EPS);
const clampVec = (c: Vec3): Vec3 => [clamp01(c[0]), clamp01(c[1]), clamp01(c[2])];

const linearToSrgb = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
/** A linear sRGB colour as a CSS `rgb()` string (channels clipped, 0..255 with decimals): what the browser paints. */
export function linearToCss(c: Vec3): string {
  const [r, g, b] = clampVec(c).map((v) => Number((255 * linearToSrgb(v)).toFixed(3)));
  return `rgb(${r} ${g} ${b})`;
}

/** A ramp as CSS colour strings: ground, ink and the five stops (`FieldContext.colours`). */
export function rampColours(r: Ramp): { ground: string; ink: string; stops: string[] } {
  return { ground: linearToCss(r.ground), ink: linearToCss(r.ink), stops: r.stops.map(linearToCss) };
}

function srgbToLinear(v: number): number {
  const a = Math.abs(v);
  const l = a <= 0.04045 ? a / 12.92 : ((a + 0.055) / 1.055) ** 2.4;
  return Math.sign(v) * l;
}

export function linearToOklab(c: Vec3): Vec3 {
  const l = Math.cbrt(0.4122214708 * c[0] + 0.5363325363 * c[1] + 0.0514459929 * c[2]);
  const m = Math.cbrt(0.2119034982 * c[0] + 0.6806995451 * c[1] + 0.1073969566 * c[2]);
  const s = Math.cbrt(0.0883024619 * c[0] + 0.2817188376 * c[1] + 0.6299787005 * c[2]);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab to linear sRGB, unclipped. */
function oklabToLinearRaw(L: number, a: number, b: number): Vec3 {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function oklchToLinearRaw(L: number, C: number, hDeg: number): Vec3 {
  const h = (hDeg * Math.PI) / 180;
  return oklabToLinearRaw(L, C * Math.cos(h), C * Math.sin(h));
}

/** OKLCH (L 0..1, C, h in degrees) to linear sRGB, pulled into gamut by reducing chroma. */
export function oklchToLinear(L: number, C: number, h: number): Vec3 {
  const l = clamp01(L);
  const c = Math.max(0, C);
  const raw = oklchToLinearRaw(l, c, h);
  if (inGamut(raw)) return clampVec(raw);
  let lo = 0;
  let hi = c;
  for (let i = 0; i < GAMUT_STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToLinearRaw(l, mid, h))) lo = mid;
    else hi = mid;
  }
  return clampVec(oklchToLinearRaw(l, lo, h));
}

/** Linear sRGB to OKLCH: `[L, C, h]`, h in degrees in [0, 360). */
export function linearToOklch(c: Vec3): Vec3 {
  const [L, a, b] = linearToOklab(c);
  const h = (Math.atan2(b, a) * 180) / Math.PI;
  return [L, Math.hypot(a, b), h < 0 ? h + 360 : h];
}

/** Brings any linear triple into sRGB gamut by chroma reduction. In-gamut input comes back clamped only. */
function toGamut(c: Vec3): Vec3 {
  if (inGamut(c)) return clampVec(c);
  const [L, C, h] = linearToOklch(c);
  return oklchToLinear(L, C, h);
}

/**
 * Mixes two linear colours in OKLab: `t` 0 gives `a`, 1 gives `b`. The result is pulled into gamut by
 * chroma reduction. GLSL `mixOklab` (in `GLSL_OKLAB`) does not reduce chroma and clamps negative LMS, so
 * vivid mixes differ slightly between CPU and GPU: never compare CPU and GPU ramps for exact equality.
 */
export function mixOklab(a: Vec3, b: Vec3, t: number): Vec3 {
  const p = linearToOklab(a);
  const q = linearToOklab(b);
  return toGamut(oklabToLinearRaw(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t));
}

/** Tints a computed colour (a lamp's kelvin, a glow) toward a palette colour by `amount` 0..1, in OKLab. */
export function tintToward(c: Vec3, target: Vec3, amount: number): Vec3 {
  return mixOklab(c, target, clamp01(amount));
}

/** CIE xy of a Planckian radiator at `t` kelvin (1667..25000): Kang et al. (2002) cubic fit of the Planckian locus. */
function planckianXy(t: number): [number, number] {
  const t1 = 1e3 / t;
  const x =
    t <= 4000
      ? -0.2661239 * t1 ** 3 - 0.2343589 * t1 ** 2 + 0.8776956 * t1 + 0.17991
      : -3.0258469 * t1 ** 3 + 2.1070379 * t1 ** 2 + 0.2226347 * t1 + 0.24039;
  const y =
    t <= 2222
      ? -1.1063814 * x ** 3 - 1.3481102 * x ** 2 + 2.18555832 * x - 0.20219683
      : t <= 4000
        ? -0.9549476 * x ** 3 - 1.37418593 * x ** 2 + 2.09137015 * x - 0.16748867
        : 3.081758 * x ** 3 - 5.8733867 * x ** 2 + 3.75112997 * x - 0.37001483;
  return [x, y];
}

/** CIE xy of CIE daylight at `t` kelvin (4000..25000), the locus D50 and D65 sit on. */
function daylightXy(t: number): [number, number] {
  const t1 = 1e3 / t;
  const x =
    t <= 7000
      ? -4.607 * t1 ** 3 + 2.9678 * t1 ** 2 + 0.09911 * t1 + 0.244063
      : -2.0064 * t1 ** 3 + 1.9018 * t1 ** 2 + 0.24748 * t1 + 0.23704;
  return [x, -3 * x * x + 2.87 * x - 0.275];
}

/**
 * CIE XYZ (D65 white) to linear sRGB, unclipped: the sRGB matrix from the IEC 61966-2-1 primaries. A colour outside
 * sRGB comes back with a channel below 0 or above 1.
 */
export function xyzToLinear(c: Vec3): Vec3 {
  const [X, Y, Z] = c;
  return [
    3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z,
    -0.969266 * X + 1.8760108 * Y + 0.041556 * Z,
    0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z,
  ];
}

/**
 * The colour of light at `k` kelvin, as linear sRGB with its largest channel at 1 (input clamped to 798..25000).
 * It gives only the hue: how bright a light or a glow is comes from its own level, never from this colour.
 * - 798 K (the Draper point, where a dull red glow first shows) to below 1667 K: a Planckian radiator, Planck's
 *   law summed against the CIE 1931 2-degree observer (`blackbodyXyz` in spectrum.ts).
 * - 1667 K up, bit for bit as before the extension: an approximation of the CIE reference-illuminant convention
 *   (CIE 224:2017), a Planckian radiator below 4000 K (Kang et al.'s fit), CIE daylight above 5000 K, and between
 *   them a linear blend of the two chromaticities in xy (CIE blends the spectra; this blends xy). So 6504 K is D65,
 *   the sRGB reference illuminant, as a designer expects.
 * At 1667 K the two methods meet within OKLab 0.0005 (measured; test/unit/palette.test.ts holds it under 0.01).
 * Below 1904 K the colour lies outside sRGB (blue below 0); a negative channel is clipped to 0 before the scaling.
 */
export function kelvinToLinear(k: number): Vec3 {
  const t = Math.min(25000, Math.max(798, k));
  let xyz: Vec3;
  if (t < 1667) {
    xyz = blackbodyXyz(t);
  } else {
    const w = Math.min(1, Math.max(0, (t - 4000) / 1000));
    const p = planckianXy(t);
    const d = w > 0 ? daylightXy(t) : p;
    const x = p[0] + (d[0] - p[0]) * w;
    const y = p[1] + (d[1] - p[1]) * w;
    // xyY with Y = 1 to XYZ.
    xyz = [x / y, 1, (1 - x - y) / y];
  }
  const rgb = xyzToLinear(xyz).map((v) => Math.max(0, v)) as Vec3;
  const max = Math.max(...rgb);
  return [rgb[0] / max, rgb[1] / max, rgb[2] / max];
}

/**
 * Builds the 5-stop ramp. Accents (at most 3) are sorted by OKLab lightness from the ground's end to the
 * ink's end and placed at stops 1..3 (one accent: stop 2; two: stops 1 and 3). Empty stops are OKLab mixes
 * of their nearest filled neighbours, by position.
 */
export function buildRamp(ground: Vec3, ink: Vec3, accents: Vec3[]): Ramp {
  if (accents.length > 3) throw new RangeError(`buildRamp takes at most 3 accents, got ${accents.length}`);
  const lg = linearToOklab(ground)[0];
  const li = linearToOklab(ink)[0];
  const dir = li >= lg ? 1 : -1;
  const sorted = accents
    .map((c) => ({ c, l: linearToOklab(c)[0] }))
    .sort((p, q) => dir * (p.l - q.l))
    .map((p) => [...p.c] as Vec3);
  const slots: (Vec3 | undefined)[] = [[...ground], undefined, undefined, undefined, [...ink]];
  const places = sorted.length === 1 ? [2] : sorted.length === 2 ? [1, 3] : [1, 2, 3];
  sorted.forEach((c, i) => (slots[places[i]!] = c));
  const filled = slots.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
  const stops = slots.map((s, i) => {
    if (s) return s;
    const lo = Math.max(...filled.filter((j) => j < i));
    const hi = Math.min(...filled.filter((j) => j > i));
    return mixOklab(slots[lo]!, slots[hi]!, (i - lo) / (hi - lo));
  }) as Ramp["stops"];
  return { ground: [...ground], ink: [...ink], stops };
}

/**
 * A position on the ramp as a linear colour: the CPU side of the GLSL `ramp(t)`. `t` 0 is the ground (stop 0), 1
 * the ink (stop 4), and between them the five stops are spaced evenly, each pair mixed in OKLab (`mixOklab`). A
 * position on a stop (0, 0.25, 0.5, 0.75, 1) returns a copy of that stop exactly, so position 0 is the ground to the
 * bit. `t` is clamped to 0..1; a non-finite `t` throws. The one place a ramp position becomes a colour on the CPU
 * (a material's `tone`, a halftone's ground): between stops it can differ slightly from the GPU's `ramp()`, which
 * does not reduce chroma (see `mixOklab`).
 */
export function rampAt(r: Ramp, t: number): Vec3 {
  if (!Number.isFinite(t)) throw new RangeError(`rampAt: the ramp position must be a number 0..1, got ${t}`);
  const x = clamp01(t) * 4;
  const i = Math.min(Math.floor(x), 3);
  const f = x - i;
  if (f === 0) return [...r.stops[i]!];
  if (f === 1) return [...r.stops[i + 1]!];
  return mixOklab(r.stops[i]!, r.stops[i + 1]!, f);
}

/**
 * The ramp stop next to position `t` that lies farther from `rampAt(r, t)` in OKLab: what a surface at `t` varies
 * toward (a material's fine colour variation), so the variation never collapses because `t` sits on a fixed stop.
 * The candidates are the stops on either side of `t` (on a stop, its neighbours; between two stops, those two). Ties
 * go to the stop toward the ink. At `t` 0 the only neighbour is stop 1, so the ground varies toward stop 1, as every
 * material did before tones. Returns a copy; `t` as `rampAt`.
 */
export function rampAway(r: Ramp, t: number): Vec3 {
  const at = rampAt(r, t);
  const x = clamp01(t) * 4;
  const lo = Number.isInteger(x) ? x - 1 : Math.floor(x);
  const hi = Number.isInteger(x) ? x + 1 : Math.ceil(x);
  const candidates = [lo, hi].filter((i) => i >= 0 && i <= 4);
  const p = linearToOklab(at);
  const dist = (i: number) => {
    const q = linearToOklab(r.stops[i]!);
    return Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
  };
  const far = candidates.reduce((best, i) => (dist(i) >= dist(best) ? i : best));
  return [...r.stops[far]!];
}

function num(tok: string | undefined, pctScale: number): number {
  if (tok === undefined || tok === "none") return 0;
  if (tok.endsWith("%")) return (parseFloat(tok) / 100) * pctScale;
  return parseFloat(tok);
}

function hue(tok: string | undefined): number {
  if (tok === undefined || tok === "none") return 0;
  const v = parseFloat(tok);
  if (tok.endsWith("grad")) return v * 0.9;
  if (tok.endsWith("rad")) return (v * 180) / Math.PI;
  if (tok.endsWith("turn")) return v * 360;
  return v;
}

/** Parses a computed colour to linear sRGB plus alpha. See `parseCssColor`. */
function parseCss(computed: string): { rgb: Vec3; alpha: number } {
  const m = /^([a-z-]+)\((.*)\)$/s.exec(computed.trim().toLowerCase());
  if (!m) throw new Error(`parseCssColor: unsupported colour "${computed}"`);
  const fn = m[1]!;
  // Alpha follows "/" (space form) or is the fourth comma value (legacy form).
  const [body, slashAlpha] = m[2]!.split("/");
  const args = body!.split(/[\s,]+/).filter(Boolean);
  let alpha = 1;
  const alphaTok = slashAlpha?.trim() ?? (fn !== "color" && body!.includes(",") ? args[3] : undefined);
  if (alphaTok !== undefined && alphaTok !== "none") alpha = num(alphaTok, 1);
  // Out-of-gamut values are clipped per channel, as Chromium paints them (not chroma-reduced).
  let raw: Vec3;
  if (/^rgba?$/.test(fn)) {
    raw = [0, 1, 2].map((i) => srgbToLinear(num(args[i], 255) / 255)) as Vec3;
  } else if (fn === "color") {
    const [space, ...ch] = args;
    const v = [0, 1, 2].map((i) => num(ch[i], 1)) as Vec3;
    if (space === "srgb") raw = v.map(srgbToLinear) as Vec3;
    else if (space === "srgb-linear") raw = v;
    else throw new Error(`parseCssColor: unsupported colour space "${space}" in "${computed}"`);
  } else if (fn === "oklch") {
    raw = oklchToLinearRaw(clamp01(num(args[0], 1)), Math.max(0, num(args[1], 0.4)), hue(args[2]));
  } else if (fn === "oklab") {
    raw = oklabToLinearRaw(clamp01(num(args[0], 1)), num(args[1], 0.4), num(args[2], 0.4));
  } else {
    throw new Error(`parseCssColor: unsupported colour "${computed}"`);
  }
  return { rgb: clampVec(raw), alpha };
}

/**
 * Parses a colour as `getComputedStyle` returns it, to linear sRGB, matching what the browser paints:
 * out-of-gamut values are clipped per channel (unlike `oklchToLinear` and `mixOklab`, which reduce chroma).
 * Alpha is dropped. Forms: the legacy and space-separated sRGB function with or without alpha,
 * `color(srgb ...)`, `color(srgb-linear ...)`, `oklch()` and `oklab()`. Anything else throws.
 */
export function parseCssColor(computed: string): Vec3 {
  return parseCss(computed).rgb;
}

function propertyName(token: string): string {
  const t = token.trim();
  const m = /^(?:var\(\s*)?(--[\w-]+)\s*\)?$/.exec(t);
  if (!m || t.startsWith("var(") !== t.endsWith(")")) {
    throw new Error(`fromPage: "${token}" is not a CSS custom property; name a page token as --name`);
  }
  return m[1]!;
}

type Resolved = { name: string; raw: string; computed: string };

/**
 * A palette read from the page's CSS custom properties. Each token is resolved by a hidden probe inside
 * `el` (default `<body>`), so `var()` chains and named colours come out as the browser paints them.
 * On `read()`, a token that is not set, not a colour, or not opaque (alpha below 1, including the fully clear keyword) throws.
 */
export function fromPage(spec: PaletteSpec, el?: Element): PaletteSource {
  const names = [spec.ground, spec.ink, ...(spec.accents ?? [])].map(propertyName);
  if (names.length > 5) throw new RangeError(`fromPage takes at most 3 accents, got ${names.length - 2}`);
  const hostOf = () => el ?? document.body ?? document.documentElement;
  const tokens: PaletteTokens = { ground: names[0]!, ink: names[1]!, accents: names.slice(2) };

  /** Each token's raw value on the host and its computed colour on a probe; no parsing, never throws. */
  function resolveAll(): Resolved[] {
    const host = hostOf();
    const hostStyle = getComputedStyle(host);
    const probe = document.createElement("span");
    probe.setAttribute("aria-hidden", "true");
    probe.style.display = "none";
    host.appendChild(probe);
    try {
      return names.map((name) => {
        const raw = hostStyle.getPropertyValue(name).trim();
        probe.style.color = `var(${name})`;
        return { name, raw, computed: getComputedStyle(probe).color };
      });
    } finally {
      probe.remove();
    }
  }

  const toColour = ({ name, raw, computed }: Resolved): Vec3 => {
    const where = `<${hostOf().localName}>`;
    if (!raw) throw new Error(`fromPage: token ${name} is not set on ${where}`);
    if (!CSS.supports("color", raw)) throw new Error(`fromPage: token ${name} is "${raw}", not a colour`);
    const { rgb, alpha } = parseCss(computed);
    if (alpha < 1) throw new Error(`fromPage: token ${name} is "${raw}", which is not opaque (alpha ${alpha}); tokens must be solid colours`);
    return rgb;
  };

  const signature = () => resolveAll().map((r) => `${r.raw}\u0000${r.computed}`).join("\u0001");

  return {
    tokens,
    read() {
      const [ground, ink, ...accents] = resolveAll().map(toColour);
      return buildRamp(ground!, ink!, accents);
    },
    watch(onChange) {
      // Fire only when a resolved token actually changes: attribute writes that leave every token as it was
      // (scroll locks, per-frame CSS variables for other things) stay silent.
      let last = signature();
      let live = true;
      const check = () => {
        if (!live) return;
        const now = signature();
        if (now === last) return;
        last = now;
        onChange();
      };
      const scheme = matchMedia("(prefers-color-scheme: dark)");
      scheme.addEventListener("change", check);
      const observer = new MutationObserver(check);
      const targets = new Set<Element>([document.documentElement]);
      if (document.body) targets.add(document.body);
      if (el) targets.add(el);
      for (const t of targets) observer.observe(t, { attributes: true });
      return () => {
        live = false;
        scheme.removeEventListener("change", check);
        observer.disconnect();
      };
    },
  };
}

/**
 * GLSL ES 3.0 snippet: the palette uniforms, OKLab conversion, `mixOklab(a, b, t)` and `ramp(t)` (t 0..1
 * walks the 5 stops, mixed in OKLab). Port of lab/2026-11-wild-sampler/lib.js `RAMP`.
 */
export const GLSL_OKLAB = /* glsl */ `
uniform vec3 uGround, uInk, uRamp[5];
vec3 _toOklab(vec3 c) {
  float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
  float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
  float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
  l = pow(max(l, 0.0), 1.0 / 3.0); m = pow(max(m, 0.0), 1.0 / 3.0); s = pow(max(s, 0.0), 1.0 / 3.0);
  return vec3(0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, // not-colour: LMS to OKLab matrix
              1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
              0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s);
}
vec3 _fromOklab(vec3 c) {
  float l = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float m = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float s = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  l = l * l * l; m = m * m * m; s = s * s * s;
  return vec3(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, // not-colour: LMS to linear sRGB matrix
             -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
             -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
}
// Unlike the CPU mixOklab, no chroma reduction after the mix (and _toOklab clamps negative LMS), so vivid
// mixes differ slightly from the CPU ramp. Do not compare the two for exact equality.
vec3 mixOklab(vec3 a, vec3 b, float t) { return _fromOklab(mix(_toOklab(a), _toOklab(b), t)); }
vec3 ramp(float t) {
  float x = clamp(t, 0.0, 1.0) * 4.0;
  int i = int(min(floor(x), 3.0));
  return mixOklab(uRamp[i], uRamp[i + 1], x - float(i));
}
`;
