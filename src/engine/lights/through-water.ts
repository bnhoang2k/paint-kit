// `throughWater`: a light filtered by the water field, which draws moving caustic lines on what lies below.
// It wraps any light (a key, a lamp). Its diffuse light falls on the floor, which is flat, so the wrapped light is
// read at the floor's flat normal and multiplied by the caustic: the floor's brightness over a flat surface's,
// 1 / |det| of the refracted rays' area change (GLSL_WATER_OPTICS, ../glsl/water.ts). It is evaluated at the floor
// point the eye sees through the water (`waterSeen`, the material's refraction) and at the floor's depth there
// (`waterBed`, so a card that rises gets its own focus), both from the water field's geometry, so the lines bend
// with the picture. Where the field's lifted layer covers, the caustic is the layer's, at the layer's depth. Its
// highlight is the wrapped light's own on the water's surface (glints). Law: caustic.
//
// `caustic` 0..1 (default 1) mixes the caustic in: 0 is the same light through still water. Pages leave it alone;
// the relight check's caustic law switches it to 0 to read the caustic alone (frame on over frame off), as the
// highlight law does with `specular`. Test positions are the wrapped light's.
import type { Light, Uniforms } from "../types.ts";

export type ThroughWaterOptions = {
  /** 0..1, how much of the caustic the light draws (default 1). */
  caustic?: number;
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** The wrapped light's uniforms under `in_`, as its GLSL is renamed from `$` to `$_in`. */
const lift = (u: Uniforms): Uniforms => Object.fromEntries(Object.entries(u).map(([k, v]) => [`in_${k}`, v]));
/** The light's direction toward it, when it has one (a key); else straight down from above. */
function dirOf(light: Light): number[] {
  const d = light.props.dir;
  if (!Array.isArray(d) || d.length !== 3 || !d.every((v) => typeof v === "number")) return [0, 0, 1];
  const l = Math.hypot(...(d as number[])) || 1;
  return (d as number[]).map((v) => v / l);
}

export function throughWater(light: Light, opts: ThroughWaterOptions = {}): Light {
  // Its shadow would be dropped without a word: the shadow march does not follow the light through the water.
  if (light.shadow) throw new Error("paint-kit: lights.throughWater cannot wrap a light that casts a shadow; drop the light's shadow option");
  const caustic = clamp01(opts.caustic ?? 1);
  const own = (): Uniforms => ({ caustic, ldir: dirOf(light) });
  return {
    id: "throughWater",
    laws: ["caustic"],
    props: { ...light.props, caustic },
    uniforms: { ...lift(light.uniforms), ...own() },
    resolve: (ramp) => ({ ...lift(light.resolve ? light.resolve(ramp) : light.uniforms), ...own() }),
    with(p) {
      const { caustic: k, ...rest } = p;
      const inner = light.with ? light.with(rest) : { ...light, props: { ...light.props, ...rest } };
      return throughWater(inner, { caustic: typeof k === "number" ? k : caustic });
    },
    ...(light.testPositions ? { testPositions: (step: 0 | 1) => light.testPositions!(step) } : {}),
    ...(light.frame ? { frame: (t: number, p: [number, number]): Uniforms => lift(light.frame!(t, p)) } : {}),
    glsl:
      light.glsl.replaceAll("$", "$_in") +
      /* glsl */ `
uniform float u_$_caustic;
uniform vec3 u_$_ldir;
LightSum light_$(Surf s, MatOut m) {
  // The floor is flat: the wrapped light's diffuse is read at its normal, with no highlight.
  Surf f = s;
  f.n = vec3(0.0, 0.0, 1.0); // not-colour: the flat floor's normal
  f.height = 0.0;
  MatOut mf = m;
  mf.n = f.n;
  mf.spec = 0.0;
  LightSum lf = light_$_in(f, mf);
  LightSum ls = light_$_in(s, m);
  // The surface's slope here, once: the floor and the layer are met by the same refracted ray.
  vec2 g = waterAt(s.q, uTime).g;
  vec2 seen = waterSeen(s.q, g);
  float tc = uTime;
#ifdef PK_FAULT_STATIC_CAUSTICS
  // The test fault: a caustic baked once (t = 0) and laid over the picture where it is drawn, not where the eye
  // sees the floor through the water.
  seen = s.q;
  tc = 0.0;
#endif
  float px = 1.0 / min(uView.x, uView.y);
  // The field's lifted layer: where it covers, its caustic at its own depth (its own focus). Under full cover the
  // floor's caustic is hidden, so it is not computed (each caustic sums the waves 8 times).
  float cover = 0.0;
  vec2 ly = s.q;
  if (uWaterHasLayer > 0.5) {
    ly = waterLayerSeen(s.q, g);
#ifdef PK_FAULT_STATIC_CAUSTICS
    ly = s.q;
#endif
    cover = waterLayerOver(ly, seen).y;
  }
  float c = 1.0;
  if (cover < 1.0) c = waterCaustic(seen, tc, u_$_ldir, uWaterIor, waterBed(seen), px);
  if (cover > 0.0) {
    float cl = waterCaustic(ly, tc, u_$_ldir, uWaterIor, waterLayerDepth(), px);
    c = cover < 1.0 ? mix(c, cl, cover) : cl;
  }
  LightSum r;
  r.diffuse = lf.diffuse * mix(1.0, c, u_$_caustic);
  r.spec = ls.spec;
  return r;
}
`,
  };
}
