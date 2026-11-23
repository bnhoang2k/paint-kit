import { type Target } from "./gl.ts";
import type { SheetChannel, SheetSample } from "./types.ts";
/**
 * GLSL: `vec4 sheetEncode(vec4 v)` / `sheetDecode` for (height, coverage, ink, slot), and `dirEncode(vec2)` /
 * `dirDecode` for a unit direction. Fields write `sheetEncode(...)`; readers decode. `PK_SHEET8` selects RGBA8.
 */
export declare const GLSL_SHEET = "\n#ifdef PK_SHEET8\n// Height keeps +-0.0625 short-side units in 8 bits, dithered by half a level so slopes read as fine noise,\n// not as contour lines. Used in fragment shaders only (gl_FragCoord).\nfloat _sheetDither() { return fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5; }\n// Slot -1 (\"none\", a cleared layer) to 3 is stored as (slot + 1) / 4.\nvec4 sheetEncode(vec4 v) { return vec4(v.x * 8.0 + 0.5 + _sheetDither() / 255.0, v.y, v.z, (v.w + 1.0) / 4.0); }\nvec4 sheetDecode(vec4 e) { return vec4((e.x - 0.5) * 0.125, e.y, e.z, floor(e.w * 4.0 + 0.5) - 1.0); }\nvec4 dirEncode(vec2 d) { return vec4(d * 0.5 + 0.5, 0.0, 1.0); }\nvec2 dirDecode(vec4 e) { return e.xy * 2.0 - 1.0; }\n// The rest offset (sheet px): 1/8 px steps over +-4096 px, each axis as a high and a low byte.\nvec2 _restBytes(float v) { float n = clamp(floor(v * 8.0 + 0.5) + 32768.0, 0.0, 65535.0); float hi = floor(n / 256.0); return vec2(hi, n - hi * 256.0) / 255.0; }\nvec4 restEncode(vec2 off) { return vec4(_restBytes(off.x), _restBytes(off.y)); }\nvec2 restDecode(vec4 e) { vec4 b = floor(e * 255.0 + 0.5); return (vec2(b.x * 256.0 + b.y, b.z * 256.0 + b.w) - 32768.0) / 8.0; }\n#else\nvec4 sheetEncode(vec4 v) { return v; }\nvec4 sheetDecode(vec4 e) { return e; }\nvec4 dirEncode(vec2 d) { return vec4(d, 0.0, 1.0); }\nvec2 dirDecode(vec4 e) { return e.xy; }\nvec4 restEncode(vec2 off) { return vec4(off, 0.0, 1.0); }\nvec2 restDecode(vec4 e) { return e.xy; }\n#endif\n// The rest offset at this fragment's own texel of the rest image (a sheet-sized pass).\nvec2 restOffsetHere(sampler2D tex) { return restDecode(texelFetch(tex, ivec2(gl_FragCoord.xy), 0)); }\n// Param in the direction image: blue is the value, and alpha marks it written in a field's layer. A field that also\n// writes direction draws the two with colour masks, so neither pass overwrites the other's components.\nvec4 paramEncode(float p) { return vec4(0.0, 0.0, clamp(p, 0.0, 1.0), 1.0); }\nfloat paramDecode(vec4 e) { return e.z; }\n";
export declare const sheetDefines: (float: boolean) => "" | "#define PK_SHEET8\n";
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
export declare function createSheet(gl: WebGL2RenderingContext, w: number, h: number, float: boolean, withDir: boolean, withRest?: boolean, readsRest?: boolean, withParam?: boolean): SheetStore;
