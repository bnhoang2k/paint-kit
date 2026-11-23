/** Wavelengths the film sums, 380 to 780 nm: every second line of the 5 nm table. Builder: a film's cosine is smooth at 10 nm. */
export declare const FILM_TAPS = 41;
/** The index under a dielectric film: glTF's default for a base material (KHR_materials_ior, 1.5). */
export declare const FILM_BASE_IOR = 1.5;
/** Iron's complex index: Johnson and Christy 1974, the rows nearest 450, 550 and 650 nm. */
export declare const FILM_IRON: readonly [{
    readonly nm: 451;
    readonly n: 2.59;
    readonly k: 2.77;
}, {
    readonly nm: 549;
    readonly n: 2.95;
    readonly k: 2.93;
}, {
    readonly nm: 659;
    readonly n: 2.92;
    readonly k: 3.1;
}];
/** The summed luminance of the film's white-balanced lines, so a flat reflectance of 1 returns luminance 1. */
export declare function filmLineSum(): number;
/** The base phase phi at `nm`, in radians, 0 to 2 pi: the same rule as `pk_filmBase` below. */
export declare function filmPhase(ior: number, base: "metal" | "dielectric", nm: number): number;
/**
 * The planted fault film-place-hue (paint.ts TEST_FAULTS): nm of first-order bright wavelength between one bin's two
 * halves, Task 14's unit for a visible shift (glsl/grating.ts PLACE_HUE_SLOPE).
 */
export declare const FILM_PLACE_HUE_NM = 20;
/** The planted fault film-place-hue: the two panels' centres are 288 px apart on film.html at 960 x 600, in canvas widths. */
export declare const FILM_PLACE_HUE_APART: number;
/** The wavelength at which film-place-hue reads the base phase: iron's middle row, the design note's check value. */
export declare const FILM_PLACE_HUE_AT: 549;
/**
 * The planted fault film-place-hue's OPD offset, nm per canvas width. The first-order bright wavelength is
 * OPD / (1 - phi / 2 pi), so 20 nm of it is 20 (1 - phi / 2 pi) nm of OPD, over the panels' distance.
 */
export declare const filmPlaceHueSlope: (ior: number, base: "metal" | "dielectric") => number;
/**
 * GLSL ES 3.0 chunk, after `GLSL_SPECTRUM` and `GLSL_SURF` (it reads MatOut and `specLobe`):
 * `vec3 filmSpec(MatOut m, vec3 n, vec3 l, vec3 view, float lightSpec)`, the film's highlight from a light at unit
 * direction `l`, before the light's colour and level. MatOut's `film` holds x the thickness in nm, y the film's index,
 * z the pull amount and w the pull target (0 nearest, 1 ground); `filmBase` is 0 dielectric, 1 metal. The shade pass
 * stitches it in only on a page with a film material (`PK_FILM`). The reflectance scale is a builder value: the
 * reflectance is divided by the film's own brightest reflectance at normal incidence, so a clear film's faint highlight
 * reads beside a metal's (a one-key page has no environment to show a 4% reflection). `m.spec` then sets the highlight's
 * strength. The pull works at unit luminance, so neither the scale nor the reflectance's level changes the hue it gives.
 */
export declare const GLSL_FILM: string;
