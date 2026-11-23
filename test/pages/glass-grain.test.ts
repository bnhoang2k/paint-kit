// Guard for the finish's near-white grain on backlit glass (finish(c, fc, keepGrain), asked for by the shade pass on
// pixels that pass light from behind). The shoulder flattens grain added before it; glass lit from behind runs past
// white, so without the fix its brightest tiles carry no grain at all: a dead, flat white patch. banding-grain does
// not see it, because it reads the grain over the whole frame and a flat 255 patch has no lighter neighbour to make
// a staircase run.
//
// Measure: the finish's grain as banding-grain reads it (the frame at the declared grain minus the same frame at
// grain 0, high-pass std of the luminance difference), but over only the pixels the grain-0 frame drives to white
// (brightest channel 255). It must stay at or above `grain.floor`, the existing line under which "the frame has no
// grain". Measured on test/pages/glass.html, 960 x 600, dpr 1, t 2, level as declared (6), seeds 1 to 3:
//   fix as committed in 7b1d815 (grain put back before the shoulder)   0.0165 / 0.0166 (light / dark, seed 1)
//   fix as grain after the shoulder (finish.ts rewrite, 2026-11-14)   0.0084 to 0.0090
//   fix removed (keepGrain forced to 0 in a scratch copy of dist)     0.0009 to 0.0017
// Only the floor is asserted: it is what fails when the fix is gone. The 7b1d815 reading sits just over
// `grain.ceiling` (0.016), so that version's grain at white is a little loud; the ceiling is not this guard's job.
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeBrowsers, openPage, type Rgba } from "../../src/checks/harness.ts";
import { highPass, luminance, std } from "../../src/checks/image.ts";
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

/** The finish's grain (banding-grain's `finishGrain`) over only the pixels the grain-0 frame drives to white. */
function grainAtWhite(frame: Rgba, bare: Rgba): { grain: number; n: number } {
  const a = luminance(frame);
  const b = luminance(bare);
  const d = new Float64Array(a.length);
  for (let i = 0; i < d.length; i++) d[i] = a[i]! - b[i]!;
  const hp = highPass(d, frame.w, frame.h);
  const read: number[] = [];
  for (let i = 0; i < hp.length; i++) {
    if (Math.max(bare.data[i * 4]!, bare.data[i * 4 + 1]!, bare.data[i * 4 + 2]!) === 255) read.push(hp[i]!);
  }
  return { grain: std(read), n: read.length };
}

describe("backlit glass keeps its grain past white", () => {
  it.each([false, true])("glass.html (dark %s): the white tile carries the finish's grain", async (dark) => {
    const h = await openPage(`${server.url}/test/pages/glass.html`, { dpr: 1, width: 960, height: 600, t: 2, seed: 1, dark });
    let frame: Rgba;
    let bare: Rgba;
    try {
      frame = await h.shot();
      await h.hook("__paint.setGrain(0)");
      bare = await h.shot();
    } finally {
      await h.close();
    }
    const { grain, n } = grainAtWhite(frame, bare);
    console.log(`glass grain at white (dark ${dark}): std ${grain.toFixed(5)} over ${n} px`);
    // The page drives a tile past white (its brightest glass pixel reads 1.000), so there are pixels to read.
    expect(n).toBeGreaterThan(0);
    expect(grain).toBeGreaterThanOrEqual(threshold("grain.floor", null));
  }, 120_000);
});
