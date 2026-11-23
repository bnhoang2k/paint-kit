import { GLSL_TWILL, TWILL_RATIO } from "../glsl/twill.js";
import { shape } from "./shape.js";
export { TWILL_RATIO };
export function twill(opts) {
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
