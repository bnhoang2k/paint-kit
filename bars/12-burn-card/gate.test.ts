// Bar 12's gate: every check that applies passes at the bar's seeds (bar.json's `query` gives the gate and the sheet
// `burnAt=0`, since they have no user to click), and the bar's own rows: the card waits for the user; a click or Enter
// starts the burn once; the next screen shows when the card is gone; reduced motion shows the end state; without WebGL
// the card and the next screen stay readable; the printed words burn with the paper.
// Run alone: npx vitest run -c vitest.pages.config.ts bars/12-burn-card/gate.test.ts
//
// Limits, each set before any reading of this bar:
// - A card "waits" when every texel of its inner area (10 px in from its edge) has coverage above 0.5 at a frozen
//   time long after any start: 0.5 is the blend's own cut (REFERENCE.md: coverage under a half is a hole).
// - The words' region is read as the frame's standard deviation of luma over the `.card-body` box, against a box of
//   plain ground beside the card in the same frame (the ground carries the finish's grain, so it is not flat). "Gone"
//   is within 1.2 times the ground box's own spread: the same grain and nothing else. "There" is over 8 levels of 255
//   (a printed glyph against paper is far above it).
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CHECKS, gate } from "../../src/checks/gate.ts";
import { closeBrowsers, openPage, type PageHandle, type Rgba } from "../../src/checks/harness.ts";
import { serveRoot } from "../../src/checks/serve.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");
const PAGE = "bars/12-burn-card/";
const BAR = path.resolve(import.meta.dirname);
const SAME = 1.2;
const THERE = 8;

type Box = { x: number; y: number; w: number; h: number };
type Sheet = { coverage: number[] };

let server: { url: string; close(): Promise<void> };
beforeAll(async () => {
  server = await serveRoot(ROOT);
});
afterAll(async () => {
  await server?.close();
  await closeBrowsers();
});

async function withPage(query: string, opts: Parameters<typeof openPage>[1], fn: (h: PageHandle, card: Box) => Promise<void>) {
  const h = await openPage(`${server.url}/${PAGE}${query}`, { width: 960, height: 600, dpr: 1, readyTimeout: 20000, ...opts });
  try {
    await fn(h, await h.hook<Box>("window.__card"));
    console.log(`BAR 12 page errors: ${JSON.stringify(h.errors)}`);
    expect(h.errors).toEqual([]);
  } finally {
    await h.close();
  }
}

/** The lowest and highest coverage of the card's inner area (10 px in from its edge), over the sheet's texels there. */
async function inner(h: PageHandle, c: Box): Promise<{ lo: number; hi: number; n: number }> {
  const s = await h.hook<Sheet>(`__paint.sheetRegion(${c.x + 10}, ${c.y + 10}, ${c.w - 20}, ${c.h - 20})`);
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of s.coverage) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  return { lo, hi, n: s.coverage.length };
}

/** The standard deviation of the frame's luma over a box (0 to 255). */
function spread(f: Rgba, b: Box): number {
  const v: number[] = [];
  for (let y = Math.max(0, Math.round(b.y)); y < Math.min(f.h, Math.round(b.y + b.h)); y++)
    for (let x = Math.max(0, Math.round(b.x)); x < Math.min(f.w, Math.round(b.x + b.w)); x++) {
      const i = (y * f.w + x) * 4;
      v.push(0.2126 * f.data[i]! + 0.7152 * f.data[i + 1]! + 0.0722 * f.data[i + 2]!);
    }
  const m = v.reduce((a, b2) => a + b2, 0) / v.length;
  return Math.sqrt(v.reduce((a, b2) => a + (b2 - m) ** 2, 0) / v.length);
}

describe("12-burn-card", () => {
  // Nine checks at three seeds in a software-WebGL browser: one test per seed and check group (bar 11's split, with flash
  // apart since Phase 2 Task 26: bar.json shortens flash's tail, because the page rests at its settle time), so each stays under the 120 s every page test must keep. Together they assert what one gate at that seed asserts.
  const GROUPS: [string, (n: string) => boolean][] = [
    ["relight", (n) => n === "relight"],
    ["detail", (n) => n === "detail"],
    ["flash", (n) => n === "flash"],
    ["the other six checks", (n) => n !== "relight" && n !== "detail" && n !== "flash"],
  ];
  for (const seed of [1, 2, 3])
    for (const [label, pick] of GROUPS)
      it(`12-burn-card ${label} pass at seed ${seed}`, async () => {
        const r = await gate(BAR, { seeds: [seed] }, CHECKS.filter((c) => pick(c.name)));
        console.log(r.lines.join("\n"));
        expect(r.verdict, r.lines.join("\n")).toBe("passed");
      });

  it("the card waits for the user: without a start the whole card stays, however late the time", async () => {
    await withPage("?seed=1", { t: 0 }, async (h, c) => {
      expect(await h.hook("__burn.startAt"), "the burn has a start time with no user").toBeNull();
      for (const t of [0, 3, 10]) {
        await h.hook(`__paint.setTime(${t})`);
        const cov = await inner(h, c);
        console.log(`BAR 12 waiting, t ${t}: ${cov.n} inner texels, lowest coverage ${cov.lo.toFixed(3)}`);
        expect(cov.lo, `a hole in the card at t ${t}`).toBeGreaterThan(0.5);
      }
    });
  });

  it("a click starts the burn once; a second start is ignored", async () => {
    await withPage("?seed=1", {}, async (h) => {
      await h.page.click(".hit");
      await h.page.waitForTimeout(400);
      const first = await h.hook<number | null>("__burn.startAt");
      expect(first, "the click did not start the burn").not.toBeNull();
      expect(await h.hook<boolean>("document.querySelector('.hit').disabled"), "the press target stays live").toBe(true);
      await h.hook("__burn.start()");
      expect(await h.hook("__burn.startAt"), "a second start moved the burn's start").toBe(first);
    });
  });

  it("Enter on the focused card starts the burn", async () => {
    await withPage("?seed=1", {}, async (h) => {
      await h.page.focus(".hit");
      await h.page.keyboard.press("Enter");
      await h.page.waitForTimeout(400);
      expect(await h.hook("__burn.startAt"), "Enter did not start the burn").not.toBeNull();
    });
  });

  it("the next screen shows after the card is gone, not before", async () => {
    await withPage("?seed=1", {}, async (h, c) => {
      await h.page.click(".hit");
      const start = await h.hook<number>("__burn.startAt");
      await h.hook(`__paint.setTime(${start + 2})`);
      await h.page.waitForTimeout(800);
      expect(await h.hook("document.querySelector('.after').hidden"), "the next screen shows while the card burns").toBe(true);
      expect((await inner(h, c)).hi, "the card is already gone at 2 s").toBeGreaterThan(0.5);
      await h.hook(`__paint.setTime(${start + 8})`);
      await h.page.waitForFunction("document.querySelector('.after').classList.contains('shown')", undefined, { timeout: 5000 });
      expect((await inner(h, c)).hi, "the next screen shows over paper").toBeLessThan(0.5);
      expect(await h.hook("getComputedStyle(document.querySelector('.card')).display"), "the card's words stay up").toBe("none");
    });
  });

  // The wait follows the front, so a taller page, where the front has further to go, waits longer.
  it("a resize during the burn moves the wait with the front", async () => {
    await withPage("?seed=1", {}, async (h) => {
      await h.page.click(".hit");
      const start = await h.hook<number>("__burn.startAt");
      await h.page.setViewportSize({ width: 600, height: 960 });
      // At 6.5 s the front stands at 1.62 short sides: past the 960 x 600 page's wait (1.55), short of the 600 x 960 page's (1.85).
      await h.hook(`__paint.setTime(${start + 6.5})`);
      await h.page.waitForTimeout(800);
      expect(await h.hook("document.querySelector('.after').hidden"), "the wait kept the old page's height").toBe(true);
      await h.hook(`__paint.setTime(${start + 8})`);
      await h.page.waitForFunction("document.querySelector('.after').classList.contains('shown')", undefined, { timeout: 5000 });
    });
  });

  it("on a tall view the click places the front at the card's lowest edge", async () => {
    await withPage("?seed=1", { width: 390, height: 844 }, async (h) => {
      await h.page.click(".hit");
      const front = await h.hook<number>("__burn.frontNow()");
      // The page's half height less the card's half height less the first arrival's depth under the card (index.html's CARD and FIRST_ARRIVAL).
      const edge = (0.5 * 844) / 390 - 0.45 - 0.12;
      console.log(`BAR 12 tall view: the front stands ${front.toFixed(3)} short sides up at the click, the card's edge less the rag ${edge.toFixed(3)}`);
      expect(front, "the click shows nothing until the front climbs to the card").toBeGreaterThanOrEqual(edge - 0.26 / 60 - 1e-6); // the front moves in whole 1/60 s ticks, so the lead can land one tick short
    });
  });

  it("under reduced motion a click shows the end state: the card gone and the next screen up at once", async () => {
    await withPage("?seed=1", { reduced: true }, async (h, c) => {
      await h.page.click(".hit");
      await h.page.waitForFunction("document.querySelector('.after').classList.contains('shown')", undefined, { timeout: 5000 });
      const cov = await inner(h, c);
      console.log(`BAR 12 reduced motion after the click: highest inner coverage ${cov.hi.toFixed(3)}`);
      expect(cov.hi, "paper left on the card in the end state").toBeLessThan(0.5);
    });
  });

  it("without WebGL the card's words are on a card and a click shows the next screen", async () => {
    await withPage("?seed=1", { webgl: false }, async (h) => {
      const bg = await h.hook<string>("getComputedStyle(document.querySelector('.card')).backgroundColor");
      expect(bg, "the fallback card has no background").not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
      expect(await h.hook("document.querySelector('.after').hidden")).toBe(true);
      await h.page.click(".hit");
      await h.page.waitForFunction("document.querySelector('.after').classList.contains('shown')", undefined, { timeout: 5000 });
      expect(await h.hook("getComputedStyle(document.querySelector('.card')).display"), "the card stays behind the next screen").toBe("none");
    });
  });

  it("the printed words burn with the paper: the body text is on the card before the front and gone after it", async () => {
    await withPage("?burnAt=0&seed=1", { t: 0 }, async (h) => {
      const body = await h.hook<Box>("(() => { const r = document.querySelector('.card-body').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()");
      await h.hook("__paint.setTime(0.2)");
      const before = spread(await h.shot(), body);
      await h.hook("__paint.setTime(3.2)");
      const f = await h.shot();
      const after = spread(f, body);
      const ground = spread(f, { x: 20, y: body.y, w: body.w, h: body.h });
      console.log(`BAR 12 body text region spread: ${before.toFixed(2)} before the front, ${after.toFixed(2)} after, plain ground ${ground.toFixed(2)}`);
      expect(before, "no printed words before the front").toBeGreaterThan(THERE);
      expect(after, "words left over the hole").toBeLessThan(ground * SAME);
    });
  });
});
