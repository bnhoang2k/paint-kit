import { type Ramp, type Vec3 } from "./palette.ts";
/** One row of the colour-matching table: wavelength in nm, then x-bar, y-bar, z-bar. */
export type CmfRow = readonly [nm: number, x: number, y: number, z: number];
/**
 * The CIE 1931 2-degree standard colorimetric observer: the colour-matching functions x-bar, y-bar, z-bar from 380
 * to 780 nm at 5 nm (81 rows), as `[nm, x, y, z]`. y-bar is the photopic luminous efficiency, 1 at 555 nm.
 * Source: CIE 018:2019 dataset "CIE 1931 colour-matching functions, 2 degree observer" (doi 10.25039/CIE.DS.xvudnb9b,
 * file CIE_xyz_1931_2deg.csv, files.cie.co.at, read 2026-11-17), the data of CIE 015:2018 "Colorimetry, 4th edition"
 * (doi 10.25039/TR.015.2018). The rows are the dataset's 5 nm rows copied verbatim, trailing zeros dropped (one
 * kept at 590 nm); none is smoothed or interpolated. Cross-checked: the CVRL copy (cvrl.org, ciexyz31.csv, 5 nm)
 * matches every row exactly.
 */
export declare const CIE_1931_2DEG: readonly CmfRow[];
/**
 * The linear sRGB of a unit-power spectral line at `nm` (XYZ = the colour-matching functions there, so 555 nm has
 * Y = 1), linear between the table's 5 nm rows, black outside 380..780 nm. Unclipped: every spectral colour lies
 * outside sRGB, so a channel can be negative (500 nm needs negative red) or above 1. Sum lines (a spread of
 * wavelengths) before clipping, then pull the sum toward the ramp (`pullToRamp`) and let the shade pass clip.
 */
export declare function wavelengthToLinear(nm: number): Vec3;
/**
 * The 81 table wavelengths (380, 385 .. 780 nm) as linear sRGB, unclipped: `wavelengthToLinear` at each, packed
 * as R, G, B per sample (243 floats). `GLSL_SPECTRUM` bakes this same table into its `pk_spectrum`.
 */
export declare function spectrumLut(): Float32Array;
/**
 * The colour of a blackbody (a Planckian radiator) at `k` kelvin, as CIE XYZ scaled to Y = 1: Planck's law
 * M(l, T) = c1 / l^5 / (exp(c2 / (l T)) - 1) weighted by `CIE_1931_2DEG` and summed at its 5 nm rows (the CIE 015
 * tristimulus sum). Measured 2026-11-17 against a 1 nm sum over 360..830 nm, the chromaticity differs by at most
 * 6.4e-5 in x or y from 798 to 10000 K; against Kang et al.'s (2002) fit of the Planckian locus, by at most 5.6e-4
 * from 1667 to 4000 K.
 * `kelvinToLinear` uses it below 1667 K, where the fit stops. Throws on a temperature with no visible light.
 */
export declare function blackbodyXyz(k: number): Vec3;
/** Where a pull goes: the nearest of the ramp's five stops, or the ground's hue at the colour's own lightness. */
export type PullTarget = "nearest" | "ground";
/**
 * Pulls a computed colour (a spectral line, a sum of lines, a heat colour) toward the page's ramp by `amount`, mixed
 * in OKLab (`mixOklab`): 0 returns `c` as given (a copy, unclipped), 1 returns the target. The amount is clamped to
 * 0..1; above 0 the result is in gamut (`mixOklab` reduces chroma). Targets:
 * - `"nearest"`: the ramp stop nearest `c` in OKLab (ties go to the stop toward the ground). Keeps the palette's
 *   several colours: each part of a rainbow goes to its own stop.
 * - `"ground"`: the ground's hue and chroma at `c`'s own OKLab lightness, what `lights.key`'s `tint` does for its
 *   kelvin. A one-colour wash at high amounts.
 * The ramp is the page's, so new tokens give a new result. GLSL `pk_pull` (in `GLSL_SPECTRUM`) is the GPU side. At
 * amount 1 the two pick the same target; between, the GPU does not reduce chroma (as GLSL `mixOklab`), so for a
 * colour far outside sRGB they part: a raw spectral line at amount 0.5 differed by 0.06 to 0.11 in OKLab once the GPU
 * result was clipped per channel (measured 2026-11-17, headless Chromium). Never compare the two at mid amounts.
 */
export declare function pullToRamp(c: Vec3, ramp: Ramp, amount: number, target: PullTarget): Vec3;
