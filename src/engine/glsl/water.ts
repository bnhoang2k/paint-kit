// The water surface and its optics in GLSL: the one source for `fields.water` (height into the sheet), for
// `materials.water` (the floor refracted) and for `lights.throughWater` (the caustic lines).

/**
 * The water surface as a GLSL chunk: `Water waterSurface(vec2 q, float t, float seed, float waves, float speed,
 * float depth, float detail)`. A pure function of the point, the time and the seed (a timeline: no state), so a
 * shape field, a material or a page's own field can read the same water at any point and time.
 * `q` is in short-side units, centred. It returns the height `h` (short-side units), its gradient `g` and its
 * second derivatives `hess` = (h_xx, h_yy, h_xy), all analytic, so optics need no finite differences of the
 * sheet's half-float height (whose rounding would speckle the caustic lines).
 * The surface is a sum of travelling waves:
 * - swell, at every detail level (macro relief): WATER_SWELL waves, crests `waves` per short side times 1 / 0.55 to
 *   1 / 1.5, headed within 120 degrees of a seeded wind (a cellular net of caustic lines, not streaks), each of the same steepness (slope), so the long waves are the
 *   tallest. Deep-water dispersion: a wave `m` times the base wavelength turns its phase at 1 / sqrt(m) times the base
 *   rate, so shorter waves overtake longer ones and the pattern never repeats. At `speed` 1 a base wave's period is 2 s.
 * - ripples, by the detail dial (micro relief): WATER_RIPPLE waves 0.15 to 0.3 times the base wavelength, any heading.
 * `depth` 0..1 scales both (0 is a still pool).
 * Every name starts with `water` or `WATER_`.
 */
export const GLSL_WATER = /* glsl */ `
const int WATER_SWELL = 7;
const int WATER_RIPPLE = 6;
const float WATER_TAU = 6.28318531;
// Slopes at depth 1: each swell wave's and each ripple's steepness (amplitude x wavenumber), over sqrt(count) so
// the sum's spread does not grow with the count.
const float WATER_STEEP = 0.16;
const float WATER_RIPPLE_STEEP = 0.025;
struct Water { float h; vec2 g; vec3 hess; };
float waterHash(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
void waterWave(inout Water w, vec2 q, float t, vec2 dir, float k, float omega, float amp, float phase) {
  vec2 kv = dir * k;
  float th = dot(kv, q) - omega * t + phase;
  float s = sin(th);
  float c = cos(th);
  w.h += amp * s;
  w.g += amp * c * kv;
  w.hess -= amp * s * vec3(kv.x * kv.x, kv.y * kv.y, kv.x * kv.y); // not-colour: second derivatives xx, yy, xy
}
Water waterSurface(vec2 q, float t, float seed, float waves, float speed, float depth, float detail) {
  Water w;
  w.h = 0.0;
  w.g = vec2(0.0);
  w.hess = vec3(0.0); // not-colour: second derivatives
  float k0 = WATER_TAU * max(waves, 0.01);
  float rate = WATER_TAU * 0.5 * speed;
  float wind = waterHash(seed * 0.37 + 1.7) * WATER_TAU;
  for (int i = 0; i < WATER_SWELL; i++) {
    float fi = float(i);
    // Stratified, so every seed has the same spectrum (and the same focus depth) and only the pattern changes:
    // wavelength i of 7 and heading 3i mod 7 of 7, each jittered within its stratum.
    float fj = mod(fi * 3.0, float(WATER_SWELL));
    float a = wind + ((fj + 0.5 + 0.8 * (waterHash(seed * 1.31 + fi * 7.13) - 0.5)) / float(WATER_SWELL) - 0.5) * 4.19;
    float m = mix(0.55, 1.5, (fi + 0.5 + 0.8 * (waterHash(seed * 0.71 + fi * 3.17) - 0.5)) / float(WATER_SWELL));
    float k = k0 / m;
    float steep = depth * WATER_STEEP / sqrt(float(WATER_SWELL));
    waterWave(w, q, t, vec2(cos(a), sin(a)), k, rate / sqrt(m), steep / k, waterHash(seed + fi * 11.3) * WATER_TAU);
  }
  for (int i = 0; i < WATER_RIPPLE; i++) {
    float fi = float(i);
    float a = waterHash(seed * 2.03 + fi * 5.71) * WATER_TAU;
    float m = mix(0.15, 0.3, waterHash(seed * 0.43 + fi * 9.07));
    float k = k0 / m;
    float steep = detail * depth * WATER_RIPPLE_STEEP / sqrt(float(WATER_RIPPLE));
    waterWave(w, q, t, vec2(cos(a), sin(a)), k, rate / sqrt(m), steep / k, waterHash(seed * 3.3 + fi * 13.7) * WATER_TAU);
  }
  return w;
}
`;

/**
 * The optics of light through water, as a GLSL chunk after a `Water waterAt(vec2 q, float t)` (the shade pass gets
 * one from `fields.water`). Distances in short-side units; `ior` is the water's refractive index; `bed` the depth
 * of the floor (what lies under the surface; GLSL's `floor` is a built-in).
 * - `vec2 waterView(vec2 g, float ior, float bed)`: where the eye, looking straight down through a surface of
 *   slope `g`, meets the floor, as an offset from the point straight below (exact refraction).
 * - `float waterCaustic(vec2 x, float t, vec3 l, float ior, float bed, float px)`: the light a floor point `x`
 *   gets from a light at unit direction `l` (toward the light), over what a flat surface would give. A ray through
 *   surface point s lands at P(s) = s + bed * tan(flat refraction) + bed * (1 - 1 / ior) * grad h(s) (the bend
 *   linearised in the slope), so a patch of surface lights a patch of floor `det(dP/ds)` times its area, and the
 *   floor's brightness is 1 / |det(dP/ds)| = 1 / |det(I + bed * (1 - 1 / ior) * Hessian)|: rays that converge
 *   under a crest make bright lines, rays that spread leave the floor dimmer. The surface point above `x` is found
 *   by one fixed-point step from the point the flat refraction gives. Clamped at WATER_CAUSTIC_MAX (where rays cross,
 *   the area goes to 0), and averaged over 2 x 2 points `px` apart so a line under a pixel wide does not alias.
 */
export const GLSL_WATER_OPTICS = /* glsl */ `
const float WATER_CAUSTIC_MAX = 8.0;
vec2 waterView(vec2 g, float ior, float bed) {
  vec3 n = normalize(vec3(-g, 1.0)); // not-colour: the surface normal
  vec3 r = refract(vec3(0.0, 0.0, -1.0), n, 1.0 / ior); // not-colour: the view ray, straight down
  return r.xy / max(-r.z, 1e-3) * bed;
}
float waterCausticAt(vec2 x, float t, vec2 lean, float c) {
  vec2 s0 = x - lean;
  vec2 s = s0 - c * waterAt(s0, t).g;
  vec3 H = waterAt(s, t).hess;
  float det = (1.0 + c * H.x) * (1.0 + c * H.y) - c * c * H.z * H.z;
  return 1.0 / max(abs(det), 1.0 / WATER_CAUSTIC_MAX);
}
float waterCaustic(vec2 x, float t, vec3 l, float ior, float bed, float px) {
  vec3 r0 = refract(-normalize(l), vec3(0.0, 0.0, 1.0), 1.0 / ior); // not-colour: the light ray through flat water
  vec2 lean = r0.xy / max(-r0.z, 1e-3) * bed;
  float c = bed * (1.0 - 1.0 / ior);
  float e = 0.5 * px;
  return 0.25 * (waterCausticAt(x + vec2(-e, -e), t, lean, c) + waterCausticAt(x + vec2(e, -e), t, lean, c) +
                 waterCausticAt(x + vec2(-e, e), t, lean, c) + waterCausticAt(x + vec2(e, e), t, lean, c));
}
`;
