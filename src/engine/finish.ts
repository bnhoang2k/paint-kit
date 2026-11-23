// The finish: seeded luminance grain, a soft highlight shoulder, sRGB encoding and a half-level dither.
// Shoulder, encode and dither are ported from lab/2026-11-wild-sampler/lib.js `FINISH`; the grain is new.
// Needs GLSL_OKLAB (for _toOklab/_fromOklab) and GLSL_HASH (for hash21) earlier in the shader. Under PK_SCREEN it also
// holds the halftone screen after light (`screen`, `screenLuma`), which needs uView earlier in the shader.

export const DEFAULT_GRAIN = 0.04;

/**
 * `vec3 finish(vec3 linearColour, vec2 fragCoord)`. The grain adds `uGrain * (hash(fragCoord, seed) - 0.5)` to
 * OKLab lightness before encoding, so it is luminance only and even across dark and light grounds. The
 * shoulder leaves colour below 0.8 untouched, so palette colours stay true.
 * `finish(c, fragCoord, keepGrain)`: with keepGrain above 0 the grain goes on after the shoulder, so it keeps its
 * size (and stays colourless) near white, and a slow ramp into white does not band. The shade pass asks for it only
 * on pixels that pass light from behind (backlit glass, which runs deep into the shoulder); everywhere else, and on
 * every page with no light behind, the grain goes through the shoulder as before.
 */
export const GLSL_FINISH = /* glsl */ `
uniform float uGrain;
uniform float uSeed;
vec3 srgbEncode(vec3 c) {
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055; // not-colour: sRGB exponent
  return mix(lo, hi, step(vec3(0.0031308), c)); // not-colour: sRGB threshold
}
// The highlight shoulder: the identity below the knee k, rolling off toward 1.0 above it with slope exp(-over / (1 - k)).
vec3 _shoulder(vec3 c) {
  const float k = 0.8;
  return min(c, vec3(k)) + (1.0 - k) * (1.0 - exp(-max(c - k, 0.0) / (1.0 - k))); // not-colour: shoulder knee
}
// The grain: uGrain * g added to OKLab lightness, so it moves lightness only.
vec3 _grain(vec3 c, float g) {
  if (uGrain <= 0.0) return c;
  vec3 lab = _toOklab(c);
  lab.x = max(lab.x + uGrain * g, 0.0);
  return max(_fromOklab(lab), 0.0);
}
// "keepGrain" > 0: the grain goes on after the shoulder, so it keeps its size near white (below).
vec3 finish(vec3 c, vec2 fragCoord, float keepGrain) {
  c = max(c, 0.0);
#ifdef PK_NOFINISH
  // Test fault "nofinish" (pages under test/faults only): the bare encode, with no grain, shoulder or dither.
  return srgbEncode(min(c, 1.0));
#else
  float g = hash21(fragCoord + fract(uSeed * 0.6180339887) * 1013.0) - 0.5;
  // The shoulder's slope near white flattens grain added before it, and a slow ramp into white then bands in 8-bit
  // runs with nothing to break them. With keepGrain the grain goes on after the shoulder, so it keeps its size (and
  // stays colourless) however far past white the light is. For colour clearly below the knee (the colour plus its
  // grain stays under it) the shoulder is the identity, and both orders draw the same picture.
  c = keepGrain > 0.0 ? _grain(_shoulder(c), g) : _shoulder(_grain(c, g));
  c = srgbEncode(c);
  float ign = fract(52.9829189 * fract(dot(fragCoord, vec2(0.06711056, 0.00583715))));
  return c + (ign - 0.5) / 255.0;
#endif
}
vec3 finish(vec3 c, vec2 fragCoord) { return finish(c, fragCoord, 0.0); }
#ifdef PK_SCREEN
// The halftone screen after light (finish.halftone): uScreenCell in drawing-buffer px, uScreenAngle in radians,
// uScreenGround the linear colour the dots sit on.
uniform float uScreenCell;
uniform float uScreenAngle;
uniform vec3 uScreenGround;
// One weight per material slot: 1 screened, 0 not (finish.halftone.slots).
uniform vec4 uScreenSlots;
// The area of a disc of radius r (in cells) centred in its unit cell, the part outside the cell cut off: pi r^2 up to
// r 0.5, then less the four caps past the cell's edges, reaching 1 at the corner (r = sqrt(0.5)).
float _screenArea(float r) {
  float a = 3.14159265 * r * r;
  if (r <= 0.5) return a;
  return a - 4.0 * (r * r * acos(0.5 / r) - 0.5 * sqrt(r * r - 0.25));
}
// Its rate of change with r: the length of the circle's arc inside the cell.
float _screenEdge(float r) {
  return r <= 0.5 ? 6.28318531 * r : 2.0 * r * (3.14159265 - 4.0 * acos(0.5 / r));
}
// The luminance the screen reads: Rec. 709 weights on the colour as displayed (shoulder, then sRGB encode), as
// fields.halftone reads its source's stored, sRGB-encoded values.
float screenLuma(vec3 c) {
  return dot(srgbEncode(_shoulder(max(c, 0.0))), vec3(0.2126, 0.7152, 0.0722)); // not-colour: Rec. 709 luminance weights
}
// The dot's area from a lit luminance 'l' against the bed's, so the cell brightens as the light grows on either side
// of the bed. A lit colour lighter than the bed prints light dots that cover l's share of the way from the bed up to
// white, (l - g) / (1 - g); one darker than the bed prints dark dots that cover its share of the way from the bed down
// to black, (g - l) / g, so they shrink as the light grows. At l = g the bed shows alone.
float screenArea(float l) {
  float g = screenLuma(uScreenGround);
  return l >= g ? (l - g) / max(1.0 - g, 1e-4) : (g - l) / max(g, 1e-4);
}
// One dot per cell of the turned grid (centred on the canvas, as fields.halftone centres its grid on the sheet): the
// dot prints 'lit' on uScreenGround and covers 'area' of its cell exactly (the disc whose cut area is 'area'), so a
// cell's mean is mix(ground, lit, area). One buffer px of anti-aliased edge, centred on the dot's rim.
vec3 screen(vec3 lit, float area, vec2 fragCoord) {
  area = clamp(area, 0.0, 1.0);
  if (area <= 0.0) return uScreenGround;
  if (area >= 1.0) return lit;
  float ca = cos(uScreenAngle), sa = sin(uScreenAngle);
  vec2 g = mat2(ca, -sa, sa, ca) * (fragCoord - 0.5 * uView) / uScreenCell;
  float r = length(g - floor(g + 0.5));
  float ink = clamp((area - _screenArea(r)) / max(_screenEdge(r), 1e-3) * uScreenCell + 0.5, 0.0, 1.0);
  return mix(uScreenGround, lit, ink);
}
#endif
`;

/** Put after the shader header to switch the finish off (the "nofinish" test fault). */
export const NOFINISH_DEFINE = "#define PK_NOFINISH\n";
