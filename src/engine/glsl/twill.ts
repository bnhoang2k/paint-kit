// The twill weave in GLSL: the one source for `fields.twill` and for any page that moves its cloth.

/** Weft pick pitch over warp end pitch, as on denim. It sets the wale's slope against the threads. */
export const TWILL_RATIO = 1.5;

/**
 * The twill weave as a GLSL chunk, for a `fields.shape` that has to read the weave at its own coordinate (a page
 * whose cloth moves: bar 02 slides each row of its denim, so it reads the weave at the unslid cloth point).
 * `fields.twill` builds from this same chunk, so a fix to the weave reaches every page that draws it.
 * Include it in the shape's GLSL with `${GLSL_TWILL}`; it uses the shape prelude's `uSeed`, `hash11` and `snoise`.
 *
 * A 3/1 twill: each warp thread floats over three weft picks and under one, and the next warp steps one pick
 * along, so the floats line up in diagonal ribs (wales). Weft picks sit `TWILL_RATIO` times the warp pitch apart.
 * Every function takes `q` in short-side units, `wales` (wales per short side) and `angle` (the wales' angle on
 * screen, radians anticlockwise from the x axis):
 * - `float twillHeight(vec2 q, float wales, float angle, float side, float detail)`: the weave relief (each float
 *   a rounded yarn that dives at its ends, the weft lower in the gaps; fixed depth) plus the thread relief (twist,
 *   slubs and fuzz, zero-mean, scaled by `detail`). `side` is the short side in px, the fuzz's scale. No macro
 *   drape: the caller adds its own folds.
 * - `vec2 twillRelief(...)`, same arguments: the two levels apart, (weave, thread); `twillHeight` is their sum.
 *   `fields.twill` adds them to its drape one by one, `drape + r.x + r.y`, the order its frames were measured in.
 * - `vec2 twillDir(vec2 q, float wales, float angle)`: the warp axis, length 1 on warp floats and 0.6 on weft.
 * - `TwillWeave twillWeave(vec2 q, float wales, float angle)`: the weave cell under `q` (`m` 0..2 a warp float,
 *   3 the pick where the weft shows), for a caller that needs the cell itself.
 * Every name starts with `twill` or `TWILL_`, so the chunk sits beside a shape's own constants.
 */
export const GLSL_TWILL = /* glsl */ `
const float TWILL_RATIO = ${TWILL_RATIO.toFixed(4)};
const float TWILL_PI = 3.14159265;
// Depths in short-side units: the weave's yarn and the detail-1 thread texture.
const float TWILL_WEAVE = 0.0011;
const float TWILL_THREAD = 0.00045;
struct TwillWeave { vec2 c; vec2 cell; vec2 f; float m; float pw; float pf; };
TwillWeave twillWeave(vec2 q, float wales, float angle) {
  TwillWeave w;
  // Wale spacing 1 / wales; the diagonal of a pw x pf cell runs along the wale, 4 ends per repeat.
  w.pw = sqrt(1.0 + TWILL_RATIO * TWILL_RATIO) / (4.0 * TWILL_RATIO * wales);
  w.pf = w.pw * TWILL_RATIO;
  float rot = angle - atan(TWILL_RATIO);
  w.c = mat2(cos(rot), -sin(rot), sin(rot), cos(rot)) * q;
  vec2 g = w.c / vec2(w.pw, w.pf) + vec2(hash11(uSeed * 1.3), hash11(uSeed * 2.1)) * 64.0;
  w.cell = floor(g);
  w.f = fract(g);
  // 0..2: a warp float, 3: the pick where the warp goes under and the weft shows.
  w.m = mod(w.cell.x - w.cell.y, 4.0);
  return w;
}
// A round yarn's cross-section, 0 at its edges and 1 on its crown (t 0..1 across it).
float twillYarn(float t) { return sqrt(max(1.0 - (2.0 * t - 1.0) * (2.0 * t - 1.0), 0.0)); }
vec2 twillRelief(vec2 q, float wales, float angle, float side, float detail) {
  TwillWeave w = twillWeave(q, wales, angle);
  bool weft = w.m > 2.5;
  // Weave relief: a warp float rises over its three picks and dives at both ends; the weft sits lower.
  float across = weft ? twillYarn(w.f.y) : twillYarn(w.f.x);
  float along = (2.0 - w.m + w.f.y) / 3.0;
  float weaveH = weft ? 0.55 * across : mix(0.25, 1.0, across) * pow(sin(TWILL_PI * clamp(along, 0.0, 1.0)), 0.35);
  // Thread relief: twist ridges slanting across the yarn, slubs along it (one stream per thread), fuzz.
  float pitch = weft ? w.pf : w.pw;
  vec2 axis = weft ? w.c.yx : w.c;
  float twist = sin(2.0 * TWILL_PI * (axis.y + axis.x * 1.4) / (pitch * 0.7));
  float slub = snoise(vec2((weft ? w.cell.y : w.cell.x) * 13.1 + uSeed, axis.y / (weft ? w.pw : w.pf) * 0.45));
  float fuzz = snoise(q * side * 0.7 + uSeed * 0.37);
  float thread = (0.55 * twist + 0.3 * slub) * across + 0.15 * fuzz;
  return vec2(TWILL_WEAVE * weaveH, TWILL_THREAD * detail * thread);
}
float twillHeight(vec2 q, float wales, float angle, float side, float detail) {
  vec2 r = twillRelief(q, wales, angle, side, detail);
  return r.x + r.y;
}
vec2 twillDir(vec2 q, float wales, float angle) {
  TwillWeave w = twillWeave(q, wales, angle);
  // The warp runs along the weave frame's y axis, which twillWeave() turned by angle - atan(TWILL_RATIO): on
  // screen that is angle + atan(1 / TWILL_RATIO).
  float warp = angle + atan(1.0 / TWILL_RATIO);
  return vec2(cos(warp), sin(warp)) * (w.m > 2.5 ? 0.6 : 1.0);
}
`;
