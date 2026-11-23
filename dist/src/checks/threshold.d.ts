import type { BarConfig } from "../bar.ts";
/** A threshold's value: the bar's own entry when it has one, else `thresholds.json`. Throws on an unknown name. */
export declare function threshold(name: string, bar: BarConfig | null): number;
