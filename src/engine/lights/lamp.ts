// `lamp`: a spot light. It sits at a point, points at another, and lights a cone with a soft edge. Its light
// dims with the square of the distance from the bulb and falls on each slope by lambert on the sheet normal.
// Outside the cone it adds nothing, so the surface drops to the other lights there.
//
// Coordinate frame for `at` and `aim` (the "page frame"): [x, y, z].
// - x and y are fractions of the canvas: x 0 is the left edge and 1 the right edge; y 0 is the top edge and 1 the
//   bottom edge, as in CSS. A pointer maps straight in (clientX / width, clientY / height). Values outside 0..1
//   are off the page: a lamp hung above the top edge has y < 0.
// - z is the height above the sheet, in short-side units (1 is the canvas's shorter side).
// - `aim` is the point the lamp points at, usually on the sheet (z 0).
// Distances (the falloff) and angles (the cone) are measured in short-side units, so the cone stays round at any
// aspect. `pageToSheet` and `sheetToPage` convert between the page frame and that space; `lampSheetPoint` finds
// where a ray from the lamp at a given angle off its aim meets the sheet, for checks that sample along the aim.
import { kelvinToLinear, type Ramp, type Vec3 } from "../palette.ts";
import type { Light, Uniforms } from "../types.ts";
import { paletteLight, shadowOf, specularOf, type ShadowOptions } from "./basic.ts";

export type LampOptions = {
  at: Vec3;
  aim: Vec3;
  /** Half angle of the cone, in degrees. */
  cone: number;
  /** Width of the cone's soft edge, in degrees, inside `cone`: full light at `cone - soft`, none at `cone`. */
  soft: number;
  /** How bright a flat sheet is at the aim point. Nearer the bulb it is brighter, farther it is dimmer. */
  level: number;
  kelvin: number;
  /** 0..1, how far the kelvin colour is tinted toward the ground's hue (default 0.15, as the key light). */
  tint?: number;
  /** 0..1, how much of its specular term the lamp gives (default 1); as the key light's `specular`. */
  specular?: number;
  /** The lamp casts a shadow from the sheet's height, away from its bulb; as the key light's `shadow`. */
  shadow?: ShadowOptions | null;
};

/** Short-side units per page fraction, for a canvas of this aspect (width / height). */
const scaleOf = (aspect: number): [number, number] => (aspect >= 1 ? [aspect, 1] : [1, 1 / aspect]);

/** Page frame to sheet space: x right, y up, z toward the viewer, in short-side units, centred. */
export function pageToSheet([x, y, z]: Vec3, aspect: number): Vec3 {
  const [sx, sy] = scaleOf(aspect);
  return [(x - 0.5) * sx, (0.5 - y) * sy, z];
}

/** Sheet space back to the page frame. */
export function sheetToPage([x, y, z]: Vec3, aspect: number): Vec3 {
  const [sx, sy] = scaleOf(aspect);
  return [x / sx + 0.5, 0.5 - y / sy, z];
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/**
 * Where a ray from the lamp meets the sheet (z 0), as a page-frame point [x, y], or null if the ray misses it.
 * The ray is the lamp's aim turned by `offDeg` degrees. Along the aim (default), positive turns it farther from
 * the lamp's foot (the point on the sheet under the bulb), so `-k, 0, k` give three points at growing distance.
 * `across` turns it sideways instead; positive turns toward screen right when the lamp aims down the page.
 * `aspect` is the canvas width / height. The sheet's own height is ignored (it is a few thousandths).
 */
export function lampSheetPoint(lamp: Pick<LampOptions, "at" | "aim">, aspect: number, offDeg = 0, across = false): [number, number] | null {
  return turnToSheet(lamp, aspect, offDeg, across ? 0 : 1, across ? 1 : 0);
}

/**
 * The point on the ring `offDeg` degrees off the lamp's aim, at azimuth `azimuthDeg` around the aim, where it meets
 * the sheet (or null). Azimuth 0 turns along the aim away from the foot, 90 across toward screen right (as
 * `lampSheetPoint`'s `across`), 180 along toward the foot and 270 across toward screen left. At the four quarter
 * turns the point is exactly `lampSheetPoint`'s: 0 is `(offDeg)`, 180 `(-offDeg)`, 90 `(offDeg, true)` and 270
 * `(-offDeg, true)`, since the turn's cosine and sine are taken exact there (Phase 2 Task 2d: the falloff law's
 * outside probe sweeps this ring, and a page the old four-turn probe read keeps its point).
 */
export function lampRingPoint(lamp: Pick<LampOptions, "at" | "aim">, aspect: number, offDeg: number, azimuthDeg: number): [number, number] | null {
  const q = (((azimuthDeg % 360) + 360) % 360) / 90;
  const quarter: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  if (Number.isInteger(q)) {
    const [ca, sa] = quarter[q]!;
    return turnToSheet(lamp, aspect, offDeg, ca, sa);
  }
  const ph = (azimuthDeg * Math.PI) / 180;
  return turnToSheet(lamp, aspect, offDeg, Math.cos(ph), Math.sin(ph));
}

/** The ray turned `offDeg` off the aim toward `along * e_along + across * e_across`, met with the sheet. */
function turnToSheet(lamp: Pick<LampOptions, "at" | "aim">, aspect: number, offDeg: number, along: number, across: number): [number, number] | null {
  const L = pageToSheet(lamp.at, aspect);
  const a = norm(sub(pageToSheet(lamp.aim, aspect), L));
  const flat = Math.hypot(a[0], a[1]);
  // The two directions of the turn: in the aim's vertical plane, away from the foot; and sideways.
  const eAlong: Vec3 = flat > 1e-6 ? norm([-a[0] * a[2], -a[1] * a[2], flat * flat]) : [0, -1, 0];
  const eAcross: Vec3 = flat > 1e-6 ? [-a[1] / flat, a[0] / flat, 0] : [1, 0, 0];
  // With (along, across) one of (1, 0), (0, 1), (-1, 0), (0, -1) each product is exact, so a quarter turn gives
  // the same direction as turning by -offDeg or offDeg along one axis.
  const e: Vec3 = [0, 1, 2].map((i) => along * eAlong[i]! + across * eAcross[i]!) as Vec3;
  const th = (offDeg * Math.PI) / 180;
  const d: Vec3 = [0, 1, 2].map((i) => Math.cos(th) * a[i]! + Math.sin(th) * e[i]!) as Vec3;
  if (d[2] >= -1e-6) return null;
  const t = -L[2] / d[2];
  const p = sheetToPage([L[0] + t * d[0], L[1] + t * d[1], 0], aspect);
  return [p[0], p[1]];
}

const scale = (c: Vec3, k: number): number[] => c.map((v) => v * k);
const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * A spot light; see the file header for the frame of `at` and `aim`. Test positions: the declared lamp, and the
 * lamp slid a quarter of the view along x toward the middle, its aim sliding with it (a lamp moving on a rail;
 * ruled by the Task 5 driver over the plan's "slides its `at`", so the pool of light moves rather than pivots).
 */
export function lamp(opts: LampOptions, declared: LampOptions = opts): Light {
  const tint = opts.tint ?? 0.15;
  const outer = Math.max(opts.cone, 0.1);
  const inner = Math.max(outer - Math.max(opts.soft, 0.1), 0);
  const { shadow, soft } = shadowOf(opts.shadow);
  // `rayAt` is the bulb the shadow march runs toward: always `at`, except under the "shadow-baked" test fault.
  const base = (colour: number[]): Uniforms => ({
    at: [...opts.at],
    aim: [...opts.aim],
    edge: [Math.cos(rad(outer)), Math.cos(rad(inner))],
    colour,
    specular: specularOf(opts.specular),
    ...(shadow ? { rayAt: [...opts.at], soft: soft! } : {}),
  });
  return {
    id: "lamp",
    laws: shadow ? ["falloff", "shadow"] : ["falloff"],
    props: { ...opts },
    ...(shadow ? { shadow } : {}),
    uniforms: base(scale(kelvinToLinear(opts.kelvin), opts.level)),
    resolve: (ramp: Ramp) => base(scale(paletteLight(opts.kelvin, tint, ramp), opts.level)),
    with: (p) => lamp({ ...opts, ...p } as LampOptions, declared),
    testPositions: (step) => {
      const dx = step === 0 ? 0 : declared.at[0] > 0.5 ? -0.25 : 0.25;
      const slide = (v: Vec3): Vec3 => [v[0] + dx, v[1], v[2]];
      return { at: slide(declared.at), aim: slide(declared.aim) };
    },
    glsl: /* glsl */ `
uniform vec3 u_$_at;
uniform vec3 u_$_aim;
uniform vec2 u_$_edge;
uniform vec3 u_$_colour;
uniform float u_$_specular;
vec3 $_toSheet(vec3 p) {
  vec2 sc = uSheetSize / min(uSheetSize.x, uSheetSize.y);
  return vec3((p.x - 0.5) * sc.x, (0.5 - p.y) * sc.y, p.z); // not-colour: page frame to sheet space
}
LightSum light_$(Surf s, MatOut m) {
  vec3 lp = $_toSheet(u_$_at);
  vec3 ap = $_toSheet(u_$_aim);
  vec3 d = lp - vec3(s.q, s.height); // not-colour: surface point
  float dist2 = max(dot(d, d), 1e-4);
  vec3 l = d * inversesqrt(dist2);
  vec3 axis = normalize(ap - lp - vec3(0.0, 0.0, 1e-6)); // not-colour: keeps the axis defined when aim is at
  // Cone: full inside the soft edge, exactly none at and beyond the cone angle.
  float cone = smoothstep(u_$_edge.x, u_$_edge.y, dot(-l, axis));
  // Inverse square, scaled so a flat sheet at the aim point gets the light's level.
  vec3 da = lp - ap;
  float ref2 = max(dot(da, da), 1e-4);
  float refLit = max((normalize(da).z + m.wrap) / (1.0 + m.wrap), 0.2);
  float lit = max((dot(s.n, l) + m.wrap) / (1.0 + m.wrap), 0.0);
  float k = cone * ref2 / dist2;
  LightSum r;
  r.diffuse = u_$_colour * (k * lit / refLit);
  r.spec = u_$_colour * (k * specColour(m, s.n, l, s.view, u_$_specular));
  return r;
}
` + (shadow ? LAMP_RAY : ""),
  };
}

/** A casting lamp's ray: toward the bulb, running no farther across the sheet than the bulb's foot. */
const LAMP_RAY = /* glsl */ `uniform vec3 u_$_rayAt;
uniform float u_$_soft;
vec4 ray_$(Surf s) {
  vec3 d = $_toSheet(u_$_rayAt) - vec3(s.q, s.height); // not-colour: surface point to bulb
  return vec4(normalize(d), length(d.xy));
}
`;
