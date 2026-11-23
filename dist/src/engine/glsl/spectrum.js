// The spectrum helper in GLSL: the GPU side of spectrum.ts, for a material that turns light into wavelengths (foil,
// thin film) or reads heat colour, and pulls the result toward the page's ramp.
import { spectrumLut } from "../spectrum.js";
/** `spectrumLut()` as the body of a GLSL `vec3[81]` constructor, one sample per line (8 significant digits). */
function lutRows() {
    const lut = spectrumLut();
    const rows = [];
    for (let i = 0; i < lut.length; i += 3) {
        const v = [lut[i], lut[i + 1], lut[i + 2]].map((x) => x.toExponential(7));
        rows.push(`  vec3(${v.join(", ")})`);
    }
    return rows.join(",\n");
}
/**
 * The white balance a sum of spectral lines is multiplied by, per channel: the mean luminance of the 81 table lines over
 * each channel's mean. Summing unit-power lines treats the light as equal-energy, whose white in sRGB is pink (the table's
 * mean line is 0.318, 0.250, 0.240); the light's own colour already carries its white (a key's kelvin, tinted toward the
 * page), so a material balances the spectrum to neutral first, and every visible wavelength together returns the light's
 * colour, not a pink cast over it. A von Kries scale in linear sRGB; luminance is unchanged.
 */
export function spectrumWhite() {
    const lut = spectrumLut();
    const n = lut.length / 3;
    const mean = [0, 0, 0];
    for (let i = 0; i < n; i++)
        for (let k = 0; k < 3; k++)
            mean[k] += lut[i * 3 + k] / n;
    const y = 0.2126 * mean[0] + 0.7152 * mean[1] + 0.0722 * mean[2];
    return [y / mean[0], y / mean[1], y / mean[2]];
}
/**
 * GLSL ES 3.0 chunk, three functions and the white balance:
 * - `vec3 pk_spectrum(float nm)`: the linear sRGB of a unit-power line at `nm`, unclipped (`wavelengthToLinear`),
 *   linear between the 5 nm samples, black outside 380..780 nm. Sum lines over a spread before pulling.
 * - `vec3 pk_pull(vec3 c, float amount, int target)`: `pullToRamp` on the GPU. `amount` is clamped to 0..1 and 0
 *   returns `c` as given. `target` 1 is "ground" (the ground's hue and chroma at `c`'s own OKLab lightness, clamped to
 *   0..1 as `pullToRamp`'s is); 0 is "nearest" (the ramp stop nearest `c` in OKLab, ties toward the ground), and so is
 *   any value but 1 (a material passes only 0 or 1, from a `PullTarget`). It reads the ramp uniforms `uRamp[5]` and
 *   `uGround`, which `GLSL_OKLAB` declares and the shade pass sets from the page's tokens at every draw, so a token
 *   change reaches it with no work from the material. Unlike the CPU it does not reduce chroma, and `_toOklab`
 *   clamps negative LMS: at amount 1 it picks the same target as `pullToRamp`, but between 0 and 1 a colour far
 *   outside sRGB (a raw spectral line) parts from the CPU (0.06 to 0.11 in OKLab, measured at 0.5). Never compare
 *   the two there.
 * - `vec3 pk_bandPull(vec3 c, float amount, int target)`: `pk_pull` for a band of light. It moves the colour and keeps the
 *   band's own luminance, so a band with no light in it stays dark. Amount 0 returns `c` as given.
 * - `PK_SPECTRUM_WHITE`: `spectrumWhite()`, and `PK_SPECTRUM_Y`, the Rec. 709 luminance weights.
 *
 * The samples are baked into the chunk as a constant array (`spectrumLut()`, generated from `CIE_1931_2DEG` when
 * this module loads), so a material binds nothing for them: it has no uniform or texture to set, and the table can
 * never be missing. (A uniform array would not work through `Material.uniforms` today: the engine's `setUniform`
 * sets an array longer than 4 with `uniform1fv`, which WebGL rejects on a `vec3[81]`; and `Material.textures` take
 * 8-bit pictures, which cannot hold the negative lobes.)
 *
 * How a material uses it (Task 13, foil): put `GLSL_SPECTRUM` at the top of the material's `glsl` string. The
 * shade pass stitches materials after `GLSL_OKLAB`, so `_toOklab`, `_fromOklab`, `uRamp` and `uGround` are in scope.
 * The chunk has no `$`, and an include guard (`PK_SPECTRUM`) keeps it to one copy when two slots carry it. Pass the
 * pull amount and target as the material's own uniforms (`u_$_pull`, a float; the target as a float cast to int).
 * Every name starts with `pk_` or `PK_`.
 */
export const GLSL_SPECTRUM = /* glsl */ `
#ifndef PK_SPECTRUM
#define PK_SPECTRUM
// Spectral colours: physics, not page colours (the CIE 1931 2-degree observer through the sRGB matrix, unclipped).
// The page's palette reaches them only through pk_pull.
const vec3 PK_SPECTRUM_LUT[81] = vec3[81](
${lutRows()}
);
vec3 pk_spectrum(float nm) {
  if (!(nm >= 380.0 && nm <= 780.0)) return vec3(0.0);
  float x = (nm - 380.0) / 5.0;
  int i = min(int(x), 79);
  return mix(PK_SPECTRUM_LUT[i], PK_SPECTRUM_LUT[i + 1], x - float(i));
}
vec3 pk_pull(vec3 c, float amount, int target) {
  float a = clamp(amount, 0.0, 1.0);
  if (a <= 0.0) return c;
  vec3 p = _toOklab(c);
  vec3 goal;
  if (target == 1) {
    // As pullToRamp's ground: c's lightness, held to 0..1, with the ground's a and b.
    goal = vec3(clamp(p.x, 0.0, 1.0), _toOklab(uGround).yz); // not-colour: OKLab lightness of c with the ground's a and b
  } else {
    // Target 0, "nearest"; any value but 1 lands here.
    goal = _toOklab(uRamp[0]);
    float best = distance(p, goal);
    for (int i = 1; i < 5; i++) {
      vec3 q = _toOklab(uRamp[i]);
      float d = distance(p, q);
      if (d < best) { best = d; goal = q; }
    }
  }
  return _fromOklab(mix(p, goal, a));
}
const vec3 PK_SPECTRUM_WHITE = vec3(${spectrumWhite().map((v) => v.toExponential(7)).join(", ")}); // not-colour: white balance, equal-energy to neutral
const vec3 PK_SPECTRUM_Y = vec3(0.2126, 0.7152, 0.0722); // not-colour: Rec. 709 luminance weights
// The pull moves a band's colour, never its power. pk_pull mixes OKLab lightness too, so on its own it would light a
// band with no light in it (black pulled toward a stop); this puts the band's own luminance back. Amount 0 returns
// the band as it is.
vec3 pk_bandPull(vec3 c, float amount, int target) {
  if (amount <= 0.0) return c;
  float y = dot(c, PK_SPECTRUM_Y);
  if (y <= 0.0) return vec3(0.0); // not-colour: no light
  vec3 p = pk_pull(c, amount, target);
  float yp = dot(p, PK_SPECTRUM_Y);
  return yp > 1e-6 ? p * (y / yp) : vec3(y);
}
#endif
`;
