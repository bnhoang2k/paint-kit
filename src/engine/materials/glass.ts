// `glass`: backlit frosted glass, a light panel lit from behind. Its pixels are lit mainly by light arriving from
// BEHIND the sheet (a light with `behind: true`, such as glow({ behind: true })): the frost spreads that light over
// `frost` short-side units and passes `transmit` of it to the viewer, so a tile glows from within where the light
// behind it sits, and a strongly lit tile runs into the finish's shoulder and clips toward white. Its colour is the
// light's (its token); the glass adds none.
// The rim: within `rimWidth` of the coverage edge (a rounded tile's edge) the light crosses more glass on its way
// out, so the frost passes `rim` more (a brighter rim; negative, a darker one). It is read from the sheet's coverage
// around the pixel, so it follows any shape's outline.
// The front: a little sheen, `gloss` of a fairly rough lobe from front lights (key, lamp), on a dim body (the lighter
// of the ink token and its tone at 25%; the tone is a ramp position, default 0, the ground), and a slight wrap, as
// frosted glass scatters what falls on it.
// At detail the frost's fine etch shows: micro relief in the normal, and an unevenness in what the body returns
// (up to 30%) and the glass passes (up to `etch`, default 15%), at the rest position (it moves with the surface).
// The pass unevenness is the only part a page lit from behind alone shows (the normal needs a front light, the body
// an ambient), and the finish's shoulder flattens it on tiles blown past white, so it reads on the dimmer tiles.
// Law: transmit.
import type { Material } from "../types.ts";
import { TONE_GLSL, resolveTone, tonePosition, type ToneOptions } from "./tone.ts";

export type GlassOptions = ToneOptions & {
  /** Short-side units over which the frost spreads light from behind (0 clear glass; about half a tile reads as a diffuser). */
  frost: number;
  /** 0..1: the share of the light behind the glass passes to the viewer; default 0.9. */
  transmit?: number;
  /** -1..1: how much more (or, negative, less) light the rim passes than the face; default 0.6. */
  rim?: number;
  /** Short-side units: the rim's width inside the coverage edge; default 0.008. */
  rimWidth?: number;
  /** 0..1: the front sheen's strength; default 0.3. */
  gloss?: number;
  /**
   * 0..1: how unevenly the frost's fine etch passes light, at detail 1 (scaled by the detail dial, so detail 0 has
   * none); default 0.15. Fine structure only: it moves the light passed by up to this share, pixel to pixel.
   */
  etch?: number;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function glass(opts: GlassOptions): Material {
  return {
    id: "glass",
    laws: ["transmit"],
    uniforms: {
      frost: Math.max(0, opts.frost),
      transmit: clamp(opts.transmit ?? 0.9, 0, 1),
      rim: clamp(opts.rim ?? 0.6, -1, 1),
      rimWidth: Math.max(1e-4, opts.rimWidth ?? 0.008),
      gloss: clamp(opts.gloss ?? 0.3, 0, 1),
      etch: clamp(opts.etch ?? 0.15, 0, 1),
    },
    resolve: resolveTone(tonePosition(opts)),
    glsl:
      TONE_GLSL +
      /* glsl */ `
uniform float u_$_frost, u_$_transmit, u_$_rim, u_$_rimWidth, u_$_gloss, u_$_etch;
float $_cov(vec2 uv) { return clamp(sheetDecode(texture(uSheet, uv)).y, 0.0, 1.0); }
MatOut mat_$(Surf s) {
  MatOut m = matBase(s, u_$_tone);
  float side = min(uSheetSize.x, uSheetSize.y);
  // The rim: the share of 8 points at rimWidth around this pixel that are off the glass, doubled and clamped, so it
  // is 0 on the face and rises to 1 at the edge.
  vec2 e = vec2(u_$_rimWidth * side) / uSheetSize;
  float on = 0.0;
  for (int k = 0; k < 8; k++) {
    float a = float(k) * 0.78539816;
    on += $_cov(s.uv + e * vec2(cos(a), sin(a)));
  }
  float rim = clamp(2.0 * (1.0 - on / 8.0), 0.0, 1.0);
  // The etch: fine frost relief about 3 sheet px across, by detail, at the rest position.
  vec2 g = s.rest * side * 0.35 + uSeed * 0.41;
  vec2 etch = vec2(snoise(g), snoise(g + vec2(17.0, 5.0))); // not-colour: a noise offset
  m.n = normalize(s.n + vec3(etch * 0.15 * uDetail, 0.0)); // not-colour: a normal tilt
  bool inkDark = dot(uInk, vec3(0.2126, 0.7152, 0.0722)) < dot(u_$_tone, vec3(0.2126, 0.7152, 0.0722)); // not-colour: Rec. 709 luminance weights
  m.albedo = 0.25 * (inkDark ? u_$_tone : uInk) * (1.0 + 0.3 * uDetail * etch.x);
  m.wrap = 0.3;
  m.spec = u_$_gloss;
  m.rough = 0.35;
  m.transmit = vec3(u_$_transmit * (1.0 + u_$_rim * rim) * (1.0 + u_$_etch * uDetail * etch.x)); // not-colour: a share of light
  m.frost = u_$_frost;
  return printInk(m, s, 0.0, s.dir);
}
`,
  };
}
