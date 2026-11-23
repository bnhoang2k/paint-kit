// `ambient` and `key` lights. A light's colour is computed (kelvin), then tinted toward the palette's ground
// hue by a declared amount, keeping the light's own lightness. The engine never invents a hue.
import { kelvinToLinear, linearToOklch, oklchToLinear, tintToward, type Ramp, type Vec3 } from "../palette.ts";
import type { Light, Uniforms } from "../types.ts";

const D65 = 6504;

/** `kelvin` light tinted by `tint` 0..1 toward the ground's hue and chroma, at the light's own lightness. */
export function paletteLight(kelvin: number, tint: number, ramp: Ramp): Vec3 {
  const c = kelvinToLinear(kelvin);
  const [L] = linearToOklch(c);
  const [, C, h] = linearToOklch(ramp.ground);
  return tintToward(c, oklchToLinear(L, C, h), tint);
}

const scale = (c: Vec3, k: number): number[] => c.map((v) => v * k);
/** A light's `specular` prop as its uniform: 0..1, default 1. */
export const specularOf = (v: number | undefined): number => Math.min(1, Math.max(0, v ?? 1));

export function ambient(level: number): Light {
  const props = { level };
  return {
    id: "ambient",
    laws: [],
    props,
    uniforms: { colour: scale(kelvinToLinear(D65), level) },
    resolve: (ramp): Uniforms => ({ colour: scale(paletteLight(D65, 0.3, ramp), level) }),
    with: (p) => ambient(Number(p.level ?? level)),
    glsl: /* glsl */ `
uniform vec3 u_$_colour;
LightSum light_$(Surf s, MatOut m) {
  LightSum r;
  r.diffuse = u_$_colour;
  r.spec = vec3(0.0); // not-colour: no highlight
  return r;
}
`,
  };
}

export type KeyOptions = {
  dir: Vec3;
  level: number;
  kelvin?: number;
  tint?: number;
  /**
   * 0..1, how much of its specular term (the highlight) the light gives; default 1. Pages leave it alone: the
   * relight check's highlight law switches it to 0 to read the highlight alone (frame on minus frame off).
   */
  specular?: number;
  /**
   * Tilt with the engine's eased pointer (pointer.ts): the light's direction is `dir` + follow x (pointer x - 0.5,
   * 0.5 - pointer y, 0), read per draw, its diffuse and its highlight alike. At the pointer's rest (the centre) it is
   * `dir`. Unset: the light keeps `dir`.
   */
  follow?: number;
  /**
   * The light casts a shadow from the sheet's height (Phase 2 Task 7): it falls on the side away from the light, moves
   * against it, and softens with height. `soft`: short-side units of penumbra per unit of the blocker's height above
   * the receiver (0 is a hard edge). `ground` (default false): the shadow also darkens the bare ground (coverage 0),
   * which otherwise stays unlit. Declares the shadow law. `null` or unset: no shadow (the relight check's shadow law
   * reads the frame with `setLight(i, { shadow: null })`).
   */
  shadow?: ShadowOptions | null;
};

/** A light's shadow: see `KeyOptions.shadow`. */
export type ShadowOptions = { soft: number; ground?: boolean };

/** The structural shadow flag (`Light.shadow`) and the uniforms of a light's `shadow` option, or nothing without one. */
export function shadowOf(sh: ShadowOptions | null | undefined): { shadow?: { ground: boolean }; soft?: number } {
  if (!sh) return {};
  const soft = Number(sh.soft);
  if (!Number.isFinite(soft) || soft < 0) throw new RangeError(`paint-kit: a light's shadow.soft must be a number at or above 0, got ${sh.soft}`);
  return { shadow: { ground: sh.ground === true }, soft };
}

/** Rotates `d` about the view axis (z) by `deg` degrees. */
const swing = (d: Vec3, deg: number): Vec3 => {
  const a = (deg * Math.PI) / 180;
  return [d[0] * Math.cos(a) - d[1] * Math.sin(a), d[0] * Math.sin(a) + d[1] * Math.cos(a), d[2]];
};

/**
 * A directional light. `dir` points from the surface toward the light (x right, y up, z toward the viewer).
 * `level` is how bright a flat sheet is under it: slopes facing the light get more, slopes facing away less.
 * Test positions: the declared `dir`, and that `dir` swung 60 degrees about the view axis.
 */
export function key(opts: KeyOptions, declared: KeyOptions = opts): Light {
  const kelvin = opts.kelvin ?? D65;
  const tint = opts.tint ?? 0.15;
  const { shadow, soft } = shadowOf(opts.shadow);
  // `rayDir` is the direction the shadow march runs: always `dir`, except under the "shadow-baked" test fault.
  const ray = (d: number[]): Uniforms => (shadow ? { rayDir: d, soft: soft! } : {});
  return {
    id: "key",
    laws: shadow ? ["relief", "shadow"] : ["relief"],
    props: { ...opts },
    ...(shadow ? { shadow } : {}),
    // `specDir` is the direction the specular lobe uses: always `dir`, except under the "spec-fixed-light" test fault.
    uniforms: { dir: [...opts.dir], specDir: [...opts.dir], colour: scale(kelvinToLinear(kelvin), opts.level), specular: specularOf(opts.specular), ...ray([...opts.dir]) },
    resolve: (ramp) => ({ dir: [...opts.dir], specDir: [...opts.dir], colour: scale(paletteLight(kelvin, tint, ramp), opts.level), specular: specularOf(opts.specular), ...ray([...opts.dir]) }),
    with: (p) => key({ ...opts, ...p } as KeyOptions, declared),
    ...(opts.follow
      ? {
          frame: (_t: number, [px, py]: [number, number]) => {
            const d = [opts.dir[0] + opts.follow! * (px - 0.5), opts.dir[1] + opts.follow! * (0.5 - py), opts.dir[2]];
            return { dir: d, specDir: d, ...ray(d) };
          },
        }
      : {}),
    testPositions: (step) => ({ dir: step === 0 ? [...declared.dir] : swing(declared.dir, 60) }),
    glsl: /* glsl */ `
uniform vec3 u_$_dir;
uniform vec3 u_$_specDir;
uniform vec3 u_$_colour;
uniform float u_$_specular;
LightSum light_$(Surf s, MatOut m) {
  vec3 l = normalize(u_$_dir);
  float lit = max((dot(s.n, l) + m.wrap) / (1.0 + m.wrap), 0.0);
  float ref = max((l.z + m.wrap) / (1.0 + m.wrap), 0.2);
  LightSum r;
  r.diffuse = u_$_colour * (lit / ref);
  r.spec = u_$_colour * specColour(m, s.n, normalize(u_$_specDir), s.view, u_$_specular);
  return r;
}
` + (shadow ? KEY_RAY : ""),
  };
}

/** A casting key's ray: toward the light everywhere, with no end to its run. */
const KEY_RAY = /* glsl */ `uniform vec3 u_$_rayDir;
uniform float u_$_soft;
vec4 ray_$(Surf s) { return vec4(normalize(u_$_rayDir), 1e3); }
`;
