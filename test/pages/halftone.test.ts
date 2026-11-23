// Behaviour tests for the halftone (points) field on test/pages/halftone.html, driven through `window.__paint` and
// frozen at a fixed t and seed. The tolerances here are test constants, each with its reason.
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { gate } from "../../src/checks/gate.ts";
import { closeBrowsers, openPage, type OpenOpts, type PageHandle, type Rgba } from "../../src/checks/harness.ts";
import { serveRoot } from "../../src/checks/serve.ts";
import { meanAbsDiff } from "../../src/checks/image.ts";
import { NO_TEXT } from "../../src/checks/text-contrast.ts";
import { threshold } from "../../src/checks/threshold.ts";
import { MIN_CELL } from "../../src/engine/fields/halftone.ts";

type SheetSample = { height: number[]; coverage: number[]; ink: number[]; slot: number[] };

const W = 960;
const H = 600;
// dpr 1, sheetScale 1: one sheet pixel is one CSS pixel, so a 400 x 400 region is 400 x 400 sheet pixels.
const FROZEN: OpenOpts = { dpr: 1, width: W, height: H, t: 2, seed: 1 };
// The patch the dots are counted in: 400 x 400 px, centred on the page.
const PATCH = { x: (W - 400) / 2, y: (H - 400) / 2, w: 400, h: 400 };
// A pixel is part of a dot when its ink is at least half: the dot's anti-aliased edge sits at 0.5.
const INK_ON = 0.5;
// The page's coarse cell (halftone.html CELL) and the fine one, half of it.
const COARSE = 16;
const FINE = 8;
// Halving the cell puts four cells where one was. Dots cut by the patch edge, and the palest dots that fall under
// INK_ON at the finer cell, move the ratio off 4, so the brief allows 3 to 5.
const RATIO = [3, 5] as const;
// Blob counting needs dots that never touch. A dot's area is tone * grow * cell^2, so at tone 1 its radius reaches
// half the cell (pi r^2 = pi / 4 cell^2) when grow is pi / 4 (about 0.785): past that, neighbouring dots join into
// one 4-connected blob and the count ratio means nothing. The page's grow is pinned under it.
const MAX_GROW = Math.PI / 4;

let server: { url: string; close(): Promise<void> };
const url = () => `${server.url}/test/pages/halftone.html`;
const ROOT = path.resolve(import.meta.dirname, "../..");

beforeAll(async () => {
  server = await serveRoot(ROOT);
});

afterAll(async () => {
  await server?.close();
  await closeBrowsers();
});

async function withPage(opts: OpenOpts, fn: (h: PageHandle) => Promise<void>) {
  const h = await openPage(url(), opts);
  try {
    await fn(h);
  } finally {
    await h.close();
  }
}

const twoFrames = "new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))";

/** Ink blobs (4-connected runs of ink >= INK_ON) in a w x h image, rows top to bottom. */
function countBlobs(ink: number[], w: number, h: number): number {
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  let n = 0;
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || (ink[i] ?? 0) < INK_ON) continue;
    n++;
    seen[i] = 1;
    stack.push(i);
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % w;
      const y = (p - x) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (seen[q] || (ink[q] ?? 0) < INK_ON) continue;
        seen[q] = 1;
        stack.push(q);
      }
    }
  }
  return n;
}

describe("halftone page", () => {
  it("halftone passes render, palette, banding-grain, still", async () => {
    const r = await gate(path.join(ROOT, "test/pages/halftone.html"), { baseUrl: server.url });
    console.log(r.lines.join("\n"));
    const status = Object.fromEntries(r.results.map((c) => [c.name, c.status]));
    expect({ render: status.render, palette: status.palette, still: status.still }).toEqual({ render: "pass", palette: "pass", still: "pass" });
    // banding-grain, by halves. Banding: no quantised run over the limit in either scheme.
    const bg = r.results.find((c) => c.name === "banding-grain")!.measured;
    for (const scheme of ["light", "dark"]) expect(bg[`run.${scheme}`]!).toBeLessThanOrEqual(threshold("banding.maxRun", null));
    // The banding half reads a real share of smooth slope (the graded ground between dots), so "no run" is measured.
    for (const scheme of ["light", "dark"]) expect(bg[`share.${scheme}`]!).toBeGreaterThan(0);
    // Grain: the finish's own grain (frame at the declared grain minus frame at grain 0), so the dots, which are
    // high-frequency picture, cancel. Before check-fix (a) the whole frame was read (0.090 light / 0.086 dark).
    expect(status["banding-grain"]).toBe("pass");
    // check-fix (f): the page has no text, so text-contrast does not apply (before: the range floor read the
    // ink-off frame, the picture turned off with the ink, and it failed 0.041 light / 0.036 dark).
    expect(status["text-contrast"]).toBe("skip");
    expect(r.results.find((c) => c.name === "text-contrast")!.line).toBe(`text-contrast: ${NO_TEXT}`);
  });

  it("cell change changes dot count", async () => {
    await withPage(FROZEN, async (h) => {
      const count = async () => {
        const s = await h.hook<SheetSample>(`__paint.sheetRegion(${PATCH.x}, ${PATCH.y}, ${PATCH.w}, ${PATCH.h})`);
        return countBlobs(s.ink, PATCH.w, PATCH.h);
      };
      expect(await h.hook<number>("window.halftoneNow().grow")).toBeLessThan(MAX_GROW);
      await h.hook(`window.setHalftone({ cell: ${COARSE} })`);
      await h.hook(twoFrames);
      const coarse = await count();
      await h.shot("halftone-cell16");
      await h.hook(`window.setHalftone({ cell: ${FINE} })`);
      await h.hook(twoFrames);
      const fine = await count();
      await h.shot("halftone-cell8");
      console.log(`halftone dots in 400 x 400: cell ${COARSE} -> ${coarse}, cell ${FINE} -> ${fine}, ratio ${(fine / coarse).toFixed(2)}`);
      expect(coarse).toBeGreaterThan(0);
      expect(fine / coarse).toBeGreaterThanOrEqual(RATIO[0]);
      expect(fine / coarse).toBeLessThanOrEqual(RATIO[1]);
      expect(h.errors).toEqual([]);
    });
  });

  // The cell-minimum tests open a small view: the instance count is n^2 with n = sheet diagonal / cell + 2, so the
  // cost scales with the area (review of fix round 1: 1.38 s at 240 x 150 against 17.27 s at 960 x 600, same
  // equalities). The 64 x 64 region sits at the small view's centre.
  const SMALL: OpenOpts = { ...FROZEN, width: 240, height: 150 };
  const SMALL_PATCH = { x: (240 - 64) / 2, y: (150 - 64) / 2 };

  it("a cell under the minimum draws as the minimum", async () => {
    await withPage(SMALL, async (h) => {
      const ink = async (cell: number) => {
        await h.hook(`window.setHalftone({ cell: ${cell} })`);
        await h.hook(twoFrames);
        return (await h.hook<SheetSample>(`__paint.sheetRegion(${SMALL_PATCH.x}, ${SMALL_PATCH.y}, 64, 64)`)).ink;
      };
      // MIN_CELL (1 CSS px) bounds the instance count at n^2, n = sheet diagonal / cell + 2 (about 81,000 at
      // 240 x 150; about 1.3 million at 960 x 600). A smaller cell, or 0, would ask for more (or infinitely many) dots.
      const atMin = await ink(MIN_CELL);
      expect(atMin.some((v) => v > 0)).toBe(true);
      expect(await ink(MIN_CELL / 4)).toEqual(atMin);
      expect(await ink(0)).toEqual(atMin);
      // A cell that is not a number draws as the minimum too (Math.max(1, NaN) is NaN: no dots at all).
      expect(await ink(Number.NaN)).toEqual(atMin);
      expect(h.errors).toEqual([]);
    });
  }, 120_000);

  it("a cell never falls under one sheet pixel", async () => {
    await withPage(SMALL, async (h) => {
      // At sheetScale 0.5 one CSS px is half a sheet px, so cell 1 would be a half-pixel cell; it draws as one sheet
      // px, which is cell 2 at this scale.
      await h.hook("window.painter.set({ sheetScale: 0.5 })");
      const ink = async (cell: number) => {
        await h.hook(`window.setHalftone({ cell: ${cell} })`);
        await h.hook(twoFrames);
        return (await h.hook<SheetSample>(`__paint.sheetRegion(${SMALL_PATCH.x}, ${SMALL_PATCH.y}, 64, 64)`)).ink;
      };
      const two = await ink(2);
      expect(two.some((v) => v > 0)).toBe(true);
      expect(await ink(MIN_CELL)).toEqual(two);
      expect(h.errors).toEqual([]);
    });
  }, 120_000);

  // Check-fix (b) round 3, fix round 1 (I1): the picture function source is called again when the palette changes,
  // so the frame after a token swap is the frame a fresh re-run with the new tokens draws. The re-run is
  // setHalftone at the same values, which makes the fields again (and so calls the source again).
  // Tolerance: one 8-bit level per channel. Both frames are drawn by the same code from the same inputs at a frozen
  // t (the reviewer's control, a re-init twice over, moved 0.0000), so they should match exactly; one level allows
  // only the screenshot's 8-bit rounding of the float sheet, far under the stale picture's measured gap (mean 0.1047).
  const SAME_LEVEL = 1;
  // The far accent the review measured with: a near-white accent pales the picture's graded ground.
  const FAR_ACCENT = "oklch(0.97 0.01 30)";
  const frameGap = (a: { data: Uint8ClampedArray }, b: { data: Uint8ClampedArray }) => {
    let sum = 0;
    let max = 0;
    let n = 0;
    for (let i = 0; i < a.data.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const d = Math.abs(a.data[i + c]! - b.data[i + c]!);
        sum += d;
        if (d > max) max = d;
        n++;
      }
    }
    return { mean: sum / n / 255, max };
  };
  /** On the page at `file`: the frame before a swap, after it, and after a re-run with the swapped tokens. */
  async function swapAgainstRerun(file: string, swap: string) {
    const h = await openPage(`${server.url}/${file}`, { ...FROZEN, t: 1 });
    try {
      const before = await h.shot();
      await h.hook(swap);
      await h.hook(twoFrames);
      const swapped = await h.shot();
      await h.hook("window.setHalftone({})");
      await h.hook(twoFrames);
      const rerun = await h.shot();
      expect(h.errors).toEqual([]);
      return { moved: frameGap(before, rerun), gap: frameGap(swapped, rerun) };
    } finally {
      await h.close();
    }
  }
  const swapToken = `__paint.setPalette({ "--accent": "${FAR_ACCENT}" })`;
  // painter.set({ palette }) with a new source that reads a second accent token, set first: the old source does not
  // read it, so its watcher stays silent and only set() can bring the change.
  const swapSource = `(async () => {
    const { fromPage } = await import("paint-kit");
    document.documentElement.style.setProperty("--accent-far", "${FAR_ACCENT}");
    window.painter.set({ palette: fromPage({ ground: "--ground", ink: "--ink", accents: ["--accent-far"] }) });
  })()`;

  it("after a palette swap the picture source runs again: the frame equals a fresh re-run's", async () => {
    for (const [how, swap] of [["token swap", swapToken], ["painter.set({ palette })", swapSource]] as const) {
      const r = await swapAgainstRerun("test/pages/halftone.html", swap);
      console.log(`halftone ${how}: re-run moved the frame by mean ${r.moved.mean.toFixed(4)}; swap vs re-run mean ${r.gap.mean.toFixed(4)}, max ${r.gap.max} levels`);
      // The swap is real: the re-run with the far accent is a different picture.
      expect(r.moved.mean).toBeGreaterThan(0.01);
      expect(r.gap.max).toBeLessThanOrEqual(SAME_LEVEL);
    }
  }, 120_000);

  it("a planted fault that skips the picture's re-upload keeps the old tone after a swap", async () => {
    // test/faults/halftone-stale-picture: engine fault 'stale-picture', the palette hook is not called.
    const r = await swapAgainstRerun("test/faults/halftone-stale-picture/index.html", swapToken);
    console.log(`halftone-stale-picture: swap vs re-run mean ${r.gap.mean.toFixed(4)}, max ${r.gap.max} levels`);
    expect(r.gap.max).toBeGreaterThan(SAME_LEVEL);
  }, 120_000);

  // Bar 03 review I3: a picture that arrives (cell steps coarse to fine, dots grow) changes `cell` and `grow` each
  // frame through uniforms, as functions of t. Across a whole arrival no program compiles and no texture uploads:
  // the picture is uploaded at init (and on a palette change) only. The test counts the GL calls themselves
  // (compileShader, texImage2D, texSubImage2D), because stats().compiles counts the shade pass alone.
  const COUNT_GL = `(() => {
    globalThis.__gl = { compiles: 0, uploads: 0 };
    const P = WebGL2RenderingContext.prototype;
    const wrap = (name, key) => { const f = P[name]; P[name] = function (...a) { globalThis.__gl[key]++; return f.apply(this, a); }; };
    wrap("compileShader", "compiles");
    wrap("texImage2D", "uploads");
    wrap("texSubImage2D", "uploads");
  })()`;
  const STEP = 1 / 60;
  type Work = { compiles: number; uploads: number; shadeCompiles: number; frames: number; moved: number };
  /** Opens `page` frozen at `from`, then sets t through each window in 1/60 s steps: the GL work done meanwhile. */
  async function arrivalWork(page: string, from: number, windows: [number, number][]): Promise<Work> {
    const h = await openPage(`${server.url}/${page}`, { dpr: 1, width: W, height: H, seed: 1, t: from, initScript: COUNT_GL });
    try {
      const gl = () => h.hook<{ compiles: number; uploads: number }>("({ ...globalThis.__gl })");
      const stats = () => h.hook<{ compiles: number }>("__paint.stats()");
      const g0 = await gl();
      const s0 = await stats();
      let frames = 0;
      let moved = 0;
      for (const [a, b] of windows) {
        await h.hook(`__paint.setTime(${a})`);
        const first = await h.shot();
        for (let t = a + STEP; t <= b + 1e-9; t += STEP, frames++) await h.hook(`__paint.setTime(${t})`);
        moved = Math.max(moved, meanAbsDiff(first, await h.shot()));
        frames++;
      }
      const g1 = await gl();
      const s1 = await stats();
      expect(h.errors).toEqual([]);
      return { compiles: g1.compiles - g0.compiles, uploads: g1.uploads - g0.uploads, shadeCompiles: s1.compiles - s0.compiles, frames, moved };
    } finally {
      await h.close();
    }
  }
  const workLine = (w: Work) => `${w.frames} frames: ${w.compiles} shader compiles, ${w.uploads} texture uploads, shade compiles +${w.shadeCompiles}; the frame moved by ${w.moved.toFixed(4)}`;

  it("bar 03's arrivals change cell and grow with no shader compile and no texture upload", async () => {
    // TIMELINE in bars/03-halftone-resolve: the first picture steps coarse to fine from 0.35 s and is full at
    // 0.75 s; the second arrives pale at 2.0 s and darkens within 0.2 s. Opened at 0.34 s, before the first dots.
    const w = await arrivalWork("bars/03-halftone-resolve/index.html", 0.34, [[0.35, 0.75], [2.0, 2.2]]);
    console.log(`bar 03 arrivals: ${workLine(w)}`);
    // The arrival is real: the frame changes across each window (else no work would be needed anyway).
    expect(w.moved).toBeGreaterThan(0.005);
    expect(w.compiles).toBe(0);
    expect(w.uploads).toBe(0);
    expect(w.shadeCompiles).toBe(0);
    // Deterministic: a fresh frozen open at a mid-arrival t prints what stepping there printed.
    const mid = 0.55;
    const stepped = await openPage(`${server.url}/bars/03-halftone-resolve/index.html`, { dpr: 1, width: W, height: H, seed: 1, t: 0.34 });
    const fresh = await openPage(`${server.url}/bars/03-halftone-resolve/index.html`, { dpr: 1, width: W, height: H, seed: 1, t: mid });
    try {
      for (let t = 0.35; t < mid - 1e-9; t += STEP) await stepped.hook(`__paint.setTime(${t})`);
      await stepped.hook(`__paint.setTime(${mid})`);
      const gap = meanAbsDiff(await stepped.shot(), await fresh.shot());
      console.log(`bar 03 at t ${mid}: stepped there vs opened there differ by ${gap}`);
      expect(gap).toBe(0);
    } finally {
      await stepped.close();
      await fresh.close();
    }
  }, 120_000);

  it("a planted fault that makes the halftone again at each state change compiles and uploads every arrival frame", async () => {
    // test/faults/halftone-rebuild-per-frame: bar 03 with the plate it had before fix round 1.
    const w = await arrivalWork("test/faults/halftone-rebuild-per-frame/index.html", 0.34, [[0.35, 0.75], [2.0, 2.2]]);
    console.log(`halftone-rebuild-per-frame arrivals: ${workLine(w)}`);
    expect(w.compiles).toBeGreaterThan(0);
    expect(w.uploads).toBeGreaterThan(0);
  }, 120_000);

  // check-fix (f) fix round 1: test/pages/halftone-caption.html, a caption printed by the text field over the dots.
  const captionUrl = () => `${server.url}/test/pages/halftone-caption.html`;

  it("setInk by source turns the text ink and the picture ink off apart", async () => {
    const h = await openPage(captionUrl(), FROZEN);
    try {
      const box = await h.hook<{ x: number; y: number; w: number; h: number }>(
        "(() => { const r = document.querySelector('.caption').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()",
      );
      const sum = async (b: { x: number; y: number; w: number; h: number }) =>
        (await h.hook<SheetSample>(`__paint.sheetRegion(${b.x}, ${b.y}, ${b.w}, ${b.h})`)).ink.reduce((a, v) => a + v, 0);
      const ink = async () => ({ caption: await sum(box), picture: await sum(PATCH) });
      const all = await ink();
      await h.hook('__paint.setInk(false, "picture")');
      const textOnly = await ink();
      await h.hook('__paint.setInk(true, "picture")');
      await h.hook('__paint.setInk(false, "text")');
      const pictureOnly = await ink();
      await h.hook('__paint.setInk(true, "text")');
      const back = await ink();
      console.log(`caption page ink sums: all ${JSON.stringify(all)}, text only ${JSON.stringify(textOnly)}, picture only ${JSON.stringify(pictureOnly)}`);
      // The patch (page centre) holds dots and no caption; the caption box holds both.
      expect(textOnly.picture).toBe(0);
      expect(pictureOnly.picture).toBe(all.picture);
      expect(textOnly.caption).toBeGreaterThan(0);
      expect(pictureOnly.caption).toBeGreaterThan(0);
      expect(pictureOnly.caption).toBeLessThan(all.caption);
      expect(back).toEqual(all);
      expect(h.errors).toEqual([]);
    } finally {
      await h.close();
    }
  });

  it("the caption page's range floor reads the dots, and the caption is scored against them", async () => {
    const r = await gate(path.join(ROOT, "test/pages/halftone-caption.html"), { baseUrl: server.url });
    const tc = r.results.find((c) => c.name === "text-contrast")!;
    console.log(tc.line);
    // Before (floor on the frame with all ink off): 0.0410 light / 0.0361 dark, a fail on bare paper.
    expect(tc.status).toBe("pass");
    for (const scheme of ["light", "dark"]) {
      expect(tc.measured[`${scheme}.range`]!).toBeGreaterThanOrEqual(threshold("text.rangeFloor", null));
      expect(tc.measured[`${scheme}.always0.pixels`]!).toBeGreaterThan(0);
    }
  }, 120_000);

  it("a caption over dense dots fails by its glyphs: they are scored against the dots, not bare paper", async () => {
    // check-fix (f) fix round 2: test/faults/halftone-caption-dense, the caption over the sphere's shadow. Against
    // the dots it reads about 1:1; against an all-ink-off frame it would read about 12:1 and pass.
    const r = await gate(path.join(ROOT, "test/faults/halftone-caption-dense/index.html"), { baseUrl: server.url });
    const tc = r.results.find((c) => c.name === "text-contrast")!;
    console.log(tc.line);
    expect(tc.status).toBe("fail");
    expect(tc.line).toMatch(/always p "Fig\. 1: a sphere in one " \(ink\) reaches [0-9.]+:1 at its worst tenth, needs 3/);
    expect(tc.line).not.toMatch(/is under the floor/);
    for (const scheme of ["light", "dark"]) expect(tc.measured[`${scheme}.range`]!).toBeGreaterThanOrEqual(threshold("text.rangeFloor", null));
  }, 120_000);
});

// Phase 2 Task 8: halftone after light. `finish.halftone` screens the lit colour after shading: each cell prints
// one dot of the lit colour on the `ground` tone (the bed), sized so the cell brightens as the light grows: a dot
// lighter than the bed grows with the light, a dot darker than it shrinks (a negative print, as the dark palette is).
// So the test reads light coverage: the share of a cell showing the lighter of dot and bed (Behaviour 8: brighter lit
// areas print more light). test/pages/halftone-lit.html is a warped
// paper sheet under bar 03's grazing key with the screen on. A cell's dot is read from two frames at the same key:
// the frame with the screen on (S) and with it off (C, the lit colour). The screen ground G is the colour of the
// pixels S moves farthest from C (bare gaps print G exactly). In linear light, a pixel's coverage is the share of the
// way from G to C its S sits (S = mix(G, C, a) in the shade pass, under the shoulder's knee); a cell's coverage is
// its pixels' mean, its brightness the mean luma of C over it (the luminance the screen reads).
describe("halftone after light", () => {
  // A cell counts when the frame holds most of it: a rotated 8 px cell covers 64 px give or take its edge pixels;
  // a cell cut by the frame edge holds far fewer and would read a partial dot.
  const WHOLE_CELL = 0.85;
  /** Per whole cell: brightness, dot coverage, and light coverage (the share showing the lighter of dot and bed). */
  type Cells = { lit: number[]; cover: number[]; light: number[]; id: string[] };
  const toLinear = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  /** Each whole cell's coverage and brightness, from the screen-on frame `s` and the screen-off frame `c`. */
  function screenCells(s: Rgba, c: Rgba, cellPx: number, angleDeg: number): Cells {
    const n = s.w * s.h;
    const lin = (f: Rgba) => Float64Array.from(f.data, (v, i) => (i % 4 === 3 ? 0 : toLinear(v)));
    const S = lin(s);
    const C = lin(c);
    let far = 0;
    const gap = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 3; k++) gap[i]! += Math.abs(S[i * 4 + k]! - C[i * 4 + k]!);
      far = Math.max(far, gap[i]!);
    }
    const G = [0, 0, 0];
    let gn = 0;
    for (let i = 0; i < n; i++) {
      if (gap[i]! < 0.9 * far) continue;
      for (let k = 0; k < 3; k++) G[k]! += S[i * 4 + k]!;
      gn++;
    }
    for (let k = 0; k < 3; k++) G[k]! /= gn;
    const a = (angleDeg * Math.PI) / 180;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const lumG = 0.2126 * G[0]! + 0.7152 * G[1]! + 0.0722 * G[2]!;
    const cells = new Map<string, { n: number; cover: number; light: number; lit: number }>();
    for (let row = 0; row < s.h; row++) {
      for (let col = 0; col < s.w; col++) {
        const i = row * s.w + col;
        // gl_FragCoord (y up) about the canvas centre, turned back by the screen's angle, in cells.
        const x = col + 0.5 - s.w / 2;
        const y = s.h - row - 0.5 - s.h / 2;
        const id = `${Math.round((x * ca + y * sa) / cellPx)},${Math.round((-x * sa + y * ca) / cellPx)}`;
        let num = 0;
        let den = 0;
        for (let k = 0; k < 3; k++) {
          const d = C[i * 4 + k]! - G[k]!;
          num += (S[i * 4 + k]! - G[k]!) * d;
          den += d * d;
        }
        const cover = den > 1e-9 ? Math.min(1, Math.max(0, num / den)) : 1;
        const lit = (0.2126 * c.data[i * 4]! + 0.7152 * c.data[i * 4 + 1]! + 0.0722 * c.data[i * 4 + 2]!) / 255;
        // The dot is the lighter of the two where the lit colour is lighter than the bed (linear luminance).
        const lumC = 0.2126 * C[i * 4]! + 0.7152 * C[i * 4 + 1]! + 0.0722 * C[i * 4 + 2]!;
        const e = cells.get(id) ?? { n: 0, cover: 0, light: 0, lit: 0 };
        e.n++;
        e.cover += cover;
        e.light += lumC >= lumG ? cover : 1 - cover;
        e.lit += lit;
        cells.set(id, e);
      }
    }
    const out: Cells = { lit: [], cover: [], light: [], id: [] };
    for (const [id, e] of cells) {
      if (e.n < WHOLE_CELL * cellPx * cellPx) continue;
      out.id.push(id);
      out.cover.push(e.cover / e.n);
      out.light.push(e.light / e.n);
      out.lit.push(e.lit / e.n);
    }
    return out;
  }
  /** Mean `cover` of the decile of cells highest in `by` minus the mean of the decile lowest in it. */
  function decileSplit(by: number[], cover: number[]): number {
    const order = by.map((_, i) => i).sort((p, q) => by[p]! - by[q]!);
    const tenth = Math.max(1, Math.floor(order.length / 10));
    const mean = (ix: number[]) => ix.reduce((sum, i) => sum + cover[i]!, 0) / ix.length;
    return mean(order.slice(-tenth)) - mean(order.slice(0, tenth));
  }
  /**
   * The move split: as the key moves from position 0 to 1, the mean coverage gain of the decile of cells that
   * brightened most minus that of the decile that darkened most. The cells are the same (one grid, one frame size).
   */
  function moveSplit(a: Cells, b: Cells): number {
    const at = new Map(b.id.map((id, i) => [id, i]));
    const lit: number[] = [];
    const cover: number[] = [];
    a.id.forEach((id, i) => {
      const j = at.get(id);
      if (j === undefined) return;
      lit.push(b.lit[j]! - a.lit[i]!);
      cover.push(b.light[j]! - a.light[i]!);
    });
    return decileSplit(lit, cover);
  }
  /** The page at `file` (seed, scheme): the split and the cells at key positions 0 and 1, grain off. */
  async function readScreen(file: string, seed: number, dark: boolean) {
    const h = await openPage(`${server.url}/${file}`, { ...FROZEN, seed, dark });
    try {
      const screen = await h.hook<{ cell: number; angle: number }>("window.__screen");
      await h.hook("__paint.setGrain(0)");
      const at = async (step: 0 | 1) => {
        await h.hook(`__paint.moveLight(0, ${step})`);
        await h.hook("window.setScreen(true)");
        await h.hook(twoFrames);
        const on = await h.shot();
        await h.hook("window.setScreen(false)");
        await h.hook(twoFrames);
        const off = await h.shot();
        await h.hook("window.setScreen(true)");
        return screenCells(on, off, screen.cell * FROZEN.dpr!, screen.angle);
      };
      const a = await at(0);
      const b = await at(1);
      expect(h.errors).toEqual([]);
      return { split: decileSplit(a.lit, a.light), splitB: decileSplit(b.lit, b.light), move: moveSplit(a, b), dot: decileSplit(a.lit, a.cover), cells: a.id.length };
    } finally {
      await h.close();
    }
  }
  const ROWS = (["light", "dark"] as const).flatMap((scheme) => [1, 2, 3].map((seed) => [scheme, seed] as const));

  it.each(ROWS)("halftone lit: brighter lit areas print more light (%s, seed %i)", async (scheme, seed) => {
    const r = await readScreen("test/pages/halftone-lit.html", seed, scheme === "dark");
    console.log(`LIT halftone-lit ${scheme} seed ${seed}: split ${r.split.toFixed(5)} at key A, ${r.splitB.toFixed(5)} at key B, move ${r.move.toFixed(5)} over ${r.cells} cells (dot coverage split at key A ${r.dot.toFixed(5)})`);
    expect(r.split).toBeGreaterThan(0);
    // Brighter cells show more light, at both key positions.
    expect(r.split).toBeGreaterThan(threshold("halftone.litSplit", null));
    expect(r.splitB).toBeGreaterThan(threshold("halftone.litSplit", null));
    // Moving the key changes which cells show the most light: the cells it brightens gain light coverage.
    expect(r.move).toBeGreaterThan(threshold("halftone.litSplit", null));
  }, 120_000);

  it.each(ROWS)("a planted fault that sizes the dots before light fails halftone lit (%s, seed %i)", async (scheme, seed) => {
    // test/faults/halftone-lit-fixed: engine fault 'halftone-lit-fixed', the dots' area reads the unlit albedo.
    const r = await readScreen("test/faults/halftone-lit-fixed/index.html", seed, scheme === "dark");
    console.log(`LIT halftone-lit-fixed ${scheme} seed ${seed}: split ${r.split.toFixed(5)} at key A, ${r.splitB.toFixed(5)} at key B, move ${r.move.toFixed(5)} over ${r.cells} cells (dot coverage split at key A ${r.dot.toFixed(5)})`);
    expect(r.split).toBeLessThanOrEqual(threshold("halftone.litSplit", null));
    expect(r.splitB).toBeLessThanOrEqual(threshold("halftone.litSplit", null));
    expect(r.move).toBeLessThanOrEqual(threshold("halftone.litSplit", null));
  }, 120_000);
});

describe("halftone screen on some slots", () => {
  type Box = { x: number; y: number; w: number; h: number };
  /** Mean and largest absolute 8-bit RGB difference of two frames over the pixels `keep` picks inside `box`. */
  const diffIn = (a: Rgba, b: Rgba, box: Box, keep: (x: number, y: number) => boolean = () => true) => {
    let s = 0;
    let n = 0;
    let max = 0;
    for (let y = box.y; y < box.y + box.h; y++)
      for (let x = box.x; x < box.x + box.w; x++) {
        if (!keep(x, y)) continue;
        const i = (y * a.w + x) * 4;
        for (let k = 0; k < 3; k++) {
          const d = Math.abs(a.data[i + k]! - b.data[i + k]!);
          s += d;
          max = Math.max(max, d);
        }
        n++;
      }
    return { mean: n ? s / (3 * n) : 0, max, n };
  };
  /** test/pages/halftone-slots.html (query `q`): the frames with the screen on and off, grain 0, and its boxes. */
  async function onOff(q: string, dark: boolean) {
    const h = await openPage(`${server.url}/test/pages/halftone-slots.html?${q}`, { ...FROZEN, dark });
    try {
      const boxes = await h.hook<{ card: Box; desk: Box; word: Box }>("window.__slots");
      const word = await h.hook<SheetSample>(`__paint.sheetRegion(${boxes.word.x}, ${boxes.word.y}, ${boxes.word.w}, ${boxes.word.h})`);
      await h.hook("__paint.setGrain(0)");
      await h.hook("window.setScreen(true)");
      await h.hook(twoFrames);
      const on = await h.shot();
      await h.hook("window.setScreen(false)");
      await h.hook(twoFrames);
      const off = await h.shot();
      expect(h.errors).toEqual([]);
      return { boxes, word, on, off };
    } finally {
      await h.close();
    }
  }
  // A screened area differs from its unscreened frame by dots: on the card (matte at the ink tone on a bed at the
  // accent) every cell prints the bed around its dot. One 8-bit level of mean change is far under that and over the
  // dither (which is the same in both frames, so an unscreened area reads exactly 0).
  const SCREENED = 1;
  // Solid ink: where the sheet's ink is 1, the screen draws the lit colour itself. 0.99 leaves out the glyphs'
  // anti-aliased rims, whose partial ink is blended with the screen.
  const SOLID_INK = 0.99;

  it.each(["light", "dark"] as const)("slots [1]: the card is screened, the desk is not, and the word's solid ink is not (%s)", async (scheme) => {
    const r = await onOff("seed=1", scheme === "dark");
    const card = diffIn(r.on, r.off, r.boxes.card);
    const desk = diffIn(r.on, r.off, r.boxes.desk);
    const w = r.boxes.word;
    const solid = (x: number, y: number) => (r.word.ink[(y - w.y) * w.w + (x - w.x)] ?? 0) >= SOLID_INK;
    const ink = diffIn(r.on, r.off, w, solid);
    console.log(`SLOTS ${scheme}: card mean ${card.mean.toFixed(3)}; desk mean ${desk.mean.toFixed(3)} max ${desk.max}; solid ink ${ink.n} px, max ${ink.max}`);
    expect(card.mean, "the card (a listed slot) is not screened").toBeGreaterThan(SCREENED);
    expect(desk.max, "the desk (an unlisted slot) is screened").toBe(0);
    expect(ink.n, "the word printed no solid ink").toBeGreaterThan(200);
    expect(ink.max, "the word's solid ink is screened").toBe(0);
  });

  it("no slots: every slot is screened, the desk too", async () => {
    const r = await onOff("seed=1&all=1", false);
    const card = diffIn(r.on, r.off, r.boxes.card);
    const desk = diffIn(r.on, r.off, r.boxes.desk);
    console.log(`SLOTS all: card mean ${card.mean.toFixed(3)}; desk mean ${desk.mean.toFixed(3)}`);
    expect(card.mean).toBeGreaterThan(SCREENED);
    expect(desk.mean, "with no slots listed the desk is not screened").toBeGreaterThan(SCREENED);
  });
});
