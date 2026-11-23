// Behaviour tests for the paper material and the text (ink) field on test/pages/paper.html, driven through
// `window.__paint` and frozen at a fixed t and seed. The tolerances here are test constants, each with its reason.
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CHECKS, gate, resolveTarget, runEntry } from "../../src/checks/gate.ts";
import { closeBrowsers, openPage, type OpenOpts, type PageHandle, type Rgba } from "../../src/checks/harness.ts";
import { serveRoot } from "../../src/checks/serve.ts";
import { threshold } from "../../src/checks/threshold.ts";
import { expectMudFault } from "./mud-fault.ts";

type SheetSample = { height: number[]; coverage: number[]; ink: number[]; slot: number[] };
type Box = { x: number; y: number; w: number; h: number };
type PaintStats = { webgl: boolean };

const W = 960;
const H = 600;
// dpr 1 and sheetScale 1: one sheet pixel is one CSS pixel, so a region read lines up with the HTML text pixel for pixel.
const FROZEN: OpenOpts = { dpr: 1, width: W, height: H, t: 2, seed: 1 };

// A glyph core is ink at full strength: anti-aliased edges sit below it.
const CORE = 0.9;
// Text covers a fifth to a third of its line boxes; a box whose mean ink is under this has lost its text.
const MIN_BOX_MEAN = 0.06;
// Outside every text box the field writes nothing; 0.02 allows an anti-aliased fringe that pokes past a box edge.
const OUTSIDE_MAX = 0.02;
// Canvas text and HTML text share the font and the rasteriser. Measured on this page (2026-11-13, SwiftShader,
// dpr 1): IoU 1.000 (heading) and 0.997 (paragraph); with the baseline planted 2 px low, 0.621 and 0.331. 0.9
// leaves room for anti-aliasing differences and still fails a box drawn even 2 px off.
const MIN_IOU = 0.9;
// After a reflow at most this share of the ink may lie outside the new text boxes (anti-aliased fringes only).
const REFLOW_OUTSIDE = 0.05;

let server: { url: string; close(): Promise<void> };
const url = () => `${server.url}/test/pages/paper.html`;

beforeAll(async () => {
  server = await serveRoot(path.resolve(import.meta.dirname, "../.."));
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

const boxOf = (h: PageHandle, which: "always" | "lit") =>
  h.hook<Box>(`(() => { const r = document.querySelector('[data-paint-text="${which}"]').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);

const region = (h: PageHandle, b: Box) => h.hook<SheetSample>(`__paint.sheetRegion(${b.x}, ${b.y}, ${b.w}, ${b.h})`);

const twoFrames = "new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))";

/** Hides the canvas and shows the HTML text black on white. Inline `!important` beats the field's own transparent rule. */
const revealHtml = (sel: string) =>
  `(() => { document.querySelector('canvas').style.visibility = 'hidden'; document.body.style.background = 'white'; document.documentElement.style.background = 'white'; for (const e of document.querySelectorAll(${JSON.stringify(`${sel}, ${sel} *`)})) e.style.setProperty('color', 'black', 'important'); })()`;

// Spread (Math.max(...a)) overflows the stack on a large region.
const maxOf = (a: number[]) => a.reduce((m, v) => (v > m ? v : m), -Infinity);
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);

/** Ink mass and centroid of a 64x64 `sheet()` grid, in page fractions; and the share of mass inside the boxes. */
function inkStats(s: { w: number; h: number; ink: number[] }, boxes: Box[], vw: number, vh: number) {
  let m = 0;
  let cx = 0;
  let cy = 0;
  let inside = 0;
  for (let j = 0; j < s.h; j++) {
    for (let i = 0; i < s.w; i++) {
      const v = s.ink[j * s.w + i]!;
      if (v <= 0) continue;
      const fx = (i + 0.5) / s.w;
      const fy = (j + 0.5) / s.h;
      m += v;
      cx += v * fx;
      cy += v * fy;
      const px = fx * vw;
      const py = fy * vh;
      if (boxes.some((b) => px >= b.x - 2 && px <= b.x + b.w + 2 && py >= b.y - 2 && py <= b.y + b.h + 2)) inside += v;
    }
  }
  return { mass: m, cx: cx / m, cy: cy / m, insideShare: inside / m };
}

describe("paper page", () => {
  it("ink lands on the text boxes", async () => {
    await withPage(FROZEN, async (h) => {
      for (const which of ["always", "lit"] as const) {
        const b = await boxOf(h, which);
        const r = await region(h, b);
        const m = mean(r.ink);
        const max = maxOf(r.ink);
        console.log(`paper ink ${which}: box ${JSON.stringify(b)}, mean ${m.toFixed(3)}, max ${max.toFixed(3)}`);
        expect(m).toBeGreaterThan(MIN_BOX_MEAN);
        expect(max).toBeGreaterThanOrEqual(CORE);
      }
      // Bands outside the boxes: the gap between heading and paragraph, and the margin right of the text column.
      const a = await boxOf(h, "always");
      const p = await boxOf(h, "lit");
      const gap = await region(h, { x: a.x, y: a.y + a.h + 3, w: a.w, h: Math.max(1, p.y - (a.y + a.h) - 6) });
      const right = await region(h, { x: p.x + p.w + 4, y: a.y, w: W - (p.x + p.w + 4), h: p.y + p.h - a.y });
      const below = await region(h, { x: 0, y: p.y + p.h + 4, w: W, h: H - (p.y + p.h + 4) });
      const outside = Math.max(maxOf(gap.ink), maxOf(right.ink), maxOf(below.ink));
      console.log(`paper ink outside: gap ${maxOf(gap.ink).toFixed(3)}, right ${maxOf(right.ink).toFixed(3)}, below ${maxOf(below.ink).toFixed(3)}`);
      expect(outside).toBeLessThanOrEqual(OUTSIDE_MAX);

      // The ink must match the HTML glyphs: show the HTML text black on white with the canvas hidden, and
      // compare glyph masks over each box.
      const inks: Record<string, number[]> = {};
      for (const which of ["always", "lit"] as const) inks[which] = (await region(h, await boxOf(h, which))).ink;
      await h.hook(revealHtml("[data-paint-ink]"));
      const shot = await h.shot("paper-html-text");
      for (const which of ["always", "lit"] as const) {
        const b = await boxOf(h, which);
        const iou = maskIou(inks[which]!, shot, b);
        console.log(`paper glyph IoU ${which}: ${iou.toFixed(3)}`);
        expect(iou).toBeGreaterThanOrEqual(MIN_IOU);
      }
      expect(h.errors).toEqual([]);
    });
  });

  it("ink follows reflow", async () => {
    await withPage(FROZEN, async (h) => {
      const before = inkStats(await h.hook("__paint.sheet()"), [await boxOf(h, "always"), await boxOf(h, "lit")], W, H);
      const pBefore = await boxOf(h, "lit");
      await h.page.setViewportSize({ width: 375, height: H });
      await h.hook(twoFrames);
      const a = await boxOf(h, "always");
      const p = await boxOf(h, "lit");
      const after = inkStats(await h.hook("__paint.sheet()"), [a, p], 375, H);
      // The paragraph's share of the ink, in the new layout.
      const pOnly = inkStats(await h.hook("__paint.sheet()"), [p], 375, H);
      console.log(
        `paper reflow: paragraph ${JSON.stringify(pBefore)} -> ${JSON.stringify(p)}; centroid (${before.cx.toFixed(3)}, ${before.cy.toFixed(3)}) -> (${after.cx.toFixed(3)}, ${after.cy.toFixed(3)}); inside new boxes ${after.insideShare.toFixed(3)}, paragraph share ${pOnly.insideShare.toFixed(3)}`,
      );
      expect(p.h).toBeGreaterThan(pBefore.h);
      expect(1 - after.insideShare).toBeLessThanOrEqual(REFLOW_OUTSIDE);
      expect(pOnly.insideShare).toBeGreaterThan(0.5);
      // The centroid lands inside the paragraph's new box (the paragraph holds most of the ink).
      expect(after.cx * 375).toBeGreaterThan(p.x);
      expect(after.cx * 375).toBeLessThan(p.x + p.w);
      expect(after.cy * H).toBeGreaterThan(a.y);
      expect(after.cy * H).toBeLessThan(p.y + p.h);
      expect(Math.hypot(after.cx - before.cx, after.cy - before.cy)).toBeGreaterThan(0.05);
      expect(h.errors).toEqual([]);
    });
  });

  it("glyphs match at fractional pixel ratios, up to the engine's cap of 1.5", async () => {
    // One sheet pixel is one device px; the region and the screenshot are both in device px. Before the field
    // snapped line tops as the browser does, the paragraph measured 0.887 at 1.5 and 0.753 at 1.25 (one line a
    // device row off at 1.5, two at 1.25).
    for (const dpr of [1.25, 1.5]) {
      await withPage({ ...FROZEN, dpr }, async (h) => {
        const inks: Record<string, number[]> = {};
        for (const which of ["always", "lit"] as const) inks[which] = (await region(h, await boxOf(h, which))).ink;
        await h.hook(revealHtml("[data-paint-ink]"));
        const shot = await h.shot(`paper-html-text-dpr${dpr}`);
        for (const which of ["always", "lit"] as const) {
          const iou = maskIou(inks[which]!, shot, await boxOf(h, which), shot.w / W);
          console.log(`paper glyph IoU dpr ${dpr} ${which}: ${iou.toFixed(3)}`);
          expect(iou).toBeGreaterThanOrEqual(MIN_IOU);
        }
        expect(h.errors).toEqual([]);
      });
    }
  });

  it("ink follows a reflow that keeps the canvas size", async () => {
    // The column narrows by CSS alone, so the canvas keeps its size and the engine's own resize path never runs:
    // only the field's triggers can redraw the ink. Measured by the reviewer's probe: paragraph share 0.757 with the
    // triggers working, 0.164 with them broken.
    await withPage(FROZEN, async (h) => {
      const pBefore = await boxOf(h, "lit");
      const sizeBefore = await h.hook<number[]>("(() => { const c = document.querySelector('canvas'); return [c.width, c.height]; })()");
      await h.hook("(() => { document.querySelector('main').style.maxWidth = '16rem'; })()");
      await h.hook(twoFrames);
      const sizeAfter = await h.hook<number[]>("(() => { const c = document.querySelector('canvas'); return [c.width, c.height]; })()");
      const a = await boxOf(h, "always");
      const p = await boxOf(h, "lit");
      const all = inkStats(await h.hook("__paint.sheet()"), [a, p], W, H);
      const pOnly = inkStats(await h.hook("__paint.sheet()"), [p], W, H);
      console.log(
        `paper css reflow: paragraph ${JSON.stringify(pBefore)} -> ${JSON.stringify(p)}; centroid (${all.cx.toFixed(3)}, ${all.cy.toFixed(3)}); inside new boxes ${all.insideShare.toFixed(3)}, paragraph share ${pOnly.insideShare.toFixed(3)}`,
      );
      expect(sizeAfter).toEqual(sizeBefore);
      expect(p.h).toBeGreaterThan(pBefore.h);
      expect(1 - all.insideShare).toBeLessThanOrEqual(REFLOW_OUTSIDE);
      expect(pOnly.insideShare).toBeGreaterThan(0.5);
      expect(all.cx * W).toBeGreaterThan(p.x);
      expect(all.cx * W).toBeLessThan(p.x + p.w);
      expect(all.cy * H).toBeGreaterThan(a.y);
      expect(all.cy * H).toBeLessThan(p.y + p.h);
      expect(h.errors).toEqual([]);
    });
  });

  it("setInk(false) removes ink only", async () => {
    await withPage(FROZEN, async (h) => {
      const on = await h.hook<SheetSample>("__paint.sheet()");
      const shotOn = await h.shot("paper-ink-on");
      await h.hook("__paint.setInk(false)");
      const off = await h.hook<SheetSample>("__paint.sheet()");
      const shotOff = await h.shot("paper-ink-off");
      expect(maxOf(on.ink)).toBeGreaterThanOrEqual(CORE);
      expect(maxOf(off.ink)).toBe(0);
      expect(off.height).toEqual(on.height);
      expect(off.coverage).toEqual(on.coverage);
      expect(off.slot).toEqual(on.slot);
      // The frame changes inside the paragraph (the words are gone) and not far from any text.
      const p = await boxOf(h, "lit");
      const diffIn = boxDiff(shotOn, shotOff, p);
      const diffOut = boxDiff(shotOn, shotOff, { x: 0, y: p.y + p.h + 8, w: W, h: H - (p.y + p.h + 8) });
      console.log(`paper setInk: frame diff in paragraph ${diffIn.toFixed(4)}, below it ${diffOut.toFixed(5)}`);
      expect(diffIn).toBeGreaterThan(0.01);
      expect(diffOut).toBe(0);
      await h.hook("__paint.setInk(true)");
      expect(await h.hook<SheetSample>("__paint.sheet()")).toEqual(on);
      expect(h.errors).toEqual([]);
    });
  });

  it("HTML text is transparent while WebGL runs and visible in fallback", async () => {
    const colourOf = "Array.from(document.querySelectorAll('[data-paint-ink]'), (e) => getComputedStyle(e).color)";
    await withPage(FROZEN, async (h) => {
      const cs = await h.hook<string[]>(colourOf);
      expect(cs.length).toBe(2);
      for (const c of cs) expect(c).toBe("rgba(0, 0, 0, 0)");
      expect(h.errors).toEqual([]);
    });
    await withPage({ ...FROZEN, webgl: false }, async (h) => {
      const cs = await h.hook<string[]>(colourOf);
      const ink = await h.hook<string>("getComputedStyle(document.body).color");
      await h.shot("paper-fallback");
      expect((await h.hook<PaintStats>("__paint.stats()")).webgl).toBe(false);
      for (const c of cs) {
        expect(c).not.toBe("rgba(0, 0, 0, 0)");
        expect(c).toBe(ink);
      }
      expect(h.errors).toEqual([]);
    });
  });
});

// The text-contrast check on the paper page, its three planted faults and the control, through the gate. Each fault
// must fail text-contrast for its own measured reason, and every other check must keep the paper page's status.
const ROOT = path.resolve(import.meta.dirname, "../..");
const gateRun = (rel: string, control = false) => gate(path.join(ROOT, rel), { baseUrl: server.url, control });
type GateRun = Awaited<ReturnType<typeof gateRun>>;
const statusOf = (r: GateRun) => Object.fromEntries(r.results.map((c) => [c.name, c.status]));
const tc = (r: GateRun) => r.results.find((c) => c.name === "text-contrast")!;
const th = (n: string) => threshold(n, null);
const logGate = (name: string, r: GateRun) => console.log(`${name}\n${r.lines.join("\n")}\n${JSON.stringify(tc(r).measured)}`);
/** Scores in `measured` whose key matches, e.g. "dark.always". */
const scores = (r: GateRun, prefix: string) =>
  Object.entries(tc(r).measured)
    .filter(([k]) => k.startsWith(prefix) && k.endsWith(".score"))
    .map(([, v]) => v);

describe("text-contrast check", () => {
  // The paper page's gate statuses, which a fault is compared with. Task 2e: a fault test used to run the paper gate
  // itself when the paper test had not run first, so a test run alone cost two gates. The paper test below now
  // asserts these values, so the comparison keeps the paper page's own result.
  const PAPER_STATUS: Record<string, string> = {
    render: "pass", palette: "pass", "banding-grain": "pass", still: "pass", hygiene: "pass",
    relight: "partial", detail: "pass", "text-contrast": "pass", flash: "pass",
  };

  // Each test below runs one gate alone (a fault test also runs the paper page's gate, when the paper test did not run
  // first). Task 2e: the limit is the page tests' 120 s, the default in vitest.pages.config.ts, not the 300 s earlier
  // rounds gave (raised from vitest's 60 s when whole gates ran in one test).
  const GATE_TIMEOUT = 120_000;

  it("paper page passes text-contrast", async () => {
    const r = await gateRun("test/pages/paper.html");
    logGate("paper", r);
    expect(statusOf(r)).toEqual(PAPER_STATUS);
    expect(tc(r).status).toBe("pass");
    const m = tc(r).measured;
    for (const scheme of ["light", "dark"]) {
      // Heading (40 px, large) and paragraph (19 px) both scored, in both schemes.
      expect(scores(r, `${scheme}.always`).length).toBe(1);
      expect(scores(r, `${scheme}.lit`).length).toBe(1);
      expect(scores(r, `${scheme}.always`)[0]!).toBeGreaterThanOrEqual(th("text.large"));
      expect(scores(r, `${scheme}.lit`)[0]!).toBeGreaterThanOrEqual(th("text.normal"));
      expect(m[`${scheme}.range`]!).toBeGreaterThanOrEqual(th("text.rangeFloor"));
    }
  }, GATE_TIMEOUT);

  // How bad a status is. The paper page's relight is already partial (its falloff samples fall on ink; see the
  // Task 6b report), and a fault that moves the lamp can turn relight's fail into a partial, so "nothing else newly fails" compares
  // severity: no other check may end worse than it does on the paper page.
  const RANK: Record<string, number> = { pass: 0, skip: 0, partial: 1, fail: 2 };

  /** text-contrast fails; no other check ends worse than on the paper page, except those named in `alsoFails`. */
  async function onlyTextContrastFails(rel: string, alsoFails: string[] = []) {
    const r = await gateRun(rel);
    logGate(rel, r);
    expect(tc(r).status).toBe("fail");
    const base = PAPER_STATUS;
    const worse = r.results
      .filter((c) => c.name !== "text-contrast" && !alsoFails.includes(c.name) && RANK[c.status]! > RANK[base[c.name]!]!)
      .map((c) => `${c.name}: ${base[c.name]} -> ${c.status}`);
    expect(worse).toEqual([]);
    return r;
  }

  it("hot spot behind heading fails", async () => {
    // detail may fail as well, and no longer does: with the finish grain off (Phase 2 Task 2c) the dial's fibres
    // show in the pool (relative rise 0.28 to 0.46 light, 1.69 to 1.93 dark, seeds 1-3; with the grain on it read
    // -0.005, the grain floor swamping them). The clipped pool's smooth slope also bands: banding-grain fails by
    // its banding half (a light run of 21 px, over 6). That run was there before check-fix (a) too, hidden while
    // paper.html itself failed banding-grain by its grain half (fibre read as grain).
    const r = await onlyTextContrastFails("test/faults/paper-hotspot/index.html", ["detail", "banding-grain"]);
    expect(r.results.find((c) => c.name === "banding-grain")!.line).toMatch(/banding \(light\): a quantised run/);
    expect(r.results.find((c) => c.name === "banding-grain")!.line).not.toMatch(/grain \((light|dark)\):/);
    expect(Math.min(...scores(r, "light.always"))).toBeLessThan(th("text.large"));
    expect(tc(r).line).toMatch(/always h1 "Night shift notes" \(ink\) reaches/);
    expect(tc(r).line).not.toMatch(/is under the floor/);
  }, GATE_TIMEOUT);

  it("bright ground under body fails", async () => {
    // detail fails as well, in dark only, pinned as measured (Phase 2 Task 2c fix round 2, seed 1): with the finish
    // grain off the dark shares read 0.0114 / 0.0114 / 0.0116, relative rise 0.0164, under detail.minRise (light
    // rises 0.0642 and passes; paper.html rises 11.96 light, 1.599 dark). In dark the fault's bright, fibreless patch
    // under the paragraph is a hard-edged step on the dark ground: it fills the frame's variance and its edges give a
    // fixed fine share (0.0114 at detail 0, against paper.html's 0.0046), so the fibres the dial adds elsewhere barely
    // move the share. Not an exemption: the row asserts that detail fails, and where.
    const r = await onlyTextContrastFails("test/faults/paper-bright-ground/index.html", ["detail"]);
    const detailLine = r.results.find((c) => c.name === "detail")!.line;
    expect(r.results.find((c) => c.name === "detail")!.status).toBe("fail");
    expect(detailLine).toMatch(/dark: the high-frequency share does not rise enough/);
    expect(detailLine).not.toMatch(/light: the high-frequency share does not rise/);
    expect(Math.min(...scores(r, "dark.lit"))).toBeLessThan(th("text.normal"));
    expect(tc(r).line).toMatch(/lit p "The lamp on the rail dec" \(ink\) reaches/);
    expect(tc(r).line).not.toMatch(/always h1 [^;]*reaches/);
    expect(tc(r).line).not.toMatch(/is under the floor/);
  }, GATE_TIMEOUT);

  it("mud page fails the range floor", async () => {
    // Mud dims the lamp to a tenth, so moving it barely changes the frame: relight's relief law fails as well, for
    // the same reason (relative change 0.0063 light and 0.0104 dark, raw 0.0055 light, under relight.reliefDiff 0.013;
    // Phase 2 Task 2b). Measured once with the lamp at 0.3 and ambient
    // 0.9: relief passed (0.0137) but light mode's range rose to 0.083, over the floor, so it was no longer mud.
    // detail may fail as well, and no longer does: with the finish grain off (Phase 2 Task 2c) the fibres the dial
    // adds show through the flattened paint (relative rise 0.81 to 0.87 light, 0.58 to 0.65 dark, seeds 1-3; with the
    // grain on it read 0.0059, the grain floor swamping them).
    const r = await onlyTextContrastFails("test/faults/paper-mud/index.html", ["relight", "detail"]);
    expect(r.results.find((c) => c.name === "relight")!.line).toMatch(/relief FAIL \(moving the light changes the frame/);
    const m = tc(r).measured;
    expect(Math.min(m["light.range"]!, m["dark.range"]!)).toBeLessThan(th("text.rangeFloor"));
    expectMudFault(tc(r), null);
    expect(tc(r).line).toMatch(/is under the floor/);
    // The text itself still reads: only the floor fails.
    expect(tc(r).line).not.toMatch(/reaches/);
  }, GATE_TIMEOUT);

  it("a text-heavy mud page fails the range floor", async () => {
    // The floor measures the paint with the ink off. Ink-on, five paragraphs of text spread the frame's luminance
    // (reviewer's probe: 0.430 / 0.699) though the paint under them is as flat as paper-mud's.
    const r = await onlyTextContrastFails("test/faults/paper-mud-wordy/index.html", ["relight", "detail"]);
    const m = tc(r).measured;
    expect(Math.min(m["light.range"]!, m["dark.range"]!)).toBeLessThan(th("text.rangeFloor"));
    expectMudFault(tc(r), null);
    expect(tc(r).line).toMatch(/is under the floor/);
    expect(tc(r).line).not.toMatch(/reaches/);
  }, GATE_TIMEOUT);

  it("mud under plain, unmarked text still fails the range floor", async () => {
    // check-fix (f): text-contrast is skipped only on a page with no text. This page's text carries no
    // data-paint-ink or data-paint-text mark, so no box is scored, but it is text, so the floor still runs and fails.
    // A rule that skipped pages with no marked boxes would skip it. relight fails (and detail may) as on paper-mud. With no
    // ink printed, the flat sheet is near-blank too, so render fails its blank test as well (measured luminance std
    // 0.0162, under render.blankStd 0.02; paper-mud's ink text lifts it over).
    const r = await onlyTextContrastFails("test/faults/paper-mud-plain/index.html", ["relight", "detail", "render"]);
    expect(r.results.find((c) => c.name === "render")!.line).toMatch(/the frame is blank/);
    const m = tc(r).measured;
    expect(Math.min(m["light.range"]!, m["dark.range"]!)).toBeLessThan(th("text.rangeFloor"));
    expectMudFault(tc(r), null);
    expect(tc(r).line).toMatch(/is under the floor/);
    expect(tc(r).line).toMatch(/text on the page but none marked for scoring, floor only/);
    expect(tc(r).line).not.toMatch(/does not apply/);
  }, GATE_TIMEOUT);

  it("mud under text in an open shadow root still fails the range floor", async () => {
    // check-fix (f) fix round 1: the visible-text test walks open shadow roots. On 47e47c5 it did not, and this page
    // skipped text-contrast ("does not apply: the page has no text"). The page is paper-mud-plain's frame, so render
    // and relight fail as there (detail may) (render: luminance std 0.0162, under render.blankStd 0.02).
    const r = await onlyTextContrastFails("test/faults/paper-mud-shadow/index.html", ["relight", "detail", "render"]);
    const m = tc(r).measured;
    expect(Math.min(m["light.range"]!, m["dark.range"]!)).toBeLessThan(th("text.rangeFloor"));
    expectMudFault(tc(r), null);
    expect(tc(r).line).toMatch(/is under the floor/);
    expect(tc(r).line).not.toMatch(/does not apply/);
  }, GATE_TIMEOUT);

  it("mud under inked paragraphs a bar does not score still fails the range floor", async () => {
    // check-fix (f) fix round 1: the floor turns off text ink by its source (the text field), not by bar.text.
    // This fault's bar.json scores only the heading; the paragraphs' ink must not count as paint.
    const r = await gateRun("test/faults/paper-mud-wordy-bar");
    logGate("paper-mud-wordy-bar", r);
    expect(tc(r).status).toBe("fail");
    const m = tc(r).measured;
    expect(Math.min(m["light.range"]!, m["dark.range"]!)).toBeLessThan(th("text.rangeFloor"));
    expectMudFault(tc(r), null);
    expect(tc(r).line).toMatch(/is under the floor/);
  }, GATE_TIMEOUT);

  it("mud under a 0.99 coverage field with one fully covered ramp patch still fails the range floor", async () => {
    // checks fix round 1 (review-checks-scope I2): 2fac119 chose the paint by coverage at least 0.998, so this page's
    // floor read the 2% ramp patch alone and passed (0.694 light / 0.652 dark). The paint is now every texel with
    // coverage above 0 (less the anti-alias edge), so the 0.99 mud field is paint and the floor reads it.
    const r = await runEntry(CHECKS.find((c) => c.name === "text-contrast")!, resolveTarget(path.resolve(import.meta.dirname, "../faults/paper-mud-partial/index.html"), {}, server.url), {});
    console.log(`paper-mud-partial\n${r.line}\n${JSON.stringify(r.measured)}`);
    expectMudFault(r, null);
    expect(r.line).not.toMatch(/over the paint/); // the whole sheet is paint, so the floor reads the whole frame
    expect(r.measured["light.paint"]).toBe(1);
  }, GATE_TIMEOUT);

  // Checks fix round 2 (review-checks-fix1 Minor 1): 8b6c77c shrank the paint by a 5 x 5 window, so a coverage-0
  // pin-hole every 5 texels dropped the whole 0.99 field and the floor read the ramp patch alone: 0.734 light /
  // 0.674 dark over the paint (0.025 of the frame), a pass. An edge texel is now dropped by its own coverage (a ramp
  // between bare and full), so a hole costs only itself.
  it("mud under a 0.99 coverage field with pin-holes and one ramp patch still fails the range floor", async () => {
    const r = await runEntry(CHECKS.find((c) => c.name === "text-contrast")!, resolveTarget(path.resolve(import.meta.dirname, "../faults/paper-mud-pinhole/index.html"), {}, server.url), {});
    console.log(`paper-mud-pinhole\n${r.line}\n${JSON.stringify(r.measured)}`);
    expectMudFault(r, null);
    expect(r.measured["light.paint"]).toBeGreaterThan(0.9); // the field less its holes (4%)
  }, GATE_TIMEOUT);

  // Checks fix round 3 (review-checks-fix2 Minor 1): a second lattice of full texels at (2, 2) mod 5 put a bare and a
  // full texel within 2 of every 0.99 texel, so 799f2f2 dropped the whole field and read the dots and the ramp patch:
  // 0.6914 light / 0.6074 dark over 0.065 of the frame, a pass (checks-fix3-before-lattice.txt). A bare or full texel
  // now counts as ramp evidence only inside a 3 x 3 region of its kind, so single texels steer nothing.
  it("mud under a 0.99 coverage field with pin-holes, a lattice of full dots and one ramp patch still fails the range floor", async () => {
    const r = await runEntry(CHECKS.find((c) => c.name === "text-contrast")!, resolveTarget(path.resolve(import.meta.dirname, "../faults/paper-mud-lattice/index.html"), {}, server.url), {});
    console.log(`paper-mud-lattice\n${r.line}\n${JSON.stringify(r.measured)}`);
    expectMudFault(r, null);
    expect(r.measured["light.paint"]).toBeGreaterThan(0.9); // the field less its holes (4%)
  }, GATE_TIMEOUT);

  // Review-checks-fix1 Minor 3: the under-1% branch end to end. The sheet is one patch of about 0.5% of the frame.
  it("paint under 1% of the frame is partial in both schemes, named, never a pass", async () => {
    const r = await runEntry(CHECKS.find((c) => c.name === "text-contrast")!, resolveTarget(path.resolve(import.meta.dirname, "../faults/paper-small/index.html"), {}, server.url), {});
    console.log(`paper-small\n${r.line}\n${JSON.stringify(r.measured)}`);
    expect(r.status).toBe("partial");
    for (const scheme of ["light", "dark"]) {
      expect(r.line).toMatch(new RegExp(`${scheme}: the paint covers [0-9.]+ of the frame, under ${th("text.rangePaintMin")}, so its luminance range cannot be judged`));
      expect(r.measured[`${scheme}.paint`]).toBeGreaterThan(0);
      expect(r.measured[`${scheme}.paint`]).toBeLessThan(th("text.rangePaintMin"));
    }
    expect(r.line).not.toMatch(/is under the floor/);
  }, GATE_TIMEOUT);

  it("a lit box the light misses is partial and named", async () => {
    const r = await gateRun("test/faults/paper-unlit/index.html");
    logGate("paper-unlit", r);
    expect(tc(r).status).not.toBe("pass");
    expect(tc(r).line).toMatch(/the light reaches none of \[data-paint-text="lit"\]/);
    // Nothing else is wrong with the text on this page, so the box alone makes it partial.
    expect(tc(r).status).toBe("partial");
    expect(tc(r).line).not.toMatch(/is under the floor/);
  });

  it("control runs the range floor only", async () => {
    const r = await gateRun("controls/spectral-drape/index.html", true);
    logGate("control", r);
    expect(tc(r).status).toBe("pass");
    expect(tc(r).measured.range).toBeGreaterThanOrEqual(th("text.rangeFloor"));
    expect(r.lines).toContain("control: quiet");
  });
});

// The text field's edge cases on test/pages/ink-cases.html: a custom selector, styled and `!important` children, an
// author inline colour, context loss, and text-transform. Element ids are the page's; change both together.
describe("text field cases", () => {
  const casesUrl = () => `${server.url}/test/pages/ink-cases.html`;
  const IDS = ["#styled", "#styled a", "#styled em", "#cap", "#upper", "#other"];
  const colours = `(() => Object.fromEntries(${JSON.stringify(IDS)}.map((s) => [s, getComputedStyle(document.querySelector(s)).color])))()`;
  const TRANSPARENT = "rgba(0, 0, 0, 0)";

  async function withCases(fn: (h: PageHandle) => Promise<void>) {
    const h = await openPage(casesUrl(), FROZEN);
    try {
      await fn(h);
    } finally {
      await h.close();
    }
  }

  it("hides the selector's text and its styled children, and nothing else", async () => {
    await withCases(async (h) => {
      const c = await h.hook<Record<string, string>>(colours);
      console.log(`ink cases while WebGL runs: ${JSON.stringify(c)}`);
      for (const id of ["#styled", "#styled a", "#styled em", "#cap", "#upper"]) expect(c[id], id).toBe(TRANSPARENT);
      // #other has data-paint-ink but not the field's selector.
      expect(c["#other"]).not.toBe(TRANSPARENT);
      expect(h.errors).toEqual([]);
    });
  });

  it("context loss gives the selector's elements their own colours back", async () => {
    await withCases(async (h) => {
      const lost = await h.hook<boolean>(`(async () => {
        document.querySelector('canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext();
        for (let i = 0; i < 100; i++) {
          if (window.__paint && window.__paint.stats().webgl === false) return true;
          await new Promise((r) => setTimeout(r, 20));
        }
        return false;
      })()`);
      expect(lost).toBe(true);
      const c = await h.hook<Record<string, string>>(colours);
      const want = await h.hook<{ accent: string; ink: string }>(
        "(() => { const s = document.createElement('span'); s.style.color = 'var(--accent)'; document.body.append(s); const accent = getComputedStyle(s).color; s.remove(); return { accent, ink: getComputedStyle(document.body).color }; })()",
      );
      const inline = await h.hook<string[]>("(() => { const st = document.querySelector('#styled').style; return [st.getPropertyValue('color'), st.getPropertyPriority('color')]; })()");
      console.log(`ink cases after context loss: ${JSON.stringify(c)}; inline ${JSON.stringify(inline)}; want ${JSON.stringify(want)}`);
      expect(inline).toEqual(["var(--accent)", ""]);
      for (const id of ["#styled", "#styled a", "#styled em"]) expect(c[id], id).toBe(want.accent);
      for (const id of ["#cap", "#upper", "#other"]) expect(c[id], id).toBe(want.ink);
    });
  });

  it("capitalized and uppercased ink matches the HTML glyphs", async () => {
    await withCases(async (h) => {
      const box = (id: string) => h.hook<Box>(`(() => { const r = document.querySelector('${id}').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
      const inks: Record<string, number[]> = {};
      for (const id of ["#cap", "#upper"]) inks[id] = (await region(h, await box(id))).ink;
      await h.hook(revealHtml(".inked"));
      const shot = await h.shot("ink-cases-html-text");
      for (const id of ["#cap", "#upper"]) {
        const iou = maskIou(inks[id]!, shot, await box(id));
        console.log(`ink cases glyph IoU ${id}: ${iou.toFixed(3)}`);
        expect(iou, id).toBeGreaterThanOrEqual(MIN_IOU);
      }
      expect(h.errors).toEqual([]);
    });
  });
});

/** IoU of glyph masks: sheet ink >= 0.5 against screenshot darkness >= 0.5, over the box. `s` is device px per CSS
 * px (sheetScale 1, so sheet px are device px); the region is placed as sheetRegion clamps it. */
function maskIou(ink: number[], shot: Rgba, b: Box, s = 1): number {
  const x0 = Math.floor(b.x * s);
  const y0 = Math.floor(b.y * s);
  const w = Math.round(b.w * s);
  const hh = Math.floor(ink.length / w);
  let inter = 0;
  let union = 0;
  for (let j = 0; j < hh; j++) {
    for (let i = 0; i < w; i++) {
      const o = ((y0 + j) * shot.w + (x0 + i)) * 4;
      const dark = 1 - (0.2126 * shot.data[o]! + 0.7152 * shot.data[o + 1]! + 0.0722 * shot.data[o + 2]!) / 255;
      const a = (ink[j * w + i] ?? 0) >= 0.5;
      const c = dark >= 0.5;
      if (a && c) inter++;
      if (a || c) union++;
    }
  }
  return union === 0 ? 0 : inter / union;
}

/** Mean absolute RGB difference over a box, 0..1. */
function boxDiff(a: Rgba, b: Rgba, box: Box): number {
  let s = 0;
  let n = 0;
  for (let y = Math.max(0, Math.floor(box.y)); y < Math.min(a.h, Math.floor(box.y + box.h)); y++) {
    for (let x = Math.max(0, Math.floor(box.x)); x < Math.min(a.w, Math.floor(box.x + box.w)); x++) {
      const o = (y * a.w + x) * 4;
      for (let c = 0; c < 3; c++) s += Math.abs(a.data[o + c]! - b.data[o + c]!);
      n += 3;
    }
  }
  return s / (n * 255);
}
