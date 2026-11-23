import type { Rgba } from "./harness.ts";
export type FlashRule = {
    maxPerSecond: number;
    areaShare: number;
    window: {
        width: number;
        height: number;
    };
    lumaDelta: number;
    darkMax: number;
    redRatio: number;
    redChroma: number;
    /** Sampling box side in CSS px. */
    cell: number;
    /** Sampling step in CSS px (also the window stride and the area each sample covers). */
    stride: number;
};
/** The rule from thresholds.json (a bar may override entries through the check). */
export declare const FLASH_RULE: FlashRule;
/** One frame sampled: relative luminance, R/(R+G+B), and CIE 1976 u'v' per sample (all from linear sRGB means). */
export type Cells = {
    cols: number;
    rows: number;
    y: Float32Array;
    ratio: Float32Array;
    u: Float32Array;
    v: Float32Array;
};
/**
 * Samples a frame: the mean of each `rule.cell` CSS px box, every `rule.stride` CSS px. `scale` is frame pixels per
 * CSS px. Boxes that would run past the frame's edge are dropped.
 */
export declare function cellsOf(img: Rgba, rule?: Pick<FlashRule, "cell" | "stride">, scale?: number): Cells;
/** One transition: from frame `a` (a peak or valley) to frame `b` (the next one of the other kind). */
export type Transition = {
    a: number;
    b: number;
    from: number;
    to: number;
};
/**
 * Transitions in a series: the legs between adjacent peaks and valleys whose size reaches `size` (or exceeds it,
 * when `strict`). A reversal smaller than `size` does not end a leg. The last leg counts if it reaches `size`, even
 * with no reversal after it. (The same tracker the counter runs online.)
 */
export declare function transitions(s: Float32Array, size: number, strict?: boolean): Transition[];
/** The worst window: flashes per s (counted transitions / 2) reached over more than the area share, and where. */
export type FlashMeasure = {
    flashes: number;
    /**
     * The largest flashing area in any window, as a share of 341 x 256 CSS px, among samples that flash more than
     * `maxPerSecond` in one span (fails above `areaShare`).
     */
    share: number;
    /** The worst window's top-left in CSS px, and its span's first frame (-1 when nothing flashes). */
    x: number;
    y: number;
    frame: number;
};
export type FlashReport = {
    general: FlashMeasure;
    red: FlashMeasure;
    frames: number;
    cols: number;
    rows: number;
};
/** Counts flashes frame by frame. `push` each frame in order (all the same size), then `report`. */
export declare class FlashCounter {
    private F;
    private cols;
    private rows;
    private general;
    private red;
    private gEnds;
    private rEnds;
    private anchored;
    private u0;
    private v0;
    private box;
    private onGeneral;
    private onRed;
    private readonly fps;
    private readonly rule;
    constructor(fps: number, rule?: FlashRule);
    push(cells: Cells): void;
    report(): FlashReport;
    private measure;
}
/** Counts general and red flashes over `frames` (consecutive, `fps` per second, all the same size). */
export declare function countFlashes(frames: Iterable<Cells>, fps: number, rule?: FlashRule): FlashReport;
