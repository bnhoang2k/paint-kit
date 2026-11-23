// `halftone`: a picture printed as a grid of ink dots, kind `points`. One instanced point (a small quad) per cell
// of a square grid turned by `angle`; each dot's area is the share of its cell the picture's tone asks for, so
// dark parts of the picture print big dots and pale parts small ones. Tone is 1 minus the source's luminance
// (Rec. 709 weights on its stored, sRGB-encoded values) at the cell centre, times `grow` (0 a pale dot field,
// 1 full strength): dot area = tone * grow * cell^2, so a tone of 1 at grow 1 prints a dot just past touching
// its neighbours (radius 0.56 cell), as a printed solid does.
//
// It writes ink, and height: above detail 0.5 each dot adds a faint dome (a printed ink film), rising to INK_FILM
// at detail 1; at or below 0.5 the height it writes is 0. Dots overlap only at their edges and are merged by a
// MAX blend, so one dot never cuts another's anti-aliased rim.
//
// The source is the stretched picture over the whole sheet: (0, 0) of the source is the sheet's top-left. It is
// uploaded at init; a page that changes its picture makes the field again. A function source is also called again,
// and its picture uploaded again, when the palette changes (`FieldRuntime.palette`). `cell` is in CSS px, so the
// grid looks the same at any pixel ratio or sheetScale. The grid is centred on the sheet and does not move, so
// the field keeps no state (`stateful: false`) and a frame depends only on its options at t and the detail dial.
// `cell` and `grow` are each a number or a function of t, read at every draw and set as uniforms: a picture that
// arrives (coarse to fine, pale to dark) changes them each frame with no shader compile and no texture upload, and
// a frame still depends on t alone. The program is built at init.
import { HEADER, locations, program } from "../gl.js";
import { GLSL_SHEET, sheetDefines } from "../sheet.js";
/** The ink film's height at detail 1, in short-side units: about a fifth of a CSS px on a 600 px side. */
export const INK_FILM = 0.0003;
const VS = /* glsl */ `
uniform vec2 uRes;
uniform float uCell, uAngle, uGrow;
uniform int uN;
uniform sampler2D uSrc;
out vec2 vLocal;
out float vR;
const vec2 CORNER[6] = vec2[6](vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(1.0, 1.0), vec2(-1.0, -1.0), vec2(1.0, 1.0), vec2(-1.0, 1.0));
void main() {
  // Cell (ix, iy) of an uN x uN grid in the turned frame, centred on the sheet centre; uN covers the sheet's diagonal.
  vec2 cell = vec2(float(gl_InstanceID % uN), float(gl_InstanceID / uN)) - 0.5 * float(uN - 1);
  float ca = cos(uAngle), sa = sin(uAngle);
  vec2 c = 0.5 * uRes + mat2(ca, sa, -sa, ca) * (cell * uCell);
  vec2 uv = c / uRes;
  float r = 0.0;
  if (all(greaterThan(c, vec2(-uCell))) && all(lessThan(c, uRes + uCell))) {
    // Source row 0 is the picture's top; sheet uv y is up.
    vec3 s = texture(uSrc, vec2(clamp(uv.x, 0.0, 1.0), 1.0 - clamp(uv.y, 0.0, 1.0))).rgb;
    float tone = 1.0 - dot(s, vec3(0.2126, 0.7152, 0.0722)); // not-colour: Rec. 709 luminance weights
    // Area = tone * grow * cell^2, so radius = cell * sqrt(tone * grow / pi).
    r = uCell * sqrt(clamp(tone * uGrow, 0.0, 1.0) / 3.14159265);
  }
  // A dot under a tenth of a px draws nothing: its quad collapses.
  float half_ = r > 0.1 ? r + 1.0 : 0.0;
  vec2 local = CORNER[gl_VertexID] * half_;
  vLocal = local;
  vR = r;
  gl_Position = vec4((c + local) / uRes * 2.0 - 1.0, 0.0, 1.0);
}
`;
const FS = /* glsl */ `
uniform float uFilm;
in vec2 vLocal;
in float vR;
out vec4 o;
void main() {
  float d = length(vLocal);
  // One px of anti-aliased edge, centred on the radius.
  float ink = clamp(vR + 0.5 - d, 0.0, 1.0);
  if (ink <= 0.0) discard;
  float dome = sqrt(max(1.0 - (d * d) / max(vR * vR, 1e-4), 0.0));
  o = sheetEncode(vec4(uFilm * dome, 1.0, ink, -1.0));
}
`;
/**
 * The smallest cell, CSS px. The field draws n x n instanced dots, n = sheet diagonal / cell (sheet px) + 2, so the
 * count grows as 1 / cell^2: about 1.3 million at cell 1 on 960 x 600. A smaller cell (or 0, or a negative one)
 * draws as this one, and a cell never falls under one sheet pixel (a sheetScale under 1 cannot shrink it further).
 */
export const MIN_CELL = 1;
/** A number option, or a timeline option read at t. */
const at = (v, t) => (typeof v === "function" ? v(t) : v);
const cellAt = (v, t) => {
    const c = at(v, t);
    return Math.max(MIN_CELL, Number.isFinite(c) ? c : MIN_CELL);
};
const growAt = (v, t) => {
    const g = at(v, t);
    return Number.isFinite(g) ? Math.min(1, Math.max(0, g)) : 0;
};
export function halftone(opts) {
    const angle = (opts.angle * Math.PI) / 180;
    return {
        kind: "points",
        writes: ["height", "ink"],
        init(gl, ctx) {
            const tex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            // Unflipped upload (ImageBitmap ignores UNPACK_FLIP_Y): the vertex shader flips y when it samples.
            const upload = (src) => {
                gl.bindTexture(gl.TEXTURE_2D, tex);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, src);
            };
            const source = opts.source;
            upload(typeof source === "function" ? source(ctx.colours()) : source);
            const vao = gl.createVertexArray();
            let built;
            // Built for the sheet format at init (the sheet is float exactly when ctx.float is), so no draw compiles.
            const build = (float) => {
                if (built)
                    gl.deleteProgram(built.prog);
                const prog = program(gl, HEADER + VS, HEADER + sheetDefines(float) + GLSL_SHEET + FS);
                built = { float, prog, loc: locations(gl, prog) };
                return built;
            };
            build(ctx.float);
            return {
                stateful: false,
                draw(sheet, t) {
                    const { prog, loc } = built && built.float === sheet.float ? built : build(sheet.float);
                    const cell = cellAt(opts.cell, t);
                    const grow = growAt(opts.grow, t);
                    // Sheet px per CSS px: the canvas's device pixels times sheetScale, read off the sheet itself.
                    const css = Math.max(1, gl.canvas.clientWidth || sheet.w);
                    const cellPx = Math.max(1, cell * (sheet.w / css));
                    const n = Math.ceil(Math.hypot(sheet.w, sheet.h) / cellPx) + 2;
                    // The ink film: none at detail 0.5 and below, rising to INK_FILM at 1. Read at draw time (the dial is live).
                    const film = INK_FILM * Math.min(1, Math.max(0, (ctx.detail - 0.5) * 2));
                    sheet.out.bind();
                    gl.useProgram(prog);
                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, tex);
                    gl.uniform1i(loc("uSrc"), 0);
                    gl.uniform2f(loc("uRes"), sheet.w, sheet.h);
                    gl.uniform1f(loc("uCell"), cellPx);
                    gl.uniform1f(loc("uAngle"), angle);
                    gl.uniform1f(loc("uGrow"), grow);
                    gl.uniform1i(loc("uN"), n);
                    gl.uniform1f(loc("uFilm"), film);
                    gl.enable(gl.BLEND);
                    gl.blendEquation(gl.MAX);
                    gl.bindVertexArray(vao);
                    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n * n);
                    gl.blendEquation(gl.FUNC_ADD);
                    gl.disable(gl.BLEND);
                },
                resize() { },
                // A picture toned from the palette is drawn again from the new palette; a canvas or bitmap stays as it is.
                ...(typeof source === "function" ? { palette: () => upload(source(ctx.colours())) } : {}),
                dispose() {
                    if (built)
                        gl.deleteProgram(built.prog);
                    built = undefined;
                    gl.deleteVertexArray(vao);
                    gl.deleteTexture(tex);
                },
            };
        },
    };
}
