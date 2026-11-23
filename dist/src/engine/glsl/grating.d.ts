import { spectrumWhite } from "./spectrum.ts";
/**
 * The spread of X.(l + v) one order shows: about 3 degrees (0.05 in direction cosine), the size of a room light
 * seen from the page and the waviness of a laid-on film. Builder: no source gives it; it sets how wide each order's
 * rainbow band is (at 1.5 um, 75 nm in the first order, 38 nm in the second), so a band reads as a colour, not a hair
 * line, and two orders stay apart. The look review may move it.
 */
export declare const GRATING_SPREAD = 0.05;
/** Points summed across one order's band, at -2 to +2 spreads (Gaussian weights): builder, smooth at 5 nm steps. */
export declare const GRATING_TAPS = 9;
/**
 * The planted fault iridescence-place-hue's wavelength ramp, nm per canvas width (paint.ts TEST_FAULTS). Reason
 * (Task 14 round 4 ruling): 20 nm between the two half-centres of one (b) group, the same "visible shift" unit the
 * law's (e) uses (U_SPAN 0.02 in u, 20 nm of first order at 1.0 um). On test/pages/foil.html (960 x 600, short side
 * 600 px) one (b) group is one groove region's flat top, half the panel: 0.42 x 600 = 252 px wide, so its
 * half-centres sit 126 px apart, 126 / 960 of the canvas width; 20 / (126 / 960) = 152.38 nm per width. Taken from the
 * page's geometry, not from a reading.
 */
export declare const PLACE_HUE_SLOPE: number;
/** The most orders a foil sums: Stam's GPU Gems chapter 8 sums 1 to 7 (bars/10-foil-card/study.md). */
export declare const GRATING_MAX_ORDERS = 7;
/** The white balance a band is multiplied by: `spectrumWhite`, shared with the thin film. */
export declare const gratingWhite: typeof spectrumWhite;
/**
 * GLSL ES 3.0 chunk, after `GLSL_SPECTRUM` and `GLSL_SURF` (it reads MatOut): `vec3 gratingSpec(MatOut m, vec3 n,
 * vec3 l, vec3 view, float lightSpec)`, the grating's highlight from a light at unit direction `l`, before the light's
 * colour and level. MatOut's `tdir` is the groove direction, `rough` the lobe's width, `spec` its strength and
 * `grating` (x spacing in nm, y orders, z pull amount, w pull target: 0 nearest, 1 ground). The shade pass stitches
 * it in only on a page with a grating material (`PK_GRATING`).
 */
export declare const GLSL_GRATING: string;
