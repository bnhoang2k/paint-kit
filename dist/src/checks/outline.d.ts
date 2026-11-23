import type { Rgba } from "./harness.ts";
/** The shape's rest box, px, `x1` and `y1` exclusive. */
export type Box = {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
};
export type RippleOpts = {
    /** Luma 0..1 under which a pixel is the shape (the review's measure: 60 / 255). */
    cut: number;
    /** Px left out at each end of every edge (the rounded corners). */
    corner: number;
    /** Px searched on each side of the rest edge: the scan starts `reach` outside and stops `reach` inside. */
    reach: number;
};
export type Ripple = {
    top: number;
    left: number;
    right: number;
    bottom: number;
};
/**
 * Peak to peak of each edge's position, px. An edge read in fewer than half its scan lines is NaN (no shape there),
 * never 0, so a missing shape cannot pass as a straight one.
 */
export declare function outlineRipple(f: Rgba, box: Box, o: RippleOpts): Ripple;
