// Guard for d9198ed: the grain on backlit glass far past white. test/pages/glass-white.html drives its light behind
// to level 100, so the tiles under it run deep into the finish's shoulder. Read dark, 960 x 600, dpr 1, t 2, seed 1,
// text hidden, at the declared grain and at grain 0 (`__paint.setGrain(0)`). "White glass" is the fully covered glass
// pixels whose grain-0 frame has every channel at 250 or more; "bare ground" is coverage 0. The grain step is
// (declared - grain 0), per pixel.
// (a) Colourless: over the white glass, the grain step's OKLab chroma move, hypot(std(da), std(db)), is at most 0.5 x
//     its lightness move, std(dL). Neutral grain moves L only; its a and b move only by 8-bit rounding and by one
//     channel clipping at 255 before the others, predicted about 0.15 x. Grain that differs per channel moves a and b
//     about as much as L: an even, independent per-channel step at white predicts 1.1 x. 0.5 sits a factor of 2 or more
//     from each. (An absolute chroma ceiling cannot do this: even +-8-level per-channel grain at white reads p99
//     chroma 0.017, under the 0.02 just-noticeable difference.) Proved by a per-channel grain fault.
// (b) Keeps its size: the std of (declared - grain 0) luminance over the white glass is within a factor of 2 of that
//     over the bare ground (the grain.floor rule's halving, taken both ways). Grain added before the shoulder alone
//     flattens to almost nothing; grain kept in linear light (before d9198ed) measured 12.0 x the ground's.
// Proved by reverting the grain order (src/engine/finish.ts at 33af38e): RED; at d9198ed: GREEN.
//
// Bare ground on a glass page: the same page in light mode against `?opaque` (the same tiles in matte, no light
// behind). Light mode puts the ground's red above the shoulder's knee, so the glass finish path (grain after the
// shoulder) gives the ground about 1 / 0.81 the red grain of the normal path. Both pages run the same finish on the
// same ground colour at the same pixel and seed, so on the pixels that are bare ground on both, the frames must
// match: at most 1% of them may differ in any channel (room for a float rounding flip between two compiled shaders;
// a 19% change in red grain moves about half of them by a level). Proved by the shade pass without the coverage gate.
import path from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { closeBrowsers, openPage, type OpenOpts, type PageHandle, type Rgba } from "../../src/checks/harness.ts";
import { luminance, srgbToOklab, std } from "../../src/checks/image.ts";
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

const VIEW: OpenOpts = { t: 2, dpr: 1, width: 960, height: 600, seed: 1 };

/** The frame at the declared grain, the same frame at grain 0, and each pixel's coverage. */
async function frames(h: PageHandle): Promise<{ on: Rgba; bare: Rgba; covAt: (p: number) => number }> {
  const grid = await h.hook<{ coverage: number[]; w: number; h: number }>("(() => { const s = __paint.stats(); return { ...__paint.sheetRegion(0, 0, innerWidth, innerHeight), w: s.sheetW, h: s.sheetH }; })()");
  const on: Rgba = await h.shot();
  await h.hook("__paint.setGrain(0)");
  const bare: Rgba = await h.shot();
  const W = on.w;
  const H = on.h;
  const covAt = (p: number) => grid.coverage[Math.floor((Math.floor(p / W) * grid.h) / H) * grid.w + Math.floor(((p % W) * grid.w) / W)]!;
  return { on, bare, covAt };
}

it("backlit glass far past white keeps a colourless grain of its full size", async () => {
  const h = await openPage(`${server.url}/test/pages/glass-white.html`, { ...VIEW, dark: true });
  try {
    const { on, bare, covAt } = await frames(h);
    const full = threshold("relight.fullCoverage", null);
    const la = luminance(on);
    const lb = luminance(bare);
    const white: number[] = [];
    const ground: number[] = [];
    const dL: number[] = [];
    const da: number[] = [];
    const db: number[] = [];
    for (let p = 0; p < on.w * on.h; p++) {
      const c = covAt(p);
      const o = p * 4;
      if (c === 0) ground.push(la[p]! - lb[p]!);
      else if (c >= full && Math.min(bare.data[o]!, bare.data[o + 1]!, bare.data[o + 2]!) >= 250) {
        white.push(la[p]! - lb[p]!);
        const x = srgbToOklab(on.data[o]!, on.data[o + 1]!, on.data[o + 2]!);
        const y = srgbToOklab(bare.data[o]!, bare.data[o + 1]!, bare.data[o + 2]!);
        dL.push(x[0] - y[0]);
        da.push(x[1] - y[1]);
        db.push(x[2] - y[2]);
      }
    }
    const tint = Math.hypot(std(da), std(db)) / std(dL);
    const ratio = std(white) / std(ground);
    console.log(`glass-white: ${white.length} white glass px, grain chroma / lightness move ${tint.toFixed(3)}, grain std white / ground ${ratio.toFixed(3)}`);
    expect(white.length).toBeGreaterThan(1000);
    expect(std(ground), "the bare ground has no grain: the page draws with grain 0, so the size check reads 0 / 0").toBeGreaterThan(0);
    expect(tint, "the grain at white moves colour, not only lightness").toBeLessThanOrEqual(0.5);
    expect(ratio).toBeGreaterThanOrEqual(0.5);
    expect(ratio).toBeLessThanOrEqual(2);
  } finally {
    await h.close();
  }
}, 120_000);

it("bare ground on a glass page (light) has the grain of the same ground on an opaque page", async () => {
  const read = async (query: string) => {
    const h = await openPage(`${server.url}/test/pages/glass-white.html${query}`, { ...VIEW, dark: false });
    try {
      return await frames(h);
    } finally {
      await h.close();
    }
  };
  const glass = await read("");
  const plain = await read("?opaque");
  const ground: number[] = [];
  for (let p = 0; p < glass.on.w * glass.on.h; p++) if (glass.covAt(p) === 0 && plain.covAt(p) === 0) ground.push(p);
  const differ = (a: Rgba, b: Rgba) => ground.filter((p) => [0, 1, 2].some((c) => a.data[p * 4 + c] !== b.data[p * 4 + c])).length / ground.length;
  const redStep = (f: { on: Rgba; bare: Rgba }) => ground.map((p) => f.on.data[p * 4]! - f.bare.data[p * 4]!);
  const share = differ(glass.on, plain.on);
  const shareBare = differ(glass.bare, plain.bare);
  const red = std(redStep(glass)) / std(redStep(plain));
  console.log(`glass-white ground (light): ${ground.length} px, differ at declared grain ${share.toFixed(4)}, at grain 0 ${shareBare.toFixed(4)}, red grain std glass / opaque ${red.toFixed(3)}`);
  expect(ground.length).toBeGreaterThan(100_000);
  expect(shareBare, "the two pages' grounds differ before any grain: the comparison reads nothing").toBeLessThanOrEqual(0.01);
  expect(share, "bare ground on the glass page takes the glass finish path").toBeLessThanOrEqual(0.01);
}, 120_000);
