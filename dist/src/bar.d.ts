import type { PointerStop } from "./engine/pointer.ts";
import type { Law } from "./engine/types.ts";
export type BarConfig = {
    id: string;
    reference: {
        shelfKey: string;
        title: string;
    };
    palette: {
        ground: string;
        ink: string;
        accents: string[];
    };
    detail: number;
    seeds: number[];
    /** At least one. */
    laws: Law[];
    /** Either two times a living page differs between, or the reason it holds still untouched. */
    alive: {
        t0: number;
        t1: number;
    } | {
        rests: string;
    };
    text?: {
        always: string[];
        lit: string[];
    };
    beats: string[];
    thresholds?: Record<string, {
        value: number;
        why: string;
    }>;
    motion?: {
        from: string;
        cited: string;
    };
    /** The CSS-pixel frame the bar is designed for; checks and the sheet open it at this size. Unset: the checks' VIEW. */
    view?: BarView;
    /**
     * The bar's settle time in seconds: where its picture holds, so reduced motion rests on the frame `setTime` gives
     * there. A whole number of the engine's 1/60 s ticks. Unset: the page has none (it rests on its first frame). The
     * still check holds the engine to it, so a page whose engine settle time drifts fails.
     */
    settle?: number;
    /**
     * What the flash check drives besides time. `pointer`: a path the engine's pointer follows while the check steps
     * the page frozen ({ t, x, y }: t in seconds of page time, ascending; x, y in viewport fractions 0..1, at least two
     * stops), so a pointer-driven light is measured at the engine's 60 ticks per s.
     */
    flash?: {
        pointer?: PointerStop[];
    };
    /**
     * URL parameters the gate, the sheet and the bar's page tests open the page with, as `a=1&b=2` (no leading `?`).
     * For a page that waits for the user, such as a burn that starts on a click: the checks have no user, so the page
     * reads a parameter (`?burnAt=0`) that starts it. `seed`, `t` and `detail` are the harness's own and are refused. Unset: none.
     */
    query?: string;
};
export type BarView = {
    width: number;
    height: number;
};
/**
 * Bounds on each side of `view`, in CSS pixels. 320 is the narrowest phone width in common use (the small iPhone
 * SE and Android phones), so no real bar frame is narrower or shorter. 2560 (a large desktop width) caps the cost of
 * software WebGL in the checks: a 2560 x 2560 frame already holds about 11 times the pixels of the default 960 x 600
 * one, and a larger frame would slow every gate run without measuring anything a smaller one misses. Integers only,
 * because a viewport is set in whole CSS pixels.
 */
export declare const VIEW_SIDE: {
    readonly min: 320;
    readonly max: 2560;
};
/** The engine's fixed tick (src/engine/loop.ts STEP): settle times are whole numbers of it. */
export declare const TICKS_PER_SECOND = 60;
export declare const LAWS: readonly Law[];
/** Reads `<dir>/bar.json`. Throws an Error naming the first field that is wrong. */
export declare function loadBar(dir: string): BarConfig;
