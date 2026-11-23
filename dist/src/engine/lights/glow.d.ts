import type { Light, PerFrame } from "../types.ts";
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
/**
 * The time a moving glow's test positions read its `at` at: 2 s, the time the checks freeze a page at
 * (src/checks/relight.ts). Both test positions hold still there, so moveLight gives the same light at any t.
 */
export declare const GLOW_TEST_TIME = 2;
/**
 * A glow; see the file header for its frame. Test positions: the declared glow, and the glow moved by its radius
 * along y toward the middle. y is used because on a landscape canvas a y fraction is exactly short-side units.
 * A moving `at` is read at GLOW_TEST_TIME for both. `follow` is kept by both, as by `with`.
 */
export declare function glow(opts: GlowOptions, declared?: GlowOptions): Light;
