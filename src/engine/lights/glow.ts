// `glow`: a soft coloured area light. Its colour comes from the palette's ramp and it is light, not paint: the
// shade pass multiplies it with the surface's albedo, so on white paper it reads as coloured light and on a
// black surface it shows nothing. It is strongest at its centre and falls smoothly to exactly 0 at `radius`.
//
// Frame: `at` is [x, y] in page fractions (x 0 left to 1 right, y 0 top to 1 bottom, as the lamp's frame in
// lamp.ts); `radius` is in short-side units (1 is the canvas's shorter side), so the glow is round at any aspect.
import type { Light, PerFrame, Uniforms } from "../types.ts";

export type GlowOptions = {
  /** The centre, or a function of the paint's time in seconds (a glow that drifts); setTime replays it exactly. */
  at: PerFrame<[number, number]>;
  radius: number;
  /** How much the glow adds to a white surface at its centre (its colour normalised to luminance about 1). */
  level: number;
  /** Ramp positions 0..1 (at most 4), or 'accents' for ramp stops 1 to 3 (positions 0.25, 0.5, 0.75). */
  hues: "accents" | number[];
  /** 0..1, how much of the ramp colour's chroma the light takes: 0 is white light, 1 (default) the full hue. */
  tint?: number;
  /**
   * Follow the engine's eased pointer (pointer.ts): the glow sits at at(t) + follow x (pointer - [0.5, 0.5]), read per
   * draw as a uniform. 1 puts a glow declared at the centre under the pointer; 0.2 is a parallax shift (bar 06's
   * reference moves its light by 20% of the pointer's offset). Unset: the glow stays at `at`.
   */
  follow?: number;
  /**
   * The glow sits behind the sheet (Light.behind): it lights only what passes light from behind (materials.glass),
   * which glows from inside where it falls; `level` is then the light reaching the glass's back at its centre. It
   * declares the transmit law instead of tint. Unset: a glow on the front, as before.
   */
  behind?: boolean;
};

const ACCENTS = [0.25, 0.5, 0.75];

/**
 * The time a moving glow's test positions read its `at` at: 2 s, the time the checks freeze a page at
 * (src/checks/relight.ts). Both test positions hold still there, so moveLight gives the same light at any t.
 */
export const GLOW_TEST_TIME = 2;

const atOf = (at: GlowOptions["at"], t: number): [number, number] => {
  const a = typeof at === "function" ? at(t) : at;
  return [a[0], a[1]];
};

/**
 * A glow; see the file header for its frame. Test positions: the declared glow, and the glow moved by its radius
 * along y toward the middle. y is used because on a landscape canvas a y fraction is exactly short-side units.
 * A moving `at` is read at GLOW_TEST_TIME for both. `follow` is kept by both, as by `with`.
 */
export function glow(opts: GlowOptions, declared: GlowOptions = opts): Light {
  const hues = opts.hues === "accents" ? ACCENTS : opts.hues;
  if (hues.length < 1 || hues.length > 4) throw new RangeError(`paint-kit: glow takes 1 to 4 hues, got ${hues.length}`);
  const packed = [0, 1, 2, 3].map((i) => Math.min(1, Math.max(0, hues[Math.min(i, hues.length - 1)]!)));
  const uniforms: Uniforms = {
    at: atOf(opts.at, 0),
    radius: Math.max(opts.radius, 1e-4),
    level: opts.level,
    tint: Math.min(1, Math.max(0, opts.tint ?? 1)),
    hues: packed,
    count: hues.length,
  };
  return {
    id: "glow",
    laws: opts.behind ? ["transmit"] : ["tint"],
    ...(opts.behind ? { behind: true } : {}),
    props: { ...opts },
    uniforms,
    with: (p) => glow({ ...opts, ...p } as GlowOptions, declared),
    // The one place a glow's centre is made per draw: at(t) + follow x (pointer - 0.5).
    ...(typeof opts.at === "function" || opts.follow
      ? {
          frame: (t: number, [px, py]: [number, number]) => {
            const [x, y] = atOf(opts.at, t);
            const f = opts.follow ?? 0;
            return { at: [x + f * (px - 0.5), y + f * (py - 0.5)] };
          },
        }
      : {}),
    testPositions: (step) => {
      const [x, y] = atOf(declared.at, GLOW_TEST_TIME);
      const dy = step === 0 ? 0 : y > 0.5 ? -declared.radius : declared.radius;
      return { at: [x, y + dy] };
    },
    glsl: /* glsl */ `
uniform vec2 u_$_at;
uniform float u_$_radius, u_$_level, u_$_tint, u_$_count;
uniform vec4 u_$_hues;
LightSum light_$(Surf s, MatOut m) {
  vec2 sc = uSheetSize / min(uSheetSize.x, uSheetSize.y);
  vec2 c = vec2((u_$_at.x - 0.5) * sc.x, (0.5 - u_$_at.y) * sc.y);
  vec2 rel = (s.q - c) / u_$_radius;
  float r2 = dot(rel, rel);
  // Smooth to exactly 0 at the radius, with no slope there.
  float f = r2 < 1.0 ? (1.0 - r2) * (1.0 - r2) : 0.0;
  // Across the glow the colour drifts through the hue list, by a slow noise seeded per page.
  int n = int(u_$_count + 0.5);
  float k = clamp(snoise(rel * 0.9 + uSeed * 0.13) * 0.5 + 0.5, 0.0, 1.0) * float(n - 1);
  int i = int(min(floor(k), float(max(n - 2, 0))));
  vec3 col = n <= 1 ? ramp(u_$_hues[0]) : mixOklab(ramp(u_$_hues[i]), ramp(u_$_hues[i + 1]), k - float(i));
  // Light of the ramp colour's hue and chroma (times tint) at a fixed lightness, scaled to luminance about 1.
  vec3 lab = _toOklab(col);
  lab.yz *= u_$_tint;
  lab.x = 0.8;
  col = max(_fromOklab(lab), 0.0) / 0.512;
  LightSum r;
  r.diffuse = col * (u_$_level * f);
  r.spec = vec3(0.0); // not-colour: a glow has no highlight
  return r;
}
`,
  };
}
