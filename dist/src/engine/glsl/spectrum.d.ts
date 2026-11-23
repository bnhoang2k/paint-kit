/**
 * The white balance a sum of spectral lines is multiplied by, per channel: the mean luminance of the 81 table lines over
 * each channel's mean. Summing unit-power lines treats the light as equal-energy, whose white in sRGB is pink (the table's
 * mean line is 0.318, 0.250, 0.240); the light's own colour already carries its white (a key's kelvin, tinted toward the
 * page), so a material balances the spectrum to neutral first, and every visible wavelength together returns the light's
 * colour, not a pink cast over it. A von Kries scale in linear sRGB; luminance is unchanged.
 */
export declare function spectrumWhite(): [number, number, number];
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
export declare const GLSL_SPECTRUM: string;
