// The rule every mud fault meets (checks fix round 1, 2026-11-15, review-checks-scope I3): a planted mud fault must
// fail text-contrast's range floor at every seed it is read at, and at every seed its lower scheme reading,
// min(light, dark), must be at most MUD_FAULT_SHARE of `text.rangeFloor`.
// Why: the floor (0.07) was set between a fault at 0.052 (paper-mud) and a real page at 0.087 (paper.html dark). A
// fault that reads 0.069 tests the floor's rounding, not the floor: one histogram bin (1/1024) of engine drift flips
// it. 0.75 is the derivation fault's own ratio to the floor (0.052 / 0.07 = 0.743, rounded up).
import { expect } from "vitest";
import { threshold } from "../../src/checks/threshold.ts";

export const MUD_FAULT_SHARE = 0.75;

/**
 * Asserts the mud-fault rule on a text-contrast result. `seeds` lists the bar's seeds (keys `light.range@<seed>`);
 * null for a page read once (keys `light.range`). A one-seed run (Task 2e's per-seed fault rows) also has plain keys:
 * `combineSeeds` returns a single run as it is, with no `@<seed>` copies.
 */
export function expectMudFault(r: { status: string; line: string; measured: Record<string, number> }, seeds: number[] | null) {
  const most = MUD_FAULT_SHARE * threshold("text.rangeFloor", null);
  expect(r.status).toBe("fail");
  expect(r.line).toMatch(/is under the floor/);
  if (seeds && seeds.length > 1) expect(r.line).toMatch(new RegExp(`fails at seeds ${seeds.join(", ")} of ${seeds.join(", ")}`));
  for (const k of seeds ?? [null]) {
    const at = k === null || seeds!.length === 1 ? "" : `@${k}`;
    const low = Math.min(r.measured[`light.range${at}`]!, r.measured[`dark.range${at}`]!);
    expect(low, `mud fault at seed ${k ?? 1}: min(light, dark) range ${low} must be at most ${most}`).toBeLessThanOrEqual(most);
  }
}
