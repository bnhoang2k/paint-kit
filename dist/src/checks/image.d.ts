import type { Rgba } from "./harness.ts";
type Nums = ArrayLike<number>;
/** Rec. 709 luma of the encoded 8-bit values, 0..1 (the weights the engine's own percentiles use). */
export declare function luminance(f: Rgba): Float32Array;
/** Population standard deviation. */
export declare function std(v: Nums): number;
/** Mean absolute difference over RGB of two same-size frames, 0..1. */
export declare function meanAbsDiff(a: Rgba, b: Rgba): number;
/** An 8-bit sRGB colour in OKLab, [L, a, b]. */
export declare function srgbToOklab(r: number, g: number, b: number): [number, number, number];
/** Mean OKLab of a frame, over every pixel or only those `keep` selects (pixel index). */
export declare function meanOklab(f: Rgba, keep?: (i: number) => boolean): [number, number, number];
export declare const oklabDistance: (p: Nums, q: Nums) => number;
/** Mean OKLab distance of every pixel to one OKLab colour. */
export declare function meanDistanceTo(f: Rgba, target: Nums): number;
/**
 * The palette check's smoke measure (S3): the share of pixels whose OKLab distance from `before` to `after` is at
 * least `visible`.
 */
export declare function movedShare(before: Rgba, after: Rgba, visible: number): number;
/** One number per pixel, packing 8-bit RGB: two pixels share a level only when all three channels match. */
export declare function levels(f: Rgba): Uint32Array;
/**
 * The longest run of one level along a row, in px. Runs never cross a row. With `mask`, only pixels where
 * the mask is non-zero count, and a masked-out pixel ends the run.
 */
export declare function longestRun(v: Nums, w: number, h: number, mask?: ArrayLike<number>): number;
/**
 * The longest run of one level along a row that has the shape of a quantised ramp: the pixel just outside each
 * end differs from the run by exactly one 8-bit step (largest channel gap 1), one end darker and the other lighter.
 * A flat fill, an edge (a bigger step) or a ridge (both ends on one side) is not banding and counts 0. Only
 * pixels where `mask` is non-zero take part in a run.
 */
export declare function longestStaircaseRun(f: Rgba, mask?: ArrayLike<number>): number;
/** Box blur with a window of 2r+1 px (edge pixels repeat), separable, through prefix sums. */
export declare function boxBlur(src: Nums, w: number, h: number, r: number): Float64Array;
/** Central-difference gradient magnitude, per px (edge pixels use the one-sided difference). */
export declare function gradientMagnitude(v: Nums, w: number, h: number): Float64Array;
/**
 * Pixels on a smooth, slow slope: the gradient of a (2r+1) px box blur is non-zero but below `smoothMax`.
 * A large `blurRadius` keeps the inside of a wide band in the mask.
 */
export declare function smoothMask(lum: Nums, w: number, h: number, blurRadius: number, smoothMax: number): Uint8Array;
/** The frame minus its 3 x 3 box blur: what is left once the slow shape is gone (grain, fibre, noise). */
export declare function highPass(lum: Nums, w: number, h: number): Float64Array;
export declare const highPassStd: (lum: Nums, w: number, h: number) => number;
/** A rectangle in px of a frame: left, top, width, height. */
export type Box = {
    x: number;
    y: number;
    w: number;
    h: number;
};
/**
 * How far the fine texture of `b` sits from that of `a`: the lag (dx right, dy down, in px) with the highest
 * normalised cross-correlation of their fine detail (each frame minus its box blur of radius `radius`, default 4,
 * a 9 x 9 box, so lighting and macro shape do not count) over `box` of `a`, among the lags `candidates` lists. A
 * texture whose features are wider than the box (matte's tone noise) needs a larger `radius`: the box must be wider
 * than the features it keeps. `box` must stay inside both frames at every candidate lag. `score` is the peak's
 * correlation (-1..1); `at` gives the correlation at any listed lag.
 * The shared measure for "the texture moved with the surface" (test/pages/carry.test.ts).
 */
export declare function textureShift(a: Rgba, b: Rgba, box: Box, candidates: [number, number][], radius?: number): {
    dx: number;
    dy: number;
    score: number;
    at: Map<string, number>;
};
/** Every integer lag within `r` px (Chebyshev) of each centre, once: the candidate list for `textureShift`. */
export declare function lagsAround(centres: [number, number][], r: number): [number, number][];
export {};
