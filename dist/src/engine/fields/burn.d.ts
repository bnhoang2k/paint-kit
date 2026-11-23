import type { Field } from "../types.ts";
export type BurnOptions = {
    /** Where the burn starts: the bottom edge, or a point in page fractions (x 0 left to 1 right, y 0 top to 1 bottom). */
    from: "bottom" | [number, number];
    /** How fast the front moves, short-side units per second. */
    speed: number;
    /** 0..1: how ragged the front is (0 a straight or round front). */
    rag: number;
    /** Seconds from the front passing to the paper being gone: param runs 0 to 1 over it. Above 0. */
    scorch: number;
    /** The paint time in seconds the burn starts at, or `null` to wait for `start()`. */
    startAt: number | null;
    /** 0..1: how torn the front is: spot starts, holes, islands and a jagged edge. Default 0 (the rag alone). */
    tear?: number;
    /** Short-side units the front travels after the paper is gone while its embers still glow. Default 0. */
    linger?: number;
};
/** What a page holds: the field, plus its start call and the front's place for `lights.ember`. */
export type BurnField = Field & {
    /**
     * Starts a waiting burn at the paint time of the latest frame. Ignored once started. `lead` (short-side units, default
     * 0) places the front that far from its start at once, so a card that sits away from the page's edge burns on the click.
     * A negative lead places it behind the start, for a torn front whose first arrival lies before the sheet's edge.
     */
    start(lead?: number): void;
    /** The start time in seconds, or null while waiting. */
    readonly startAt: number | null;
    /** The front's distance from the start in short-side units at paint time `t` (negative before the start). */
    front(t: number): number;
    /** The front's distance at the latest frame drawn: the paint clock, which slows on a slow page and stops on a hidden one. */
    frontNow(): number;
    /** The scorch band's width, short-side units (`speed x scorch`). */
    readonly band: number;
    /** The largest shift of the front from the rag and the tear, short-side units. */
    readonly maxShift: number;
    /** How far the front travels while the embers behind the hole still glow, short-side units. */
    readonly linger: number;
    /** The options as declared, with `from` and the latest sheet size, for `lights.ember`'s region. */
    readonly opts: Readonly<BurnOptions>;
    /** The sheet size of the latest draw, or null before one. */
    size(): {
        w: number;
        h: number;
    } | null;
};
/**
 * The rag's largest shift of the front, short-side units, at rag 1. Builder: picked by eye before any check ran. A
 * tenth of the short side reads as a torn, wandering edge on a card; much more lets the noise pull islands ahead of
 * the front (A(q)'s slope across the front stays near 1 at this size and these two wavelengths).
 */
export declare const RAG_AMP = 0.08;
/**
 * The tear's wide layers' largest shift at tear 1, short-side units. Set by measurement against the reference
 * (bars/12-burn-card/study.md's clip), whose front spreads 39-57% of the card's width from high to low. On a 0.53 wide card,
 * over seeds 1 to 3 and three times mid-burn, 0.13 spread a mean of 23% and at most 38%, 0.20 a mean of 28%, 0.26 a mean of
 * 37% and at most 59%, and 0.32 no wider (36%, 59%). So 0.26, the smallest that reaches the reference's range.
 */
export declare const TEAR_WIDE = 0.26;
/** The fine layers' largest shift together, short-side units. */
export declare const TEAR_FINE_AMP: number;
/**
 * The arrival formula, shared by the field's draw and the shade pass (lights.ember). `q`: short-side units, centred,
 * y up (a shape's `q`, the shade's `s.q`); `res`: the sheet's size.
 */
export declare const GLSL_BURN: string;
export declare function burn(opts: BurnOptions): BurnField;
