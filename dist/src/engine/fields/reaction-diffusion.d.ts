import type { Field } from "../types.ts";
export type ReactionDiffusionOptions = {
    /** The family. Unset, the seed picks one (seed mod 4, in this order). */
    preset?: "coral" | "cells" | "worms" | "spots";
    /**
     * Relief depth: plate texels of height per unit of B. Default RELIEF_TEXELS (18), chosen by eye from a sweep at
     * 4.5 / 9 / 18 / 27: the smallest depth that reads as raised cells in both schemes; picked before any gate run.
     */
    depth?: number;
};
/** Simulation steps per 1/60 s tick. */
export declare const STEPS_PER_TICK = 12;
/** Ticks until the field is settled: 5 s, the state the wild sampler showed under reduced motion. */
export declare const SETTLE_TICKS = 300;
/**
 * Default height per unit of B, in plate texels. Chosen by eye from a sweep at 4.5 / 9 / 18 / 27 (seed 1, t 2 and
 * t 5, light and dark; out/grown-depth-*.png). 18 is the smallest depth that reads as raised cells in BOTH schemes.
 * 9 reads in light but only on a close look in dark. 27 turns to plastic pegs or bubble wrap. Picked before any
 * gate run. (4.5, the wild sampler's own normal slope, read as faint dots without its colour ramp.)
 */
export declare const RELIEF_TEXELS = 18;
export declare function reactionDiffusion(opts?: ReactionDiffusionOptions): Field;
