// The glass's `etch` option (materials.glass): how unevenly the frost's fine etch passes light at detail 1. Phase 2
// Task 4 exposed it (it was a fixed 0.15) because bar 06's detail dial barely showed in dark: the pass unevenness is
// the only part of the etch a page lit from behind alone shows, and at 0.15 it read on the dim tiles only.
// Guards: the default is today's 0.15, so every glass page renders as before (pixel digests of test/pages/glass.html
// and bars/06-glimmer matched before and after the change, seed 1, t 2, detail 0.6 and 1, light and dark; recorded
// in the Task 4 report), and a larger etch reaches the picture: it raises the detail check's rise.
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { highFrequencyShare } from "../../src/checks/detail.ts";
import { closeBrowsers, openPage, type Rgba } from "../../src/checks/harness.ts";
import { serveRoot } from "../../src/checks/serve.ts";
import { glass } from "../../src/engine/materials/glass.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");
let server: { url: string; close(): Promise<void> };

beforeAll(async () => {
  server = await serveRoot(ROOT);
});

afterAll(async () => {
  await server?.close();
  await closeBrowsers();
});

/** test/pages/glass.html in dark at seed 1, t 2, the given detail, with `?etch=` when given. */
async function frame(detail: number, etch?: number): Promise<Rgba> {
  const q = etch === undefined ? "" : `?etch=${etch}`;
  const h = await openPage(`${server.url}/test/pages/glass.html${q}`, { dpr: 1, width: 960, height: 600, t: 2, seed: 1, dark: true, detail });
  try {
    return await h.shot();
  } finally {
    await h.close();
  }
}

/** The detail check's relative rise, (share(1) - share(0)) / share(0), at this etch. */
async function rise(etch?: number): Promise<number> {
  const s0 = highFrequencyShare(await frame(0, etch));
  const s1 = highFrequencyShare(await frame(1, etch));
  return (s1 - s0) / s0;
}

describe("glass etch", () => {
  it("defaults to 0.15, the value it had when it was fixed in the shader", () => {
    expect(glass({ frost: 0.065 }).uniforms.etch).toBe(0.15);
    expect(glass({ frost: 0.065, etch: 2 }).uniforms.etch).toBe(1);
    expect(glass({ frost: 0.065 }).glsl).toBe(glass({ frost: 0.065, etch: 0.3 }).glsl);
  });

  it("the default draws the same pixels as an explicit 0.15", async () => {
    const a = await frame(1);
    const b = await frame(1, 0.15);
    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
  }, 120_000);

  it("a larger etch raises the detail dial's rise in dark", async () => {
    const base = await rise();
    const strong = await rise(0.45);
    console.log(`glass.html dark: detail rise ${base.toFixed(5)} at the default etch, ${strong.toFixed(5)} at 0.45`);
    // Detail 0 is the same at any etch (the etch is scaled by the dial), so the rise can only grow through the etch.
    // An option the shader ignores draws the same pixels at both, so the rises are equal. Measured when written:
    // 0.0788 at the default, 0.1309 at 0.45 (this page blows more of its glass to white than bar 06 does).
    expect(strong).toBeGreaterThan(base);
  }, 120_000);
});
