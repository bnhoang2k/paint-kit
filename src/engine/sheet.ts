// The sheet: one RGBA image (R height, G coverage, B ink, A material slot) plus an optional direction image.
// RGBA16F when float targets render; RGBA8 otherwise, with height and direction offset-encoded.
// Fields draw their own layer into `out`; `commit` blends it into `a` by the blend rule, in field order:
// height adds, coverage multiplies, ink takes the max, slot, direction and param overwrite where the field's coverage
// is above 0.5 (a field that does not write coverage counts as fully covering).
// Before each field draws, the engine clears `out` (and `outDir`) to the "no effect" layer: height 0, coverage 1,
// ink 0, slot "none" (-1), direction "none" (0, 0) and param not written. A direction's length grades it: a field may write a length
// from 0.5 to 1 (how strongly the surface runs that way; the twill marks weft with 0.6), and one under 0.5 is
// "no write". A field that draws only part of the sheet (dots, strokes,
// `discard`) leaves the rest as no effect, never the previous field's layer.
//
// The rest image (only when a field writes "rest"): per pixel, where that point of the surface sat on the flat
// sheet, stored as the offset from the pixel to its rest position in sheet px (rest = pixel + offset). `begin`
// clears it to offset 0 (every point at rest, where it shows), so a page with no rest writer reads the screen
// position exactly. Rest writers' rest passes draw straight into it (no blend: a later writer overwrites where its
// coverage is above 0.5, as slot does), before any field's other passes. Why an offset and not the position: a half
// float keeps 11 significant bits, so an absolute position at 2048 to 2560 px would step in 2 px (fibres a few px
// wide would shimmer); an offset is small where texture is fine: steps of 1/512 px under 4 px of sway (1/256 from
// 4 to 8), 1/64 px under 32, 1/8 px under 256, 1/2 px under 1024 and 2 px only past 2048 px (a surface moved more than a whole 2560 px
// screen, a uniform shift whose error is the same at every pixel). Format: RG16F with float targets (4 bytes per
// px, one target, about 11.7 MB at 2160 x 1350); RGBA8 without, each axis packed into two bytes as a 16-bit fixed
// point of 1/8 px over +-4096 px. Readers fetch their own texel (no filtering), so the 8-bit packing holds.
//
// The param channel (only when a field writes "param"): a free 0..1 number per pixel, which a material reads as
// `s.param`. It lives in the blue component of the direction image, which direction leaves unused, so a page that
// writes both pays for no extra image and a page that writes neither allocates nothing new. A page that writes param
// alone allocates the direction image for it, and `writesDir` stays false so its direction still reads as "none
// written". `begin` starts param at 0. In a field's layer (`outDir`) alpha says "param written here": the engine clears
// it to 0, so a field that draws only part of the sheet leaves the rest unwritten. `commit` overwrites where the
// field wrote param and its coverage is above 0.5, as slot does.
import { HEADER, VS_FULLSCREEN, bindTexture, locations, program, quad, target, type Target } from "./gl.ts";
import type { SheetChannel, SheetSample } from "./types.ts";

/**
 * GLSL: `vec4 sheetEncode(vec4 v)` / `sheetDecode` for (height, coverage, ink, slot), and `dirEncode(vec2)` /
 * `dirDecode` for a unit direction. Fields write `sheetEncode(...)`; readers decode. `PK_SHEET8` selects RGBA8.
 */
export const GLSL_SHEET = /* glsl */ `
#ifdef PK_SHEET8
// Height keeps +-0.0625 short-side units in 8 bits, dithered by half a level so slopes read as fine noise,
// not as contour lines. Used in fragment shaders only (gl_FragCoord).
float _sheetDither() { return fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5; }
// Slot -1 ("none", a cleared layer) to 3 is stored as (slot + 1) / 4.
vec4 sheetEncode(vec4 v) { return vec4(v.x * 8.0 + 0.5 + _sheetDither() / 255.0, v.y, v.z, (v.w + 1.0) / 4.0); }
vec4 sheetDecode(vec4 e) { return vec4((e.x - 0.5) * 0.125, e.y, e.z, floor(e.w * 4.0 + 0.5) - 1.0); }
vec4 dirEncode(vec2 d) { return vec4(d * 0.5 + 0.5, 0.0, 1.0); }
vec2 dirDecode(vec4 e) { return e.xy * 2.0 - 1.0; }
// The rest offset (sheet px): 1/8 px steps over +-4096 px, each axis as a high and a low byte.
vec2 _restBytes(float v) { float n = clamp(floor(v * 8.0 + 0.5) + 32768.0, 0.0, 65535.0); float hi = floor(n / 256.0); return vec2(hi, n - hi * 256.0) / 255.0; }
vec4 restEncode(vec2 off) { return vec4(_restBytes(off.x), _restBytes(off.y)); }
vec2 restDecode(vec4 e) { vec4 b = floor(e * 255.0 + 0.5); return (vec2(b.x * 256.0 + b.y, b.z * 256.0 + b.w) - 32768.0) / 8.0; }
#else
vec4 sheetEncode(vec4 v) { return v; }
vec4 sheetDecode(vec4 e) { return e; }
vec4 dirEncode(vec2 d) { return vec4(d, 0.0, 1.0); }
vec2 dirDecode(vec4 e) { return e.xy; }
vec4 restEncode(vec2 off) { return vec4(off, 0.0, 1.0); }
vec2 restDecode(vec4 e) { return e.xy; }
#endif
// The rest offset at this fragment's own texel of the rest image (a sheet-sized pass).
vec2 restOffsetHere(sampler2D tex) { return restDecode(texelFetch(tex, ivec2(gl_FragCoord.xy), 0)); }
// Param in the direction image: blue is the value, and alpha marks it written in a field's layer. A field that also
// writes direction draws the two with colour masks, so neither pass overwrites the other's components.
vec4 paramEncode(float p) { return vec4(0.0, 0.0, clamp(p, 0.0, 1.0), 1.0); }
float paramDecode(vec4 e) { return e.z; }
`;

export const sheetDefines = (float: boolean) => (float ? "" : "#define PK_SHEET8\n");

const COMMIT = /* glsl */ `
uniform sampler2D uPrev, uField, uPrevDir, uFieldDir;
uniform vec4 uMask;
uniform float uWritesDir, uWritesParam;
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 f = sheetDecode(texelFetch(uField, p, 0));
  float cov = uMask.y > 0.5 ? f.y : 1.0;
#ifdef DIR_PASS
  vec4 prevTexel = texelFetch(uPrevDir, p, 0);
  vec4 fieldTexel = texelFetch(uFieldDir, p, 0);
  vec2 prev = dirDecode(prevTexel);
  vec2 fd = dirDecode(fieldTexel);
  vec4 e = dirEncode(uWritesDir > 0.5 && cov > 0.5 && dot(fd, fd) > 0.25 ? fd : prev);
  e.z = uWritesParam > 0.5 && cov > 0.5 && fieldTexel.a > 0.5 ? paramDecode(fieldTexel) : paramDecode(prevTexel);
  o = e;
#else
  vec4 a = sheetDecode(texelFetch(uPrev, p, 0));
  a.x += uMask.x * f.x;
  a.y *= mix(1.0, f.y, uMask.y);
  a.z = max(a.z, uMask.z * f.z);
  if (uMask.w > 0.5 && cov > 0.5 && f.w > -0.5) a.w = f.w;
  o = sheetEncode(a);
#endif
}
`;

const PROBE = /* glsl */ `
uniform sampler2D uSheet;
uniform vec2 uSize, uGrid;
out vec4 o;
void main() { o = texelFetch(uSheet, ivec2(floor(gl_FragCoord.xy / uGrid * uSize)), 0); }
`;

export type Sheet = {
  /** The blended sheet so far (after `commit`, the result). */
  a: Target;
  /** The blended direction image, when any field writes direction or param (param is its blue component). */
  dir?: Target;
  /** A field writes direction. False on a page where `dir` exists only to hold param. */
  writesDir: boolean;
  /** Where a field draws its own layer before `commit`. */
  out: Target;
  outDir?: Target;
  /** The rest image, when any field writes "rest": rest writers draw into it directly; see the file's header. */
  rest?: Target;
  /**
   * Readers (carried fields, the shade pass) sample `rest`. False only under the test fault 'rest-ignored', which
   * pins every texture to the screen while writers still write.
   */
  readsRest: boolean;
  w: number;
  h: number;
  float: boolean;
};

export type SheetStore = Sheet & {
  /** Clears `a` to height 0, coverage 1, ink 0, slot 0 (direction to +x, and the rest offset to 0). */
  begin(): void;
  /** Clears `out` (and `outDir`) to the "no effect" layer, before a field draws. */
  clearOut(): void;
  /** Blends `out` into `a` by the blend rule for the channels in `writes`. */
  commit(writes: SheetChannel[]): void;
  /** Decoded channels on an n x n grid of sample points, rows top to bottom. */
  readGrid(n: number): SheetSample;
  /** Decoded channels of a region in sheet pixels (top-left origin), rows top to bottom. */
  readRegion(x: number, y: number, w: number, h: number): SheetSample;
  dispose(): void;
};

type Programs = { commit: WebGLProgram; commitDir: WebGLProgram; probe: WebGLProgram };
const cache = new WeakMap<WebGL2RenderingContext, Map<boolean, Programs>>();

function programs(gl: WebGL2RenderingContext, float: boolean): Programs {
  let byFormat = cache.get(gl);
  if (!byFormat) cache.set(gl, (byFormat = new Map()));
  let p = byFormat.get(float);
  if (!p) {
    const head = HEADER + sheetDefines(float) + GLSL_SHEET;
    p = {
      commit: program(gl, VS_FULLSCREEN, head + COMMIT),
      commitDir: program(gl, VS_FULLSCREEN, head.replace(HEADER, HEADER + "#define DIR_PASS\n") + COMMIT),
      probe: program(gl, VS_FULLSCREEN, HEADER + PROBE),
    };
    byFormat.set(float, p);
  }
  return p;
}

export function createSheet(gl: WebGL2RenderingContext, w: number, h: number, float: boolean, withDir: boolean, withRest = false, readsRest = true, withParam = false): SheetStore {
  const progs = programs(gl, float);
  const loc = {
    commit: locations(gl, progs.commit),
    commitDir: locations(gl, progs.commitDir),
    probe: locations(gl, progs.probe),
  };
  const make = () => target(gl, w, h, float);
  let spare = make();
  const withDirImage = withDir || withParam;
  let spareDir = withDirImage ? make() : undefined;

  const decode = (data: ArrayLike<number>, count: number): SheetSample => {
    const s = float ? 1 : 1 / 255;
    const out: SheetSample = { height: [], coverage: [], ink: [], slot: [], param: new Array<number>(count).fill(0) };
    for (let i = 0; i < count; i++) {
      const r = data[i * 4]! * s;
      const a = data[i * 4 + 3]! * s;
      out.height.push(float ? r : (r - 0.5) * 0.125);
      out.coverage.push(data[i * 4 + 1]! * s);
      out.ink.push(data[i * 4 + 2]! * s);
      out.slot.push(float ? Math.round(a) : Math.floor(a * 4 + 0.5) - 1);
    }
    return out;
  };

  /** Reads the bound framebuffer's region and flips rows to top-down. */
  const readRaw = (x: number, y: number, rw: number, rh: number): Float32Array | Uint8Array => {
    const n = rw * rh * 4;
    const raw = float ? new Float32Array(n) : new Uint8Array(n);
    gl.readPixels(x, y, rw, rh, gl.RGBA, float ? gl.FLOAT : gl.UNSIGNED_BYTE, raw);
    const flipped = float ? new Float32Array(n) : new Uint8Array(n);
    const row = rw * 4;
    for (let j = 0; j < rh; j++) flipped.set(raw.subarray((rh - 1 - j) * row, (rh - j) * row), j * row);
    return flipped;
  };
  const read = (x: number, y: number, rw: number, rh: number): SheetSample => decode(readRaw(x, y, rw, rh), rw * rh);
  /**
   * Decodes the direction image's region (bound framebuffer) into `s`: param from blue, and (x, y) pairs as GLSL
   * `dirDecode` does when a field writes direction.
   */
  const readDirImage = (s: SheetSample, x: number, y: number, rw: number, rh: number) => {
    const raw = readRaw(x, y, rw, rh);
    const dir: [number, number][] = [];
    for (let i = 0; i < rw * rh; i++) {
      const r = raw[i * 4]!;
      const g = raw[i * 4 + 1]!;
      dir.push(float ? [r, g] : [(r / 255) * 2 - 1, (g / 255) * 2 - 1]);
      s.param[i] = float ? raw[i * 4 + 2]! : raw[i * 4 + 2]! / 255;
    }
    if (withDir) s.dir = dir;
  };

  const store: SheetStore = {
    a: make(),
    out: make(),
    readsRest,
    writesDir: withDir,
    w,
    h,
    float,
    begin() {
      store.a.bind();
      // The empty sheet: height 0, coverage 1, ink 0, slot 0, encoded for the format.
      gl.clearColor(float ? 0 : 0.5, 1, 0, float ? 0 : 0.25);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (store.dir) {
        store.dir.bind();
        gl.clearColor(1, float ? 0 : 0.5, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      if (store.rest) {
        store.rest.bind();
        // Offset 0: in 8 bits, 32768 on each axis (high byte 128, low byte 0).
        gl.clearColor(float ? 0 : 128 / 255, 0, float ? 0 : 128 / 255, float ? 1 : 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
    },
    clearOut() {
      store.out.bind();
      // No effect: height 0, coverage 1, ink 0, slot -1 ("none"), encoded for the format.
      gl.clearColor(float ? 0 : 0.5, 1, 0, float ? -1 : 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (store.outDir) {
        store.outDir.bind();
        // Direction (0, 0): "none", so the commit keeps the direction below. Alpha 0: param not written.
        gl.clearColor(float ? 0 : 0.5, float ? 0 : 0.5, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
    },
    commit(writes) {
      const has = (c: SheetChannel) => (writes.includes(c) ? 1 : 0);
      if (store.dir && store.outDir && spareDir) {
        spareDir.bind();
        gl.useProgram(progs.commitDir);
        const l = loc.commitDir;
        bindTexture(gl, l("uField"), 0, store.out.tex);
        bindTexture(gl, l("uPrevDir"), 1, store.dir.tex);
        bindTexture(gl, l("uFieldDir"), 2, store.outDir.tex);
        gl.uniform4f(l("uMask"), has("height"), has("coverage"), has("ink"), has("slot"));
        gl.uniform1f(l("uWritesDir"), has("direction"));
        gl.uniform1f(l("uWritesParam"), has("param"));
        quad(gl);
        [store.dir, spareDir] = [spareDir, store.dir];
      }
      spare.bind();
      gl.useProgram(progs.commit);
      const l = loc.commit;
      bindTexture(gl, l("uPrev"), 0, store.a.tex);
      bindTexture(gl, l("uField"), 1, store.out.tex);
      gl.uniform4f(l("uMask"), has("height"), has("coverage"), has("ink"), has("slot"));
      quad(gl);
      [store.a, spare] = [spare, store.a];
    },
    readGrid(n) {
      const probe = target(gl, n, n, float);
      const sampleOf = (tex: WebGLTexture) => {
        probe.bind();
        gl.useProgram(progs.probe);
        bindTexture(gl, loc.probe("uSheet"), 0, tex);
        gl.uniform2f(loc.probe("uSize"), w, h);
        gl.uniform2f(loc.probe("uGrid"), n, n);
        quad(gl);
      };
      try {
        sampleOf(store.a.tex);
        const s = read(0, 0, n, n);
        if (store.dir) {
          sampleOf(store.dir.tex);
          readDirImage(s, 0, 0, n, n);
        }
        return s;
      } finally {
        probe.dispose();
      }
    },
    readRegion(x, y, rw, rh) {
      const x0 = Math.max(0, Math.min(w - 1, Math.floor(x)));
      const y0 = Math.max(0, Math.min(h - 1, Math.floor(y)));
      const cw = Math.max(1, Math.min(w - x0, Math.round(rw)));
      const ch = Math.max(1, Math.min(h - y0, Math.round(rh)));
      gl.bindFramebuffer(gl.FRAMEBUFFER, store.a.fbo);
      const s = read(x0, h - y0 - ch, cw, ch);
      if (store.dir) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, store.dir.fbo);
        readDirImage(s, x0, h - y0 - ch, cw, ch);
      }
      return s;
    },
    dispose() {
      for (const t of [store.a, store.out, spare, store.dir, store.outDir, spareDir, store.rest]) t?.dispose();
    },
  };
  if (withDirImage) {
    store.dir = make();
    store.outDir = make();
  }
  if (withRest) store.rest = target(gl, w, h, float, true);
  return store;
}
