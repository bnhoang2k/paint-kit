import { type FlashRule } from "./flash-count.ts";
import type { Check, Target } from "./types.ts";
/** The rule with the bar's own overrides (bar.json `thresholds`), else thresholds.json. */
export declare function ruleOf(target: Target): FlashRule;
export declare const check: Check;
