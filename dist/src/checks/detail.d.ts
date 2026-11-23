import type { Rgba } from "./harness.ts";
import { type Check, type CheckOpts, type Target } from "./types.ts";
/** Energy of (luminance minus its 4 px blur) over the energy of luminance about its mean; 0 for a flat frame. */
export declare function highFrequencyShare(f: Rgba): number;
/**
 * The high-frequency share at one dial level, read as this check reads it: frozen at t 2, text hidden, all ink off,
 * the whole finish off (grain 0, halftone screen hidden). `null` when the page has no hook. scripts/measure.mjs reads its detail cells through this too.
 */
export declare function shareAt(target: Target, opts: CheckOpts, detail: number, dark: boolean): Promise<number | null>;
export declare const check: Check;
