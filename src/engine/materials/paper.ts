// `paper`: a sheet of paper. Fibre micro relief (short strands at seeded angles) tilts the normal, scaled by the
// detail dial; the macro relief is the field's and is already in the sheet's normal, so it stays at detail 0.
// Paper is a soft diffuser and lets a little light through, so its lambert wraps round slopes (translucency adds
// wrap). Ink is printed on it by the shared `printInk`, which at high detail lets the ink follow the fibres.
// Its colour is its tone, a ramp position (default 0, the ground). Its only law is relief.
// `scorch`: the sheet's param is time since a burn front passed (fields.burn), 0 to 1. Where it is above 0 the paper
// loses reflectance: the tone's OKLab lightness is scaled down by the scorch curve toward 0 (char), in either scheme,
// at every detail level (`SCORCH_GLSL`). It never moves toward a ramp stop: in a dark scheme the ink is light, and the
// paper's tone may already be the darkest stop. Any warm colour at the front comes from `lights.ember`.
import type { Material } from "../types.ts";
import { TONE_GLSL, resolveTone, tonePosition, type ToneOptions } from "./tone.ts";

export type PaperOptions = ToneOptions & {
  /** 0..1, how strongly the fibres tilt the light at detail 1 (default 1). */
  fibre?: number;
  /** 0..1, how much light the sheet lets through, which softens its shading round slopes (default 0.3). */
  translucency?: number;
  /** Read the sheet's param as scorch (fields.burn): above 0 the paper's lightness falls toward 0. Default false. */
  scorch?: boolean;
};

/**
 * The scorch curve: the share of the tone's lightness lost at param p (0 none, 1 all: black char). Builder, picked by
 * eye before any check ran: the paper darkens fast (half its lightness gone by p 0.3) and then chars slowly to black at
 * p 1, as paper behind a flame goes brown in a moment and black only near the hole.
 */
const SCORCH_GLSL = /* glsl */ `
float $_scorch(float p) { return 0.5 * smoothstep(0.0, 0.3, p) + 0.5 * smoothstep(0.3, 1.0, p); }
`;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function paper(opts: PaperOptions = {}): Material {
  return {
    id: "paper",
    laws: ["relief"],
    uniforms: { fibre: clamp01(opts.fibre ?? 1), translucency: clamp01(opts.translucency ?? 0.3), scorch: opts.scorch ? 1 : 0 },
    resolve: resolveTone(tonePosition(opts)),
    glsl:
      TONE_GLSL +
      SCORCH_GLSL +
      /* glsl */ `
uniform float u_$_fibre, u_$_translucency, u_$_scorch;
// Fibres: three layers of noise stretched about 6:1 at seeded angles, so they read as short strands, plus a
// finer pulp grain. About -1..1. "q" is in short-side units; strands are a few px wide at any canvas size.
float $_strands(vec2 q) {
  float side = min(uSheetSize.x, uSheetSize.y);
  float h = 0.0;
  for (int i = 0; i < 3; i++) {
    float a = hash11(uSeed * 0.71 + float(i) * 3.17) * 3.14159;
    vec2 p = mat2(cos(a), sin(a), -sin(a), cos(a)) * q * side;
    h += snoise(p * vec2(0.035, 0.21) + float(i) * 17.3 + uSeed * 0.13);
  }
  return h / 3.0 * 0.85 + snoise(q * side * 0.45 + 41.0) * 0.15;
}
MatOut mat_$(Surf s) {
  MatOut m = matBase(s, u_$_tone);
  float side = min(uSheetSize.x, uSheetSize.y);
  vec2 e = vec2(1.0 / side, 0.0);
  // Fibres and pulp are the flat sheet's: drawn at the rest position, so they move with the surface.
  float f0 = $_strands(s.rest);
  vec2 g = vec2($_strands(s.rest + e.xy), $_strands(s.rest + e.yx)) - f0;
  float amt = u_$_fibre * uDetail;
  // Micro relief: the fibres' slope tilts the normal, by detail.
  m.n = normalize(vec3(s.n.xy - g * 0.9 * amt, s.n.z)); // not-colour: a normal vector
  // Fine colour variation about the tone, toward and away from the ramp stop beside it that lies farther from it
  // (u_$_away: stop 1 at tone 0), by detail: pulp and fibres
  // a touch apart in tone. Zero-mean (f0 is noise about 0), so the dial adds texture without moving the page's mean
  // tone (AGENTS.md: the dial "changes only fine structure"). The test fault keeps the old constant 0.05 pulp term,
  // which moved the whole sheet toward stop 1 as the dial rose.
#ifdef PK_FAULT_DETAIL_TONE_SHIFT
  m.albedo = mixOklab(u_$_tone, u_$_away, uDetail * (0.05 + 0.04 * f0));
#else
  m.albedo = mixOklab(u_$_tone, u_$_away, uDetail * 0.04 * f0);
#endif
  // Scorch: where a burn front has passed, the paper loses reflectance. Its OKLab lightness is scaled down by the curve
  // (a scale, not a colour: the hue stays the paper's).
  if (u_$_scorch > 0.5 && s.param > 0.0) {
    vec3 lab = _toOklab(m.albedo);
    lab.x *= 1.0 - $_scorch(s.param);
    m.albedo = max(_fromOklab(lab), 0.0);
  }
  m.wrap = 0.2 + 0.5 * u_$_translucency;
  // Along the fibre: across the slope of the strand pattern.
  vec2 flow = dot(g, g) > 1e-10 ? normalize(vec2(-g.y, g.x)) : vec2(1.0, 0.0);
  return printInk(m, s, f0 * u_$_fibre, flow);
}
`,
  };
}
