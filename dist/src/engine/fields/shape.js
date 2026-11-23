// `shape` fields: a formula drawn by a fragment shader into the sheet. `fields.sheet` is the plain paper sheet.
import { HEADER, VS_FULLSCREEN, bindTexture, locations, program, quad, setUniform } from "../gl.js";
import { GLSL_FBM, GLSL_HASH, GLSL_NOISE } from "../glsl/noise.js";
import { GLSL_SHEET, sheetDefines } from "../sheet.js";
/**
 * What a shape's GLSL sees: `uTime`, `uDt`, `uDetail` (0..1), `uSeed`, `uRes` (sheet px), hash, snoise and fbm.
 * It defines `vec4 field(vec2 uv, vec2 q)` returning (height, coverage, ink, slot), where `uv` is 0..1 and `q`
 * is the position in short-side units, centred, so a shape never stretches. Height is in short-side units.
 * A shape that writes direction also defines `vec2 fieldDir(vec2 uv, vec2 q)`: a unit direction (x right, y up),
 * or a shorter one (0.5..1) to grade it; under 0.5 (as `vec2(0.0)`) leaves the direction below unchanged.
 * A shape that writes "rest" (it moves the surface: a strip's sway or lift) also defines
 * `vec2 fieldRest(vec2 uv, vec2 q)`: the uv where the point now at `uv` sat on the flat sheet. It is written where
 * the shape's coverage is above 0.5 (everywhere when it does not write coverage). Every rest pass is drawn first
 * (`drawRest`), at the screen position; the shape's other passes then draw in list order with every other field, so
 * its slot and direction keep their list-order precedence. The rest map moves positions only: the direction a
 * carried field writes is its rest-frame direction, exact for a translation (sway, lift), not for a rotating or
 * shearing surface. A `carried` shape (and fields.sheet and fields.twill) is drawn at the rest position the
 * writers left: its `uv` and `q` are the flat sheet's, so its relief moves with the surface.
 * A shape that writes "param" also defines `float fieldParam(vec2 uv, vec2 q)`: the 0..1 value at this point, a fixed
 * number or a per-pixel formula. It is written where the shape's coverage is above 0.5, and not where `field` discards.
 */
const PRELUDE = /* glsl */ `
uniform float uTime, uDt, uDetail, uSeed;
uniform vec2 uRes;
#ifdef PK_CARRIED
uniform sampler2D uRest;
#endif
in vec2 vUv;
out vec4 o;
`;
const MAIN = /* glsl */ `
void main() {
#ifdef PK_CARRIED
  vec2 uv = vUv + restOffsetHere(uRest) / uRes;
#else
  vec2 uv = vUv;
#endif
  vec2 q = (uv - 0.5) * uRes / min(uRes.x, uRes.y);
#ifdef DIR_PASS
  // Length is kept up to 1 (it grades the direction); a longer vector is cut to 1. Under 0.5 is "no write".
  vec2 d = fieldDir(uv, q);
  float l = length(d);
  o = dirEncode(l > 1.0 ? d / l : d);
#elif defined(PARAM_PASS)
  field(uv, q); // Where the shape discards, its layer stays "param not written".
  o = paramEncode(fieldParam(uv, q));
#elif defined(REST_PASS)
#ifdef REST_GATED
  if (field(uv, q).y <= 0.5) discard;
#endif
  o = restEncode((fieldRest(uv, q) - uv) * uRes);
#else
  o = sheetEncode(field(uv, q));
#endif
}
`;
export function shape(opts) {
    const writesDir = opts.writes.includes("direction");
    const writesRest = opts.writes.includes("rest");
    const writesParam = opts.writes.includes("param");
    const passes = ["main", ...(writesDir ? ["dir"] : []), ...(writesParam ? ["param"] : []), ...(writesRest ? ["rest"] : [])];
    const define = { main: "", dir: "#define DIR_PASS\n", param: "#define PARAM_PASS\n", rest: "#define REST_PASS\n" + (opts.writes.includes("coverage") ? "#define REST_GATED\n" : "") };
    return {
        kind: "shape",
        writes: opts.writes,
        init(gl, ctx) {
            let built;
            const build = (float, carried) => {
                const src = (pass) => HEADER + define[pass] + (carried ? "#define PK_CARRIED\n" : "") + sheetDefines(float) + GLSL_HASH + GLSL_NOISE + GLSL_FBM + GLSL_SHEET + PRELUDE + opts.glsl + MAIN;
                const progs = passes.map((pass) => {
                    const prog = program(gl, VS_FULLSCREEN, src(pass));
                    return { pass, prog, loc: locations(gl, prog) };
                });
                built?.progs.forEach((p) => gl.deleteProgram(p.prog));
                built = { float, carried, progs };
                return built;
            };
            // `restPass`: the rest pass alone (drawRest), or every other pass (draw).
            const run = (sheet, t, dt, restPass) => {
                const carried = !!opts.carried && !writesRest && !!sheet.rest && sheet.readsRest;
                const b = built && built.float === sheet.float && built.carried === carried ? built : build(sheet.float, carried);
                for (const { pass, prog, loc } of b.progs) {
                    if ((pass === "rest") !== restPass)
                        continue;
                    const out = pass === "main" ? sheet.out : pass === "dir" || pass === "param" ? sheet.outDir : sheet.rest;
                    if (!out)
                        continue;
                    out.bind();
                    // Direction and param share one image: each pass writes only its own components.
                    const shared = writesParam && (pass === "dir" || pass === "param");
                    if (shared)
                        gl.colorMask(pass === "dir", pass === "dir", pass === "param", pass === "param");
                    gl.useProgram(prog);
                    if (carried)
                        bindTexture(gl, loc("uRest"), 0, sheet.rest.tex);
                    gl.uniform1f(loc("uTime"), t);
                    gl.uniform1f(loc("uDt"), dt);
                    gl.uniform1f(loc("uDetail"), ctx.detail);
                    gl.uniform1f(loc("uSeed"), ctx.seed);
                    gl.uniform2f(loc("uRes"), sheet.w, sheet.h);
                    for (const [k, v] of Object.entries(opts.uniforms ?? {}))
                        setUniform(gl, loc(k), v);
                    quad(gl);
                    if (shared)
                        gl.colorMask(true, true, true, true);
                }
            };
            return {
                draw: (sheet, t, dt) => run(sheet, t, dt, false),
                ...(writesRest ? { drawRest: (sheet, t, dt) => run(sheet, t, dt, true) } : {}),
                resize() { },
                dispose() {
                    built?.progs.forEach((p) => gl.deleteProgram(p.prog));
                    built = undefined;
                },
            };
        },
    };
}
/**
 * A sheet of paper with a gentle macro warp (`warp` 0..1) that drifts slowly, and fibre micro relief that the
 * detail dial scales. Macro relief stays at every detail level. It is carried: on a page whose fields move the
 * surface (write "rest"), the warp moves with it.
 */
export function sheet(opts) {
    return shape({
        writes: ["height", "coverage"],
        carried: true,
        uniforms: { uWarp: Math.min(1, Math.max(0, opts.warp)) },
        glsl: /* glsl */ `
uniform float uWarp;
vec4 field(vec2 uv, vec2 q) {
  vec2 off = vec2(hash11(uSeed), hash11(uSeed + 7.0)) * 100.0;
  float drift = uTime * 0.05;
  vec2 p = q * 1.4 + off;
  float macro = snoise(p + vec2(drift, -0.6 * drift)) * 0.65 + snoise(p * 2.3 - vec2(0.4 * drift, drift)) * 0.35;
  float micro = fbm(q * 180.0 + off, 2);
  return vec4(uWarp * 0.04 * macro + uDetail * 0.0004 * micro, 1.0, 0.0, 0.0);
}
`,
    });
}
