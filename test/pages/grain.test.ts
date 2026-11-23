// The grain half of banding-grain measures the finish's grain, not the material's texture. Paper fibre, cloth weave
// and halftone dots are high-frequency picture; with the finish's grain at core's (the default), each page's grain
// must read as core's does. Loud grain on a loud material (cloth with the grain doubled) must still fail.
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { check } from "../../src/checks/banding-grain.ts";
import { resolveTarget } from "../../src/checks/gate.ts";
import { hideText, VIEW } from "../../src/checks/frames.ts";
import { closeBrowsers, openPage } from "../../src/checks/harness.ts";
import { highPassStd, luminance } from "../../src/checks/image.ts";
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

const target = (rel: string) => resolveTarget(path.join(ROOT, rel), {}, server.url);
/** The finish grain a page declares, read through the hook. */
async function declaredGrain(rel: string): Promise<number> {
  const h = await openPage(`${server.url}/${rel}`, { dpr: 1, width: 320, height: 200, t: 1, seed: 1 });
  try {
    return await h.hook<number>("__paint.grain()");
  } finally {
    await h.close();
  }
}

describe("grain measures the finish, not the material", () => {
  it.each(["test/pages/paper.html", "test/pages/cloth.html", "test/pages/halftone.html"])(
    "%s: grain like core's passes the grain half",
    async (page) => {
      const core = await declaredGrain("test/pages/core.html");
      const own = await declaredGrain(page);
      expect(own).toBeLessThanOrEqual(core);
      const r = await check(target(page), {});
      console.log(`${page} (declared grain ${own}, core ${core})\n${r.line}`);
      for (const scheme of ["light", "dark"]) {
        expect(r.measured[`grain.${scheme}`]!).toBeGreaterThanOrEqual(threshold("grain.floor", null));
        expect(r.measured[`grain.${scheme}`]!).toBeLessThanOrEqual(threshold("grain.ceiling", null));
      }
      expect(r.line).not.toMatch(/grain \((light|dark)\):/);
    },
    120_000,
  );

  it("cloth with the grain doubled fails by the grain ceiling", async () => {
    expect(await declaredGrain("test/faults/cloth-grain2x/index.html")).toBe(2 * (await declaredGrain("test/pages/core.html")));
    const r = await check(target("test/faults/cloth-grain2x/index.html"), {});
    console.log(`cloth-grain2x\n${r.line}`);
    expect(r.status).toBe("fail");
    expect(Math.max(r.measured["grain.light"]!, r.measured["grain.dark"]!)).toBeGreaterThan(threshold("grain.ceiling", null));
    expect(r.line).toMatch(/so the grain is too loud/);
  }, 120_000);

  it("grain() reads 0 under the nofinish fault, which draws no finish", async () => {
    expect(await declaredGrain("test/faults/core-nofinish/index.html")).toBe(0);
  }, 120_000);

  // KNOWN GAP (owner: Task 20), not a pass. Noise a page writes itself (here per-pixel hash noise in a shape field's
  // height) is in both frames of the finish-only grain, so it cancels and the grain half passes, though the whole
  // frame is far louder than the ceiling and such noise can hide banding runs. When Task 20 makes the check see page
  // noise, the first assert trips: turn it into a fail by the grain (or a new noise) sub-reason.
  it("core-fieldnoise: page noise passes the grain half (KNOWN GAP)", async () => {
    const rel = "test/faults/core-fieldnoise/index.html";
    const r = await check(target(rel), {});
    const h = await openPage(`${server.url}/${rel}`, { ...VIEW, t: 1, seed: 1 });
    let whole: number;
    try {
      await hideText(h);
      const f = await h.shot();
      whole = highPassStd(luminance(f), f.w, f.h);
    } finally {
      await h.close();
    }
    console.log(`core-fieldnoise\n${r.line}\nwhole-frame high-pass std (light) ${whole.toFixed(5)}`);
    expect(r.status).toBe("pass");
    expect(whole).toBeGreaterThan(threshold("grain.ceiling", null));
  }, 120_000);
});
