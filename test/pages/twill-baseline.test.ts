// Before/after guard for a change to the engine's twill weave code that must not change a pixel (such as moving
// the weave into a shared GLSL chunk). It frames the pages that draw the twill, frozen, and compares each frame
// with a baseline taken from the build before the change:
//   TWILL_BASELINE=<dir> TWILL_BASELINE_WRITE=1 npx vitest run -c vitest.pages.config.ts test/pages/twill-baseline.test.ts
//   (at the old build: writes the baseline), then the same without TWILL_BASELINE_WRITE (at the new build: compares).
// Without TWILL_BASELINE it is skipped: a stored frame depends on the renderer, so the baseline lives outside the repo.
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { closeBrowsers, openPage, type OpenOpts } from "../../src/checks/harness.ts";
import { meanAbsDiff } from "../../src/checks/image.ts";
import { serveRoot } from "../../src/checks/serve.ts";

const DIR = process.env.TWILL_BASELINE;
const WRITE = process.env.TWILL_BASELINE_WRITE === "1";
const ROOT = path.resolve(import.meta.dirname, "../..");

// Each case: a page that draws the twill weave, at a frozen time, seed and detail. Detail 0 and 1 cover the
// weave alone and the weave with its thread texture. Bar 02 is framed at its bar.json view.
const CLOTH: OpenOpts = { dpr: 1, width: 960, height: 600, t: 2 };
const ZIP: OpenOpts = { dpr: 1, width: 393, height: 852, t: 2 };
const CASES: { name: string; page: string; opts: OpenOpts }[] = [
  { name: "cloth-s1-d0", page: "test/pages/cloth.html", opts: { ...CLOTH, seed: 1, detail: 0 } },
  ...[1, 2, 3].map((seed) => ({ name: `cloth-s${seed}-d1`, page: "test/pages/cloth.html", opts: { ...CLOTH, seed, detail: 1 } })),
  ...[1, 2, 3].map((seed) => ({ name: `zip-s${seed}-d1`, page: "bars/02-denim-zip/index.html", opts: { ...ZIP, seed, detail: 1 } })),
];

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
  it.skipIf(!DIR)(`twill pages match the baseline frame for frame: ${c.name}`, async () => {
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
