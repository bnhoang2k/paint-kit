import type { OpenOpts, PageHandle } from "./harness.ts";
import type { CheckOpts, Target } from "./types.ts";
/** Software WebGL is slow, so checks look at a small viewport at device pixel ratio 1 unless they say otherwise. */
export declare const VIEW: {
    readonly dpr: 1;
    readonly width: 960;
    readonly height: 600;
};
/**
 * The frame a target opens at: the bar's declared `view` (bar.json, for a bar designed at another size, such as a
 * phone screen) at device ratio 1, else VIEW. Every check and the sheet start from this.
 */
export declare const viewOf: (target: Target) => {
    dpr: number;
    width: number;
    height: number;
};
/**
 * A smaller frame with the view's aspect and about `area` pixels, in whole pixels. Checks that open a page small to
 * save time (hygiene at device ratio 3, the sheet's cells) use it, so a portrait bar stays portrait: no stretch.
 */
export declare function scaledView(view: {
    width: number;
    height: number;
}, area: number): {
    width: number;
    height: number;
};
export declare const sleep: (ms: number) => Promise<void>;
/**
 * Open options for a target: the view (`viewOf`), the seed and the detail (a control gets neither). The seed is `opts.seed`
 * (the gate runs a bar at every seed in bar.json, check-fix (g)), else the bar's first, else 1.
 */
export declare function pageOpts(target: Target, opts: CheckOpts, extra?: OpenOpts): OpenOpts;
export declare const open: (target: Target, opts: CheckOpts, extra?: OpenOpts) => Promise<PageHandle>;
export declare const hasHook: (h: PageHandle) => Promise<boolean>;
/**
 * Hides everything except canvases, so a frame shows the painted surface alone (the heading would
 * otherwise dominate a standard-deviation reading). `body` itself is hidden too, so text sitting directly in it
 * (a bare text node, which `body *` does not match) is hidden as well. Idempotent.
 */
export declare function hideText(h: PageHandle): Promise<void>;
export declare const round: (n: number, d?: number) => string;
