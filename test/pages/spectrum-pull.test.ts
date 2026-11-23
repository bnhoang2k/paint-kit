// The pull on the screen (Phase 2 Task 13, the driver's addition from Task 12's review, Review Focus 1): GLSL pk_pull,
// drawn through the engine on test/pages/spectrum-pull.html, on the palette-tokens pattern (the frame's pixels against
// colours computed here). The CPU `pullToRamp` is not evidence for the screen at mid amounts, so this reads only the
// two ends, where the two pick the same target:
// - amount 0 leaves the spectral line as it is (the frame shows it clipped, as every colour is);
// - amount 1 lands on the ramp target: the nearest stop exactly, or the ground's hue at the line's own lightness;
// - a token swap (light to dark) changes the pulled swatches within one frame: the swap draws one frame and the
//   swatches then match the new ramp (each moves as far as its target did), while the unpulled lines stay put.
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeBrowsers, openPage, type PageHandle, type Rgba } from "../../src/checks/harness.ts";
import { oklabDistance, srgbToOklab } from "../../src/checks/image.ts";
import { serveRoot } from "../../src/checks/serve.ts";
import { threshold } from "../../src/checks/threshold.ts";
import type { Ramp, Vec3 } from "../../src/engine/palette.ts";
import { pullToRamp, wavelengthToLinear } from "../../src/engine/spectrum.ts";

type Cell = { row: number; col: number; nm: number; x: number; y: number };
// The page's own dark tokens (spectrum-pull.html), written over the light ones by the swap.
const DARK = { "--ground": "oklch(0.27 0.03 260)", "--ink": "oklch(0.92 0.02 85)", "--accent-a": "oklch(0.7 0.12 35)", "--accent-b": "oklch(0.62 0.1 155)" };

// The finish as the frame applies it with grain 0: the highlight shoulder (knee 0.8) and the sRGB encode, written here
// on their own so the test does not trust the module's. The dither adds under half a level.
const shoulder = (c: number) => Math.min(c, 0.8) + 0.2 * (1 - Math.exp(-Math.max(c - 0.8, 0) / 0.2));
const encode = (v: number) => {
  const c = shoulder(Math.max(0, v));
  return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
};
const shown = (c: Vec3): Vec3 => c.map(encode) as Vec3;

let server: { url: string; close(): Promise<void> };
let h: PageHandle;

beforeAll(async () => {
  server = await serveRoot(path.resolve(import.meta.dirname, "../.."));
  h = await openPage(`${server.url}/test/pages/spectrum-pull.html`, { dpr: 1, width: 960, height: 600, t: 0 });
});
afterAll(async () => {
  await h?.close();
  await server?.close();
  await closeBrowsers();
});

const pixel = (f: Rgba, c: Cell): Vec3 => {
  const o = (Math.round(c.y) * f.w + Math.round(c.x)) * 4;
  return [f.data[o]!, f.data[o + 1]!, f.data[o + 2]!];
};
const fmt = (v: number[]) => v.map((x) => x.toFixed(1)).join(",");

/** What each swatch should show under `ramp`: row 0 the line, row 1 its nearest stop, row 2 the ground's hue. */
function expected(c: Cell, ramp: Ramp, scale: number): Vec3 {
  const line = wavelengthToLinear(c.nm).map((v) => v * scale) as Vec3;
  if (c.row === 0) return line;
  return pullToRamp(line, ramp, 1, c.row === 1 ? "nearest" : "ground");
}

/** Checks every swatch of `f` against `ramp`: the line and the nearest stop within 2 levels, the ground pull in OKLab. */
function checkFrame(f: Rgba, cells: Cell[], ramp: Ramp, scale: number, label: string) {
  const visible = threshold("palette.visibleMove", null);
  const rows: string[] = [];
  for (const c of cells) {
    const want = shown(expected(c, ramp, scale));
    const got = pixel(f, c);
    const off = oklabDistance(srgbToOklab(...got), srgbToOklab(want[0], want[1], want[2]));
    rows.push(`${label} row ${c.row} ${c.nm} nm: painted ${got.join(",")} want ${fmt(want)} (OKLab ${off.toFixed(4)})`);
    if (c.row === 2) {
      // The ground's hue at the line's lightness: the GPU clamps negative LMS where the CPU takes a signed cube root,
      // and does not reduce chroma, so the two agree to within the just-noticeable difference, not to the level.
      expect(off, rows.at(-1)).toBeLessThan(visible);
    } else {
      for (let i = 0; i < 3; i++) expect(Math.abs(got[i]! - want[i]!), rows.at(-1)).toBeLessThanOrEqual(2);
    }
  }
  console.log(rows.join("\n"));
}

describe("pk_pull on the screen", () => {
  it("amount 0 leaves the spectral line; amount 1 lands on the nearest stop and on the ground's hue", async () => {
    const { cells, scale } = await h.hook<{ cells: Cell[]; scale: number }>("window.__pull");
    const f = await h.shot("spectrum-pull-light");
    checkFrame(f, cells, await h.hook<Ramp>("window.__pull.ramp()"), scale, "light");
    expect(h.errors).toEqual([]);
  });

  it("a token swap (light to dark) changes the pulled colour within one frame", async () => {
    const { cells, scale } = await h.hook<{ cells: Cell[]; scale: number }>("window.__pull");
    const before = await h.shot();
    const rampBefore = await h.hook<Ramp>("window.__pull.ramp()");
    const drawn = await h.hook<number>(`(() => { const n = __paint.stats().frames; __paint.setPalette(${JSON.stringify(DARK)}); return __paint.stats().frames - n; })()`);
    const after = await h.shot("spectrum-pull-swapped");
    const ramp = await h.hook<Ramp>("window.__pull.ramp()");
    console.log(`PULL swap: frames drawn by the swap ${drawn}`);
    expect(drawn).toBe(1);
    checkFrame(after, cells, ramp, scale, "swapped");
    const visible = threshold("palette.visibleMove", null);
    let movedVisibly = 0;
    for (const c of cells) {
      const moved = oklabDistance(srgbToOklab(...pixel(before, c)), srgbToOklab(...pixel(after, c)));
      const w0 = shown(expected(c, rampBefore, scale));
      const w1 = shown(expected(c, ramp, scale));
      const wanted = oklabDistance(srgbToOklab(w0[0], w0[1], w0[2]), srgbToOklab(w1[0], w1[1], w1[2]));
      console.log(`PULL swap row ${c.row} ${c.nm} nm: moved ${moved.toFixed(4)}, the ramps' targets ${wanted.toFixed(4)} apart`);
      // The lines take no token. A pulled swatch moves as far as its target did: the nearest stop or the ground's hue
      // under the new ramp (a stop of one scheme can sit near a stop of the other: the light ink and the dark ground).
      if (c.row === 0) expect(moved).toBe(0);
      else expect(Math.abs(moved - wanted)).toBeLessThan(visible);
      if (c.row > 0 && moved > visible) movedVisibly++;
    }
    console.log(`PULL swap: ${movedVisibly} of 6 pulled swatches moved visibly`);
    expect(movedVisibly).toBeGreaterThan(0);
    expect(h.errors).toEqual([]);
  });
});
