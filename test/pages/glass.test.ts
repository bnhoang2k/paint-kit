// Backlit frosted glass (materials.glass, a glow with `behind: true`) and the relight transmit law, through the
// gate. The honest page passes every check, its brightest tile reaches near-white through the finish's shoulder,
// and its slow swell passes the flash check. Each planted fault fails relight's transmit law for its own reason;
// a fault built in page code may also fail palette's "page code makes its own Light" rule, and nothing else.
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CHECKS, resolveTarget, runEntry } from "../../src/checks/gate.ts";
import { closeBrowsers } from "../../src/checks/harness.ts";
import { serveRoot } from "../../src/checks/serve.ts";
import { TILE_WHITE } from "../../src/checks/relight.ts";
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

// Task 2e: each test below reads one seed (`resolveTarget(..., { seeds: [n] })`) or one group of checks, so it runs
// alone in under 120 s. With one seed the measured keys carry no `@<seed>` suffix.
const SEEDS = [1, 2, 3];
const th = (n: string) => threshold(n, null);

// Task 2e: one gate on glass.html or a glass fault runs every check (detail alone about 80 s under load), over the page
// suite's 120 s, so each page is read in three groups of checks, each its own test: relight, detail, and the rest.
// `groupAt` runs a group's checks as the gate does (`runEntry`) and logs them.
type Group = "relight" | "detail" | "rest";
const inGroup = (g: Group) => (name: string) => (g === "rest" ? name !== "relight" && name !== "detail" : name === g);
async function groupAt(rel: string, g: Group) {
  const t = resolveTarget(path.join(ROOT, rel), {}, server.url);
  const results = [];
  for (const c of CHECKS) if (inGroup(g)(c.name)) results.push(await runEntry(c, t, {}));
  for (const r of results) console.log(`${rel}\n${r.line}\n${JSON.stringify(r.measured)}`);
  return results;
}
const pickOf = (rs: Awaited<ReturnType<typeof groupAt>>, name: string) => rs.find((c) => c.name === name)!;

/**
 * Three tests for a glass fault: relight fails by its transmit law (`relight` adds the row's own assertions); detail
 * does not fail or go partial; palette may fail only for a Light or material made in page code, every other check
 * passes, and nothing is partial. Together they are the old "only transmit fails" row.
 */
function onlyTransmitFails(title: string, rel: string, relight: (r: Awaited<ReturnType<typeof groupAt>>[number]) => void) {
  it(`${title} (relight)`, async () => {
    const r = pickOf(await groupAt(rel, "relight"), "relight");
    expect(r.status).toBe("fail");
    expect(r.line).toMatch(/transmit FAIL/);
    relight(r);
  });
  it(`${title} (detail)`, async () => {
    const d = pickOf(await groupAt(rel, "detail"), "detail");
    expect(d.status).toBe("pass");
  });
  it(`${title} (other checks)`, async () => {
    const rs = await groupAt(rel, "rest");
    const failing = rs.filter((c) => c.status === "fail").map((c) => c.name);
    expect(failing.filter((n) => n !== "palette")).toEqual([]);
    if (failing.includes("palette")) expect(pickOf(rs, "palette").line).not.toMatch(/reads the palette itself|ignores the page's tokens|colour literal\(s\) outside/);
    expect(rs.some((c) => c.status === "partial")).toBe(false);
  });
}

describe("backlit glass", () => {
  // verdict "passed" is no check failing and none partial: each group asserts it for its own checks.
  it("glass page passes every check: lit mainly from behind, the glow moves with the light, the ground stays unlit (relight)", async () => {
    const [r] = await groupAt("test/pages/glass.html", "relight");
    expect(r!.status).toBe("pass");
    expect(r!.line).toMatch(/transmit pass/);
    const m = r!.measured;
    expect(m["transmit.share.light"]).toBeGreaterThanOrEqual(th("relight.transmitShare"));
    expect(m["transmit.overlap.light"]).toBeLessThan(th("relight.transmitOverlap"));
    expect(m["transmit.outside.light"]).toBeLessThanOrEqual(th("relight.ambientBand"));
    // Near-white from light, not paint: the brightest glass pixel at the declared levels, through the finish.
    expect(m["transmit.peak.light"]).toBeGreaterThanOrEqual(0.97);
    // (d) the tiles vary: the tile under the glow is blown to white in every channel, the rest sit dimmer.
    expect(m["transmit.tiles.light"]).toBe(15);
    expect(m["transmit.tileWhite.light"]).toBeGreaterThanOrEqual(TILE_WHITE);
    expect(m["transmit.tileSpread.light"]).toBeGreaterThanOrEqual(th("relight.tileSpread"));
  });

  it("glass page passes every check: lit mainly from behind, the glow moves with the light, the ground stays unlit (detail)", async () => {
    expect((await groupAt("test/pages/glass.html", "detail"))[0]!.status).toBe("pass");
  });

  it("glass page passes every check: lit mainly from behind, the glow moves with the light, the ground stays unlit (other checks)", async () => {
    const rs = await groupAt("test/pages/glass.html", "rest");
    expect(rs.filter((c) => c.status === "fail" || c.status === "partial").map((c) => c.name)).toEqual([]);
    // A tile swelling to white over about a second is not a flash (WCAG 2.3.1, check 9).
    expect(pickOf(rs, "flash").status).toBe("pass");
  });

  onlyTransmitFails("glass lit from the front only fails transmit: the light behind gives none of its light", "test/faults/glass-front-lit/index.html", (r) => {
    expect(r.line).toMatch(/transmit FAIL \([^)]*the light behind gives/);
    expect(r.measured["transmit.share.light"]).toBeLessThan(th("relight.transmitShare"));
  });

  onlyTransmitFails("a backlight that ignores where it is put fails transmit: the glowing pixels stay put", "test/faults/glass-glow-static/index.html", (r) => {
    expect(r.line).toMatch(/transmit FAIL \([^)]*the same glass pixels glow/);
    expect(r.measured["transmit.overlap.light"]).toBeGreaterThanOrEqual(th("relight.transmitOverlap"));
  });

  onlyTransmitFails("a backlight that spills past the glass fails transmit: the ground between the tiles lights up", "test/faults/glass-spill/index.html", (r) => {
    expect(r.line).toMatch(/transmit FAIL \([^)]*outside the glass/);
    expect(r.measured["transmit.outside.light"]).toBeGreaterThan(th("relight.ambientBand"));
  });

  // Checks-scope round (2026-11-15): the law reads every light behind. The two "-second" faults put an honest light
  // behind first and the faulty one second; the law as it read only the first light passed both (measured on
  // 9f8cf99). glass-spill-small (checks fix round 1) is the reverse: the faulty light is first and small, the honest
  // one second and frame-wide; 2fac119's union of the circles passed it (outside 0.00475).
  onlyTransmitFails("a second light behind that stays put fails transmit, named", "test/faults/glass-glow-static-second/index.html", (r) => {
    expect(r.line).toMatch(/transmit FAIL \([^)]*the same glass pixels glow with the light behind 1 at both test positions/);
    expect(r.measured["transmit.overlap.1.light"]).toBeGreaterThanOrEqual(th("relight.transmitOverlap"));
    expect(r.measured["transmit.overlap.0.light"]).toBeLessThan(th("relight.transmitOverlap"));
  });

  onlyTransmitFails("a second light behind that spills past the glass fails transmit", "test/faults/glass-spill-second/index.html", (r) => {
    expect(r.line).toMatch(/transmit FAIL \([^)]*the lights behind change pixels outside the glass/);
    expect(r.measured["transmit.outside.light"]).toBeGreaterThan(th("relight.ambientBand"));
  });

  onlyTransmitFails("a small first light behind that spills under a frame-wide honest one fails transmit, on its own radius", "test/faults/glass-spill-small/index.html", (r) => {
    expect(r.line).toMatch(/transmit FAIL \([^)]*the lights behind change pixels outside the glass by [0-9.]+ within light 0's radius/);
    expect(r.measured["transmit.outside.0.light"]).toBeGreaterThan(th("relight.ambientBand"));
    expect(r.measured["transmit.outside.1.light"]).toBeLessThanOrEqual(th("relight.ambientBand"));
  });
});

// Every light behind counts toward "lit mainly from behind": bar 06's wash is behind the sheet too, so the tiles may
// brighten toward the reference by the wash. test/pages/glimmer-bright is bars/06-glimmer with the wash at 0.7 (the
// bar-06 rebuild's failed try: share 0.351 on the first light alone). Read at the bar's seeds, as the gate does.
describe("backlit glass, every light behind", () => {
  const entry = (name: string) => CHECKS.find((c) => c.name === name)!;
  const target = (rel: string, seed: number) => resolveTarget(path.join(ROOT, rel), { seeds: [seed] }, server.url);

  // Checks fix round 3, driver ruling (option 1, 2026-11-15): glimmer-bright predates the owner's tile ruling ("lit glass
  // tiles must vary in brightness, some blown to white and others dimmer") and was built for condition (a) only. Its
  // swell tile reads luma 0.977 to 0.980 and its dimmest channel 0.927 to 0.950: near white, not white, so it is not
  // a (d) page and fails (d1). This test reads (a) to (c) only; (d) is read on test/pages/glimmer-final.
  for (const seed of SEEDS) it(`bar 06 with the wash at 0.7 passes transmit (a) to (c) at seed ${seed}: the lights behind give most of the tiles' light`, async () => {
    const r = await runEntry(entry("relight"), target("test/pages/glimmer-bright", seed), {});
    console.log(`glimmer-bright @${seed}\n${r.line}\n${JSON.stringify(r.measured)}`);
    expect(r.line).not.toMatch(/lit mainly from the front|the same glass pixels glow|changes nothing on the glass|outside the glass by [0-9.]+ within|PARTIAL/);
    expect(r.measured["transmit.share.light"]).toBeGreaterThanOrEqual(th("relight.transmitShare"));
    expect(r.measured["transmit.behind.light"]).toBe(2);
  });

  // The range floor reads the paint alone: the tiles (coverage above 0, less the anti-alias edge), not the bare page
  // around them. The fault meets the mud-fault rule (./mud-fault.ts) at every seed, not only seed 1.
  for (const seed of SEEDS) it(`bar 06 with its tiles flattened and dimmed (no light behind, the ambient at a tenth) fails the range floor at seed ${seed}`, async () => {
    const r = await runEntry(entry("text-contrast"), target("test/faults/glimmer-flat", seed), {});
    console.log(`glimmer-flat @${seed}\n${r.line}\n${JSON.stringify(r.measured)}`);
    expect(r.status).toBe("fail");
    expect(r.line).toMatch(/the paint's luminance range \(p95 - p5\) over the paint \([^)]*\) [0-9.]+ is under the floor/);
    // The words still read: only the floor fails.
    expect(r.line).not.toMatch(/reaches/);
    expectMudFault(r, null);
    // The whole frame lands on the bare ground on bar 06 too; the floor no longer reads it.
    expect(r.measured["light.paint"]).toBeLessThan(0.05);
  });

  // Review-checks-fix1 Minor 2: the flatten alone, at the bar's own ambient, kept as its own fault. Exempt from the
  // mud-fault rule's 0.75 share (test/pages/mud-fault.ts): the share keeps a fault off the floor's rounding, and
  // glimmer-flat (dimmed) carries it for glass; this one guards the realistic flatten, which only dimming would push
  // under 0.0525 (and dimmed, it is glimmer-flat). Measured 0.0557 / 0.0557 / 0.0586 (min of light, dark).
  for (const seed of SEEDS) it(`bar 06 with its tiles flattened at the bar's ambient (no light behind) fails the range floor at seed ${seed}`, async () => {
    const r = await runEntry(entry("text-contrast"), target("test/faults/glimmer-flat-ambient", seed), {});
    console.log(`glimmer-flat-ambient @${seed}\n${r.line}\n${JSON.stringify(r.measured)}`);
    expect(r.status).toBe("fail");
    expect(r.line).toMatch(/is under the floor/);
    expect(r.line).not.toMatch(/reaches/);
    for (const scheme of ["light", "dark"]) expect(r.measured[`${scheme}.range`]).toBeLessThan(th("text.rangeFloor"));
  });
});

// Checks fix round 2 (2026-11-15), the owner's ruling "Add a tile-variation rule now": lit glass tiles must vary in
// brightness, some blown to white and others dimmer. The transmit law's (d) (src/checks/relight.ts): over the tiles'
// 9 x 9 centre faces, (d1) some tile's dimmest channel reaches TILE_WHITE (252 / 255: white in every channel, since
// checks fix round 3) and (d2) the brightest luma face minus the lower quartile is at least relight.tileSpread, both
// at one of the moments t = 1, 2, 3. Read at each bar seed, as the gate does.
describe("backlit glass, the tiles vary", () => {
  const entry = (name: string) => CHECKS.find((c) => c.name === name)!;
  const target = (rel: string, seed: number) => resolveTarget(path.join(ROOT, rel), { seeds: [seed] }, server.url);
  const relight = async (rel: string, seed: number) => {
    const r = await runEntry(entry("relight"), target(rel, seed), {});
    console.log(`${rel} @${seed}\n${r.line}\n${JSON.stringify(r.measured)}`);
    return r;
  };
  const FLAT = /the glass tiles are flat at t [0-9, ]+: the brightest tile face [0-9.]+ is within [0-9.]+ of the lower quartile/;
  const DIM = /no glass tile is blown to white at t [0-9, ]+/;

  // test/pages/glimmer-final is bars/06-glimmer at 91de979 (its final round: wash 1.0 at radius 0.6, swell at 6).
  // Margin (checks fix round 3): its worst white face is 0.9919 (seed 2, t 2) against 0.9882, about 1 level of 255.
  for (const seed of SEEDS) it(`bar 06's final settings pass (d) at seed ${seed}: one tile blown to white, a quarter of them clearly dimmer`, async () => {
    const r = await relight("test/pages/glimmer-final", seed);
    expect(r.status).toBe("pass");
    expect(r.measured["transmit.tiles.light"]).toBe(11);
    expect(r.measured["transmit.tileWhite.light"]).toBeGreaterThanOrEqual(TILE_WHITE);
    expect(r.measured["transmit.tileSpread.light"]).toBeGreaterThanOrEqual(th("relight.tileSpread"));
  });

  // The gap review-checks-fix1 measured: a bright flatten with a slow drift passed every check on 8b6c77c (gate
  // verdict "passed"; checks-fix2-before-drift.txt). It must now fail relight by (d), and only relight: render passes
  // it (the frames differ), so nothing but the new condition catches it.
  // Task 2e: the whole gate of a drift fault at one seed is over the page suite's 120 s (detail alone reads 84 s), so
  // each seed is three tests that together run every check once: the plumbing checks, relight, and detail. The
  // original row asserted that exactly relight and detail are non-pass; here the plumbing test asserts every other
  // check passes, and the relight and detail tests assert those two fail, with the same reasons.
  const OTHERS = (n: string) => n !== "relight" && n !== "detail";
  const checksAt = async (rel: string, seed: number, pick: (name: string) => boolean) => {
    const t = target(rel, seed);
    const results = [];
    for (const c of CHECKS) if (pick(c.name)) results.push(await runEntry(c, t, {}));
    for (const r of results) console.log(`${rel} @${seed}\n${r.line}\n${JSON.stringify(r.measured)}`);
    return results;
  };
  /** detail fails as well on both drift copies, in dark only: pinned as measured, not an exemption (see each row). */
  const detailFailsInDark = (d: { status: string; line: string }) => {
    expect(d.status).toBe("fail");
    expect(d.line).toMatch(/dark: the high-frequency share does not rise enough/);
    expect(d.line).not.toMatch(/light: the high-frequency share does not rise/);
  };

  // detail fails as well, in dark only, pinned as measured (Phase 2 sweep after Task 2c, the gate's detail entry from
  // dist at 22a0868): with the finish grain off the dark rise is 0.01788 / 0.01643 / 0.01611 at seeds 1 / 2 / 3 (dark
  // shares 0.0602 / 0.0605 / 0.0613 at seed 1), under detail.minRise 0.020; light rises 1.552 / 1.522 / 1.622 and
  // passes. The copy is frozen at bar 06's old etch (0.15), so it keeps the dark failure bar 06 had there (bar 06 at
  // etch 0.45 reads 0.0622 dark). Not an exemption: the row asserts that detail fails, and where.
  for (const seed of SEEDS) {
    const rel = "test/faults/glimmer-flat-bright-drift";
    it(`a flat bright wash that drifts fails relight and detail at seed ${seed}: every other check passes`, async () => {
      const rs = await checksAt(rel, seed, OTHERS);
      expect(rs.filter((c) => c.status !== "pass").map((c) => c.name)).toEqual([]);
    });
    it(`a flat bright wash that drifts fails relight at seed ${seed}, by the tiles' variation`, async () => {
      const [r] = await checksAt(rel, seed, (n) => n === "relight");
      expect(r!.status).toBe("fail");
      expect(r!.line).toMatch(FLAT);
      // (a) to (c) still pass: the rest of transmit cannot see a flatten.
      expect(r!.line).not.toMatch(/lit mainly from the front|the same glass pixels glow|outside the glass by [0-9.]+ within/);
      expect(r!.measured["transmit.tileSpread.light"]).toBeLessThan(th("relight.tileSpread"));
    });
    it(`a flat bright wash that drifts fails detail in dark only at seed ${seed}`, async () => {
      const [d] = await checksAt(rel, seed, (n) => n === "detail");
      detailFailsInDark(d!);
    });
  }

  for (const seed of SEEDS) it(`the same flatten held still fails relight by (d) and render as dead at seed ${seed}`, async () => {
    const r = await relight("test/faults/glimmer-flat-bright", seed);
    expect(r.status).toBe("fail");
    expect(r.line).toMatch(FLAT);
    const d = await runEntry(entry("render"), target("test/faults/glimmer-flat-bright", seed), {});
    console.log(`glimmer-flat-bright render\n${d.line}`);
    expect(d.status).toBe("fail");
    expect(d.line).toMatch(/the page is dead/);
  });

  // Since checks fix round 3, (d1) asks for white in every channel, which bar 06's wash alone does not reach: this
  // flatten fails both halves. glimmer-flat-blown below is the (d2)-alone proof.
  for (const seed of SEEDS) it(`bar 06 flattened near white fails both halves of (d) at seed ${seed}: no tile is white in every channel, and none is clearly dimmer`, async () => {
    const r = await relight("test/faults/glimmer-flat-white", seed);
    expect(r.status).toBe("fail");
    expect(r.line).toMatch(FLAT);
    expect(r.line).toMatch(DIM);
  });

  for (const seed of SEEDS) it(`bar 06 flattened blown fails (d2) alone at seed ${seed}: every tile is blown to white, but none is clearly dimmer`, async () => {
    const r = await relight("test/faults/glimmer-flat-blown", seed);
    expect(r.status).toBe("fail");
    expect(r.line).toMatch(FLAT);
    expect(r.line).not.toMatch(DIM);
    expect(r.measured["transmit.tileWhite.light"]).toBeGreaterThanOrEqual(TILE_WHITE);
    expect(r.measured["transmit.tileSpread.light"]).toBeLessThan(th("relight.tileSpread"));
  });

  for (const seed of SEEDS) it(`bar 06 at a quarter of its light behind fails (d1) alone at seed ${seed}: the tiles vary, but none is blown to white`, async () => {
    const r = await relight("test/faults/glimmer-dim", seed);
    expect(r.status).toBe("fail");
    expect(r.line).toMatch(DIM);
    expect(r.line).not.toMatch(FLAT);
    expect(r.measured["transmit.tileWhite.light"]).toBeLessThan(TILE_WHITE);
  });

  // the owner's ruling asks for "a flat-but-drifting test page that must fail". Review-checks-fix2 I1: bar 06 with its
  // swell deleted and the wash drifting passed the whole gate on 799f2f2 ((d) at the knee: top 0.932 to 0.942,
  // spread 0.145 to 0.226). The wash's falloff varies the tiles, but no tile is white in every channel. It must now
  // fail relight alone, by (d1), at every moment read.
  // detail fails as well, in dark only, pinned as measured (Phase 2 sweep after Task 2c, the gate's detail entry from
  // dist at 22a0868): with the finish grain off the dark rise is 0.01641 / 0.01562 / 0.01509 at seeds 1 / 2 / 3 (dark
  // shares 0.0546 / 0.0548 / 0.0555 at seed 1), under detail.minRise 0.020; light rises 0.8666 / 0.7615 / 0.8119 and
  // passes. The copy is frozen at bar 06's old etch (0.15), so it keeps the dark failure bar 06 had there (bar 06 at
  // etch 0.45 reads 0.0622 dark). Not an exemption: the row asserts that detail fails, and where.
  for (const seed of SEEDS) {
    const rel = "test/faults/glimmer-no-swell-drift";
    it(`bar 06 with no swell and a drifting wash fails relight and detail at seed ${seed}: every other check passes`, async () => {
      const rs = await checksAt(rel, seed, OTHERS);
      expect(rs.filter((c) => c.status !== "pass").map((c) => c.name)).toEqual([]);
    });
    it(`bar 06 with no swell and a drifting wash fails relight at seed ${seed}, by (d1): no tile is blown to white`, async () => {
      const [r] = await checksAt(rel, seed, (n) => n === "relight");
      expect(r!.status).toBe("fail");
      expect(r!.line).toMatch(/no glass tile is blown to white at t 1, 2, 3/);
      expect(r!.line).not.toMatch(FLAT);
      expect(r!.measured["transmit.tileWhite.light"]).toBeLessThan(TILE_WHITE);
    });
    it(`bar 06 with no swell and a drifting wash fails detail in dark only at seed ${seed}`, async () => {
      const [d] = await checksAt(rel, seed, (n) => n === "detail");
      detailFailsInDark(d!);
    });
  }
});
