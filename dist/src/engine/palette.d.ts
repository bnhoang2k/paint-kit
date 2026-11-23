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
export type PaletteTokens = {
    ground: string;
    ink: string;
    accents: string[];
};
export type PaletteSpec = {
    /** Custom property names, as `--name` or `var(--name)`. */
    ground: string;
    ink: string;
    accents?: string[];
};
/** A linear sRGB colour as a CSS `rgb()` string (channels clipped, 0..255 with decimals): what the browser paints. */
export declare function linearToCss(c: Vec3): string;
/** A ramp as CSS colour strings: ground, ink and the five stops (`FieldContext.colours`). */
export declare function rampColours(r: Ramp): {
    ground: string;
    ink: string;
    stops: string[];
};
export declare function linearToOklab(c: Vec3): Vec3;
/** OKLCH (L 0..1, C, h in degrees) to linear sRGB, pulled into gamut by reducing chroma. */
export declare function oklchToLinear(L: number, C: number, h: number): Vec3;
/** Linear sRGB to OKLCH: `[L, C, h]`, h in degrees in [0, 360). */
export declare function linearToOklch(c: Vec3): Vec3;
/**
 * Mixes two linear colours in OKLab: `t` 0 gives `a`, 1 gives `b`. The result is pulled into gamut by
 * chroma reduction. GLSL `mixOklab` (in `GLSL_OKLAB`) does not reduce chroma and clamps negative LMS, so
 * vivid mixes differ slightly between CPU and GPU: never compare CPU and GPU ramps for exact equality.
 */
export declare function mixOklab(a: Vec3, b: Vec3, t: number): Vec3;
/** Tints a computed colour (a lamp's kelvin, a glow) toward a palette colour by `amount` 0..1, in OKLab. */
export declare function tintToward(c: Vec3, target: Vec3, amount: number): Vec3;
/**
 * CIE XYZ (D65 white) to linear sRGB, unclipped: the sRGB matrix from the IEC 61966-2-1 primaries. A colour outside
 * sRGB comes back with a channel below 0 or above 1.
 */
export declare function xyzToLinear(c: Vec3): Vec3;
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
export declare function kelvinToLinear(k: number): Vec3;
/**
 * Builds the 5-stop ramp. Accents (at most 3) are sorted by OKLab lightness from the ground's end to the
 * ink's end and placed at stops 1..3 (one accent: stop 2; two: stops 1 and 3). Empty stops are OKLab mixes
 * of their nearest filled neighbours, by position.
 */
export declare function buildRamp(ground: Vec3, ink: Vec3, accents: Vec3[]): Ramp;
/**
 * A position on the ramp as a linear colour: the CPU side of the GLSL `ramp(t)`. `t` 0 is the ground (stop 0), 1
 * the ink (stop 4), and between them the five stops are spaced evenly, each pair mixed in OKLab (`mixOklab`). A
 * position on a stop (0, 0.25, 0.5, 0.75, 1) returns a copy of that stop exactly, so position 0 is the ground to the
 * bit. `t` is clamped to 0..1; a non-finite `t` throws. The one place a ramp position becomes a colour on the CPU
 * (a material's `tone`, a halftone's ground): between stops it can differ slightly from the GPU's `ramp()`, which
 * does not reduce chroma (see `mixOklab`).
 */
export declare function rampAt(r: Ramp, t: number): Vec3;
/**
 * The ramp stop next to position `t` that lies farther from `rampAt(r, t)` in OKLab: what a surface at `t` varies
 * toward (a material's fine colour variation), so the variation never collapses because `t` sits on a fixed stop.
 * The candidates are the stops on either side of `t` (on a stop, its neighbours; between two stops, those two). Ties
 * go to the stop toward the ink. At `t` 0 the only neighbour is stop 1, so the ground varies toward stop 1, as every
 * material did before tones. Returns a copy; `t` as `rampAt`.
 */
export declare function rampAway(r: Ramp, t: number): Vec3;
/**
 * Parses a colour as `getComputedStyle` returns it, to linear sRGB, matching what the browser paints:
 * out-of-gamut values are clipped per channel (unlike `oklchToLinear` and `mixOklab`, which reduce chroma).
 * Alpha is dropped. Forms: the legacy and space-separated sRGB function with or without alpha,
 * `color(srgb ...)`, `color(srgb-linear ...)`, `oklch()` and `oklab()`. Anything else throws.
 */
export declare function parseCssColor(computed: string): Vec3;
/**
 * A palette read from the page's CSS custom properties. Each token is resolved by a hidden probe inside
 * `el` (default `<body>`), so `var()` chains and named colours come out as the browser paints them.
 * On `read()`, a token that is not set, not a colour, or not opaque (alpha below 1, including the fully clear keyword) throws.
 */
export declare function fromPage(spec: PaletteSpec, el?: Element): PaletteSource;
/**
 * GLSL ES 3.0 snippet: the palette uniforms, OKLab conversion, `mixOklab(a, b, t)` and `ramp(t)` (t 0..1
 * walks the 5 stops, mixed in OKLab). Port of lab/2026-11-wild-sampler/lib.js `RAMP`.
 */
export declare const GLSL_OKLAB = "\nuniform vec3 uGround, uInk, uRamp[5];\nvec3 _toOklab(vec3 c) {\n  float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;\n  float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;\n  float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;\n  l = pow(max(l, 0.0), 1.0 / 3.0); m = pow(max(m, 0.0), 1.0 / 3.0); s = pow(max(s, 0.0), 1.0 / 3.0);\n  return vec3(0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, // not-colour: LMS to OKLab matrix\n              1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,\n              0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s);\n}\nvec3 _fromOklab(vec3 c) {\n  float l = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;\n  float m = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;\n  float s = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;\n  l = l * l * l; m = m * m * m; s = s * s * s;\n  return vec3(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, // not-colour: LMS to linear sRGB matrix\n             -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,\n             -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);\n}\n// Unlike the CPU mixOklab, no chroma reduction after the mix (and _toOklab clamps negative LMS), so vivid\n// mixes differ slightly from the CPU ramp. Do not compare the two for exact equality.\nvec3 mixOklab(vec3 a, vec3 b, float t) { return _fromOklab(mix(_toOklab(a), _toOklab(b), t)); }\nvec3 ramp(float t) {\n  float x = clamp(t, 0.0, 1.0) * 4.0;\n  int i = int(min(floor(x), 3.0));\n  return mixOklab(uRamp[i], uRamp[i + 1], x - float(i));\n}\n";
