/** Weft pick pitch over warp end pitch, as on denim. It sets the wale's slope against the threads. */
export declare const TWILL_RATIO = 1.5;
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
export declare const GLSL_TWILL: string;
