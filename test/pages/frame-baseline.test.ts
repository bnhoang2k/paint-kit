// Before/after guard for an engine change that must not change a pixel of the kept bars (such as the rest
// position: with no field writing it, every page must draw as before). It frames bars 01 to 06, frozen, at
// 79 settings (seeds 1 to 3, detail 0 / 0.5 / 1, light and dark, two times), and the water test page's rise-map
// path at a nonzero height (test/pages/water.html?rise=0.3, light and dark: bar 05's own frames come before its card
// rises), 81 frames, and 22 Phase 1 test pages under test/pages (light and dark, detail 0 and 1, seed 1, t 2: 88
// frames, so a material no bar uses, such as matte, is framed too; Phase 2 Task 6), 169 frames in all, and compares
// each frame with a baseline taken from the build before the change:
//   FRAME_BASELINE=<dir> FRAME_BASELINE_WRITE=1 npx vitest run -c vitest.pages.config.ts test/pages/frame-baseline.test.ts
//   (at the old build: writes the baseline), then the same without FRAME_BASELINE_WRITE (at the new build: compares).
// Each frame is one test, named by its frame, so a run can be split with -t ("frame for frame: page-" for the pages).
// Without FRAME_BASELINE it is skipped: a stored frame depends on the renderer, so the baseline lives outside the repo.
// Each bar is framed at its bar.json view (default 960 x 600), at dpr 1; the water page at 960 x 600.
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { closeBrowsers, openPage, type OpenOpts } from "../../src/checks/harness.ts";
import { meanAbsDiff } from "../../src/checks/image.ts";
import { serveRoot } from "../../src/checks/serve.ts";

const DIR = process.env.FRAME_BASELINE;
const WRITE = process.env.FRAME_BASELINE_WRITE === "1";
const ROOT = path.resolve(import.meta.dirname, "../..");
const BARS = ["01-lamp-on-paper", "02-denim-zip", "03-halftone-resolve", "04-paper-shred", "05-pool-light", "06-glimmer"];

const viewOf = (bar: string): { width: number; height: number } => {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, "bars", bar, "bar.json"), "utf8")) as { view?: { width: number; height: number } };
  return j.view ?? { width: 960, height: 600 };
};
const PAGES = [
  "blend", "carry", "cloth", "core", "flash-2hz", "glass", "glass-white", "glimmer-bright", "glimmer-final", "grown", "halftone",
  "halftone-caption", "ink-cases", "islands", "lights", "lights-overhead", "palette-tokens", "paper", "rest-order", "timeline", "water", "water-layer",
];
// Per bar: 9 light frames (3 seeds x 3 details at t 2), 3 dark (detail 0.6), 1 at t 0.5: 13, so 78, plus bar 01
// at detail 0.25 for 79.
const CASES: { name: string; page: string; opts: OpenOpts }[] = BARS.flatMap((bar) => {
  const base: OpenOpts = { dpr: 1, ...viewOf(bar), t: 2 };
  const page = `bars/${bar}/index.html`;
  return [
    ...[1, 2, 3].flatMap((seed) => [0, 0.5, 1].map((detail) => ({ name: `${bar}-s${seed}-d${detail}`, page, opts: { ...base, seed, detail } }))),
    ...[1, 2, 3].map((seed) => ({ name: `${bar}-s${seed}-dark`, page, opts: { ...base, seed, detail: 0.6, dark: true } })),
    { name: `${bar}-s1-t0.5`, page, opts: { ...base, seed: 1, detail: 0.6, t: 0.5 } },
  ];
}).concat([
  { name: "01-lamp-on-paper-s2-d0.25", page: "bars/01-lamp-on-paper/index.html", opts: { dpr: 1, width: 960, height: 600, t: 2, seed: 2, detail: 0.25 } },
  // The rise map lifting the card 0.3 off the floor (water layer review, Minor 6).
  ...[false, true].map((dark) => ({ name: `water-rise0.3-${dark ? "dark" : "light"}`, page: "test/pages/water.html?rise=0.3", opts: { dpr: 1, width: 960, height: 600, t: 2, seed: 1, detail: 0.5, dark } })),
  // Phase 1 test pages (Phase 2 Task 6: a material's tone at its default leaves every page as it was).
  ...PAGES.flatMap((p) =>
    [false, true].flatMap((dark) =>
      [0, 1].map((detail) => ({
        name: `page-${p}-${dark ? "dark" : "light"}-d${detail}`,
        page: p.startsWith("glimmer-") ? `test/pages/${p}/index.html` : `test/pages/${p}.html`,
        opts: { dpr: 1, width: 960, height: 600, t: 2, seed: 1, detail, dark },
      })),
    ),
  ),
]);

let server: { url: string; close(): Promise<void> };
beforeAll(async () => {
  if (DIR) server = await serveRoot(ROOT);
});
afterAll(async () => {
  await closeBrowsers();
  await server?.close();
});

// One test per frame, so each runs alone in under 120 s (the frames are independent).
for (const c of CASES)
  it.skipIf(!DIR)(`bars 01 to 06 and the test pages match the baseline frame for frame: ${c.name}`, async () => {
    fs.mkdirSync(DIR!, { recursive: true });
    const h = await openPage(`${server.url}/${c.page}`, c.opts);
    const f = await h.shot();
    await h.close();
    const file = path.join(DIR!, `${c.name}.rgba`);
    if (WRITE) {
      fs.writeFileSync(file, Buffer.concat([Buffer.from(new Uint32Array([f.w, f.h]).buffer), Buffer.from(f.data.buffer)]));
      console.log(`baseline written: ${c.name} in ${DIR}`);
      return;
    }
    const buf = fs.readFileSync(file);
    const [w, hgt] = new Uint32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + 8));
    const base = { w: w!, h: hgt!, data: new Uint8ClampedArray(buf.buffer.slice(buf.byteOffset + 8, buf.byteOffset + buf.length)) };
    expect([f.w, f.h]).toEqual([base.w, base.h]);
    const diff = meanAbsDiff(f, base);
    console.log(`${c.name}: mean abs diff ${diff}`);
    expect(diff).toBe(0);
  });
