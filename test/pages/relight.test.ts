// The relight check on the lights pages and their planted faults, through the gate. Each fault must fail
// relight for its own measured reason, and every other check must still pass on it.
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CHECKS, gate, resolveTarget } from "../../src/checks/gate.ts";
import { closeBrowsers, openPage } from "../../src/checks/harness.ts";
import { serveRoot } from "../../src/checks/serve.ts";
import { threshold } from "../../src/checks/threshold.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");
let server: { url: string; close(): Promise<void> };

beforeAll(async () => {
  server = await serveRoot(ROOT);
});

afterAll(async () => {
  await server?.close();
  await closeBrowsers();
});

const run = (rel: string) => gate(path.join(ROOT, rel), { baseUrl: server.url });
type Run = Awaited<ReturnType<typeof run>>;
const statusOf = (r: Run) => Object.fromEntries(r.results.map((c) => [c.name, c.status]));
const relightOf = (r: Run) => r.results.find((c) => c.name === "relight")!.measured;
const th = (n: string) => threshold(n, null);
const log = (name: string, r: Run) => console.log(`${name}\n${r.lines.join("\n")}\n${JSON.stringify(relightOf(r))}`);

/** Exactly these checks fail (relight by default); every other check passes. */
function onlyRelightFails(r: Run, fails = ["relight"]) {
  const failing = r.results.filter((c) => c.status === "fail").map((c) => c.name);
  expect(failing).toEqual(fails);
  expect(r.results.some((c) => c.status === "partial")).toBe(false);
}

describe("relight check", () => {
  // One test per check, so each runs alone in under the page tests' 120 s.
  it.each(["relight", "detail"])("%s reads both schemes", async (name) => {
    // Phase 2 Task 2: each opens the page in light and in dark, and every measured key carries its scheme.
    // water.html passes both in both schemes.
    const t = resolveTarget(path.join(ROOT, "test/pages/water.html"), {}, server.url);
    {
      const r = await CHECKS.find((c) => c.name === name)!.run(t, {});
      console.log(`${name}: ${r.status} | ${r.line.slice(0, 400)} | ${JSON.stringify(r.measured)}`);
      expect(r.status, r.line).toBe("pass");
      const keys = Object.keys(r.measured);
      expect(keys.length).toBeGreaterThan(0);
      expect(keys.filter((k) => !k.endsWith(".light") && !k.endsWith(".dark"))).toEqual([]);
      const key = name === "relight" ? "caustic.concentration" : "rise";
      expect(r.measured[`${key}.light`]).toBeTypeOf("number");
      expect(r.measured[`${key}.dark`]).toBeTypeOf("number");
      expect(r.line).toMatch(new RegExp(`^${name}: light: .*; dark: `));
    }
  });

  // Task 2e: a whole gate of a page ran over the 60 s default under load, so the pass-list tests run the relight check
  // and the other checks as two tests. The checks do not read each other.
  const only = (...names: string[]) => CHECKS.filter((c) => names.includes(c.name));
  const except = (...names: string[]) => CHECKS.filter((c) => !names.includes(c.name));
  const runChecks = (rel: string, checks: typeof CHECKS) => gate(path.join(ROOT, rel), { baseUrl: server.url }, checks);

  it("lights page passes every check but relight", async () => {
    const r = await runChecks("test/pages/lights.html", except("relight"));
    console.log(`lights (not relight)\n${r.lines.join("\n")}`);
    expect(r.verdict).toBe("passed");
  });

  it("lights page passes relief, falloff and tint", async () => {
    const r = await runChecks("test/pages/lights.html", only("relight"));
    log("lights", r);
    expect(statusOf(r).relight).toBe("pass");
    expect(r.verdict).toBe("passed");
    const m = relightOf(r);
    expect(m["relief.diff.light"]).toBeGreaterThan(th("relight.reliefDiff"));
    expect(m["relief.heightRange.light"]).toBeGreaterThan(th("relight.minRelief"));
    expect(Math.abs(m["falloff.exponent.light"]! - 2)).toBeLessThanOrEqual(th("relight.falloffSlack"));
    // Per page (Phase 2 Task 3): the span is at least relight.falloffSpan x the page's own fit rms.
    expect(m["falloff.span.light"]).toBeGreaterThanOrEqual(th("relight.falloffSpan") * m["falloff.rms.light"]!);
    expect(m["falloff.samples.light"]).toBeGreaterThanOrEqual(4);
    expect(m["falloff.outsideDiff.light"]).toBeLessThanOrEqual(th("relight.ambientBand"));
    expect(m["falloff.movedGain.light"]).toBeGreaterThan(th("relight.ambientBand"));
    expect(m["tint.hueGain.light"]).toBeGreaterThan(0);
    expect(m["tint.chromaGain.light"]).toBeGreaterThan(0);
    expect(m["tint.beyondDiff.light"]).toBeLessThanOrEqual(th("relight.ambientBand"));
  });

  it("overhead lamp passes palette", async () => {
    // palette passes since check-fix (b) round 3 (far colours from each token's own lightness; the old frame-mean
    // branch failed this page at 1.5%).
    const r = await runChecks("test/pages/lights-overhead.html", only("palette"));
    console.log(`lights-overhead (palette)\n${r.lines.join("\n")}`);
    expect(statusOf(r).palette).toBe("pass");
  });

  it("overhead lamp passes falloff through the opened cone", async () => {
    // The reviewer's geometry: a lamp straight above its aim. Inside its declared full-light cone every point is
    // nearly the same distance from the bulb, so the law opens the cone for the fit (check-fix (c)).
    const r = await runChecks("test/pages/lights-overhead.html", only("relight"));
    log("lights-overhead", r);
    expect(statusOf(r).relight).toBe("pass");
    const m = relightOf(r);
    expect(r.lines.find((l) => l.includes("relight:"))).toMatch(/falloff pass \(.*with the cone opened from 20 to/);
    expect(m["falloff.declaredSpan.light"]).toBeLessThan(th("relight.falloffSpan") * m["falloff.rms.light"]!);
    expect(m["falloff.cone.light"]).toBeGreaterThan(20);
    // Per page (Phase 2 Task 3): the span is at least relight.falloffSpan x the page's own fit rms.
    expect(m["falloff.span.light"]).toBeGreaterThanOrEqual(th("relight.falloffSpan") * m["falloff.rms.light"]!);
    expect(m["falloff.samples.light"]).toBeGreaterThanOrEqual(4);
    expect(Math.abs(m["falloff.exponent.light"]! - 2)).toBeLessThanOrEqual(th("relight.falloffSlack"));
    // No detail assertion: this is a weak-dial page (the owner's ruling, 2026-11-17, "Test only the fade"), and this test
    // checks only the falloff it was built for. Under an overhead lamp its dial shows almost no fine structure: with
    // the finish grain off its light shares sit at the always-on dither floor (seed 1: 1.957e-4 / 1.735e-4 /
    // 2.184e-4, not strict), so detail fails it in light; dark rises 1.317. The gate still reports that result as it
    // is, and detail.minRise's `why` records the page as off the honest side.
  });

  it("overhead lamp without falloff fails through the opened cone", async () => {
    const r = await run("test/faults/lights-overhead-nofalloff/index.html");
    log("lights-overhead-nofalloff", r);
    // The fault wraps the engine's lamp in page code (its own glsl and `with`), so palette's custom-Light rule (S2)
    // fails it too, by that sub-reason only. detail fails it too, in light only, as it fails its honest twin
    // lights-overhead.html (a weak-dial page, the owner's ruling of 2026-11-17): with the finish grain off its light shares
    // sit at the dither floor (0.0002 / 0.0002 / 0.0002, not strict; dark rises 1.40). That failure is the page's
    // geometry, not the planted fault, and it is pinned here as measured (Phase 2 Task 2c fix round 1). Every other
    // failure must be relight's.
    onlyRelightFails(r, ["palette", "relight", "detail"]);
    expect(r.lines.find((l) => l.includes("palette:"))).toMatch(/page code makes its own Light/);
    expect(r.lines.find((l) => l.includes("palette:"))).not.toMatch(/reads the palette itself|ignores the page's tokens/);
    const m = relightOf(r);
    // Its declared cone cannot resolve falloff (it read partial before check-fix (c)); only the opened cone fails it.
    expect(m["falloff.declaredSpan.light"]).toBeLessThan(th("relight.falloffSpan") * m["falloff.rms.light"]!);
    // Per page (Phase 2 Task 3): the span is at least relight.falloffSpan x the page's own fit rms.
    expect(m["falloff.span.light"]).toBeGreaterThanOrEqual(th("relight.falloffSpan") * m["falloff.rms.light"]!);
    expect(m["falloff.aimGain.light"]).toBeGreaterThan(th("relight.ambientBand"));
    expect(m["falloff.outsideDiff.light"]).toBeLessThanOrEqual(th("relight.ambientBand"));
    expect(m["falloff.movedGain.light"]).toBeGreaterThan(th("relight.ambientBand"));
    expect(Math.abs(m["falloff.exponent.light"]! - 2)).toBeGreaterThan(th("relight.falloffSlack"));
    expect(r.lines.find((l) => l.includes("relight:"))).toMatch(/falloff FAIL \(the lamp's light falls with distance\^/);
  });

  it("core page passes relief", async () => {
    const r = await run("test/pages/core.html");
    log("core", r);
    expect(statusOf(r).relight).toBe("pass");
    expect(relightOf(r)["relief.heightRange.light"]).toBeGreaterThan(th("relight.minRelief"));
  });

  it("lamp honours specular: 0, and specular: 1 puts the frame back", async () => {
    // paper.html's lamp lights its printed text, whose ink has a slight gloss (spec 0.08): with the lamp's specular
    // term off that gloss goes and nothing else changes.
    const h = await openPage(`${server.url}/test/pages/paper.html`, { dpr: 1, width: 960, height: 600, t: 2, seed: 1 });
    try {
      const lights = await h.hook<{ id: string }[]>("__paint.lights()");
      const i = lights.findIndex((l) => l.id === "lamp");
      expect(i).toBeGreaterThanOrEqual(0);
      const base = await h.shot();
      await h.hook(`__paint.setLight(${i}, { specular: 0 })`);
      const off = await h.shot();
      await h.hook(`__paint.setLight(${i}, { specular: 1 })`);
      const back = await h.shot();
      const changed = (p: ArrayLike<number>, q: ArrayLike<number>) => {
        let n = 0;
        for (let k = 0; k < p.length; k++) if (p[k] !== q[k]) n++;
        return n;
      };
      console.log(`paper lamp specular: ${changed(base.data, off.data)} channel values change with it off, ${changed(base.data, back.data)} after it is back on`);
      expect(changed(base.data, off.data)).toBeGreaterThan(0);
      expect(changed(base.data, back.data)).toBe(0);
    } finally {
      await h.close();
    }
  });

  it("baked lamp fails falloff", async () => {
    const r = await run("test/faults/lights-baked/index.html");
    log("lights-baked", r);
    // palette fails it by its custom-Light rule (S2, check-fix (b) round 3): the fake lamp is a Light made in page
    // code. Its frame still follows a token swap (the smoke test passes), which is why only a structural rule sees it.
    onlyRelightFails(r, ["palette", "relight"]);
    expect(r.lines.find((l) => l.includes("palette:"))).toMatch(/page code makes its own Light/);
    expect(r.lines.find((l) => l.includes("palette:"))).not.toMatch(/ignores the page's tokens/);
    // The painted cone does not answer setLight: turning the lamp off changes nothing at its aim.
    expect(relightOf(r)["falloff.aimGain.light"]).toBeLessThanOrEqual(th("relight.ambientBand"));
    expect(relightOf(r)["falloff.movedGain.light"]).toBeLessThanOrEqual(th("relight.ambientBand"));
    expect(r.lines.find((l) => l.includes("relight:"))).toMatch(/falloff FAIL/);
  });

  it("lamp without falloff fails", async () => {
    const r = await run("test/faults/lights-nofalloff/index.html");
    log("lights-nofalloff", r);
    // A page-code wrapper around the engine's lamp: palette's custom-Light rule (S2) fails it too.
    onlyRelightFails(r, ["palette", "relight"]);
    expect(r.lines.find((l) => l.includes("palette:"))).toMatch(/page code makes its own Light/);
    const m = relightOf(r);
    // It still lights its aim and stops at its cone; only the distance law is broken.
    expect(m["falloff.aimGain.light"]).toBeGreaterThan(th("relight.ambientBand"));
    expect(m["falloff.outsideDiff.light"]).toBeLessThanOrEqual(th("relight.ambientBand"));
    expect(m["falloff.movedGain.light"]).toBeGreaterThan(th("relight.ambientBand"));
    expect(Math.abs(m["falloff.exponent.light"]! - 2)).toBeGreaterThan(th("relight.falloffSlack"));
  });

  it("glossy islands on a brighter bare ground pass highlight: the ground is not read", async () => {
    // The ground between the discs (coverage 0) is unlit and brighter than any lit disc, so the whole frame's
    // brightest 1% is a tie of ground pixels that cannot move. The law reads fully covered pixels only
    // (relight.fullCoverage), whose brightest 1% follows the key (review-bar-06, Critical 1).
    const r = await run("test/pages/islands.html");
    log("islands", r);
    const line = r.lines.find((l) => l.includes("relight:"))!;
    expect(line).toMatch(/highlight pass/);
    const m = relightOf(r);
    expect(m["highlight.shift.light"]).toBeGreaterThanOrEqual(th("relight.highlightShift"));
    expect(m["highlight.brightShift.light"]).toBeGreaterThanOrEqual(th("relight.brightShift"));
    expect(m["highlight.read.light"]).toBeGreaterThan(0);
    expect(m["highlight.read.light"]).toBeLessThan(960 * 600);
  }, 120_000);

  it("flat sheet fails relief by the relief floor", async () => {
    const r = await run("test/faults/lights-flat/index.html");
    log("lights-flat", r);
    onlyRelightFails(r);
    const m = relightOf(r);
    // The moving lamp pool changes the frame plenty, so only the floor can catch the flat sheet.
    expect(m["relief.diff.light"]).toBeGreaterThan(th("relight.reliefDiff"));
    expect(m["relief.heightRange.light"]).toBeLessThanOrEqual(th("relight.minRelief"));
    const line = r.lines.find((l) => l.includes("relight:"))!;
    expect(line).toMatch(/relief FAIL \(the sheet is flat/);
    expect(line).not.toMatch(/moving the light changes the frame by [0-9.]+, at or under/);
  });

  // One test per seed, so each runs alone in under the page tests' 120 s.
  it.each([1, 2, 3])("mud fails the relief change in dark as well as light, at seed %i", async (seed) => {
    // Phase 2 Task 2b: the relief change is relative to the frames' brightness, and its limit is set from fault
    // readings in both schemes, since the gate reads both. paper-mud's dark half (about 0.0104) must fail by the
    // relief change, not pass on its dark ground.
    const t = resolveTarget(path.join(ROOT, "test/faults/paper-mud/index.html"), {}, server.url);
    const relight = CHECKS.find((c) => c.name === "relight")!;
    {
      const r = await relight.run(t, { seed });
      console.log(`paper-mud seed ${seed}: ${r.status} | ${r.line.slice(0, 400)}`);
      expect(r.status).toBe("fail");
      for (const scheme of ["light", "dark"]) {
        expect(r.measured[`relief.diff.${scheme}`], `${scheme} seed ${seed}`).toBeLessThanOrEqual(th("relight.reliefDiff"));
        expect(r.measured[`relief.heightRange.${scheme}`], `${scheme} seed ${seed}`).toBeGreaterThan(th("relight.minRelief"));
        expect(r.line, `${scheme} seed ${seed}`).toMatch(new RegExp(`${scheme}: relief FAIL \\(moving the light changes the frame by`));
      }
    }
  }, 120_000);

  it.each([1, 2, 3])("mud on a near-black ground fails relief in dark by the raw floor, at seed %i", async (seed) => {
    // Phase 2 Task 2b fix round 3: on a ground of OKLCH L 0.12 the relative change of mud reads about 0.0167, above
    // relight.reliefDiff; only relight.reliefRawFloor (raw change about 0.0008) catches it.
    const t = resolveTarget(path.join(ROOT, "test/faults/relight-mud-near-black"), {}, server.url);
    const relight = CHECKS.find((c) => c.name === "relight")!;
    {
      const r = await relight.run(t, { seed });
      console.log(`relight-mud-near-black seed ${seed}: ${r.status} | ${r.line.slice(0, 500)}`);
      expect(r.status).toBe("fail");
      expect(r.measured["relief.diff.dark"]).toBeGreaterThan(th("relight.reliefDiff"));
      expect(r.measured["relief.heightRange.dark"]).toBeGreaterThan(th("relight.minRelief"));
      expect(r.measured["relief.rawDiff.dark"]).toBeLessThanOrEqual(th("relight.reliefRawFloor"));
      expect(r.line).toMatch(new RegExp(`dark: relief FAIL \\(raw change [0-9.]+, at or under the floor ${th("relight.reliefRawFloor")}`));
    }
  }, 120_000);
});
