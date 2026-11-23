// Task 20 step 2 to 4: the planted faults on kept bars, and the kept bars themselves.
// Phase 2 Task 25 adds the planted faults of the shadow, iridescence, film and burn laws on bars 07, 10, 11 and 12 (relight).
// (a) Each folder under test/faults/<check>-<bar>/ is a copy of a kept bar with one planted fault, and must fail its
//     named check at EVERY seed in its bar.json (not just in the combined verdict). At least two different bars per check.
//     A folder test/faults/<check>-dark-<bar>/ plants its fault under prefers-color-scheme: dark only, and its line
//     must name dark first (Phase 2 Task 2: relight and detail read both schemes). At least two different bars per check too.
// (b) Each kept bar passes all nine checks under the measured thresholds.
// (c) The control reports `control: quiet`.
// Engine-level faults set __PAINT_TEST_FAULT, which the hygiene check fails on every page that sets it; that is
// expected and is not asserted here. A threshold is never loosened to make a row pass.
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CHECKS, resolveTarget, runEntry, seedsOf } from "../../src/checks/gate.ts";
import { gate } from "../../src/checks/gate.ts";
import { closeBrowsers } from "../../src/checks/harness.ts";
import { serveRoot } from "../../src/checks/serve.ts";
import { threshold } from "../../src/checks/threshold.ts";
import { expectMudFault } from "./mud-fault.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");
let server: { url: string; close(): Promise<void> };

beforeAll(async () => {
  server = await serveRoot(ROOT);
});
afterAll(async () => {
  await server?.close();
  await closeBrowsers();
});

type Check = "render" | "palette" | "banding-grain" | "still" | "hygiene" | "relight" | "detail" | "text-contrast" | "flash";

// [folder, named check]. The folder name is <check>-<bar>.
const FAULTS: [string, Check][] = [
  ["render-04-paper-shred", "render"],
  ["render-06-glimmer", "render"],
  ["palette-03-halftone-resolve", "palette"],
  ["palette-06-glimmer", "palette"],
  ["banding-grain-04-paper-shred", "banding-grain"],
  ["banding-grain-01-lamp-on-paper", "banding-grain"],
  ["still-04-paper-shred", "still"],
  ["still-01-lamp-on-paper", "still"],
  ["hygiene-04-paper-shred", "hygiene"],
  ["hygiene-06-glimmer", "hygiene"],
  ["relight-01-lamp-on-paper", "relight"],
  ["relight-02-denim-zip", "relight"],
  // Phase 2 Task 2d: bar 01's lamp leaks a quarter of its light outside its cone; falloff's "adds nothing outside its
  // cone" half must fail (it read only the exponent faults before).
  ["relight-01-lamp-on-paper-cone-leak", "relight"],
  ["detail-03-halftone-resolve", "detail"],
  ["detail-04-paper-shred", "detail"],
  ["relight-dark-01-lamp-on-paper", "relight"],
  ["relight-dark-02-denim-zip", "relight"],
  // Phase 2 Task 4: a spread caustic beside a bright clipped layer (the dark card) must still fail the caustic law.
  ["relight-dark-05-pool-light", "relight"],
  ["detail-dark-01-lamp-on-paper", "detail"],
  ["detail-dark-04-paper-shred", "detail"],
  ["text-contrast-01-lamp-on-paper", "text-contrast"],
  ["text-contrast-04-paper-shred", "text-contrast"],
  ["flash-03-halftone-resolve", "flash"],
  ["flash-06-glimmer", "flash"],
  // Phase 2 Task 25: each planted fault of a new law (shadow, iridescence, film, burn) must also fail on a kept bar, not only
  // on its test page: a copy of bars 07, 10, 11 and 12 with the same fault applied (and, for burn faults, the same page edit).
  ["relight-07-light-stamp-shadow-baked", "relight"],
  ["relight-07-light-stamp-shadow-reads-ink", "relight"],
  ["relight-07-light-stamp-shadow-same-side", "relight"],
  ["relight-07-light-stamp-shadow-spec-only", "relight"],
  ["relight-10-foil-card-iridescence-clock", "relight"],
  ["relight-10-foil-card-iridescence-fixed-light", "relight"],
  ["relight-10-foil-card-iridescence-fixed-surface", "relight"],
  ["relight-10-foil-card-iridescence-no-groove", "relight"],
  ["relight-10-foil-card-iridescence-pointer-x", "relight"],
  ["relight-10-foil-card-iridescence-white", "relight"],
  ["relight-11-heat-tint-film-clock", "relight"],
  ["relight-11-heat-tint-film-fixed-light", "relight"],
  ["relight-11-heat-tint-film-no-angle", "relight"],
  ["relight-11-heat-tint-film-view-normal", "relight"],
  ["relight-12-burn-card-burn-clean-wipe", "relight"],
  ["relight-12-burn-card-burn-glow-dark", "relight"],
  ["relight-12-burn-card-burn-glow-flat", "relight"],
];

const BARS = ["01-lamp-on-paper", "02-denim-zip", "03-halftone-resolve", "04-paper-shred", "05-pool-light", "06-glimmer"];
// The bars a fault folder may copy: the six above plus Phase 2's bars 07, 10, 11 and 12 (their own checks are in
// bars/<bar>/gate.test.ts, so the "kept bars pass every check" block below stays on BARS).
const FAULT_BARS = [...BARS, "07-light-stamp", "10-foil-card", "11-heat-tint", "12-burn-card"];

describe("faults: planted faults on kept bars", () => {
  it("covers all nine checks with at least two different bars each, and relight and detail in dark with at least two more", () => {
    const by = new Map<string, Set<string>>();
    for (const [folder, check] of FAULTS) {
      expect(folder.startsWith(`${check}-`)).toBe(true);
      const rest = folder.slice(check.length + 1);
      const key = rest.startsWith("dark-") ? `${check} dark` : check;
      // A folder may add a suffix after the bar's name (relight-01-lamp-on-paper-cone-leak); it counts as that bar.
      const bar = FAULT_BARS.find((b) => rest.replace(/^dark-/, "").startsWith(b));
      expect(bar, folder).toBeDefined();
      by.set(key, (by.get(key) ?? new Set()).add(bar!));
    }
    expect([...by.keys()].filter((k) => !k.endsWith(" dark")).sort()).toEqual(CHECKS.map((c) => c.name).sort());
    expect([...by.keys()].filter((k) => k.endsWith(" dark")).sort()).toEqual(["detail dark", "relight dark"]);
    for (const bars of by.values()) expect(bars.size).toBeGreaterThanOrEqual(2);
  });

  // One test per fault folder and seed (Task 2e split): each runs alone in under 120 s. Each asserts at its own seed
  // what the old row asserted at every seed.
  const FAULT_SEEDS = FAULTS.flatMap(([folder, named]) => [1, 2, 3].map((seed) => [folder, named, seed] as [string, Check, number]));
  it.each(FAULT_SEEDS)("%s fails %s at seed %i", async (folder, named, seed) => {
    const dir = path.join(ROOT, "test/faults", folder);
    expect(seedsOf(resolveTarget(dir, {}, server.url))).toEqual([1, 2, 3]);
    const t = resolveTarget(dir, { seeds: [seed] }, server.url);
    const entry = CHECKS.find((c) => c.name === named)!;
    {
      const r = await entry.run(t, { seed });
      console.log(`${folder} seed ${seed}: ${r.status} | ${r.line.slice(0, 300)} | ${JSON.stringify(r.measured)}`);
      expect(r.status, `${folder} seed ${seed}: ${r.line}`).toBe("fail");
      if (folder.startsWith(`${named}-dark-`)) expect(r.line.startsWith(`${named}: dark: `), `${folder} seed ${seed}: ${r.line}`).toBe(true);
      // The cone leak must fail for its own reason in both schemes: the lamp still adds light at 1.5 x its cone
      // angle (falloff's outside half), as relight.test.ts pins the other falloff faults; a blank page cannot do that.
      if (folder === "relight-01-lamp-on-paper-cone-leak")
        for (const scheme of ["light", "dark"]) {
          const part = r.line.split(/; (?=dark: |light: )/).find((x) => x.replace(/^relight: /, "").startsWith(`${scheme}: `));
          expect(part, `${folder} seed ${seed}: ${r.line}`).toMatch(/falloff FAIL \(at 1\.5 x the cone angle \(ring azimuth \d+ degrees\) the lamp still adds /);
          expect(r.measured[`falloff.outsideDiff.${scheme}`], `${folder} seed ${seed} ${scheme}`).toBeGreaterThan(threshold("relight.ambientBand", null));
        }
    }
    // A mud fault must also meet the mud rule: its lower scheme reading is at most 0.75 of the floor.
    if (folder.startsWith("text-contrast-")) expectMudFault(await runEntry(entry, t, {}), [seed]);
  });
});

describe("faults: kept bars pass every check", () => {
  // One test per bar, seed and check group (Task 2e split): a whole seed gate of bars 03, 05 and 06 ran over 120 s with
  // the machine busy (flash alone 100 s on bars 03 and 05; relight and detail 60 s each on bar 06). The checks do not
  // read each other, so the four tests of a bar and seed together assert what the one gate asserted.
  const GROUPS: [string, (n: string) => boolean][] = [
    ["relight", (n) => n === "relight"],
    ["detail", (n) => n === "detail"],
    ["flash", (n) => n === "flash"],
    ["the other six checks", (n) => !["relight", "detail", "flash"].includes(n)],
  ];
  const BAR_ROWS = BARS.flatMap((bar) => [1, 2, 3].flatMap((seed) => GROUPS.map(([label, pick]) => [bar, label, seed, pick] as const)));
  it.each(BAR_ROWS)("%s passes %s at seed %i", async (bar, label, seed, pick) => {
    const checks = CHECKS.filter((c) => pick(c.name));
    const r = await gate(path.join(ROOT, "bars", bar), { baseUrl: server.url, seeds: [seed] }, checks);
    console.log(`${bar} seed ${seed} ${label}\n${r.lines.join("\n")}`);
    expect(r.results.map((c) => c.name)).toEqual(checks.map((c) => c.name));
    expect(r.results.filter((c) => c.status === "fail" || c.status === "partial").map((c) => c.line)).toEqual([]);
    expect(r.verdict).toBe("passed");
  });
});

describe("faults: the control", () => {
  it("controls/spectral-drape reports control: quiet", async () => {
    const r = await gate(path.join(ROOT, "controls/spectral-drape"), { baseUrl: server.url, control: true });
    console.log(r.lines.join("\n"));
    expect(r.lines).toContain("control: quiet");
    expect(r.verdict).toBe("passed");
  });
});
