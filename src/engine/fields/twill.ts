// `twill`: woven cloth, as denim is woven. A 3/1 twill: each warp thread floats over three weft picks and under
// one, and the next warp steps one pick along, so the floats line up in diagonal ribs (wales). Warp ends sit 1.5
// times closer than weft picks, as on denim, which steepens the diagonal; the weave is turned so the wales run at
// `angle`. It writes height and direction:
// - height, three levels. Macro: a soft drape of folds, `scale` deep, drifting slowly, which stays at every
//   detail level (the relief law needs it). Weave: each float is a rounded yarn that dives at its ends, and the weft shows lower in
//   the gaps; fixed depth, independent of detail. Thread: yarn twist, slubs (thick and thin runs along a thread)
//   and fuzz, all zero-mean and scaled by the detail dial.
// - direction: the warp (thread) axis everywhere, at length 1 on warp floats and 0.6 on weft, so the denim
//   material can tell the two apart (warp takes the dye, weft the ground) and streak its dye and sheen along the
//   warp. With weft picks TWILL_RATIO times the warp pitch, the warp runs atan(1 / TWILL_RATIO) anticlockwise of
//   the wale (33.7 degrees at 1.5).
// The weave and thread levels and the direction are the engine's shared chunk, GLSL_TWILL (../glsl/twill.ts),
// which a page that moves its cloth includes in its own shape field; this field adds only the macro drape.
import type { Field } from "../types.ts";
import { GLSL_TWILL, TWILL_RATIO } from "../glsl/twill.ts";
import { shape } from "./shape.ts";

export { TWILL_RATIO };

export type TwillOptions = {
  /** Wales (diagonal ribs) per short side of the canvas; 48 puts one every 12.5 px on a 600 px side. */
  wales: number;
  /** The wales' angle on screen, degrees anticlockwise from the x axis; 63 is a right-hand twill. */
  angle: number;
  /** Depth of the cloth's macro drape, 0 (flat) to 1 (deep folds). The weave's own depth is fixed. */
  scale: number;
};

export function twill(opts: TwillOptions): Field {
  const wales = Math.max(1, opts.wales);
  return shape({
    writes: ["height", "direction"],
    // The cloth is the sheet: on a page whose fields move it (write "rest"), the weave moves with it.
    carried: true,
    uniforms: { uWales: wales, uAngle: (opts.angle * Math.PI) / 180, uScale: Math.min(1, Math.max(0, opts.scale)) },
    // The weave and thread relief and the warp direction come from the shared chunk (GLSL_TWILL); this field
    // adds the macro drape.
    glsl: /* glsl */ `
uniform float uWales, uAngle, uScale;
const float PI = 3.14159265;
${GLSL_TWILL}
vec4 field(vec2 uv, vec2 q) {
  float side = min(uRes.x, uRes.y);
  // Macro drape: folds stretched about 2.5:1 along a seeded direction, drifting slowly (cloth in still air).
  float a = hash11(uSeed * 0.53) * PI;
  vec2 p = mat2(cos(a), sin(a), -sin(a), cos(a)) * q;
  vec2 off = vec2(hash11(uSeed + 3.0), hash11(uSeed + 9.0)) * 100.0;
  float drift = uTime * 0.03;
  float drape = snoise(p * vec2(0.9, 2.3) + off + vec2(drift, -0.5 * drift)) * 0.7 + snoise(p * vec2(2.1, 4.4) - off - vec2(0.4 * drift, drift)) * 0.3;
  // Drape, then weave, then thread, added in that order (float addition is not associative).
  vec2 r = twillRelief(q, uWales, uAngle, side, uDetail);
  return vec4(uScale * 0.035 * drape + r.x + r.y, 1.0, 0.0, 0.0);
}
vec2 fieldDir(vec2 uv, vec2 q) {
  return twillDir(q, uWales, uAngle);
}
`,
  });
}
