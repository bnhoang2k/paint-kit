// `matte`: a plain diffuse surface in its tone (a ramp position, default 0: the page's ground colour), with ink
// printed on it from the ink token.
// Its only law is relief: it shows the sheet's height through the light, nothing else.
import type { Material } from "../types.ts";
import { TONE_GLSL, resolveTone, tonePosition, type ToneOptions } from "./tone.ts";

export function matte(opts: ToneOptions = {}): Material {
  return {
    id: "matte",
    laws: ["relief"],
    uniforms: {},
    resolve: resolveTone(tonePosition(opts)),
    glsl:
      TONE_GLSL +
      /* glsl */ `
MatOut mat_$(Surf s) {
  // Fine colour variation about the tone, toward and away from the ramp stop beside it that lies farther from it
  // (u_$_away: stop 1 at tone 0), scaled by detail. Zero-mean (v - 0.5, v in
  // 0..1), so the dial adds texture without moving the page's mean tone: AGENTS.md, the dial "changes only fine
  // structure". The test fault keeps the old one-sided mix, which lightened a dark page and darkened a light one.
  float v = snoise(s.rest * 24.0 + uSeed * 0.37) * 0.5 + 0.5;
  MatOut m = matBase(s, u_$_tone);
#ifdef PK_FAULT_DETAIL_TONE_SHIFT
  m.albedo = mixOklab(u_$_tone, u_$_away, uDetail * 0.1 * v);
#else
  m.albedo = mixOklab(u_$_tone, u_$_away, uDetail * 0.1 * (v - 0.5));
#endif
  m.wrap = 0.15;
  // No fibres: the ink prints flat, exactly as the channel says.
  return printInk(m, s, 0.0, vec2(1.0, 0.0));
}
`,
  };
}
