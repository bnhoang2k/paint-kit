import type { Material } from "../types.ts";
import type { PullTarget } from "../spectrum.ts";
import { type ToneOptions } from "./tone.ts";
/** Groove spacing range in um: holo film is sold at 500 to 1000 lines per mm (bars/10-foil-card/study.md, "The grating mechanism"). */
export declare const FOIL_SPACING: {
    readonly min: 1;
    readonly max: 2;
};
/** Orders a foil may sum: 1 up to Stam's 7 (GPU Gems chapter 8). */
export declare const FOIL_ORDERS: {
    readonly min: 1;
    readonly max: 7;
    readonly default: 2;
};
/**
 * The default `roughness`: how far the grooves wander from straight and the film from flat, as the width of the lobe
 * along the grooves. Builder: 0.3 is `sheen`'s satin end, wide enough that a key light off the grooves' square still
 * finds colour on a laid-on foil (an ideal grating shows colour only exactly square to the light); no source gives it.
 */
export declare const FOIL_ROUGHNESS = 0.3;
/**
 * The film's grain, the fine structure the detail dial draws: laminated holo film is not glass-flat. Up close it shows
 * an orange-peel waviness from the board under it, and that waviness breaks a band of colour into a fine sparkle. It is
 * drawn as a micro-slope on the foil's normal, two seeded noises (one per slope axis, zero-mean) at the rest position,
 * scaled by `uDetail`: none at detail 0, so a point's colour there is its groove's and its tilt's alone.
 * - `cycles`: noise cycles per sheet texel, 1 / 3. Builder: features about 3 texels across, the size film's orange peel
 *   shows at on a card drawn a few hundred px wide (a few tenths of a mm); finer than sheen's brushing along the grain
 *   (0.015 cycles per texel), coarser than its 0.9 across, as the grain is round, not streaked.
 * - `slope`: the micro-slope at detail 1, 0.025. Builder: tipping the normal by s moves X.(l + v) by up to about
 *   1.8 s, so 0.025 moves it by up to 0.045, within one band's spread (`GRATING_SPREAD`, 0.05, which already counts the
 *   film's waviness). The sparkle then stays inside each band's colour family; it never jumps a pixel to another hue.
 *   Sheen's brush is 0.12, but a metal's white highlight can take that; a grating's hue would scatter across the
 *   spectrum (hue soup).
 */
export declare const FOIL_GRAIN: {
    readonly cycles: number;
    readonly slope: 0.025;
};
export type FoilOptions = ToneOptions & {
    /** Groove spacing in micrometres, 1.0 to 2.0 (the range holo film is sold at). */
    spacing: number;
    /** Diffraction orders summed, 1 to 7; default 2. */
    orders?: number;
    /** 0..1: how far the foil's colour is pulled toward the page's ramp (0 the raw spectrum). */
    pull: number;
    /** Where the pull goes: `"nearest"` ramp stop, or the `"ground"`'s hue (`pullToRamp`). */
    pullTarget: PullTarget;
    /** 0..1: the width of the highlight along the grooves (the grooves' wander); default 0.3 (builder). */
    roughness?: number;
};
export declare function foil(opts: FoilOptions): Material;
