import { type Ramp, type Vec3 } from "./palette.ts";
import { type Sheet } from "./sheet.ts";
import type { Field, Light, Material, Uniforms } from "./types.ts";
/**
 * What materials and lights see. `q` is the position in short-side units, centred (no stretch at any aspect);
 * `n` the unit normal from the sheet's height (height is in short-side units too); `view` points at the viewer: +z.
 * On a page that tilts (`PaintOptions.tilt`) the material's normal and the groove direction its highlight reads are
 * turned by the tilt (`uTilt`, pointer.ts `tiltTurn`) after the material and before the lights: the card turns under
 * a fixed eye and fixed lights. `q`, `rest` and the sheet do not move.
 * `rest` is where this point of the surface sat on the flat sheet, in the same units as `q` (`restUv` as a uv):
 * `q` itself on a page whose fields do not move the surface. Materials draw their texture (fibres, pulp, dye,
 * brushing) at `rest`, so it moves with the surface; lights use `q` and `n`, the moved surface.
 */
export declare const GLSL_SURF = "\n// \"dir\" is the unit direction from the direction image (+x without one); \"dirLen\" its length as written, 0..1\n// (1 without one): a field may grade it, as the twill marks weft with 0.6. \"param\" is the sheet's free 0..1 channel\n// (0 where no field wrote it): each material gives it its own meaning.\nstruct Surf { vec2 uv; vec2 q; vec2 px; vec3 n; vec3 view; float height; float coverage; float ink; float slot; vec2 dir; float dirLen; vec2 rest; vec2 restUv; float param; };\n// \"n\" is the normal the lights use: the sheet's (\"s.n\") plus any micro relief the material adds. \"aniso\" 0..1\n// stretches the highlight along \"tdir\" (a unit direction in the sheet's plane): 0 is the round highlight.\n// \"transmit\" is how much of the light reaching the sheet's back the material passes to the viewer, per channel (0\n// for every opaque material); \"frost\" the radius, in short-side units, over which its frost spreads that light.\n// \"diffract\" 0..1 is the share of the highlight a diffraction grating takes (materials.foil; 0 for every other\n// material): there \"tdir\" runs along the grooves and \"grating\" holds the groove spacing in nm, the orders, and the\n// pull amount and target toward the ramp (glsl/grating.ts). Read only on a page with a grating (PK_GRATING).\n// \"filmShare\" 0..1 is the share of the highlight a thin film takes (materials.film; 0 for every other material): there\n// \"film\" holds the thickness in nm, the film's index, and the pull amount and target, and \"filmBase\" is 0 for a\n// dielectric base and 1 for a metal one (glsl/film.ts). Read only on a page with a film (PK_FILM).\nstruct MatOut { vec3 albedo; float wrap; float spec; float rough; vec3 n; vec2 tdir; float aniso; vec3 transmit; float frost; vec4 grating; float diffract; vec4 film; float filmBase; float filmShare; };\nstruct LightSum { vec3 diffuse; vec3 spec; };\n#ifdef PK_EMIT\n// Light a light gives off over the bare ground too, added after the coverage mix (Light.emits).\nvec3 pkEmit = vec3(0.0); // not-colour: empty light sum\n#endif\nuniform float uTime, uDetail, uInkOn;\n#ifdef PK_TILT\n// The tilt's rotation when the page tilts (pointer.ts tiltTurn): it turns the surface's normal and its grooves, in the\n// room's frame (the sheet's: x right, y up, z toward the viewer); the eye and the lights stay.\nuniform mat3 uTilt;\n#endif\n// Sheet size in texels and drawing-buffer size in px; declared here so lights can map page fractions to q.\nuniform vec2 uSheetSize, uView;\nuniform sampler2D uSheet;\n// A material starts from this: its tone (a linear colour: the engine's materials pass their resolved \"u_$_tone\", a\n// position on the ramp), no wrap, no gloss, fully rough, the sheet's normal. matBase(s) starts from the ground.\nMatOut matBase(Surf s, vec3 tone) {\n  MatOut m;\n  m.albedo = tone;\n  m.wrap = 0.0;\n  m.spec = 0.0;\n  m.rough = 1.0;\n  m.n = s.n;\n  m.tdir = s.dir;\n  m.aniso = 0.0;\n  m.transmit = vec3(0.0); // not-colour: opaque, passes no light from behind\n  m.frost = 0.0;\n  m.grating = vec4(0.0); // not-colour: no grating\n  m.diffract = 0.0;\n  m.film = vec4(0.0); // not-colour: no film\n  m.filmBase = 0.0;\n  m.filmShare = 0.0;\n  return m;\n}\nMatOut matBase(Surf s) { return matBase(s, uGround); }\n// The frost's spread: tap k of FROST_TAPS on a unit disc, the centre and then a golden-angle spiral of equal area\n// per tap, so equal weights give an even disc. A light behind the sheet is read at s.q + frost x tap and averaged.\nconst int FROST_TAPS = 9;\nvec2 frostTap(int k) {\n  if (k == 0) return vec2(0.0);\n  float a = float(k) * 2.39996323;\n  return sqrt(float(k) / float(FROST_TAPS - 1)) * vec2(cos(a), sin(a));\n}\n// The highlight a light at unit direction \"l\" puts on the material, before the light's colour and level: m.spec\n// times its lobe. Round (aniso 0): Blinn-Phong, the exponent from 8 (rough 1) to 128 (rough 0). Anisotropic: a\n// Ward lobe whose width along the grain (\"tdir\" laid onto the surface) is rough x (1 + aniso) and across it\n// rough x (1 - 0.9 aniso), so the highlight streaks along threads and brushed metal and sits where the surface\n// faces halfway between the light and the eye; it moves when the light moves. None from behind the surface.\n// \"lightSpec\" is the light's own \"specular\" prop (0..1, default 1), so every light that gives a highlight can\n// switch it off through this one path (the relight check reads the highlight alone that way).\nfloat specLobe(MatOut m, vec3 n, vec3 l, vec3 view, float lightSpec) {\n  vec3 hv = normalize(l + view);\n  float k = m.spec * lightSpec;\n  if (m.aniso <= 0.0) return k * pow(max(dot(n, hv), 0.0), mix(8.0, 128.0, 1.0 - m.rough));\n  vec3 g = vec3(m.tdir, 0.0); // not-colour: the grain in the sheet's plane\n#ifdef PK_TILT\n  g = uTilt * g; // the grain turns with the card\n#endif\n  vec3 t = normalize(g - n * dot(g, n) + 1e-6);\n  vec3 b = cross(n, t);\n  float hn = max(dot(hv, n), 1e-3);\n  float ax = max(m.rough * (1.0 + m.aniso), 0.02);\n  float ay = max(m.rough * (1.0 - 0.9 * m.aniso), 0.02);\n  float ht = dot(hv, t) / ax;\n  float hb = dot(hv, b) / ay;\n  return k * exp(-(ht * ht + hb * hb) / (hn * hn)) * step(0.0, dot(n, l));\n}\n// The ink channel at a sheet position, 0 while the ink is hidden.\nfloat inkAt(vec2 uv) { return clamp(sheetDecode(texture(uSheet, uv)).z, 0.0, 1.0) * uInkOn; }\n// Ink printed on a material, the last step of every material (there is no ink material): albedo moves to the\n// palette ink by the ink channel, with a slight gloss. \"fibre\" is the material's fibre texture (-1..1; 0 for a\n// material without fibres) and \"flow\" a unit direction along its fibres. As detail rises the ink follows them:\n// its edge feathers outward up to 2 texels along the fibres (it never thins a stroke), and fibre ridges hold a\n// little less ink than the hollows.\nMatOut printInk(MatOut m, Surf s, float fibre, vec2 flow) {\n  float k = s.ink;\n  if (fibre != 0.0) k = max(k, 0.85 * inkAt(s.uv + flow * fibre * 2.0 * uDetail / uSheetSize));\n  k *= 1.0 - 0.2 * uDetail * max(fibre, 0.0);\n  m.albedo = mixOklab(m.albedo, uInk, k);\n  m.spec = mix(m.spec, 0.08, k);\n  m.rough = mix(m.rough, 0.5, k);\n  return m;\n}\n";
/**
 * The shadow march (Phase 2 Task 7), shared by the shading pass and the relight check's shadow law (its geometric
 * oracle, `shadowOracle`, marches the same way on the CPU). From a surface point the march walks across the sheet
 * toward the light, `steps` samples evenly from `start` texels out to where the ray has risen to `top` (or to the
 * light's own run, a lamp's foot), and asks whether the sheet's height stands above the ray.
 * - `top` 0.0625 short-side units: the highest height the 8-bit sheet stores (sheet.ts, height keeps +-0.0625), so
 *   on every device nothing above the ray there can block it. On a float sheet a surface taller than that casts its
 *   shadow as if it ended there (a limit, named in REFERENCE.md).
 * - `start` 1.5 texels: the receiver's own texel and its neighbour are skipped, so a surface does not shadow itself
 *   through its own slope or its micro relief (fibres, threads) at one texel (builder's choice against shadow acne).
 * - `steps` 40: at a key 40 degrees up, a receiver at height 0 runs 0.075 short-side units, 1.1 px a step at 600 px
 *   (builder's choice; the steps grow under a grazing light).
 */
export declare const SHADOW_MARCH: {
    readonly steps: 40;
    readonly top: 0.0625;
    readonly start: 1.5;
};
/**
 * Throws when more than one light casts a shadow (Phase 2: one shadow-casting light per page), naming the first two.
 * `paint()` and `Painter.set` check it before anything draws.
 */
export declare function assertOneShadow(lights: Pick<Light, "id" | "shadow">[]): void;
/** The fields' shade chunks (`Field.shade`), each distinct source once, in field order. */
export declare const fieldChunks: (fields: Field[]) => string[];
/**
 * The stitched fragment source for these materials and lights. `finish: false` is the "nofinish" test fault.
 * `chunks` are the fields' shade chunks (`fieldChunks`), stitched in before the materials; `defines` are test-fault
 * defines (`#define ...` lines) put after the header. `rest`: the sheet has a rest image the pass reads. `screen`: the
 * finish's halftone screen after light is on (`finish.halftone`); off, the source holds none of it. `tilt`: the page
 * tilts (`PaintOptions.tilt`), so the surface's normal and grooves turn by the uniform `uTilt`; off, the source holds
 * none of it.
 */
export declare function shadeSource(materials: Material[], lights: Light[], float: boolean, finish?: boolean, chunks?: string[], defines?: string, rest?: boolean, restIgnoredBy?: string, screen?: boolean, tilt?: boolean): string;
export type ShadeInput = {
    sheet: Sheet;
    /** Canvas drawing-buffer size. */
    width: number;
    height: number;
    ramp: Ramp;
    materials: Material[];
    /** Uniforms per material as resolved against the ramp now, by index: `uniforms` with `resolve(ramp)` laid over. */
    materialUniforms: Uniforms[];
    lights: Light[];
    /** Uniforms per light as drawn now, by index: resolved, with its per-draw hooks laid over (pointer.ts `uniforms`). */
    lightUniforms: Uniforms[];
    /** The paint's fields: their shade chunks are stitched in and their shade uniforms set. */
    fields: Field[];
    time: number;
    detail: number;
    seed: number;
    grain: number;
    /**
     * The halftone screen after light: cell in drawing-buffer px, angle in radians, ground as linear colour, and `slots`
     * as one weight per material slot (1 screened, 0 not); or none.
     */
    screen: {
        cell: number;
        angle: number;
        ground: Vec3;
        slots: [number, number, number, number];
    } | null;
    inkOn: boolean;
    /**
     * The tilt's rotation on a page that tilts (`PaintOptions.tilt`, pointer.ts `tiltTurn`: 9 numbers, column order),
     * turning the surface's normal and grooves; null when the page does not tilt, and the source holds no tilt code.
     */
    tilt: number[] | null;
    /** Test seam: the engine pointer in canvas fractions, set only under the `iridescence-pointer-x` fault (paint.ts). */
    faultPointer?: [number, number];
};
export type Shade = {
    draw(input: ShadeInput): void;
    compiles(): number;
    dispose(): void;
};
/**
 * `defines`: test-fault `#define` lines for the shade source (paint's test seam). `pictureOnActiveUnit` is the test
 * fault 'picture-on-active-unit': a picture is uploaded on whatever texture unit is active (the sheet's, unit 0, in
 * a draw), not on its own unit, so the first draw after a new material object samples the picture as the sheet.
 */
export declare function createShade(gl: WebGL2RenderingContext, float: boolean, finish?: boolean, defines?: string, pictureOnActiveUnit?: boolean, restIgnoredBy?: string): Shade;
