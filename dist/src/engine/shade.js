// The shade pass: sheet -> normals -> material -> lights -> colour -> finish, drawn to the canvas.
// The active materials and lights are stitched into one fragment shader. It recompiles only when the list
// (ids, slots and GLSL) changes; light and material settings are uniforms.
import { GLSL_FINISH, NOFINISH_DEFINE } from "./finish.js";
import { HEADER, VS_FULLSCREEN, bindTexture, locations, program, quad, setUniform } from "./gl.js";
import { GLSL_FILM } from "./glsl/film.js";
import { GLSL_GRATING } from "./glsl/grating.js";
import { GLSL_HASH, GLSL_NOISE, GLSL_FBM } from "./glsl/noise.js";
import { GLSL_SPECTRUM } from "./glsl/spectrum.js";
import { GLSL_OKLAB } from "./palette.js";
import { GLSL_SHEET, sheetDefines } from "./sheet.js";
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
export const GLSL_SURF = /* glsl */ `
// "dir" is the unit direction from the direction image (+x without one); "dirLen" its length as written, 0..1
// (1 without one): a field may grade it, as the twill marks weft with 0.6. "param" is the sheet's free 0..1 channel
// (0 where no field wrote it): each material gives it its own meaning.
struct Surf { vec2 uv; vec2 q; vec2 px; vec3 n; vec3 view; float height; float coverage; float ink; float slot; vec2 dir; float dirLen; vec2 rest; vec2 restUv; float param; };
// "n" is the normal the lights use: the sheet's ("s.n") plus any micro relief the material adds. "aniso" 0..1
// stretches the highlight along "tdir" (a unit direction in the sheet's plane): 0 is the round highlight.
// "transmit" is how much of the light reaching the sheet's back the material passes to the viewer, per channel (0
// for every opaque material); "frost" the radius, in short-side units, over which its frost spreads that light.
// "diffract" 0..1 is the share of the highlight a diffraction grating takes (materials.foil; 0 for every other
// material): there "tdir" runs along the grooves and "grating" holds the groove spacing in nm, the orders, and the
// pull amount and target toward the ramp (glsl/grating.ts). Read only on a page with a grating (PK_GRATING).
// "filmShare" 0..1 is the share of the highlight a thin film takes (materials.film; 0 for every other material): there
// "film" holds the thickness in nm, the film's index, and the pull amount and target, and "filmBase" is 0 for a
// dielectric base and 1 for a metal one (glsl/film.ts). Read only on a page with a film (PK_FILM).
struct MatOut { vec3 albedo; float wrap; float spec; float rough; vec3 n; vec2 tdir; float aniso; vec3 transmit; float frost; vec4 grating; float diffract; vec4 film; float filmBase; float filmShare; };
struct LightSum { vec3 diffuse; vec3 spec; };
#ifdef PK_EMIT
// Light a light gives off over the bare ground too, added after the coverage mix (Light.emits).
vec3 pkEmit = vec3(0.0); // not-colour: empty light sum
#endif
uniform float uTime, uDetail, uInkOn;
#ifdef PK_TILT
// The tilt's rotation when the page tilts (pointer.ts tiltTurn): it turns the surface's normal and its grooves, in the
// room's frame (the sheet's: x right, y up, z toward the viewer); the eye and the lights stay.
uniform mat3 uTilt;
#endif
// Sheet size in texels and drawing-buffer size in px; declared here so lights can map page fractions to q.
uniform vec2 uSheetSize, uView;
uniform sampler2D uSheet;
// A material starts from this: its tone (a linear colour: the engine's materials pass their resolved "u_$_tone", a
// position on the ramp), no wrap, no gloss, fully rough, the sheet's normal. matBase(s) starts from the ground.
MatOut matBase(Surf s, vec3 tone) {
  MatOut m;
  m.albedo = tone;
  m.wrap = 0.0;
  m.spec = 0.0;
  m.rough = 1.0;
  m.n = s.n;
  m.tdir = s.dir;
  m.aniso = 0.0;
  m.transmit = vec3(0.0); // not-colour: opaque, passes no light from behind
  m.frost = 0.0;
  m.grating = vec4(0.0); // not-colour: no grating
  m.diffract = 0.0;
  m.film = vec4(0.0); // not-colour: no film
  m.filmBase = 0.0;
  m.filmShare = 0.0;
  return m;
}
MatOut matBase(Surf s) { return matBase(s, uGround); }
// The frost's spread: tap k of FROST_TAPS on a unit disc, the centre and then a golden-angle spiral of equal area
// per tap, so equal weights give an even disc. A light behind the sheet is read at s.q + frost x tap and averaged.
const int FROST_TAPS = 9;
vec2 frostTap(int k) {
  if (k == 0) return vec2(0.0);
  float a = float(k) * 2.39996323;
  return sqrt(float(k) / float(FROST_TAPS - 1)) * vec2(cos(a), sin(a));
}
// The highlight a light at unit direction "l" puts on the material, before the light's colour and level: m.spec
// times its lobe. Round (aniso 0): Blinn-Phong, the exponent from 8 (rough 1) to 128 (rough 0). Anisotropic: a
// Ward lobe whose width along the grain ("tdir" laid onto the surface) is rough x (1 + aniso) and across it
// rough x (1 - 0.9 aniso), so the highlight streaks along threads and brushed metal and sits where the surface
// faces halfway between the light and the eye; it moves when the light moves. None from behind the surface.
// "lightSpec" is the light's own "specular" prop (0..1, default 1), so every light that gives a highlight can
// switch it off through this one path (the relight check reads the highlight alone that way).
float specLobe(MatOut m, vec3 n, vec3 l, vec3 view, float lightSpec) {
  vec3 hv = normalize(l + view);
  float k = m.spec * lightSpec;
  if (m.aniso <= 0.0) return k * pow(max(dot(n, hv), 0.0), mix(8.0, 128.0, 1.0 - m.rough));
  vec3 g = vec3(m.tdir, 0.0); // not-colour: the grain in the sheet's plane
#ifdef PK_TILT
  g = uTilt * g; // the grain turns with the card
#endif
  vec3 t = normalize(g - n * dot(g, n) + 1e-6);
  vec3 b = cross(n, t);
  float hn = max(dot(hv, n), 1e-3);
  float ax = max(m.rough * (1.0 + m.aniso), 0.02);
  float ay = max(m.rough * (1.0 - 0.9 * m.aniso), 0.02);
  float ht = dot(hv, t) / ax;
  float hb = dot(hv, b) / ay;
  return k * exp(-(ht * ht + hb * hb) / (hn * hn)) * step(0.0, dot(n, l));
}
// The ink channel at a sheet position, 0 while the ink is hidden.
float inkAt(vec2 uv) { return clamp(sheetDecode(texture(uSheet, uv)).z, 0.0, 1.0) * uInkOn; }
// Ink printed on a material, the last step of every material (there is no ink material): albedo moves to the
// palette ink by the ink channel, with a slight gloss. "fibre" is the material's fibre texture (-1..1; 0 for a
// material without fibres) and "flow" a unit direction along its fibres. As detail rises the ink follows them:
// its edge feathers outward up to 2 texels along the fibres (it never thins a stroke), and fibre ridges hold a
// little less ink than the hollows.
MatOut printInk(MatOut m, Surf s, float fibre, vec2 flow) {
  float k = s.ink;
  if (fibre != 0.0) k = max(k, 0.85 * inkAt(s.uv + flow * fibre * 2.0 * uDetail / uSheetSize));
  k *= 1.0 - 0.2 * uDetail * max(fibre, 0.0);
  m.albedo = mixOklab(m.albedo, uInk, k);
  m.spec = mix(m.spec, 0.08, k);
  m.rough = mix(m.rough, 0.5, k);
  return m;
}
`;
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
export const SHADOW_MARCH = { steps: 40, top: 0.0625, start: 1.5 };
/**
 * Throws when more than one light casts a shadow (Phase 2: one shadow-casting light per page), naming the first two.
 * `paint()` and `Painter.set` check it before anything draws.
 */
export function assertOneShadow(lights) {
    const casters = lights.flatMap((l, i) => (l.shadow ? [`light ${i} (${l.id})`] : []));
    if (casters.length > 1)
        throw new Error(`paint-kit: at most one light casts a shadow, but ${casters[0]} and ${casters[1]} both have a shadow option`);
}
/**
 * GLSL for a page whose light casts (PK_SHADOW). `shadowMarch` returns 1 where the light reaches the point and 0 in
 * full shadow. A soft edge: the penumbra is `soft` short-side units wide per unit of the blocker's height above the
 * receiver, centred on the hard edge, so a shadow softens with height. `pkShadowLost` is the casting light's diffuse
 * light the shadow took from this point; the bare ground reads it when the shadow reaches the ground.
 */
const GLSL_SHADOW = /* glsl */ `
#ifdef PK_SHADOW
const int SHADOW_STEPS = ${SHADOW_MARCH.steps};
const float SHADOW_TOP = ${SHADOW_MARCH.top.toFixed(4)};
const float SHADOW_START = ${SHADOW_MARCH.start.toFixed(1)};
vec3 pkShadowLost = vec3(0.0); // not-colour: empty light sum
float shadowHeight(vec2 uv) {
#ifdef PK_FAULT_SHADOW_READS_INK
  return sheetDecode(texture(uSheet, uv)).z;
#else
  return sheetDecode(texture(uSheet, uv)).x;
#endif
}
float shadowMarch(Surf s, vec4 ray, float soft) {
  vec3 l = ray.xyz;
#ifdef PK_FAULT_SHADOW_SAME_SIDE
  l.xy = -l.xy;
#endif
  float across = length(l.xy);
  if (across < 1e-5 || l.z <= 0.0) return 1.0;
  float rise = l.z / across;
  vec2 way = l.xy / across;
  float side = min(uSheetSize.x, uSheetSize.y);
  float start = SHADOW_START / side;
  float run = min((SHADOW_TOP - s.height) / rise, ray.w);
  if (run <= start) return 1.0;
  float v = 1.0;
  for (int k = 0; k < SHADOW_STEPS; k++) {
    float t = start + (run - start) * float(k) / float(SHADOW_STEPS - 1);
    vec2 uv = (s.q + way * t) * side / uSheetSize + 0.5;
    if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) break;
    float h = shadowHeight(uv);
    float clear = s.height + t * rise - h;
    v = min(v, clamp(0.5 + clear / max(soft * (h - s.height) * rise, 1e-7), 0.0, 1.0));
  }
  return v;
}
#endif
`;
/**
 * `vec3 specColour(MatOut m, vec3 n, vec3 l, vec3 view, float lightSpec)`: the highlight a light at unit direction `l`
 * puts on the material, as a colour, before the light's own colour and level; every light that gives a highlight
 * calls it. Without a grating it is `specLobe` in every channel. On a page with a grating (`PK_GRATING`), where the
 * material sets `diffract`, that share of the highlight is the grating's colours (glsl/grating.ts `gratingSpec`) and
 * the rest the plain lobe (a direction of length 0, no grooves, gives the plain lobe alone). On a page with a film
 * (`PK_FILM`), where the material sets `filmShare`, that share of the highlight is the film's colours (glsl/film.ts
 * `filmSpec`) and the rest the plain lobe.
 */
const GLSL_SPEC_COLOUR = /* glsl */ `
vec3 specColour(MatOut m, vec3 n, vec3 l, vec3 view, float lightSpec) {
#ifdef PK_GRATING
  if (m.diffract > 0.0) return mix(vec3(specLobe(m, n, l, view, lightSpec)), gratingSpec(m, n, l, view, lightSpec), m.diffract);
#endif
#ifdef PK_FILM
  if (m.filmShare > 0.0) return mix(vec3(specLobe(m, n, l, view, lightSpec)), filmSpec(m, n, l, view, lightSpec), m.filmShare);
#endif
  return vec3(specLobe(m, n, l, view, lightSpec));
}
`;
const MAIN = /* glsl */ `
uniform sampler2D uDirTex;
uniform float uHasDir, uHasParam;
#ifdef PK_REST
uniform sampler2D uRestTex;
#endif
in vec2 vUv;
out vec4 o;
// Slopes by central difference over +-K texels: 1 on the float sheet, 3 on the 8-bit sheet, whose height
// steps would otherwise show as contour lines.
#ifdef PK_SHEET8
const float K = 3.0;
#else
const float K = 1.0;
#endif
float heightAt(vec2 uv) { return sheetDecode(texture(uSheet, uv)).x; }
void main() {
  vec2 px = K / uSheetSize;
  float side = min(uSheetSize.x, uSheetSize.y);
  vec4 c = sheetDecode(texture(uSheet, vUv));
  float dx = (heightAt(vUv + vec2(px.x, 0.0)) - heightAt(vUv - vec2(px.x, 0.0))) * side * 0.5 / K;
  float dy = (heightAt(vUv + vec2(0.0, px.y)) - heightAt(vUv - vec2(0.0, px.y))) * side * 0.5 / K;
  Surf s;
  s.uv = vUv;
  s.q = (vUv - 0.5) * uSheetSize / side;
  s.px = vUv * uView;
  s.n = normalize(vec3(-dx, -dy, 1.0)); // not-colour: surface normal from height slopes
  s.view = vec3(0.0, 0.0, 1.0); // not-colour: view axis
  s.height = c.x;
  s.coverage = clamp(c.y, 0.0, 1.0);
  s.ink = c.z * uInkOn;
  s.slot = c.w;
  vec2 dd = uHasDir > 0.5 ? dirDecode(texture(uDirTex, vUv)) : vec2(1.0, 0.0);
  s.dirLen = min(length(dd), 1.0);
  s.dir = normalize(dd + 1e-6);
  // The direction image holds param in blue; a page without that image has no param to read.
  s.param = uHasParam > 0.5 ? paramDecode(texture(uDirTex, vUv)) : 0.0;
#ifdef PK_REST
  // The rest image's texel under this pixel (nearest): the offset in sheet px to where the point sat.
  s.restUv = vUv + restDecode(texture(uRestTex, vUv)) / uSheetSize;
  s.rest = (s.restUv - 0.5) * uSheetSize / side;
#else
  s.restUv = vUv;
  s.rest = s.q;
#endif
  MatOut m;
  int slot = int(c.w + 0.5);
  /*MATERIALS*/
#ifdef PK_TILT
  // The card turns: its normal (with the material's micro relief) turns by the tilt before any light reads it; the
  // grooves turn where the highlight lays them into 3D (specLobe, gratingSpec). Materials draw in the card's frame.
  m.n = uTilt * m.n;
#endif
  s.n = m.n;
  LightSum L;
  L.diffuse = vec3(0.0); // not-colour: empty light sum
  L.spec = vec3(0.0); // not-colour: empty light sum
#ifdef PK_BACK
  // Light reaching the sheet's back from the lights behind it, spread by the material's frost.
  vec3 back = vec3(0.0); // not-colour: empty light sum
  // Bare ground (coverage 0) counts as opaque too: it shows the page's ground, unlit, whatever material the slot names,
  // so it skips the frost loop and takes the finish's normal path, as on a page with no glass.
  bool opaque = s.coverage <= 0.0 || !any(greaterThan(m.transmit, vec3(0.0))); // not-colour: opaque test
#endif
  /*LIGHTS*/
  vec3 col = m.albedo * L.diffuse + L.spec;
#ifdef PK_BACK
  col += m.transmit * back;
#endif
  // Where there is no surface (coverage 0) the page's ground shows, unlit. The planted fault 'shadow-ground-leak'
  // draws the ground shadow with 'shadow.ground' off.
#if defined(PK_SHADOW_GROUND) || (defined(PK_SHADOW) && defined(PK_FAULT_SHADOW_GROUND_LEAK))
  // The casting light's shadow on the bare ground ('shadow.ground'): the ground is multiplied by the share of the
  // light a surface there keeps (the lights' diffuse sum with the shadow, over it without), so it only darkens.
  vec3 w709 = vec3(0.2126, 0.7152, 0.0722); // not-colour: Rec. 709 luminance weights
  float kept = dot(L.diffuse, w709);
  float whole = kept + dot(pkShadowLost, w709);
  col = mix(uGround * (whole > 0.0 ? kept / whole : 1.0), col, s.coverage);
#else
  col = mix(uGround, col, s.coverage);
#endif
#ifdef PK_EMIT
  col += pkEmit;
#endif
#ifdef PK_SCREEN
  // The halftone screen after light (finish.halftone): after light and shadow, before grain. Each cell prints one dot
  // of the lit colour, sized by screenArea so the cell brightens as the light grows. Under the test fault
  // 'halftone-lit-fixed' the area reads the colour before light (the unlit albedo on its ground), so the dots keep
  // their size whatever the light does.
#ifdef PK_FAULT_HALFTONE_LIT_FIXED
  vec3 scr = screen(col, screenArea(screenLuma(mix(uGround, m.albedo, s.coverage))), gl_FragCoord.xy);
#else
  vec3 scr = screen(col, screenArea(screenLuma(col)), gl_FragCoord.xy);
#endif
  // Only the listed slots are screened (finish.halftone.slots; unset, every slot), and printed ink is not: type and
  // line art print solid, so a pixel keeps its lit colour by its ink share. A whole share takes the screen exactly.
  float onScreen = uScreenSlots[clamp(slot, 0, 3)] * (1.0 - clamp(s.ink, 0.0, 1.0));
  col = onScreen >= 1.0 ? scr : onScreen > 0.0 ? mix(col, scr, onScreen) : col;
#endif
#ifdef PK_BACK
  // Glass lit from behind runs deep into the shoulder: its grain keeps its size there (finish.ts).
  o = vec4(finish(col, gl_FragCoord.xy, opaque ? 0.0 : 1.0), 1.0);
#else
  o = vec4(finish(col, gl_FragCoord.xy), 1.0);
#endif
}
`;
const SAFE_ID = /^[a-z][a-z0-9]*$/i;
const prefix = (id, i) => {
    if (!SAFE_ID.test(id))
        throw new Error(`paint-kit: material or light id "${id}" must be letters and digits`);
    return `${id}_${i}`;
};
/** The fields' shade chunks (`Field.shade`), each distinct source once, in field order. */
export const fieldChunks = (fields) => [...new Set(fields.flatMap((f) => (f.shade ? [f.shade.glsl] : [])))];
/**
 * The stitched fragment source for these materials and lights. `finish: false` is the "nofinish" test fault.
 * `chunks` are the fields' shade chunks (`fieldChunks`), stitched in before the materials; `defines` are test-fault
 * defines (`#define ...` lines) put after the header. `rest`: the sheet has a rest image the pass reads. `screen`: the
 * finish's halftone screen after light is on (`finish.halftone`); off, the source holds none of it. `tilt`: the page
 * tilts (`PaintOptions.tilt`), so the surface's normal and grooves turn by the uniform `uTilt`; off, the source holds
 * none of it.
 */
export function shadeSource(materials, lights, float, finish = true, chunks = [], defines = "", rest = false, restIgnoredBy = "", screen = false, tilt = false) {
    if (materials.length < 1 || materials.length > 4)
        throw new Error(`paint-kit: paint takes 1 to 4 materials, got ${materials.length}`);
    assertOneShadow(lights);
    const grating = materials.some((m) => m.grating);
    const film = materials.some((m) => m.film);
    // `restIgnoredBy`: the test faults 'rest-ignored-<id>'. That one material samples its texture at the screen
    // position (s.q) where it reads the rest position (s.rest); every other reader still reads the rest position.
    const glslOf = (m) => (m.id === restIgnoredBy ? m.glsl.replace(/\bs\.rest\b/g, "s.q") : m.glsl);
    const mats = materials.map((m, i) => glslOf(m).replaceAll("$", prefix(m.id, i))).join("\n");
    const lits = lights.map((l, i) => l.glsl.replaceAll("$", prefix(l.id, i))).join("\n");
    // The water material and light read the surface from the water field's shade chunk.
    if (/\bwaterAt\(/.test(mats + lits) && !chunks.some((c) => /\bWater waterAt\(/.test(c)))
        throw new Error("paint-kit: materials.water and lights.throughWater read the water field: add fields.water to the paint");
    const dispatch = materials
        .map((m, i) => (i === 0 ? "" : `if (slot == ${i}) m = mat_${prefix(m.id, i)}(s); else `))
        .join("")
        .concat(`m = mat_${prefix(materials[0].id, 0)}(s);`);
    // A light behind the sheet adds to the back light only, read over the frost's taps, and only where the material
    // passes light (the frost loop is skipped on opaque pixels).
    // The light that casts: its own light, then its shadow (the march's visibility) on both its terms, before the
    // finish. Under the test fault 'shadow-spec-only' the shadow takes the highlight only.
    const cast = (p) => `{ LightSum k = light_${p}(s, m); float v = shadowMarch(s, ray_${p}(s), u_${p}_soft);\n` +
        `#ifdef PK_FAULT_SHADOW_SPEC_ONLY\n  L.diffuse += k.diffuse;\n#else\n  L.diffuse += k.diffuse * v; pkShadowLost += k.diffuse * (1.0 - v);\n#endif\n` +
        `  L.spec += k.spec * v; }`;
    const sum = lights
        .map((l, i) => l.behind
        ? `if (!opaque) { Surf t = s; for (int f = 0; f < FROST_TAPS; f++) { t.q = s.q + m.frost * frostTap(f); back += light_${prefix(l.id, i)}(t, m).diffuse / float(FROST_TAPS); } }`
        : l.shadow
            ? cast(prefix(l.id, i))
            : `{ LightSum k = light_${prefix(l.id, i)}(s, m); L.diffuse += k.diffuse; L.spec += k.spec; }`)
        .join("\n  ");
    return (HEADER +
        defines +
        (rest ? "#define PK_REST\n" : "") +
        (lights.some((l) => l.behind) ? "#define PK_BACK\n" : "") +
        (lights.some((l) => l.shadow) ? "#define PK_SHADOW\n" : "") +
        (lights.some((l) => l.shadow?.ground) ? "#define PK_SHADOW_GROUND\n" : "") +
        (lights.some((l) => l.emits) ? "#define PK_EMIT\n" : "") +
        (screen ? "#define PK_SCREEN\n" : "") +
        (tilt ? "#define PK_TILT\n" : "") +
        (grating ? "#define PK_GRATING\n" : "") +
        (film ? "#define PK_FILM\n" : "") +
        (finish ? "" : NOFINISH_DEFINE) +
        sheetDefines(float) +
        GLSL_OKLAB +
        GLSL_HASH +
        GLSL_NOISE +
        GLSL_FBM +
        GLSL_SHEET +
        GLSL_SURF +
        GLSL_SHADOW +
        GLSL_FINISH +
        (grating || film ? GLSL_SPECTRUM : "") +
        (grating ? GLSL_GRATING : "") +
        (film ? GLSL_FILM : "") +
        GLSL_SPEC_COLOUR +
        chunks.join("\n") +
        "\n" +
        mats +
        "\n" +
        lits +
        MAIN.replace("/*MATERIALS*/", dispatch).replace("/*LIGHTS*/", sum));
}
/** The first texture unit for field and material pictures: 0 is the sheet, 1 the direction image, 2 the rest image. */
const FIRST_PICTURE_UNIT = 3;
/**
 * `defines`: test-fault `#define` lines for the shade source (paint's test seam). `pictureOnActiveUnit` is the test
 * fault 'picture-on-active-unit': a picture is uploaded on whatever texture unit is active (the sheet's, unit 0, in
 * a draw), not on its own unit, so the first draw after a new material object samples the picture as the sheet.
 */
export function createShade(gl, float, finish = true, defines = "", pictureOnActiveUnit = false, restIgnoredBy = "") {
    let key = "";
    let prog = null;
    let loc = () => null;
    let compiles = 0;
    // Material pictures, uploaded once per `textures` record (a new material object uploads again). `unit` is the
    // texture unit the record's first picture is bound to in this draw. Every upload activates the picture's own unit
    // first: a bare bindTexture binds to the active unit, which in a draw is the sheet's (unit 0) or the direction
    // image's, and would replace it for that one draw (the first after a new material object).
    let pictures = new Map();
    const picturesOf = (rec, unit) => {
        let t = pictures.get(rec);
        if (t)
            return t;
        t = {};
        for (const [k, src] of Object.entries(rec)) {
            const tex = gl.createTexture();
            if (!pictureOnActiveUnit)
                gl.activeTexture(gl.TEXTURE0 + unit++);
            gl.bindTexture(gl.TEXTURE_2D, tex);
            // Canvas rows run top down; the shade pass's uv runs bottom up.
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, src);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            t[k] = tex;
        }
        pictures.set(rec, t);
        return t;
    };
    // Pictures of materials and fields no longer drawn are deleted.
    const prunePictures = (materials, fields) => {
        const live = new Set([...materials.flatMap((m) => (m.textures ? [m.textures] : [])), ...fields.flatMap((f) => (f.shade?.textures ? [f.shade.textures] : []))]);
        for (const [rec, t] of pictures) {
            if (live.has(rec))
                continue;
            Object.values(t).forEach((tex) => gl.deleteTexture(tex));
            pictures.delete(rec);
        }
    };
    const ensure = (materials, lights, fields, rest, screen, tilt) => {
        const chunks = fieldChunks(fields);
        const k = JSON.stringify([materials.map((m) => [m.id, m.glsl, !!m.grating, !!m.film]), lights.map((l) => [l.id, l.glsl, !!l.behind, l.shadow ? (l.shadow.ground ? 2 : 1) : 0, !!l.emits]), chunks, rest, screen, tilt]);
        if (k === key && prog)
            return;
        const next = program(gl, VS_FULLSCREEN, shadeSource(materials, lights, float, finish, chunks, defines, rest, restIgnoredBy, screen, tilt));
        if (prog)
            gl.deleteProgram(prog);
        prog = next;
        loc = locations(gl, prog);
        key = k;
        compiles++;
    };
    return {
        draw(i) {
            const rest = !!i.sheet.rest && i.sheet.readsRest;
            ensure(i.materials, i.lights, i.fields, rest, i.screen !== null, i.tilt !== null);
            prunePictures(i.materials, i.fields);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, i.width, i.height);
            gl.useProgram(prog);
            // The rest image first, so the active unit after these binds is the same as on a page without one.
            if (rest)
                bindTexture(gl, loc("uRestTex"), 2, i.sheet.rest.tex);
            bindTexture(gl, loc("uSheet"), 0, i.sheet.a.tex);
            if (i.sheet.dir)
                bindTexture(gl, loc("uDirTex"), 1, i.sheet.dir.tex);
            gl.uniform1f(loc("uHasDir"), i.sheet.writesDir ? 1 : 0);
            gl.uniform1f(loc("uHasParam"), i.sheet.dir ? 1 : 0);
            gl.uniform2f(loc("uSheetSize"), i.sheet.w, i.sheet.h);
            gl.uniform2f(loc("uView"), i.width, i.height);
            gl.uniform1f(loc("uTime"), i.time);
            gl.uniform1f(loc("uDetail"), i.detail);
            gl.uniform1f(loc("uSeed"), i.seed);
            gl.uniform1f(loc("uGrain"), i.grain);
            if (i.screen) {
                gl.uniform1f(loc("uScreenCell"), i.screen.cell);
                gl.uniform1f(loc("uScreenAngle"), i.screen.angle);
                gl.uniform3fv(loc("uScreenGround"), i.screen.ground);
                gl.uniform4fv(loc("uScreenSlots"), i.screen.slots);
            }
            gl.uniform1f(loc("uInkOn"), i.inkOn ? 1 : 0);
            if (i.tilt)
                gl.uniformMatrix3fv(loc("uTilt"), false, i.tilt);
            if (i.faultPointer)
                gl.uniform2fv(loc("uFaultPointer"), i.faultPointer);
            gl.uniform3fv(loc("uGround"), i.ramp.ground);
            gl.uniform3fv(loc("uInk"), i.ramp.ink);
            gl.uniform3fv(loc("uRamp[0]"), i.ramp.stops.flat());
            let unit = FIRST_PICTURE_UNIT;
            for (const f of i.fields) {
                if (!f.shade)
                    continue;
                const u = f.shade.frame ? { ...f.shade.uniforms, ...f.shade.frame(i.time) } : f.shade.uniforms;
                for (const [k, v] of Object.entries(u))
                    setUniform(gl, loc(k), v);
                if (f.shade.textures)
                    for (const [k, tex] of Object.entries(picturesOf(f.shade.textures, unit)))
                        bindTexture(gl, loc(k), unit++, tex);
            }
            i.materials.forEach((m, n) => {
                const base = i.materialUniforms[n] ?? m.uniforms;
                const u = m.frame ? { ...base, ...m.frame(i.time) } : base;
                for (const [k, v] of Object.entries(u))
                    setUniform(gl, loc(`u_${m.id}_${n}_${k}`), v);
                if (m.textures)
                    for (const [k, tex] of Object.entries(picturesOf(m.textures, unit)))
                        bindTexture(gl, loc(`u_${m.id}_${n}_${k}`), unit++, tex);
            });
            i.lights.forEach((l, n) => {
                const u = i.lightUniforms[n] ?? l.uniforms;
                for (const [k, v] of Object.entries(u))
                    setUniform(gl, loc(`u_${l.id}_${n}_${k}`), v);
            });
            quad(gl);
        },
        compiles: () => compiles,
        dispose() {
            for (const t of pictures.values())
                Object.values(t).forEach((tex) => gl.deleteTexture(tex));
            pictures = new Map();
            if (prog)
                gl.deleteProgram(prog);
            prog = null;
            key = "";
        },
    };
}
