// `sheen`: an anisotropic gloss for metal (zipper teeth) and satin. A stiff surface: its normal is a plane fitted
// to the sheet's height over a 0.024 short-side-unit square, so it follows the relief its own field draws (a
// bowed band, teeth) and bridges finer relief beneath it (the cloth's threads). Its highlight is a Ward lobe
// streaked along the direction image, `roughness` wide and `anisotropy` stretched; it moves toward the light as
// the light moves. At detail, fine brushing lines along the grain break the highlight. Its diffuse colour is dim
// (a step from the darker of the ink and its tone toward the lighter, at 60%), so the highlight carries it;
// the highlight's colour is the light's. Its tone is a ramp position (default 0, the ground). Law: highlight.
import type { Material } from "../types.ts";
import { TONE_GLSL, resolveTone, tonePosition, type ToneOptions } from "./tone.ts";

export type SheenOptions = ToneOptions & {
  /** 0..1: the highlight's width (0.1 polished, 0.5 satin). */
  roughness: number;
  /** 0..1: how far the highlight streaks along the grain (0 round). */
  anisotropy: number;
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function sheen(opts: SheenOptions): Material {
  return {
    id: "sheen",
    laws: ["highlight"],
    uniforms: { rough: Math.max(0.03, clamp01(opts.roughness)), aniso: clamp01(opts.anisotropy) },
    resolve: resolveTone(tonePosition(opts)),
    glsl:
      TONE_GLSL +
      /* glsl */ `
uniform float u_$_rough, u_$_aniso;
float $_h(vec2 uv) { return sheetDecode(texture(uSheet, uv)).x; }
MatOut mat_$(Surf s) {
  MatOut m = matBase(s, u_$_tone);
  float side = min(uSheetSize.x, uSheetSize.y);
  // Least-squares plane over a 5 x 5 grid, 0.006 short-side units apart: slope = sum(h x) / sum(x^2).
  const float SP = 0.006;
  vec2 e = vec2(SP * side) / uSheetSize;
  vec2 g = vec2(0.0);
  for (int j = -2; j <= 2; j++) {
    for (int i = -2; i <= 2; i++) {
      float h = $_h(s.uv + vec2(float(i), float(j)) * e);
      g += h * vec2(float(i), float(j));
    }
  }
  g /= 50.0 * SP;
  vec2 across = vec2(-s.dir.y, s.dir.x);
  // Brushing: fine lines along the grain, by detail, at the rest position (they move with the surface).
  float brush = snoise(vec2(dot(s.rest, s.dir) * side * 0.015, dot(s.rest, across) * side * 0.9) + uSeed * 0.29);
  vec3 n = vec3(-g + across * brush * 0.12 * uDetail, 1.0); // not-colour: a normal vector
  m.n = normalize(n);
  // Most of the light a metal or satin returns is in its highlight: its diffuse colour is dim, a step from the
  // darker of the ink token and the tone toward the lighter, at 60% strength.
  bool inkDark = dot(uInk, vec3(0.2126, 0.7152, 0.0722)) < dot(u_$_tone, vec3(0.2126, 0.7152, 0.0722)); // not-colour: Rec. 709 luminance weights
  m.albedo = 0.6 * mixOklab(inkDark ? uInk : u_$_tone, inkDark ? u_$_tone : uInk, 0.3);
  m.wrap = 0.0;
  m.spec = 0.9;
  m.rough = u_$_rough;
  m.aniso = u_$_aniso;
  return printInk(m, s, 0.0, s.dir);
}
`,
  };
}
