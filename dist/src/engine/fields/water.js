// `water`: a pool's surface. It writes height only: travelling waves from the shared chunk GLSL_WATER
// (../glsl/water.ts), swell at every detail level (macro relief) and ripples by the detail dial (micro relief).
// The field is a timeline: height = f(x, y, t, seed), with no state, so `setTime(t)` draws exactly t and reduced
// motion rests on one draw at the settle time.
// It also shares the surface with the shade pass (`Field.shade`): `Water waterAt(vec2 q, float t)` and the optics
// chunk, so `materials.water` and `lights.throughWater` read the same water, analytic, at the refracted points they
// need. One water field per paint: its shade uniforms are global names.
//
// The field owns the pool's whole geometry, the one source of truth for the material and the light: the floor's
// depth (`floor`), the index of refraction (`ior`), the floor pictures' offset (`shift`) and an optional per-pixel
// rise of the floor (`rise`: a card lying on the floor that comes up through the water while the tiles around it
// stay deep). The shade chunk gives `waterFloorUv(x)` (where the floor pictures are read at floor point x),
// `waterBed(x)` (the floor's depth there) and `waterSeen(q, g)` (the floor point the eye meets through surface
// point q), so the picture the material draws and the caustic the light draws bend at the same depth.
//
// A lifted layer (`layer`): a picture of its own, flat, lying `rise` above the floor (a card that has come up off the
// floor). The eye meets it at its own depth, the floor less its rise, so it bends as little as that depth bends it,
// while the floor around it keeps its full depth. Where the layer covers, the material draws the layer and the light
// its caustic at the layer's depth (its own focus); elsewhere the floor. The chunk gives `waterLayerDepth()`,
// `waterLayerSeen(q, g)` (the layer point the eye meets), `waterLayerAt(x)` (tone in x, coverage in y there) and
// `waterLayerOver(ly, seen)` (the same, hidden where a rise map lifts the floor above the layer).
// Unlike `rise`, which raises the floor picture itself, the layer's outline is read at the layer's depth, not the
// floor's, so its edge ripples by its own depth (the floor's ray beside a raised footprint lands inside it at full
// depth and drew the card there: bar 05's 7% outline).
import { GLSL_WATER, GLSL_WATER_OPTICS } from "../glsl/water.js";
import { shape } from "./shape.js";
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const TICK = 1 / 60;
const at = (v, t) => (typeof v === "function" ? v(t) : v);
export function water(opts) {
    const waves = Math.max(0.01, opts.waves);
    const speed = opts.speed;
    const depth = clamp01(opts.depth);
    const base = shape({
        writes: ["height"],
        uniforms: { uWaves: waves, uSpeed: speed, uDepth: depth },
        glsl: /* glsl */ `
uniform float uWaves, uSpeed, uDepth;
${GLSL_WATER}
vec4 field(vec2 uv, vec2 q) {
  return vec4(waterSurface(q, uTime, uSeed, uWaves, uSpeed, uDepth, uDetail).h, 1.0, 0.0, 0.0);
}
`,
    });
    const settleTicks = Math.max(1, Math.round((opts.settle ?? 1) / TICK));
    const floor = opts.floor ?? 1;
    const shift = opts.shift ?? [0, 0];
    const rise = opts.rise;
    const layer = opts.layer;
    const layerShift = layer?.shift ?? shift;
    const geometry = (t) => ({
        uWaterFloor: at(floor, t),
        uWaterShift: [...at(shift, t)],
        uWaterRise: rise ? at(rise.height, t) : 0,
        ...(layer ? { uWaterLayerRise: at(layer.rise, t), uWaterLayerShift: [...at(layerShift, t)] } : {}),
    });
    const moves = typeof floor === "function" || typeof shift === "function" || typeof rise?.height === "function" || typeof layer?.rise === "function" || typeof layerShift === "function";
    const textures = { ...(rise ? { uWaterRiseMap: rise.map } : {}), ...(layer ? { uWaterLayer: layer.picture } : {}) };
    return {
        ...base,
        init(gl, ctx) {
            return { ...base.init(gl, ctx), settleTicks, stateful: false };
        },
        shade: {
            uniforms: { uWaterWaves: waves, uWaterSpeed: speed, uWaterDepth: depth, uWaterIor: opts.ior ?? 1.33, uWaterHasRise: rise ? 1 : 0, uWaterHasLayer: layer ? 1 : 0, ...geometry(0) },
            ...(moves ? { frame: geometry } : {}),
            ...(Object.keys(textures).length ? { textures } : {}),
            glsl: /* glsl */ `
uniform float uWaterWaves, uWaterSpeed, uWaterDepth, uWaterIor, uWaterFloor, uWaterRise, uWaterHasRise;
uniform vec2 uWaterShift;
uniform sampler2D uWaterRiseMap;
${GLSL_WATER}
Water waterAt(vec2 q, float t) { return waterSurface(q, t, uSeed, uWaterWaves, uWaterSpeed, uWaterDepth, uDetail); }
${GLSL_WATER_OPTICS}
// Where the floor pictures (the material's under, the rise map) are read at floor point x (short-side units,
// centred): drawn at the canvas's aspect, stretched over it, moved by the shift.
vec2 waterFloorUv(vec2 x) { return (x - uWaterShift) / (uSheetSize / min(uSheetSize.x, uSheetSize.y)) + 0.5; }
// The floor's depth under floor point x: the floor, less the rise map's height there.
float waterBed(vec2 x) {
  float r = uWaterHasRise > 0.5 ? texture(uWaterRiseMap, waterFloorUv(x)).r : 0.0;
  return max(uWaterFloor - uWaterRise * r, 0.0);
}
// The floor point the eye, looking straight down, meets through surface point q of slope g. The offset is linear in
// the depth (waterView), and the depth is read where the ray lands, so two fixed-point steps from the plain floor:
// exact on a plain floor, and on a card's face; at the card's edge the ray lands on one side or the other.
vec2 waterSeen(vec2 q, vec2 g) {
  vec2 d = waterView(g, uWaterIor, 1.0);
  vec2 x = q + d * uWaterFloor;
  x = q + d * waterBed(x);
  return q + d * waterBed(x);
}
uniform float uWaterHasLayer, uWaterLayerRise;
uniform vec2 uWaterLayerShift;
uniform sampler2D uWaterLayer;
// The lifted layer's rise, never under 0: a negative rise (an easing that overshoots) lies on the floor, never under
// it, where the floor would hide it.
float waterLayerRise() { return max(uWaterLayerRise, 0.0); }
// The lifted layer's depth: the floor less its rise. It is flat, so the eye meets it at one depth, exactly.
float waterLayerDepth() {
#ifdef PK_FAULT_LAYER_AT_FLOOR
  // The test fault: the layer read where the eye meets the floor, at the floor's full depth.
  return uWaterFloor;
#else
  return max(uWaterFloor - waterLayerRise(), 0.0);
#endif
}
vec2 waterLayerSeen(vec2 q, vec2 g) { return q + waterView(g, uWaterIor, waterLayerDepth()); }
// The layer at layer point x: tone (a ramp position) in x, coverage in y; none off the picture.
vec2 waterLayerAt(vec2 x) {
  vec2 uv = (x - uWaterLayerShift) / (uSheetSize / min(uSheetSize.x, uSheetSize.y)) + 0.5;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return vec2(0.0);
  return texture(uWaterLayer, uv).rg;
}
// The layer as the eye sees it at layer point ly, with seen the floor point the same ray meets: none where the ray
// meets the floor first (a rise map lifts the floor there above the layer).
vec2 waterLayerOver(vec2 ly, vec2 seen) { return waterBed(seen) < waterLayerDepth() ? vec2(0.0) : waterLayerAt(ly); }
`,
        },
    };
}
