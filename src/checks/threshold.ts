import table from "./thresholds.json" with { type: "json" };
import type { BarConfig } from "../bar.ts";

const TABLE = table as Record<string, { value: number; why: string }>;

/** A threshold's value: the bar's own entry when it has one, else `thresholds.json`. Throws on an unknown name. */
export function threshold(name: string, bar: BarConfig | null): number {
  const own = bar?.thresholds?.[name] ?? TABLE[name];
  if (own === undefined) throw new Error(`unknown threshold "${name}"`);
  return own.value;
}
