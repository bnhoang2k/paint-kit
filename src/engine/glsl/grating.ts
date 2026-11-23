// The grating lobe: the highlight of a diffraction grating (`materials.foil`), as the shade pass's lights see it. A
// light's highlight on foil is not the light's colour but the colours its grooves send toward the eye, so it is
// computed per light, from that light's direction, here, and each light multiplies it by its own colour and level.
//
// The grating equation. A reflection grating with groove spacing d sends wavelength lambda into order m (m = 1, 2,
// ...) where, across the grooves, d (sin theta_i + sin theta_m) = m lambda (cited in bars/10-foil-card/study.md,
// "The grating mechanism": the diffraction grating rule, and Stam, GPU Gems chapter 8, which sums orders 1 to 7). With
// unit vectors l (to the light) and v (to the eye) and X the unit direction across the grooves in the surface, the two
// sines are X.l and X.v, so an order m shows wavelength lambda = d |X.(l + v)| / m. Along the grooves the light keeps
// its component (G.(l + v) = 0 for an ideal grating; conical diffraction): a real foil's grooves wander and its film
// is not flat, so that condition is a lobe in G.h with the material's roughness as its width, the shape of the
// engine's Ward lobe (`specLobe`). Where the grooves lie in the plane of the light and the eye, X.(l + v) is 0 and no
// order is visible: the point shows no colour (Stam's u = 0 case). Written from the equation, not from Stam's code.
//
// Each order is a band, not a line: the light's own size and the film's waviness spread X.(l + v) by
// GRATING_SPREAD, so the band spreads d x GRATING_SPREAD / m in wavelength. It is summed at GRATING_TAPS points
// through `pk_spectrum` (unit power, so a narrow band is a spectral line), pulled toward the page's ramp
// (`pk_bandPull`), and the visible orders add.
import { spectrumWhite } from "./spectrum.ts";

/**
 * The spread of X.(l + v) one order shows: about 3 degrees (0.05 in direction cosine), the size of a room light
 * seen from the page and the waviness of a laid-on film. Builder: no source gives it; it sets how wide each order's
 * rainbow band is (at 1.5 um, 75 nm in the first order, 38 nm in the second), so a band reads as a colour, not a hair
 * line, and two orders stay apart. The look review may move it.
 */
export const GRATING_SPREAD = 0.05;
/** Points summed across one order's band, at -2 to +2 spreads (Gaussian weights): builder, smooth at 5 nm steps. */
export const GRATING_TAPS = 9;
/**
 * The planted fault iridescence-place-hue's wavelength ramp, nm per canvas width (paint.ts TEST_FAULTS). Reason
 * (Task 14 round 4 ruling): 20 nm between the two half-centres of one (b) group, the same "visible shift" unit the
 * law's (e) uses (U_SPAN 0.02 in u, 20 nm of first order at 1.0 um). On test/pages/foil.html (960 x 600, short side
 * 600 px) one (b) group is one groove region's flat top, half the panel: 0.42 x 600 = 252 px wide, so its
 * half-centres sit 126 px apart, 126 / 960 of the canvas width; 20 / (126 / 960) = 152.38 nm per width. Taken from the
 * page's geometry, not from a reading.
 */
export const PLACE_HUE_SLOPE = 20 / (126 / 960);
/** The most orders a foil sums: Stam's GPU Gems chapter 8 sums 1 to 7 (bars/10-foil-card/study.md). */
export const GRATING_MAX_ORDERS = 7;

/** The white balance a band is multiplied by: `spectrumWhite`, shared with the thin film. */
export const gratingWhite = spectrumWhite;

/**
 * GLSL ES 3.0 chunk, after `GLSL_SPECTRUM` and `GLSL_SURF` (it reads MatOut): `vec3 gratingSpec(MatOut m, vec3 n,
 * vec3 l, vec3 view, float lightSpec)`, the grating's highlight from a light at unit direction `l`, before the light's
 * colour and level. MatOut's `tdir` is the groove direction, `rough` the lobe's width, `spec` its strength and
 * `grating` (x spacing in nm, y orders, z pull amount, w pull target: 0 nearest, 1 ground). The shade pass stitches
 * it in only on a page with a grating material (`PK_GRATING`).
 */
export const GLSL_GRATING = /* glsl */ `
const float PK_GRATING_SPREAD = ${GRATING_SPREAD.toFixed(4)};
const int PK_GRATING_TAPS = ${GRATING_TAPS};
const int PK_GRATING_ORDERS = ${GRATING_MAX_ORDERS};
// One order's band at 'centre' nm, 'sigma' nm wide: unit power, white-balanced.
vec3 pk_gratingBand(float centre, float sigma) {
  vec3 c = vec3(0.0); // not-colour: empty sum
  float wsum = 0.0;
  for (int i = 0; i < PK_GRATING_TAPS; i++) {
    float x = 4.0 * float(i) / float(PK_GRATING_TAPS - 1) - 2.0;
    float w = exp(-0.5 * x * x);
    c += w * pk_spectrum(centre + x * sigma);
    wsum += w;
  }
  return c / wsum * PK_SPECTRUM_WHITE;
}
#ifdef PK_FAULT_IRIDESCENCE_POINTER_X
// The planted fault iridescence-pointer-x (paint.ts TEST_FAULTS): the engine pointer, in canvas fractions.
uniform vec2 uFaultPointer;
#endif
#ifdef PK_FAULT_IRIDESCENCE_PLACE_HUE
// The planted fault iridescence-place-hue (paint.ts TEST_FAULTS): nm of wavelength offset per canvas width.
const float PK_PLACE_HUE_SLOPE = ${PLACE_HUE_SLOPE.toFixed(4)};
#endif
vec3 gratingSpec(MatOut m, vec3 n, vec3 l, vec3 view, float lightSpec) {
#ifdef PK_FAULT_IRIDESCENCE_POINTER_X
  // The planted fault iridescence-pointer-x: a rainbow keyed to the pointer's x and the pixel's place across the
  // canvas, with no light in it (no light direction, no view, no grooves), as a painted-on holo overlay is.
  float sweep = fract(gl_FragCoord.x / uView.x + uFaultPointer.x);
  return 0.5 * m.spec * lightSpec * pk_bandPull(pk_gratingBand(400.0 + 300.0 * sweep, 40.0), m.grating.z, int(m.grating.w + 0.5));
#endif
  if (dot(n, l) <= 0.0 || dot(n, view) <= 0.0) return vec3(0.0); // not-colour: no light from behind
  vec3 g = vec3(m.tdir, 0.0); // not-colour: the grooves in the sheet's plane
#ifdef PK_TILT
  g = uTilt * g; // the grooves turn with the card (shade.ts uTilt)
#endif
#ifdef PK_FAULT_IRIDESCENCE_FLAT_NORMAL
  // The planted fault iridescence-flat-normal: the grooves' frame (and so u) is the flat sheet's, whatever the surface
  // normal, so a curved foil's colour no longer follows its own geometry while it still shimmers with light and tilt.
  vec3 nf = vec3(0.0, 0.0, 1.0); // not-colour: the flat sheet's normal
#ifdef PK_TILT
  nf = uTilt * nf; // the flat card, turned with the tilt
#endif
#else
  vec3 nf = n;
#endif
  vec3 along = normalize(g - nf * dot(g, nf) + 1e-6);
  vec3 across = cross(nf, along);
  vec3 w = l + view;
  vec3 hv = normalize(w);
  float hn = max(dot(hv, n), 1e-3);
  float a = dot(hv, along) / max(m.rough, 0.02);
  float lobe = m.spec * lightSpec * exp(-a * a / (hn * hn));
  if (lobe < 1e-5) return vec3(0.0); // not-colour: outside the lobe
  // The grating equation: order k shows d |X.(l + v)| / k nm.
  float u = abs(dot(across, w));
  int target = int(m.grating.w + 0.5);
  vec3 c = vec3(0.0); // not-colour: empty sum
  for (int k = 1; k <= PK_GRATING_ORDERS; k++) {
    if (float(k) > m.grating.y + 0.5) break;
    float centre = m.grating.x * u / float(k);
#ifdef PK_FAULT_IRIDESCENCE_CLOCK
    // The planted fault iridescence-clock: each band's wavelength cycles through the spectrum on the paint clock
    // (120 nm a second), a hue cycle on time, as Balatro's Polychrome is.
    centre = 380.0 + mod(centre - 380.0 + 120.0 * uTime, 400.0);
#endif
#ifdef PK_FAULT_IRIDESCENCE_PLACE_HUE
    // The planted fault iridescence-place-hue: each band's centre gains an offset that ramps with the pixel's place
    // across the canvas, PK_PLACE_HUE_SLOPE nm per canvas width, while the lobe, u, light and view stay. The slope
    // puts 20 nm between the two half-centres of one (b) group on test/pages/foil.html (see the fault page's header).
    centre += PK_PLACE_HUE_SLOPE * gl_FragCoord.x / uView.x;
#endif
    float sigma = m.grating.x * PK_GRATING_SPREAD / float(k);
    if (centre + 2.0 * sigma < 380.0 || centre - 2.0 * sigma > 780.0) continue;
#ifdef PK_FAULT_IRIDESCENCE_WHITE
    // The planted fault iridescence-white: each band flattened to its own luminance, a groove-aware white highlight
    // with the grating's lobe and no colour.
    c += vec3(dot(pk_bandPull(pk_gratingBand(centre, sigma), m.grating.z, target), PK_SPECTRUM_Y));
#else
    c += pk_bandPull(pk_gratingBand(centre, sigma), m.grating.z, target);
#endif
  }
  return lobe * c;
}
`;
