// The detail dial adds texture only, and the detail check reads it with the finish grain off (Phase 2 Task 2c).
//
// 1. Raising the dial does not move a page's mean tone (AGENTS.md: the dial "changes only fine structure"). The
//    matte and paper materials' dial-driven colour variation was one-sided (toward ramp stop 1), so it lightened a
//    dark page and darkened a light one as the dial rose. It is zero-mean now; the test fault `detail-tone-shift`
//    restores the old term, and must fail the same assertion.
// 2. The detail check reads its high-frequency shares with the finish grain off, and its lines say so.
// 3. Phase 2 Task 8, driver ruling (2): the shares read with the whole finish off, the halftone screen too
//    (`__paint.setScreen(false)`). A screened page passes when its dial reaches the surface, and still fails when the
//    dial is dead (test/faults/halftone-lit-detail-dead).
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { check as detailCheck, highFrequencyShare } from "../../src/checks/detail.ts";
import { hideText, open } from "../../src/checks/frames.ts";
import { resolveTarget } from "../../src/checks/gate.ts";
import { closeBrowsers } from "../../src/checks/harness.ts";
import { luminance } from "../../src/checks/image.ts";
import { serveRoot } from "../../src/checks/serve.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");
let server: { url: string; close(): Promise<void> };

beforeAll(async () => {
  server = await serveRoot(ROOT);
});

afterAll(async () => {
  await server?.close();
  await closeBrowsers();
});

const target = (rel: string) => resolveTarget(path.join(ROOT, rel), {}, server.url);
const meanOf = (lum: Float32Array) => lum.reduce((a, v) => a + v, 0) / lum.length;

/**
 * The relative change of the frame's mean luma from detail 0 to detail 1, (m1 - m0) / m0: seed 1, t 2, 960 x 600,
 * dpr 1, text hidden, ink and finish grain off (the grain is zero-mean noise on top of the paint, not the dial's).
 */
async function toneChange(rel: string, dark: boolean, fault?: string): Promise<number> {
  const h = await open(target(rel), { seed: 1 }, { t: 2, detail: 0, dark, ...(fault ? { initScript: `globalThis.__PAINT_TEST_FAULT = ${JSON.stringify(fault)};` } : {}) });
  try {
    await hideText(h);
    await h.hook("__paint.setInk(false)");
    await h.hook("__paint.setGrain(0)");
    const m0 = meanOf(luminance(await h.shot()));
    await h.hook("__paint.setDetail(1)");
    const m1 = meanOf(luminance(await h.shot()));
    return (m1 - m0) / m0;
  } finally {
    await h.close();
  }
}

// Tolerance rule, stated before the value (the Phase 1 gap rule): the geometric mean of the largest fixed reading
// and the smallest planted reading of |relative change| over the four cells (lights.html and paper.html, light and
// dark) at seeds 1 to 3, rounded to the third decimal place. Measured on 6d5c8ae plus this change (Task 2c report):
// fixed, largest 0.00284 (paper.html dark, seeds 2 and 3; the fibres' micro relief and the OKLab mix's curvature
// leave a small residue); planted (the detail-tone-shift fault), smallest 0.01111 (lights.html light, seed 2).
// sqrt(0.00284 x 0.01111) = 0.00562, so 0.006.
const TOLERANCE = 0.006;
const keepsTone = (label: string, change: number) => expect(Math.abs(change), `${label}: mean luma moves by ${change.toFixed(5)} from detail 0 to 1`).toBeLessThanOrEqual(TOLERANCE);

const CELLS = ["test/pages/lights.html", "test/pages/paper.html"].flatMap((rel) => [false, true].map((dark) => ({ rel, dark, label: `${rel} ${dark ? "dark" : "light"}` })));

describe("the detail dial adds texture only", () => {
  it("raising the dial does not move the mean tone (lights.html, paper.html, light and dark)", async () => {
    for (const c of CELLS) {
      const change = await toneChange(c.rel, c.dark);
      console.log(`${c.label}: mean luma change detail 0 -> 1 ${change.toFixed(5)} (tolerance ${TOLERANCE})`);
      keepsTone(c.label, change);
    }
  });

  it("the planted detail-tone-shift fault fails that assertion in every cell", async () => {
    for (const c of CELLS) {
      const change = await toneChange(c.rel, c.dark, "detail-tone-shift");
      console.log(`${c.label}, detail-tone-shift fault: mean luma change detail 0 -> 1 ${change.toFixed(5)}`);
      expect(() => keepsTone(c.label, change)).toThrow(/mean luma moves by/);
    }
  });
});

describe("the detail check reads its shares with the finish grain off", () => {
  it("lights.html: the share at detail 0 is the grain-off frame's, and the pass line says so", async () => {
    const r = await detailCheck(target("test/pages/lights.html"), {});
    console.log(`${r.status} | ${r.line}`);
    expect(r.status, r.line).toBe("pass");
    expect(r.line).toMatch(/^detail: light: high-frequency share \(finish grain and screen off\) .*; dark: high-frequency share \(finish grain and screen off\) /);
    const h = await open(target("test/pages/lights.html"), {}, { t: 2, detail: 0 });
    let grainOn: number;
    let grainOff: number;
    try {
      await hideText(h);
      await h.hook("__paint.setInk(false)");
      grainOn = highFrequencyShare(await h.shot());
      await h.hook("__paint.setGrain(0)");
      grainOff = highFrequencyShare(await h.shot());
    } finally {
      await h.close();
    }
    console.log(`lights.html light share at detail 0: grain on ${grainOn}, grain off ${grainOff}, check ${r.measured["share.0.light"]}`);
    expect(r.measured["share.0.light"]).toBeCloseTo(grainOff, 6);
    expect(Math.abs(grainOn - grainOff)).toBeGreaterThan(1e-3);
  });

  it("a dead dial's fail line says so too", async () => {
    const r = await detailCheck(target("test/faults/cloth-detail-dead/index.html"), {});
    console.log(`${r.status} | ${r.line}`);
    expect(r.status).toBe("fail");
    expect(r.line).toMatch(/does not rise strictly .*high-frequency share \(finish grain and screen off\)/);
  });
});

describe("the detail check reads its shares with the halftone screen off too", () => {
  it("halftone-lit.html passes in light and dark, and its share is the screen-off frame's", async () => {
    const r = await detailCheck(target("test/pages/halftone-lit.html"), {});
    console.log(`${r.status} | ${r.line}`);
    for (const scheme of ["light", "dark"]) {
      const part = r.line.split(/; (?=dark: )/).find((x) => x.replace(/^detail: /, "").startsWith(`${scheme}: `));
      expect(part, r.line).not.toMatch(/does not rise/);
    }
    expect(r.status, r.line).toBe("pass");
    const h = await open(target("test/pages/halftone-lit.html"), {}, { t: 2, detail: 0 });
    let on: number;
    let off: number;
    try {
      await hideText(h);
      await h.hook("__paint.setInk(false)");
      await h.hook("__paint.setGrain(0)");
      expect(await h.hook<boolean>("__paint.screen()")).toBe(true);
      on = highFrequencyShare(await h.shot());
      await h.hook("__paint.setScreen(false)");
      expect(await h.hook<boolean>("__paint.screen()")).toBe(false);
      off = highFrequencyShare(await h.shot());
    } finally {
      await h.close();
    }
    console.log(`halftone-lit.html light share at detail 0: screen on ${on}, screen off ${off}, check ${r.measured["share.0.light"]}`);
    expect(r.measured["share.0.light"]).toBeCloseTo(off, 6);
    // The screen is real fine structure: with it on, the share is far from the paint's own.
    expect(on - off).toBeGreaterThan(0.5);
  });

  it("a screened page with a dead dial still fails", async () => {
    const r = await detailCheck(target("test/faults/halftone-lit-detail-dead/index.html"), {});
    console.log(`${r.status} | ${r.line}`);
    expect(r.status).toBe("fail");
    for (const scheme of ["light", "dark"]) expect(r.line, scheme).toMatch(new RegExp(`${scheme}: the high-frequency share does not rise strictly with the dial`));
  });
});
