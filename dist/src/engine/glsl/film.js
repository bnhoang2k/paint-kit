// The thin-film lobe: the highlight of a transparent film on a base (`materials.film`), as the shade pass's lights see
// it. Light reflects off the film's top and again off the base under it. The two reflections meet with a path difference,
// so some wavelengths add and others cancel, and the highlight takes the colour that is left.
//
// The angle. A rough film sends light to the eye only from facets whose normal is the half vector h, so the angle of
// incidence is the one between the eye and h: cos(theta_i) = v.h. Inside the film, Snell's law gives
// cos(theta_t) = sqrt(1 - (sin(theta_i) / ior)^2), and the optical path difference is OPD = 2 ior d cos(theta_t)
// (glTF KHR_materials_iridescence). A tilt turns the surface and not v.h, so it moves the highlight and holds the hue.
//
// The two beams. With r12 the top's reflection and r23 the base's, the reflected amplitude is
// r12 + t12 t21 r23 exp(+i 2 pi OPD / lambda), so the reflectance at one wavelength is
// R12 + T^2 R23 + 2 T sqrt(R12 R23) cos(2 pi OPD / lambda + phi), with T = 1 - R12 and phi = arg(r23) - arg(r12).
// The reflectances follow the angle by Schlick's form, as glTF's do. The base phase stays at its normal-incidence value.
//
// The base phase phi, in [0, 2 pi):
// - "dielectric": each interface's phase is 0 or pi, from the order of the indices on its two sides. A film between air
//   and a denser base flips at both interfaces, so phi is 0 and the first bright order sits at OPD = lambda.
// - "metal": conductor Fresnel at normal incidence, r12 = (1 - n_f) / (1 + n_f) and
//   r23 = (n_f - (n + ik)) / (n_f + (n + ik)). The sign is binding: n + ik goes with the e^(-i omega t) time convention,
//   the one in which a delay is exp(+i 2 pi OPD / lambda). The opposite pairing collapses the bands toward one hue.
//   Iron's n and k are linear in wavelength between Johnson and Christy's three rows, and hold outside them.
//
// The colour. The reflectance is summed against `pk_spectrum` over the visible range, white-balanced, then pulled toward
// the page's ramp at unit luminance (`pk_bandPull`), and its luminance is put back. The sum runs over the wavelengths themselves, so a thick film
// averages toward white and never aliases. Belcour and Barla's closed form is a fast approximation of this same integral.
//
// Sources, read and written from scratch: Belcour and Barla, "A Practical Extension to Microfacet Theory for the
// Modeling of Varying Iridescence", ACM TOG 36(4), 2017 (named by the design note; its paper could not be opened, and
// nothing here comes from its code); the glTF KHR_materials_iridescence README (OPD, Schlick, the 1.5 base index);
// Wikipedia, "Fresnel equations" (r = (n1 - n2) / (n1 + n2) at normal incidence, and the e^(-i omega t) convention);
// Johnson and Christy, Phys. Rev. B 9, 5056, 1974 (iron).
import { spectrumLut } from "../spectrum.js";
import { spectrumWhite } from "./spectrum.js";
/** Wavelengths the film sums, 380 to 780 nm: every second line of the 5 nm table. Builder: a film's cosine is smooth at 10 nm. */
export const FILM_TAPS = 41;
/** The index under a dielectric film: glTF's default for a base material (KHR_materials_ior, 1.5). */
export const FILM_BASE_IOR = 1.5;
/** Iron's complex index: Johnson and Christy 1974, the rows nearest 450, 550 and 650 nm. */
export const FILM_IRON = [
    { nm: 451, n: 2.59, k: 2.77 },
    { nm: 549, n: 2.95, k: 2.93 },
    { nm: 659, n: 2.92, k: 3.1 },
];
/** The summed luminance of the film's white-balanced lines, so a flat reflectance of 1 returns luminance 1. */
export function filmLineSum() {
    const lut = spectrumLut();
    const white = spectrumWhite();
    let sum = 0;
    for (let i = 0; i < FILM_TAPS; i++) {
        const j = i * 2 * 3;
        sum += 0.2126 * lut[j] * white[0] + 0.7152 * lut[j + 1] * white[1] + 0.0722 * lut[j + 2] * white[2];
    }
    return sum;
}
/** Iron's n and k at `nm`. */
function ironAt(nm) {
    const [a, b, c] = FILM_IRON;
    if (nm <= a.nm)
        return a;
    if (nm >= c.nm)
        return c;
    const [p, q] = nm <= b.nm ? [a, b] : [b, c];
    const t = (nm - p.nm) / (q.nm - p.nm);
    return { n: p.n + (q.n - p.n) * t, k: p.k + (q.k - p.k) * t };
}
/** The base phase phi at `nm`, in radians, 0 to 2 pi: the same rule as `pk_filmBase` below. */
export function filmPhase(ior, base, nm) {
    const top = ior > 1 ? Math.PI : 0;
    let under;
    if (base === "dielectric")
        under = ior < FILM_BASE_IOR ? Math.PI : 0;
    else {
        const { n, k } = ironAt(nm);
        under = Math.atan2(-k, ior - n) - Math.atan2(k, ior + n);
    }
    const tau = 2 * Math.PI;
    return (((under - top) % tau) + tau) % tau;
}
/**
 * The planted fault film-place-hue (paint.ts TEST_FAULTS): nm of first-order bright wavelength between one bin's two
 * halves, Task 14's unit for a visible shift (glsl/grating.ts PLACE_HUE_SLOPE).
 */
export const FILM_PLACE_HUE_NM = 20;
/** The planted fault film-place-hue: the two panels' centres are 288 px apart on film.html at 960 x 600, in canvas widths. */
export const FILM_PLACE_HUE_APART = 288 / 960;
/** The wavelength at which film-place-hue reads the base phase: iron's middle row, the design note's check value. */
export const FILM_PLACE_HUE_AT = FILM_IRON[1].nm;
/**
 * The planted fault film-place-hue's OPD offset, nm per canvas width. The first-order bright wavelength is
 * OPD / (1 - phi / 2 pi), so 20 nm of it is 20 (1 - phi / 2 pi) nm of OPD, over the panels' distance.
 */
export const filmPlaceHueSlope = (ior, base) => (FILM_PLACE_HUE_NM * (1 - filmPhase(ior, base, FILM_PLACE_HUE_AT) / (2 * Math.PI))) / FILM_PLACE_HUE_APART;
const f = (v) => v.toFixed(4);
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
export const GLSL_FILM = /* glsl */ `
const float PK_FILM_PI = 3.14159265359;
const float PK_FILM_TAU = 6.28318530718;
const int PK_FILM_TAPS = ${FILM_TAPS};
const float PK_FILM_NORM = ${(1 / filmLineSum()).toExponential(7)};
const float PK_FILM_BASE_IOR = ${f(FILM_BASE_IOR)};
vec2 pk_filmIron(float nm) {
  const vec2 A = vec2(${f(FILM_IRON[0].n)}, ${f(FILM_IRON[0].k)});
  const vec2 B = vec2(${f(FILM_IRON[1].n)}, ${f(FILM_IRON[1].k)});
  const vec2 C = vec2(${f(FILM_IRON[2].n)}, ${f(FILM_IRON[2].k)});
  if (nm <= ${f(FILM_IRON[0].nm)}) return A;
  if (nm <= ${f(FILM_IRON[1].nm)}) return mix(A, B, (nm - ${f(FILM_IRON[0].nm)}) / ${f(FILM_IRON[1].nm - FILM_IRON[0].nm)});
  if (nm <= ${f(FILM_IRON[2].nm)}) return mix(B, C, (nm - ${f(FILM_IRON[1].nm)}) / ${f(FILM_IRON[2].nm - FILM_IRON[1].nm)});
  return C;
}
float pk_filmF0(float a, float b) { float r = (a - b) / (a + b); return r * r; }
float pk_filmSchlick(float f0, float c) {
  float k = 1.0 - clamp(c, 0.0, 1.0);
  float k2 = k * k;
  return f0 + (1.0 - f0) * k2 * k2 * k;
}
// The base at one wavelength: x its reflectance from inside the film at normal incidence, y the base phase phi.
vec2 pk_filmBase(float ior, float metal, float nm) {
  float top = ior > 1.0 ? PK_FILM_PI : 0.0;
  if (metal < 0.5) return vec2(pk_filmF0(ior, PK_FILM_BASE_IOR), mod((ior < PK_FILM_BASE_IOR ? PK_FILM_PI : 0.0) - top, PK_FILM_TAU));
  vec2 nk = pk_filmIron(nm);
  vec2 over = vec2(ior - nk.x, -nk.y);
  vec2 under = vec2(ior + nk.x, nk.y);
  return vec2(dot(over, over) / dot(under, under), mod(atan(over.y, over.x) - atan(under.y, under.x) - top, PK_FILM_TAU));
}
vec3 filmSpec(MatOut m, vec3 n, vec3 l, vec3 view, float lightSpec) {
  if (dot(n, l) <= 0.0 || dot(n, view) <= 0.0) return vec3(0.0); // not-colour: no light from behind
  float lobe = specLobe(m, n, l, view, lightSpec);
  if (lobe < 1e-5) return vec3(0.0); // not-colour: outside the lobe
  float ior = m.film.y;
  float cosI = clamp(dot(view, normalize(l + view)), 0.0, 1.0);
#ifdef PK_FAULT_FILM_VIEW_NORMAL
  // The planted fault film-view-normal: the film reads the surface normal's angle to the eye in place of the half vector's.
  cosI = clamp(dot(view, n), 0.0, 1.0);
#endif
#ifdef PK_FAULT_FILM_NO_ANGLE
  // The planted fault film-no-angle: no angle reaches the film, so cos(theta_t) is 1 and the colour comes from param alone.
  cosI = 1.0;
#endif
  float sinT = sqrt(1.0 - cosI * cosI) / ior;
  float cosT = sqrt(max(1.0 - sinT * sinT, 0.0));
  float opd = 2.0 * ior * m.film.x * cosT;
#ifdef PK_FAULT_FILM_CLOCK
  // The planted fault film-clock: the OPD cycles on the paint clock at foil's clock rate, 120 nm a second (glsl/grating.ts).
  opd += 120.0 * uTime;
#endif
#ifdef PK_FAULT_FILM_PLACE_HUE
  // The planted fault film-place-hue: the OPD gains an offset that ramps with the pixel's x (filmPlaceHueSlope), read
  // through this page's own base phase, so film of one thickness and angle shows another colour at another place.
  opd += ${f(FILM_PLACE_HUE_NM)} * (1.0 - pk_filmBase(ior, m.filmBase, ${f(FILM_PLACE_HUE_AT)}).y / PK_FILM_TAU) / ${f(FILM_PLACE_HUE_APART)} * gl_FragCoord.x / uView.x;
#endif
  float f12 = pk_filmF0(1.0, ior);
  float r12 = pk_filmSchlick(f12, cosI);
  float t12 = 1.0 - r12;
  // Builder value, the reflectance scale: the reflectance is divided by the film's brightest reflectance at normal
  // incidence (at iron's middle row), so a clear film's faint highlight reads under one key. No source gives this scale.
  // It sets the highlight's brightness. The pull below works at unit luminance, so the scale does not reach the hue.
  float peak = sqrt(f12) + (1.0 - f12) * sqrt(pk_filmBase(ior, m.filmBase, ${f(FILM_IRON[1].nm)}).x);
  vec3 sum = vec3(0.0); // not-colour: empty sum
  for (int i = 0; i < PK_FILM_TAPS; i++) {
    float nm = 380.0 + 10.0 * float(i);
    vec2 base = pk_filmBase(ior, m.filmBase, nm);
    float r23 = pk_filmSchlick(base.x, cosT);
    sum += (r12 + t12 * t12 * r23 + 2.0 * t12 * sqrt(r12 * r23) * cos(PK_FILM_TAU * opd / nm + base.y)) * pk_spectrum(nm);
  }
  vec3 c = max(sum * PK_SPECTRUM_WHITE * PK_FILM_NORM / max(peak * peak, 1e-4), vec3(0.0)); // not-colour: no negative light
  // The pull works at unit luminance. pk_pull mixes in OKLab toward a ramp stop, so the level of its input would decide
  // the colour it returns; at unit luminance the result depends on the colour alone. The level is then put back.
  float y = dot(c, PK_SPECTRUM_Y);
  if (y <= 0.0) return vec3(0.0); // not-colour: no light
  return lobe * y * pk_bandPull(c / y, m.film.z, int(m.film.w + 0.5));
}
`;
