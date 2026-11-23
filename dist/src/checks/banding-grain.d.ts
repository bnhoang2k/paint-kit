import type { Rgba } from "./harness.ts";
import type { Check } from "./types.ts";
/** The staircase run of a frame inside its smooth-slope mask, and the share of pixels in that mask. */
export declare function bandingOf(frame: Rgba, smoothMax: number): {
    run: number;
    share: number;
};
/** The finish's grain: high-pass std of the luminance of `frame` (declared grain) minus `bare` (grain 0, else the same). */
export declare function finishGrain(frame: Rgba, bare: Rgba): number;
export declare const check: Check;
/** A control has no grain to judge: the banding half only, read live. */
export declare const controlCheck: Check;
