// Bar 10's gate: every check that applies passes at the bar's seeds; the pointer tilts the card and a leave eases it
// back, and it turns the key toward the pointer (the job both). Run alone:
// npx vitest run -c vitest.pages.config.ts bars/10-foil-card/gate.test.ts
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { CHECKS, gate } from "../../src/checks/gate.ts";
import { closeBrowsers, openPage, type PageHandle } from "../../src/checks/harness.ts";
import { serveRoot } from "../../src/checks/serve.ts";

afterAll(async () => {
  await closeBrowsers();
});

const ROOT = path.resolve(import.meta.dirname, "../..");
// The page's tilt (index.html TILT): max 8 degrees (the owner, look review), eased with tau 0.1 s.
const MAX = 8;

async function withPage(query: string, fn: (h: PageHandle) => Promise<void>, initScript?: string) {
  const server = await serveRoot(ROOT);
  try {
    const h = await openPage(`${server.url}/bars/10-foil-card/${query}`, { width: 960, height: 600, dpr: 1, ...(initScript ? { initScript } : {}) });
    try {
      await fn(h);
    } finally {
      await h.close();
    }
  } finally {
    await server.close();
  }
}

/** Tips the card fully right, fires `leave` in the page, then reads the tilt about the vertical axis once per frame. */
async function leaveTrace(h: PageHandle, leave: string): Promise<{ before: number; trace: number[] }> {
  await h.page.mouse.move(959, 300, { steps: 4 });
  await h.page.waitForFunction(`window.__paint.tilt()[0] > ${0.95 * MAX}`, undefined, { timeout: 20_000 });
  const before = (await h.hook<[number, number]>("__paint.tilt()"))[0];
  const trace = await h.hook<number[]>(`new Promise((done) => {
    ${leave};
    const out = [];
    const step = () => { out.push(window.__paint.tilt()[0]); out.length < 40 ? requestAnimationFrame(step) : done(out); };
    requestAnimationFrame(step);
  })`);
  return { before, trace };
}

/** An eased return: the first frame after the leave still holds most of the tilt, it never rises, and it falls toward 0. */
function expectEased(r: { before: number; trace: number[] }, what: string) {
  console.log(`${what}: before ${r.before.toFixed(2)}, after ${r.trace.slice(0, 8).map((v) => v.toFixed(2)).join(", ")} ... ${r.trace.at(-1)!.toFixed(2)}`);
  expect(r.trace[0]!, `${what}: the tilt snapped to rest`).toBeGreaterThan(0.5 * r.before);
  for (let i = 1; i < r.trace.length; i++) expect(r.trace[i]!, `${what}: the tilt rose after the leave`).toBeLessThanOrEqual(r.trace[i - 1]! + 1e-9);
  expect(r.trace.at(-1)!, `${what}: the tilt did not ease toward rest`).toBeLessThan(0.25 * r.before);
}

describe("10-foil-card", () => {
  // Nine checks at three seeds in a software-WebGL browser: minutes, not seconds. One test per seed and check group
  // (bar 07's split), so each stays under the 120 s every page test must keep. The checks do not read each other, so
  // the three tests of a seed together assert what one gate at that seed asserts: every check that applies passes.
  const GROUPS: [string, (n: string) => boolean][] = [
    ["relight", (n) => n === "relight"],
    ["detail", (n) => n === "detail"],
    ["the other seven checks", (n) => n !== "relight" && n !== "detail"],
  ];
  for (const seed of [1, 2, 3])
    for (const [label, pick] of GROUPS)
      it(`10-foil-card ${label} pass at seed ${seed}`, async () => {
        const r = await gate(path.resolve(import.meta.dirname), { seeds: [seed] }, CHECKS.filter((c) => pick(c.name)));
        console.log(r.lines.join("\n"));
        expect(r.verdict, r.lines.join("\n")).toBe("passed");
      });

  // Review Focus 3 through the window paths a full-viewport canvas uses: the pointer cannot move off the canvas while
  // inside the page, so the leave comes from the root's pointerleave or the window's blur. Either eases the tilt back.
  it("the pointer tilts the card; a pointerleave on the root or a window blur eases it back to rest", async () => {
    await withPage("", async (h) => {
      expect(await h.hook("__paint.tiltOptions()")).toEqual({ max: MAX, drive: "pointer" });
      expectEased(await leaveTrace(h, `document.documentElement.dispatchEvent(new PointerEvent("pointerleave"))`), "pointerleave");
      expectEased(await leaveTrace(h, `window.dispatchEvent(new Event("blur"))`), "blur");
      expect(h.errors).toEqual([]);
    });
  });

  it("the planted fault tilt-leave-snaps (a leave puts the tilt at rest at once) fails the eased return", async () => {
    await withPage(
      "",
      async (h) => {
        const r = await leaveTrace(h, `document.documentElement.dispatchEvent(new PointerEvent("pointerleave"))`);
        console.log(`tilt-leave-snaps: before ${r.before.toFixed(2)}, first frame after ${r.trace[0]!.toFixed(2)}`);
        expect(() => expectEased(r, "pointerleave")).toThrow(/snapped/);
      },
      `globalThis.__PAINT_TEST_FAULT = "tilt-leave-snaps";`,
    );
  });

  // The paint call's job, both (the owner, look review): the pointer tips the card and turns the key toward it at once.
  it("the pointer to the right tilts the card and turns the key toward it", async () => {
    await withPage("", async (h) => {
      const c = await h.hook<{ x: number; y: number }>("window.__card");
      await h.page.mouse.move(c.x + 320, c.y, { steps: 4 });
      await h.page.waitForFunction(`window.__paint.tilt()[0] > ${0.5 * MAX}`, undefined, { timeout: 20_000 });
      await h.page.waitForTimeout(600);
      const dir = await h.hook<number[]>("__paint.lights()[0].props.dir");
      expect(dir[0], "job both: pointer right, the light does not come from the right").toBeGreaterThan(0);
      expect(h.errors).toEqual([]);
    });
  });
});
