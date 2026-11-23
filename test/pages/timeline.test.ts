// Reduced motion on a stateless timeline field that declares a settle time (test/pages/timeline.html): the engine
// draws the frame at the settle time once and rests, with no tick replay (a frame depends on t alone). Also: reduced
// motion switched on mid-run (before and after the settle time) and off again, and the planted fault
// test/faults/timeline-settle-ignored, which reads settle times from stateful fields only. Tolerances are test
// constants, each with its reason.
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeBrowsers, openPage, type OpenOpts, type PageHandle } from "../../src/checks/harness.ts";
import { serveRoot } from "../../src/checks/serve.ts";
import { check as still } from "../../src/checks/still.ts";
import { threshold } from "../../src/checks/threshold.ts";
import { loadBar } from "../../src/bar.ts";

type Sheet = { w: number; h: number; height: number[] };

const W = 960;
const H = 600;
// timeline.html's SETTLE_TICKS: the bump holds at full height from 1 s.
const SETTLE_TICKS = 60;
const SETTLE_T = SETTLE_TICKS / 60;
// A tick replay begins the sheet once per tick (one gl.clear each, more with direction), so it clears at least
// SETTLE_TICKS - 1 times. One settled draw clears a few times (the sheet, each field's layer, the shade pass).
// Half the tick count separates the two with room either way.
const MAX_CLEARS = SETTLE_TICKS / 2;

let server: { url: string; close(): Promise<void> };
const ROOT = path.resolve(import.meta.dirname, "../..");
const PAGE = "test/pages/timeline.html";
const FAULT = "test/faults/timeline-settle-ignored/index.html";

beforeAll(async () => {
  server = await serveRoot(ROOT);
});

afterAll(async () => {
  await server?.close();
  await closeBrowsers();
});

// Counts gl.clear calls from page start, so a test can bound the work a settle does.
const COUNT_CLEARS = `(() => {
  globalThis.__clears = 0;
  const clear = WebGL2RenderingContext.prototype.clear;
  WebGL2RenderingContext.prototype.clear = function (m) { globalThis.__clears++; return clear.call(this, m); };
})()`;

// A fake requestAnimationFrame with a fixed frame length that stops after `frames` frames (as in grown.test.ts).
// The live loop's first frame is one STEP, so `frames` frames of `ms` reach t = 1/60 + (frames - 1) x ms / 1000.
const fakeRaf = (ms: number, frames: number) => `(() => {
    let now = 1000, left = ${frames}, seq = 0, armed = false;
    let queue = [];
    globalThis.__framesLeft = left;
    const fire = () => {
      armed = false;
      if (left <= 0 || !queue.length) return;
      const batch = queue;
      queue = [];
      now += ${ms};
      left--;
      globalThis.__framesLeft = left;
      for (const [, cb] of batch) cb(now);
    };
    window.requestAnimationFrame = (cb) => {
      queue.push([++seq, cb]);
      if (!armed) { armed = true; setTimeout(fire, 0); }
      return seq;
    };
    window.cancelAnimationFrame = (id) => { queue = queue.filter(([i]) => i !== id); };
  })()`;

async function withPage<T>(page: string, opts: OpenOpts, fn: (h: PageHandle) => Promise<T>): Promise<T> {
  const h = await openPage(`${server.url}/${page}`, { dpr: 1, width: W, height: H, seed: 1, ...opts });
  try {
    return await fn(h);
  } finally {
    await h.close();
  }
}

const twoFrames = "new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))";
const sheet = (h: PageHandle) => h.hook<Sheet>("__paint.sheet()").then((s) => s.height);
const motion = (h: PageHandle) => h.hook<string>("__paint.motion()");
const frames = (h: PageHandle) => h.hook<{ frames: number }>("__paint.stats()").then((s) => s.frames);
const clears = (h: PageHandle) => h.hook<number>("globalThis.__clears");
const maxAbs = (a: number[], b: number[]) => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i]!)), 0);
const frozenAt = (t: number) => withPage(PAGE, { t }, sheet);

/** The page opened under reduced motion: its motion, its sheet against the frozen settle frame, and its clears. */
const reducedAtStart = (page: string) =>
  withPage(page, { reduced: true, initScript: COUNT_CLEARS }, async (h) => {
    await h.hook(twoFrames);
    await h.hook(twoFrames);
    const r = { motion: await motion(h), height: await sheet(h), clears: await clears(h), frames: await frames(h) };
    expect(h.errors).toEqual([]);
    return r;
  });

describe("stateless settle time", () => {
  it("reduced motion draws the frame setTime(settle) gives, once, with no tick replay; the planted fault fails", async () => {
    const settled = await frozenAt(SETTLE_T);
    const start = await frozenAt(0);
    const good = await reducedAtStart(PAGE);
    const bad = await reducedAtStart(FAULT);
    console.log(
      `timeline reduced: motion ${good.motion}, frames ${good.frames}, clears ${good.clears} (max ${MAX_CLEARS}); vs frozen t ${SETTLE_T} ` +
        `differs by ${maxAbs(good.height, settled)}; frozen t 0 vs t ${SETTLE_T} differs by ${maxAbs(start, settled)}. ` +
        `fault stateless-settle-ignored: motion ${bad.motion}, vs frozen t ${SETTLE_T} differs by ${maxAbs(bad.height, settled)}`,
    );
    // The settle frame must differ from the first one, or the test could not tell them apart.
    expect(maxAbs(start, settled)).toBeGreaterThan(0.01);
    expect(good.motion).toBe("still");
    expect(maxAbs(good.height, settled)).toBe(0);
    expect(good.frames).toBe(1);
    expect(good.clears).toBeLessThan(MAX_CLEARS);
    // The fault rests on its first live frame, not the settle frame.
    expect(maxAbs(bad.height, settled)).toBeGreaterThan(0.01);
  });

  it("reduced motion switched on mid-run, before the settle time, settles there at once; off, the page runs live", async () => {
    const run = await withPage(PAGE, {}, async (h) => {
      await h.hook(twoFrames);
      const before = await motion(h);
      await h.page.emulateMedia({ reducedMotion: "reduce" });
      await h.hook(twoFrames);
      const on = await motion(h);
      const height = await sheet(h);
      const f0 = await frames(h);
      await h.hook(twoFrames);
      const f1 = await frames(h);
      await h.page.emulateMedia({ reducedMotion: "no-preference" });
      await h.hook(twoFrames);
      await h.hook(twoFrames);
      const off = await motion(h);
      const f2 = await frames(h);
      expect(h.errors).toEqual([]);
      return { before, on, off, height, f0, f1, f2 };
    });
    const settled = await frozenAt(SETTLE_T);
    console.log(
      `timeline reduced mid-run: motion ${run.before} -> ${run.on} -> ${run.off}; frames ${run.f0} -> ${run.f1} still, ${run.f2} live; ` +
        `vs frozen t ${SETTLE_T} differs by ${maxAbs(run.height, settled)}`,
    );
    expect(run.before).toBe("live");
    expect(run.on).toBe("still");
    expect(run.f1).toBe(run.f0);
    expect(maxAbs(run.height, settled)).toBe(0);
    expect(run.off).toBe("live");
    expect(run.f2).toBeGreaterThan(run.f1);
  });

  it("reduced motion switched on after the settle time draws the settle frame once, with no tick replay", async () => {
    // 61 fake live frames of 1/30 s reach t = 1/60 + 60/30 s (2.017 s), past the 1 s settle, while the bump sinks.
    const T_LATE = 1 / 60 + 60 / 30;
    const run = await withPage(PAGE, { initScript: COUNT_CLEARS + ";" + fakeRaf(1000 / 30, 61) }, async (h) => {
      await h.page.waitForFunction("globalThis.__framesLeft === 0", undefined, { timeout: 60_000 });
      const was = await motion(h);
      const late = await sheet(h);
      const f0 = await frames(h);
      const c0 = await clears(h);
      await h.page.emulateMedia({ reducedMotion: "reduce" });
      // The fake clock has stopped firing, so wait on real time, not on requestAnimationFrame.
      await h.page.waitForFunction('__paint.motion() === "still"', undefined, { polling: 50, timeout: 20_000 });
      const height = await sheet(h);
      const r = { was, late, height, frames: (await frames(h)) - f0, clears: (await clears(h)) - c0 };
      expect(h.errors).toEqual([]);
      return r;
    });
    const settled = await frozenAt(SETTLE_T);
    const frozenLate = await frozenAt(T_LATE);
    console.log(
      `timeline reduced late: motion ${run.was} -> still; ${run.frames} frame, ${run.clears} clears (max ${MAX_CLEARS}); ` +
        `live t ${T_LATE.toFixed(3)} vs frozen there ${maxAbs(run.late, frozenLate)}; rested vs frozen t ${SETTLE_T} ${maxAbs(run.height, settled)}`,
    );
    expect(maxAbs(run.late, frozenLate)).toBe(0);
    expect(maxAbs(run.late, settled)).toBeGreaterThan(0.01);
    expect(maxAbs(run.height, settled)).toBe(0);
    expect(run.frames).toBe(1);
    expect(run.clears).toBeLessThan(MAX_CLEARS);
  });
});

// Bar 03 review I1: the still check holds a bar to the settle time its bar.json declares, not to the one the engine
// under test reports. test/faults/halftone-settle-tick-off is bar 03 with engine fault 'settle-tick-off': the engine
// reports and rests on 44 ticks (0.733 s), agreeing with itself, while bar.json declares 0.75 s.
describe("still holds a bar to its declared settle time", () => {
  const target = (dir: string) => ({ url: `${server.url}/${dir}/index.html`, bar: loadBar(path.join(ROOT, dir)), control: false });

  it("bar 03 rests where bar.json says; the one-tick-early engine fault fails still", async () => {
    const good = await still(target("bars/03-halftone-resolve"), { seed: 1 });
    const bad = await still(target("test/faults/halftone-settle-tick-off"), { seed: 1 });
    console.log(`bar 03: ${good.status} ${good.line}\nhalftone-settle-tick-off: ${bad.status} ${bad.line}`);
    expect(good.status).toBe("pass");
    expect(good.measured.settle).toBe(0.75);
    expect(good.measured.heldDiff).toBe(0);
    expect(bad.status).toBe("fail");
    // Both halves see it: the reported time is not the declared one, and the rested frame is not the frame there.
    expect(bad.line).toMatch(/the engine settles at 0\.733 s, but bar\.json declares 0\.750 s/);
    expect(bad.measured.heldDiff).toBeGreaterThan(threshold("still.heldDiff", null));
  }, 120_000);

  it("the stateless-settle-ignored engine fault fails still: the engine reports no settle time, bar.json declares 1 s", async () => {
    const bad = await still(target("test/faults/timeline-settle-ignored"), { seed: 1 });
    console.log(`timeline-settle-ignored: ${bad.status} ${bad.line}`);
    expect(bad.status).toBe("fail");
    expect(bad.line).toMatch(/the engine settles at 0\.000 s, but bar\.json declares 1\.000 s/);
  }, 120_000);
});
