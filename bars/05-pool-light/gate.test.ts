// Bar 05 (pool light): the gate passes on this bar, at every seed in bar.json.
import path from "node:path";
import { afterAll, expect, it } from "vitest";
import { CHECKS, gate } from "../../src/checks/gate.ts";
import { closeBrowsers } from "../../src/checks/harness.ts";

const BAR = path.resolve(import.meta.dirname);
// The gate runs every check at each of the bar's three seeds; a three-seed bar gate measured about 130 s
// (progress.md, check-fix (g)). Ten times the vitest page default, for two other browsers running at the same time.

afterAll(async () => {
  await closeBrowsers();
});

// One test per seed and check group (Task 2e split): a whole seed gate on this bar ran over 140 s with the machine busy,
// over the 120 s each test must keep. The checks do not read each other, so the three tests of a seed together
// assert what the one gate asserted: every check that applies passes at that seed.
const GROUPS: [string, (n: string) => boolean][] = [
  ["relight and detail", (n) => n === "relight" || n === "detail"],
  ["flash", (n) => n === "flash"],
  ["the other six checks", (n) => !["relight", "detail", "flash"].includes(n)],
];
for (const seed of [1, 2, 3])
  for (const [label, pick] of GROUPS)
    it(`05-pool-light gate: ${label} pass at seed ${seed}`, async () => {
      const r = await gate(BAR, { seeds: [seed] }, CHECKS.filter((c) => pick(c.name)));
      console.log(r.lines.join("\n"));
      expect(r.verdict, r.lines.join("\n")).toBe("passed");
    });
