// Behaviour tests for the grown (reaction-diffusion) field on test/pages/grown.html: the check list, setTime
// reproducibility across page loads, reduced motion settling to the state at a fixed tick count (at start, after
// `painter.set` re-inits the field, and when switched on mid-run), and the no-float path warning once.
// The tolerances here are test constants, each with its reason.
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CHECKS, gate } from "../../src/checks/gate.ts";
import { closeBrowsers, openPage, type OpenOpts, type PageHandle } from "../../src/checks/harness.ts";
import { meanAbsDiff } from "../../src/checks/image.ts";
import { serveRoot } from "../../src/checks/serve.ts";
import { NO_TEXT } from "../../src/checks/text-contrast.ts";
import { SETTLE_TICKS } from "../../src/engine/fields/reaction-diffusion.ts";

type Sheet = { w: number; h: number; height: number[] };

const W = 960;
const H = 600;
// A modest t: each 1/60 s tick is 12 simulation steps, and a frozen open replays every tick from the seed.
const T = 2;
const FROZEN: OpenOpts = { dpr: 1, width: W, height: H, t: T };
// Settled is the state after SETTLE_TICKS fixed ticks, so a frozen page at that t is the same state.
const SETTLE_T = SETTLE_TICKS / 60;
// The gate opens many frozen pages, and each replays every tick to t 2 from the seed (about 4 to 5 s in headless
// software WebGL): it measured 60 s here, at vitest's default limit, so it gets three times that.
const GATE_TIMEOUT = 120_000;
// The re-init test runs six settle-length replays (two reduced opens settle at start and again after set, plus two
// frozen opens at the settle time): 48 to 52 s at load average 10 to 14 on the merge and on both branches before it,
// next to vitest's 60 s default, so it gets twice that.
const REINIT_TIMEOUT = 120_000;

let server: { url: string; close(): Promise<void> };
const url = () => `${server.url}/test/pages/grown.html`;
const ROOT = path.resolve(import.meta.dirname, "../..");

beforeAll(async () => {
  server = await serveRoot(ROOT);
});

afterAll(async () => {
  await server?.close();
  await closeBrowsers();
});

async function withPage<T>(opts: OpenOpts, fn: (h: PageHandle) => Promise<T>, query = ""): Promise<T> {
  const h = await openPage(url() + query, opts);
  try {
    return await fn(h);
  } finally {
    await h.close();
  }
}

const twoFrames = "new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))";
const sheet = (h: PageHandle) => h.hook<Sheet>("__paint.sheet()");
const maxAbs = (a: number[], b: number[]) => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i]!)), 0);
const range = (a: number[]) => Math.max(...a) - Math.min(...a);
const motion = (h: PageHandle) => h.hook<string>("__paint.motion()");
const frames = (h: PageHandle) => h.hook<{ frames: number }>("__paint.stats()").then((s) => s.frames);
/** The frozen sheet at `seed` and `t`, once per pair: each open replays every tick from the seed. */
const frozenCache = new Map<string, Promise<number[]>>();
const frozenAt = (seed: number, t: number) => {
  const k = `${seed}@${t}`;
  if (!frozenCache.has(k)) frozenCache.set(k, withPage({ ...FROZEN, seed, t }, async (h) => (await sheet(h)).height));
  return frozenCache.get(k)!;
};
// Hides EXT_color_buffer_float from every WebGL2 context, as on a device without float render targets.
const HIDE_FLOAT = `(() => {
  const get = WebGL2RenderingContext.prototype.getExtension;
  WebGL2RenderingContext.prototype.getExtension = function (name) { return name === "EXT_color_buffer_float" ? null : get.call(this, name); };
})()`;

// A fake requestAnimationFrame with a fixed frame length, which stops after a set number of frames (and sets
// `__framesLeft` to 0). The live loop's first frame is always one STEP, so `frames` live frames of `ms` reach
// t = 1/60 + (frames - 1) x ms / 1000.
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

describe("grown page", () => {
  // Task 2e: one gate of this page ran 112 s alone, so the checks run in three groups, each a test of its own. The
  // checks do not read each other, so together the groups assert what the one gate asserted.
  const page = path.join(ROOT, "test/pages/grown.html");
  const groupGate = (names: string[]) => gate(page, { baseUrl: server.url }, CHECKS.filter((c) => names.includes(c.name)));
  const expectPass = (r: Awaited<ReturnType<typeof groupGate>>, names: string[]) => {
    console.log(r.lines.join("\n"));
    const status = Object.fromEntries(r.results.map((c) => [c.name, c.status]));
    expect(Object.fromEntries(names.map((n) => [n, status[n]]))).toEqual(Object.fromEntries(names.map((n) => [n, "pass"])));
  };

  // banding-grain passes whole: the grain half reads the finish's own grain (frame at the declared grain minus
  // frame at grain 0), 0.0077 light / 0.0105 dark at depth 18 (range 0.005 to 0.016).
  it("grown passes relight", async () => {
    expectPass(await groupGate(["relight"]), ["relight"]);
  }, GATE_TIMEOUT);

  it("grown passes detail", async () => {
    expectPass(await groupGate(["detail"]), ["detail"]);
  }, GATE_TIMEOUT);

  it("grown passes render, palette, banding-grain, still, hygiene, and text-contrast is skipped", async () => {
    const names = ["render", "palette", "banding-grain", "still", "hygiene"];
    const r = await groupGate([...names, "text-contrast"]);
    expectPass(r, names);
    // text-contrast is not in the pass list: the page has no text.
    // check-fix (f): the gate skips it, with the spec's reason, instead of running the range floor (before: dark
    // range 0.0586 under the floor, a fail on a check the spec says does not apply).
    const tc = r.results.find((c) => c.name === "text-contrast")!;
    expect(tc.status).toBe("skip");
    expect(tc.line).toBe(`text-contrast: ${NO_TEXT}`);
  }, GATE_TIMEOUT);

  it("setTime gives identical pixels on two page loads at the same seed and t", async () => {
    const load = (seed: number, t: number, name?: string) =>
      withPage({ ...FROZEN, seed, t }, async (h) => {
        const shot = await h.shot(name);
        const s = await sheet(h);
        expect(h.errors).toEqual([]);
        return { shot, height: s.height };
      });
    const started = Date.now();
    const a = await load(2, T, "grown-repro-a");
    const frozenMs = Date.now() - started;
    const b = await load(2, T, "grown-repro-b");
    const later = await load(2, T + 0.5);
    const other = await load(3, T);
    const pixels = meanAbsDiff(a.shot, b.shot);
    console.log(
      `grown seed 2 t ${T}: frozen open ${frozenMs} ms; two loads differ by ${pixels} (pixels), ${maxAbs(a.height, b.height)} (height); ` +
        `height range ${range(a.height).toFixed(5)}; t ${T + 0.5} differs by ${meanAbsDiff(a.shot, later.shot).toFixed(5)}; seed 3 by ${meanAbsDiff(a.shot, other.shot).toFixed(5)}`,
    );
    expect(pixels).toBe(0);
    expect(maxAbs(a.height, b.height)).toBe(0);
    // Not trivially equal: the field grows with t and differs by seed.
    expect(meanAbsDiff(a.shot, later.shot)).toBeGreaterThan(0);
    expect(meanAbsDiff(a.shot, other.shot)).toBeGreaterThan(0);
  });

  it("live frames of 1/30 s and 1/120 s reach the same field state at the same time", async () => {
    // With fakeRaf, 61 frames of 1/30 s (60 at that length) and 241 of 1/120 s (240) both reach
    // 2 + 1/60 s, which is 121 fixed ticks.
    const liveHeights = (ms: number, frames: number) =>
      withPage({ dpr: 1, width: W, height: H, seed: 1, initScript: fakeRaf(ms, frames) }, async (h) => {
        await h.page.waitForFunction("globalThis.__framesLeft === 0", undefined, { timeout: 60_000 });
        const s = await sheet(h);
        expect(h.errors).toEqual([]);
        return s.height;
      });
    const coarse = await liveHeights(1000 / 30, 61);
    const fine = await liveHeights(1000 / 120, 241);
    const frozen = await withPage({ ...FROZEN, seed: 1, t: 121 / 60 }, async (h) => (await sheet(h)).height);
    console.log(`grown ticks: 1/30 vs 1/120 frames differ by ${maxAbs(coarse, fine)} (height); vs frozen 121 ticks ${maxAbs(coarse, frozen)}; range ${range(coarse).toFixed(5)}`);
    expect(range(coarse)).toBeGreaterThan(0);
    expect(maxAbs(coarse, fine)).toBe(0);
    expect(maxAbs(coarse, frozen)).toBe(0);
  });

  it("reduced motion settles to the state after the fixed tick count", async () => {
    const live = await withPage({ dpr: 1, width: W, height: H, seed: 1, reduced: true }, async (h) => {
      await h.hook(twoFrames);
      await h.hook(twoFrames);
      const motion = await h.hook<string>("__paint.motion()");
      const s = await sheet(h);
      await h.shot("grown-reduced");
      expect(h.errors).toEqual([]);
      return { motion, height: s.height };
    });
    const frozen = await withPage({ ...FROZEN, seed: 1, t: SETTLE_T }, async (h) => (await sheet(h)).height);
    console.log(`grown reduced: motion ${live.motion}; settled sheet vs frozen t ${SETTLE_T} differs by ${maxAbs(live.height, frozen)} (height)`);
    expect(live.motion).toBe("still");
    expect(maxAbs(live.height, frozen)).toBe(0);
  });

  it("reduced motion settles again after painter.set re-inits the field (new seed, new fields)", async () => {
    const reduced: OpenOpts = { dpr: 1, width: W, height: H, seed: 1, reduced: true };
    const after = (change: string) =>
      withPage(reduced, async (h) => {
        await h.hook(change);
        await h.hook(twoFrames);
        await h.hook(twoFrames);
        const m = await motion(h);
        const s = await sheet(h);
        expect(h.errors).toEqual([]);
        return { motion: m, height: s.height };
      });
    const reseeded = await after("painter.set({ seed: 2 })");
    // The same field again, from the page's own engine module (the import map resolves "paint-kit" here too).
    const refielded = await after(`import("paint-kit").then((m) => { painter.set({ fields: [m.fields.reactionDiffusion()] }); })`);
    const seed2 = await frozenAt(2, SETTLE_T);
    const seed1 = await frozenAt(1, SETTLE_T);
    console.log(
      `grown reduced re-init: set seed 2 -> motion ${reseeded.motion}, vs frozen seed 2 t ${SETTLE_T} differs by ${maxAbs(reseeded.height, seed2)} (height); ` +
        `set fields -> motion ${refielded.motion}, vs frozen seed 1 differs by ${maxAbs(refielded.height, seed1)}`,
    );
    expect(reseeded.motion).toBe("still");
    expect(refielded.motion).toBe("still");
    expect(maxAbs(reseeded.height, seed2)).toBe(0);
    expect(maxAbs(refielded.height, seed1)).toBe(0);
  }, REINIT_TIMEOUT);

  it("setTime forward on a frozen page steps on from where it is, to the frame a fresh replay gives", async () => {
    // The flash check walks a frozen page frame by frame; each forward setTime steps on, not from the seed again.
    const stepped = await withPage({ ...FROZEN, seed: 1, t: 0.5 }, async (h) => {
      for (const t of [0.5, 1, 1 + 1 / 60, 1.5, T]) await h.hook(`__paint.setTime(${t})`);
      const s = await sheet(h);
      expect(h.errors).toEqual([]);
      return s.height;
    });
    const replayed = await frozenAt(1, T);
    console.log(`grown forward setTime: stepped 0.5 -> ${T} vs frozen open at ${T} differs by ${maxAbs(stepped, replayed)} (height); range ${range(replayed).toFixed(5)}`);
    expect(range(replayed)).toBeGreaterThan(0);
    expect(maxAbs(stepped, replayed)).toBe(0);
  });

  it("reduced motion switched on mid-run settles at once; switched off, the page runs live again", async () => {
    const run = await withPage({ dpr: 1, width: W, height: H, seed: 1 }, async (h) => {
      await h.hook(twoFrames);
      const before = await motion(h);
      // Switched on early (well inside the 5 s settle time), so the page rests at the settle time itself.
      // This also guards reading reduced motion once: the engine used to read `matches` each live frame, and
      // Chromium then sends no change event, but only on a page with a stylesheet media query. grown.html's
      // `@media (prefers-color-scheme: dark)` block is that query; without it this test would not see the bug.
      await h.page.emulateMedia({ reducedMotion: "reduce" });
      await h.hook(twoFrames);
      const on = await motion(h);
      const height = (await sheet(h)).height;
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
    const settled = await frozenAt(1, SETTLE_T);
    console.log(
      `grown reduced mid-run: motion ${run.before} -> ${run.on} (reduced on) -> ${run.off} (off); frames ${run.f0} -> ${run.f1} still, ${run.f2} live; ` +
        `vs frozen t ${SETTLE_T} differs by ${maxAbs(run.height, settled)} (height)`,
    );
    expect(run.before).toBe("live");
    expect(run.on).toBe("still");
    expect(run.f1).toBe(run.f0);
    expect(maxAbs(run.height, settled)).toBe(0);
    expect(run.off).toBe("live");
    expect(run.f2).toBeGreaterThan(run.f1);
  });

  it("reduced motion switched on after the settle time stops where the page is, with no replay", async () => {
    // 321 fake live frames of 1/30 s reach t = 1/60 + 320/30 s, which is 641 fixed ticks, past the 300-tick settle.
    const TICKS = 641;
    const run = await withPage({ dpr: 1, width: W, height: H, seed: 1, initScript: fakeRaf(1000 / 30, 321) }, async (h) => {
      await h.page.waitForFunction("globalThis.__framesLeft === 0", undefined, { timeout: 120_000 });
      const before = await frames(h);
      const was = await motion(h);
      // The fake clock has stopped firing, so wait on real time, not on requestAnimationFrame.
      const started = Date.now();
      await h.page.emulateMedia({ reducedMotion: "reduce" });
      await h.page.waitForFunction('__paint.motion() === "still"', undefined, { polling: 50, timeout: 120_000 });
      const ms = Date.now() - started;
      const after = await frames(h);
      const height = (await sheet(h)).height;
      expect(h.errors).toEqual([]);
      return { before, after, was, ms, height };
    });
    const frozen = await frozenAt(1, TICKS / 60);
    console.log(
      `grown reduced late: motion ${run.was} -> still after ${run.ms} ms; frames ${run.before} -> ${run.after} (a replay draws 1); ` +
        `vs frozen ${TICKS} ticks differs by ${maxAbs(run.height, frozen)} (height)`,
    );
    // A stop draws nothing; a replay from tick 0 would draw one frame (and run every tick again).
    expect(run.after).toBe(run.before);
    expect(maxAbs(run.height, frozen)).toBe(0);
  });

  it("without float render targets the page warns once, however often it replays, and ?nofloat=1 reaches the field", async () => {
    // A small t: with no float targets the field steps nothing, so each replay is cheap.
    const noFloat = (opts: OpenOpts, query = "") =>
      withPage(
        { ...FROZEN, t: 0.5, ...opts },
        async (h) => {
          await h.hook("__paint.setTime(1)");
          await h.hook("__paint.setTime(0.25)");
          await h.hook("__paint.setDetail(0.3)");
          const s = await sheet(h);
          expect(h.errors).toEqual([]);
          return { warnings: h.warnings, height: s.height };
        },
        query,
      );
    const hidden = await noFloat({ initScript: HIDE_FLOAT });
    const forced = await noFloat({}, "?nofloat=1");
    console.log(
      `grown no float: extension hidden -> ${JSON.stringify(hidden.warnings)}; ?nofloat=1 -> ${forced.warnings.length} warning(s); ` +
        `?nofloat=1 sheet vs hidden-extension sheet differs by ${maxAbs(forced.height, hidden.height)} (height)`,
    );
    for (const r of [hidden, forced]) {
      expect(r.warnings).toHaveLength(1);
      expect(r.warnings[0]).toMatch(/float/i);
      // The page runs a grown field, so the one warning says it draws nothing.
      expect(r.warnings[0]).toMatch(/grown fields draw nothing/);
    }
    // ?nofloat=1 reaches the field: the page draws what a device without the extension draws (the field draws nothing).
    expect(maxAbs(forced.height, hidden.height)).toBe(0);
  });

  it.each([1, 2, 3])("grown frame at seed %i, light", async (seed) => {
    await withPage({ ...FROZEN, seed }, async (h) => {
      await h.shot(`grown-${seed}`);
      expect(h.errors).toEqual([]);
    });
  });

  it("grown frame at seed 1, dark", async () => {
    await withPage({ ...FROZEN, seed: 1, dark: true }, async (h) => {
      await h.shot("grown-1-dark");
      expect(h.errors).toEqual([]);
    });
  });
});
