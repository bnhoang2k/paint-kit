// A material's tone: the colour it shades in, as a position on the page's ramp (0 the ground, 1 the ink, the accents
// between them by lightness; the scale `materials.water`'s `under` and `lights.glow`'s `hues` use). Every engine
// material but water takes `tone` (default 0, the ground) and resolves it here, against the ramp, through
// `Material.resolve`: the engine calls that whenever the ramp rebuilds, so a toned surface follows the tokens.
// The material's GLSL declares `uniform vec3 u_$_tone, u_$_away;` (TONE_GLSL) and starts from `matBase(s, u_$_tone)`.
// `u_$_away` is what the surface's fine colour variation moves toward: the ramp stop beside the tone that lies
// farther from it (`rampAway`), so the variation keeps its reach on any tone, a stop included; at tone 0 it is
// stop 1, as before tones.
import { rampAt, rampAway, type Ramp } from "../palette.ts";
import type { Uniforms } from "../types.ts";

export type ToneOptions = {
  /**
   * 0..1: the surface's colour as a position on the page's ramp: 0 the ground token (default), 1 the ink token, and
   * between them the ramp's stops (the accents by lightness), mixed in OKLab. Two materials with two tones in two
   * slots give two surfaces two colours (a card on a desk).
   */
  tone?: number;
};

/** The tone position from the options: default 0, clamped to 0..1; a non-finite tone throws. */
export function tonePosition(opts: ToneOptions): number {
  const t = opts.tone ?? 0;
  if (!Number.isFinite(t)) throw new RangeError(`paint-kit: a material's tone is a ramp position 0..1, got ${t}`);
  return Math.min(1, Math.max(0, t));
}

/**
 * `Material.resolve` for a tone: the ramp position as a linear colour on the uniform `u_$_tone`, and the stop its
 * fine variation moves toward on `u_$_away`.
 */
export const resolveTone =
  (position: number) =>
  (ramp: Ramp): Uniforms => ({ tone: rampAt(ramp, position), away: rampAway(ramp, position) });

/** The tone's uniforms, for a material's GLSL. */
export const TONE_GLSL = "uniform vec3 u_$_tone, u_$_away;\n";
