import { type Ramp } from "../palette.ts";
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
export declare function tonePosition(opts: ToneOptions): number;
/**
 * `Material.resolve` for a tone: the ramp position as a linear colour on the uniform `u_$_tone`, and the stop its
 * fine variation moves toward on `u_$_away`.
 */
export declare const resolveTone: (position: number) => (ramp: Ramp) => Uniforms;
/** The tone's uniforms, for a material's GLSL. */
export declare const TONE_GLSL = "uniform vec3 u_$_tone, u_$_away;\n";
