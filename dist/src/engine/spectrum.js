// The spectrum helper: light that physics colours (a wavelength, a blackbody temperature) as linear sRGB, and the
// pull that brings such a colour toward the page's ramp by a declared amount. Foil (a grating) and thin film turn
// angles into wavelengths and read them here; heat colour reads `kelvinToLinear`, which integrates Planck's law
// against the same table below 1667 K. The engine never invents a hue: a spectral colour is physics, and the page's
// palette reaches it only through `pullToRamp` (GLSL `pk_pull`), as `lights.key`'s `tint` does for its kelvin.
//
// Import cycle: palette.ts imports `blackbodyXyz` from here and this module imports colour helpers from palette.ts.
// Both sides use the other only inside function bodies (function declarations are bound before either module runs),
// so the cycle is safe in any import order. Keep it that way: no top-level call into palette.ts from this file.
import { linearToOklab, linearToOklch, mixOklab, oklchToLinear, xyzToLinear } from "./palette.js";
/**
 * The CIE 1931 2-degree standard colorimetric observer: the colour-matching functions x-bar, y-bar, z-bar from 380
 * to 780 nm at 5 nm (81 rows), as `[nm, x, y, z]`. y-bar is the photopic luminous efficiency, 1 at 555 nm.
 * Source: CIE 018:2019 dataset "CIE 1931 colour-matching functions, 2 degree observer" (doi 10.25039/CIE.DS.xvudnb9b,
 * file CIE_xyz_1931_2deg.csv, files.cie.co.at, read 2026-11-17), the data of CIE 015:2018 "Colorimetry, 4th edition"
 * (doi 10.25039/TR.015.2018). The rows are the dataset's 5 nm rows copied verbatim, trailing zeros dropped (one
 * kept at 590 nm); none is smoothed or interpolated. Cross-checked: the CVRL copy (cvrl.org, ciexyz31.csv, 5 nm)
 * matches every row exactly.
 */
export const CIE_1931_2DEG = Object.freeze([
    [380, 0.001368, 0.000039, 0.006450001],
    [385, 0.002236, 0.000064, 0.01054999],
    [390, 0.004243, 0.00012, 0.02005001],
    [395, 0.00765, 0.000217, 0.03621],
    [400, 0.01431, 0.000396, 0.06785001],
    [405, 0.02319, 0.00064, 0.1102],
    [410, 0.04351, 0.00121, 0.2074],
    [415, 0.07763, 0.00218, 0.3713],
    [420, 0.13438, 0.004, 0.6456],
    [425, 0.21477, 0.0073, 1.0390501],
    [430, 0.2839, 0.0116, 1.3856],
    [435, 0.3285, 0.01684, 1.62296],
    [440, 0.34828, 0.023, 1.74706],
    [445, 0.34806, 0.0298, 1.7826],
    [450, 0.3362, 0.038, 1.77211],
    [455, 0.3187, 0.048, 1.7441],
    [460, 0.2908, 0.06, 1.6692],
    [465, 0.2511, 0.0739, 1.5281],
    [470, 0.19536, 0.09098, 1.28764],
    [475, 0.1421, 0.1126, 1.0419],
    [480, 0.09564, 0.13902, 0.8129501],
    [485, 0.05795001, 0.1693, 0.6162],
    [490, 0.03201, 0.20802, 0.46518],
    [495, 0.0147, 0.2586, 0.3533],
    [500, 0.0049, 0.323, 0.272],
    [505, 0.0024, 0.4073, 0.2123],
    [510, 0.0093, 0.503, 0.1582],
    [515, 0.0291, 0.6082, 0.1117],
    [520, 0.06327, 0.71, 0.07824999],
    [525, 0.1096, 0.7932, 0.05725001],
    [530, 0.1655, 0.862, 0.04216],
    [535, 0.2257499, 0.9148501, 0.02984],
    [540, 0.2904, 0.954, 0.0203],
    [545, 0.3597, 0.9803, 0.0134],
    [550, 0.4334499, 0.9949501, 0.008749999],
    [555, 0.5120501, 1, 0.005749999],
    [560, 0.5945, 0.995, 0.0039],
    [565, 0.6784, 0.9786, 0.002749999],
    [570, 0.7621, 0.952, 0.0021],
    [575, 0.8425, 0.9154, 0.0018],
    [580, 0.9163, 0.87, 0.001650001],
    [585, 0.9786, 0.8163, 0.0014],
    [590, 1.0263, 0.757, 0.00110], // one trailing zero kept: twill-chunk.test.ts reads the bare value as weave GLSL
    [595, 1.0567, 0.6949, 0.001],
    [600, 1.0622, 0.631, 0.0008],
    [605, 1.0456, 0.5668, 0.0006],
    [610, 1.0026, 0.503, 0.00034],
    [615, 0.9384, 0.4412, 0.00024],
    [620, 0.8544499, 0.381, 0.00019],
    [625, 0.7514, 0.321, 0.0001],
    [630, 0.6424, 0.265, 0.00004999999],
    [635, 0.5419, 0.217, 0.00003],
    [640, 0.4479, 0.175, 0.00002],
    [645, 0.3608, 0.1382, 0.00001],
    [650, 0.2835, 0.107, 0],
    [655, 0.2187, 0.0816, 0],
    [660, 0.1649, 0.061, 0],
    [665, 0.1212, 0.04458, 0],
    [670, 0.0874, 0.032, 0],
    [675, 0.0636, 0.0232, 0],
    [680, 0.04677, 0.017, 0],
    [685, 0.0329, 0.01192, 0],
    [690, 0.0227, 0.00821, 0],
    [695, 0.01584, 0.005723, 0],
    [700, 0.01135916, 0.004102, 0],
    [705, 0.008110916, 0.002929, 0],
    [710, 0.005790346, 0.002091, 0],
    [715, 0.004109457, 0.001484, 0],
    [720, 0.002899327, 0.001047, 0],
    [725, 0.00204919, 0.00074, 0],
    [730, 0.001439971, 0.00052, 0],
    [735, 0.0009999493, 0.0003611, 0],
    [740, 0.0006900786, 0.0002492, 0],
    [745, 0.0004760213, 0.0001719, 0],
    [750, 0.0003323011, 0.00012, 0],
    [755, 0.0002348261, 0.0000848, 0],
    [760, 0.0001661505, 0.00006, 0],
    [765, 0.000117413, 0.0000424, 0],
    [770, 0.00008307527, 0.00003, 0],
    [775, 0.00005870652, 0.0000212, 0],
    [780, 0.00004150994, 0.00001499, 0],
]);
const CMF_FIRST = 380;
const CMF_STEP = 5;
const CMF_LAST = CMF_FIRST + CMF_STEP * (CIE_1931_2DEG.length - 1);
/** The colour-matching functions at `nm` (XYZ of a unit-power line), linear between the 5 nm rows; 0 outside 380..780. */
function cmfAt(nm) {
    if (!(nm >= CMF_FIRST && nm <= CMF_LAST))
        return [0, 0, 0];
    const x = (nm - CMF_FIRST) / CMF_STEP;
    const i = Math.min(Math.floor(x), CIE_1931_2DEG.length - 2);
    const f = x - i;
    const a = CIE_1931_2DEG[i];
    const b = CIE_1931_2DEG[i + 1];
    return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f];
}
/**
 * The linear sRGB of a unit-power spectral line at `nm` (XYZ = the colour-matching functions there, so 555 nm has
 * Y = 1), linear between the table's 5 nm rows, black outside 380..780 nm. Unclipped: every spectral colour lies
 * outside sRGB, so a channel can be negative (500 nm needs negative red) or above 1. Sum lines (a spread of
 * wavelengths) before clipping, then pull the sum toward the ramp (`pullToRamp`) and let the shade pass clip.
 */
export function wavelengthToLinear(nm) {
    return xyzToLinear(cmfAt(nm));
}
/**
 * The 81 table wavelengths (380, 385 .. 780 nm) as linear sRGB, unclipped: `wavelengthToLinear` at each, packed
 * as R, G, B per sample (243 floats). `GLSL_SPECTRUM` bakes this same table into its `pk_spectrum`.
 */
export function spectrumLut() {
    const out = new Float32Array(CIE_1931_2DEG.length * 3);
    CIE_1931_2DEG.forEach(([nm], i) => out.set(wavelengthToLinear(nm), i * 3));
    return out;
}
// Planck's second radiation constant c2 = h c / k_B, from the exact SI values (CODATA 2018; exact since the 2019 SI
// redefinition): h = 6.62607015e-34 J s, c = 299792458 m/s, k_B = 1.380649e-23 J/K. c2 = 1.438776877e-2 m K.
// The first constant c1 scales every wavelength alike, so it cancels when the colour is normalised and is left out.
const PLANCK_C2 = (6.62607015e-34 * 299792458) / 1.380649e-23;
/**
 * The colour of a blackbody (a Planckian radiator) at `k` kelvin, as CIE XYZ scaled to Y = 1: Planck's law
 * M(l, T) = c1 / l^5 / (exp(c2 / (l T)) - 1) weighted by `CIE_1931_2DEG` and summed at its 5 nm rows (the CIE 015
 * tristimulus sum). Measured 2026-11-17 against a 1 nm sum over 360..830 nm, the chromaticity differs by at most
 * 6.4e-5 in x or y from 798 to 10000 K; against Kang et al.'s (2002) fit of the Planckian locus, by at most 5.6e-4
 * from 1667 to 4000 K.
 * `kelvinToLinear` uses it below 1667 K, where the fit stops. Throws on a temperature with no visible light.
 */
export function blackbodyXyz(k) {
    if (!(k > 0) || !Number.isFinite(k))
        throw new RangeError(`blackbodyXyz: the temperature must be a positive number of kelvin, got ${k}`);
    let X = 0;
    let Y = 0;
    let Z = 0;
    for (const [nm, x, y, z] of CIE_1931_2DEG) {
        const l = nm * 1e-9;
        const m = 1 / (l ** 5 * Math.expm1(PLANCK_C2 / (l * k)));
        X += m * x;
        Y += m * y;
        Z += m * z;
    }
    if (!(Y > 0))
        throw new RangeError(`blackbodyXyz: ${k} K gives no visible light to compute a colour from`);
    return [X / Y, 1, Z / Y];
}
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
export function pullToRamp(c, ramp, amount, target) {
    if (Number.isNaN(amount))
        throw new RangeError(`pullToRamp: the amount must be a number 0..1, got ${amount}`);
    if (target !== "nearest" && target !== "ground")
        throw new RangeError(`pullToRamp: the target must be "nearest" or "ground", got ${String(target)}`);
    const a = Math.min(1, Math.max(0, amount));
    if (a === 0)
        return [...c];
    return mixOklab(c, target === "ground" ? groundAt(c, ramp) : nearestStop(c, ramp), a);
}
/** The ground's hue and chroma at `c`'s OKLab lightness (as `paletteLight` in lights/basic.ts). */
function groundAt(c, ramp) {
    const [L] = linearToOklch(c);
    const [, C, h] = linearToOklch(ramp.ground);
    return oklchToLinear(L, C, h);
}
/** The ramp stop nearest `c` in OKLab; the first (toward the ground) on a tie. */
function nearestStop(c, ramp) {
    const p = linearToOklab(c);
    let best = 0;
    let bestD = Infinity;
    ramp.stops.forEach((s, i) => {
        const q = linearToOklab(s);
        const d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
        if (d < bestD) {
            bestD = d;
            best = i;
        }
    });
    return [...ramp.stops[best]];
}
