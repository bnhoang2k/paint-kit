// Bar 04 (paper shred): the gate passes on this bar, at every seed in bar.json.
import path from "node:path";
import { afterAll, expect, it } from "vitest";
import { gate } from "../../src/checks/gate.ts";
import { closeBrowsers } from "../../src/checks/harness.ts";

const BAR = path.resolve(import.meta.dirname);
// The gate runs every check at each of the bar's three seeds; a three-seed bar gate measured about 130 s
// (progress.md, check-fix (g)). Ten times the vitest page default, for two other browsers running at the same time.

afterAll(async () => {
  await closeBrowsers();
});

// One test per seed (Task 2e split), so each runs alone in under 120 s.
for (const seed of [1, 2, 3])
  it(`04-paper-shred passes the gate at seed ${seed}`, async () => {
    const r = await gate(BAR, { seeds: [seed] });
    console.log(r.lines.join("\n"));
    expect(r.verdict, r.lines.join("\n")).toBe("passed");
  });
