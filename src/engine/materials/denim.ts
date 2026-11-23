// `denim`: indigo cloth on a twill field. Warp threads take the dye and weft threads the ground: the twill's
// direction image marks weft with a shorter direction (0.6), so the weave's colours follow its relief exactly.
// Dye and wear: the dye fades a little in broad mottles (always), wear lightens it where the relief stands
// highest locally (rib tops and fold crests), and the warp's uneven yarn streaks it along the warp (broad streaks
// always, thread-fine ones by detail). Its sheen is
// anisotropic: a soft, low highlight streaked along the threads (the direction image, the warp axis), stronger on
// warp floats than on weft, which moves when the light moves. The undyed yarn (the weft, and what the dye fades
// toward) is its tone, a ramp position (default 0, the ground). The weave's colours and its dial-driven streaks
// run between the tone and the dye, so a tone equal to the dye (tone 1 with the ink dye, 0.5 with "accent0" on a
// one-accent page) leaves an undyed cloth: no weave colour, no streaks. Laws: relief and highlight.
import type { Material } from "../types.ts";
import { TONE_GLSL, resolveTone, tonePosition, type ToneOptions } from "./tone.ts";

export type DenimOptions = ToneOptions & {
  /** 0..1, how far wear lightens the dye on the highest relief (default 0.4). */
  wear?: number;
  /**
   * The warp's dye: `'ink'` (default) is the ink token; `'accent0'` is the ramp's middle stop, which is the page's
   * accent when it declares one (with two accents it is their OKLab mix).
   */
  dye?: "ink" | "accent0";
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function denim(opts: DenimOptions = {}): Material {
  return {
    id: "denim",
    laws: ["relief", "highlight"],
    uniforms: { wear: clamp01(opts.wear ?? 0.4), dye: opts.dye === "accent0" ? 1 : 0 },
    resolve: resolveTone(tonePosition(opts)),
    glsl:
      TONE_GLSL +
      /* glsl */ `
uniform float u_$_wear, u_$_dye;
float $_h(vec2 uv) { return sheetDecode(texture(uSheet, uv)).x; }
MatOut mat_$(Surf s) {
  MatOut m = matBase(s, u_$_tone);
  float side = min(uSheetSize.x, uSheetSize.y);
  vec3 dye = u_$_dye > 0.5 ? uRamp[2] : uInk;
  float warp = smoothstep(0.7, 0.9, s.dirLen);
  // Local relief: the height over the mean of eight points on a ring 0.02 short-side units out (about a wale
  // and a half). Crests (rib tops, fold crests) wear; hollows (the gaps where a yarn dives) sit in shadow.
  vec2 r = vec2(0.02 * side) / uSheetSize;
  float ring = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398;
    ring += $_h(s.uv + vec2(cos(a), sin(a)) * r);
  }
  float local = s.height - ring / 8.0;
  float crest = smoothstep(0.0, 0.0012, local);
  float cavity = mix(0.72, 1.0, smoothstep(-0.0006, 0.0002, local));
  // The direction image is the warp axis (a twill field writes it). Ring-dyed warp yarn is uneven, so the dye runs
  // in streaks along the warp: broad ones always (abrash), fine ones a thread wide by detail. Positions along and
  // across the warp, in sheet px, at the rest position (the dye is the cloth's, so it moves with it).
  vec2 wd = s.dir;
  vec2 tq = vec2(dot(s.rest, wd), dot(s.rest, vec2(-wd.y, wd.x))) * side;
  float abrash = snoise(tq * vec2(0.004, 0.06) + uSeed * 0.31);
  float streak = snoise(tq * vec2(0.03, 0.3) + uSeed);
  float mottle = snoise(s.rest * 2.5 + uSeed * 0.7);
  float fade = clamp(0.1 + 0.07 * mottle + 0.06 * abrash + u_$_wear * 0.6 * crest + uDetail * 0.1 * streak, 0.0, 1.0);
  vec3 warpCol = mixOklab(dye, u_$_tone, fade);
  // The weft is undyed, but it shows only in the shade between warp floats and picks up some dye from them.
  vec3 weftCol = mixOklab(u_$_tone, dye, clamp(0.42 + 0.06 * uDetail * streak, 0.0, 1.0));
  m.albedo = mixOklab(weftCol, warpCol, warp) * cavity;
  m.wrap = 0.35;
  m.spec = mix(0.05, 0.16, warp);
  m.rough = 0.45;
  m.aniso = 0.7;
  return printInk(m, s, 0.0, s.dir);
}
`,
  };
}
