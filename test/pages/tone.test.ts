// Surface tone (Phase 2 Task 6): a material's `tone` is a position on the page's ramp, so two surfaces take two
// colours from one palette and follow its tokens.
//   1. On test/pages/tone.html a card (slot 1, paper, tone 0.5) on a desk (slot 0, matte, tone 0) differs from the
//      desk by an OKLab distance above tone.minSplit, at seeds 1 to 3, light and dark. Its planted fault
//      test/faults/tone-split-none (the card at tone 0) reads under it.
//   2. A token swap (`__paint.setPalette`) moves the card at once: the swap redraws exactly one frame with the clock
//      frozen, and the card then matches, within palette.visibleMove, the card of a page opened with the swapped
//      tokens. Its planted fault test/faults/tone-read-once (the engine fault 'tone-read-once': tones resolved once,
//      never on a palette change) keeps the old card. The palette check failing that fault is asserted in
//      palette-eval.test.ts.
//   3. The dial reaches a toned matte on a stop (fix round 1): test/pages/tone-stop.html is a desk of matte at tone 0.25
//      (stop 1 on its one-accent palette) whose relief has no detail term, so the dial's only reach is the matte's
//      fine colour variation. Toward a fixed stop 1 that variation was mix(x, x, k): the frames at detail 0 and 1 were
//      the same, a dead dial. It now moves toward `rampAway` (the stop beside the tone that lies farther from it, never
//      the tone's own), so the frame must change, light and dark. The reach at tone 0 is printed beside it for scale;
//      it is not a bound (the rule fixes the albedo's swing, and lighting and the finish shape what the frame shows).
//      And the gate's detail check passes the page, light and dark (it read a rise of exactly 0 toward stop 1).
//   4. Every Phase 1 page renders pixel-identical at its default tone: that is frame-baseline.test.ts, with a baseline
//      written from the build before tone (FRAME_BASELINE=<dir>; it frames bars 01 to 06 and the Phase 1 test pages).
//      Not repeated here. test/unit/palette.test.ts asserts the default tone resolves to the ground to the bit.
// Readings at 960 x 600, dpr 1, t 2, detail 0.5: the conditions tone.minSplit was measured in.
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CHECKS, gate } from "../../src/checks/gate.ts";
import { closeBrowsers, openPage, type OpenOpts, type Rgba } from "../../src/checks/harness.ts";
import { meanOklab, oklabDistance, srgbToOklab } from "../../src/checks/image.ts";
import { serveRoot } from "../../src/checks/serve.ts";
import { threshold } from "../../src/checks/threshold.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");
const PAGE = "test/pages/tone.html";
const STOP = "test/pages/tone-stop.html";
const NO_SPLIT = "test/faults/tone-split-none/index.html";
const READ_ONCE = "test/faults/tone-read-once/index.html";
const VIEW: OpenOpts = { dpr: 1, width: 960, height: 600, t: 2, detail: 0.5 };
// Far tokens for the swap: each far from the page's own light-scheme token (a dark warm ground, a light ink, a green
// accent where the page's is terracotta).
const SWAP = { "--ground": "oklch(0.3 0.08 30)", "--ink": "oklch(0.95 0.03 30)", "--accent": "oklch(0.72 0.12 150)" };

type Box = { x: number; y: number; w: number; h: number };
let server: { url: string; close(): Promise<void> };

beforeAll(async () => {
  server = await serveRoot(ROOT);
});
afterAll(async () => {
  await server?.close();
  await closeBrowsers();
});

const inBox = (f: Rgba, b: Box) => (i: number) => {
  const x = i % f.w;
  const y = Math.floor(i / f.w);
  return x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
};

/** The card's and the desk's mean OKLab on a page, and the split between them. */
async function split(page: string, opts: OpenOpts): Promise<{ split: number; card: number[]; desk: number[] }> {
  const h = await openPage(`${server.url}/${page}`, { ...VIEW, ...opts });
  try {
    const boxes = await h.hook<{ card: Box; desk: Box }>("window.__tone");
    const f = await h.shot();
    expect(h.errors).toEqual([]);
    const card = meanOklab(f, inBox(f, boxes.card));
    const desk = meanOklab(f, inBox(f, boxes.desk));
    return { split: oklabDistance(card, desk), card, desk };
  } finally {
    await h.close();
  }
}

const CASES = [false, true].flatMap((dark) => [1, 2, 3].map((seed) => ({ dark, seed, name: `${dark ? "dark" : "light"} seed ${seed}` })));

describe("tone: a card and a desk in two tones", () => {
  it.each(CASES)("tone.html splits the card from the desk above tone.minSplit: $name", async ({ dark, seed }) => {
    const r = await split(PAGE, { dark, seed });
    console.log(`TONE ${PAGE} ${dark ? "dark" : "light"} seed ${seed}: split ${r.split.toFixed(5)} (card L ${r.card[0]!.toFixed(3)}, desk L ${r.desk[0]!.toFixed(3)})`);
    expect(r.split).toBeGreaterThan(threshold("tone.minSplit", null));
  });

  it.each(CASES)("the planted fault tone-split-none (card at tone 0) reads under tone.minSplit: $name", async ({ dark, seed }) => {
    const r = await split(NO_SPLIT, { dark, seed });
    console.log(`TONE ${NO_SPLIT} ${dark ? "dark" : "light"} seed ${seed}: split ${r.split.toFixed(5)}`);
    expect(r.split).toBeLessThan(threshold("tone.minSplit", null));
  });
});

/**
 * Swaps the tokens on a frozen page and reads the card: the frames the swap itself drew (counted in the same task as
 * the swap, before any observer or tick), and the card's mean OKLab after it, against the card of the same page
 * opened with the swapped tokens from the start.
 */
async function swap(page: string): Promise<{ drawn: number; moved: number; offFresh: number }> {
  const h = await openPage(`${server.url}/${page}`, { ...VIEW, seed: 1 });
  let before: number[];
  let after: number[];
  let drawn: number;
  try {
    const boxes = await h.hook<{ card: Box }>("window.__tone");
    const f0 = await h.shot();
    before = meanOklab(f0, inBox(f0, boxes.card));
    drawn = await h.hook<number>(`(() => { const n = __paint.stats().frames; __paint.setPalette(${JSON.stringify(SWAP)}); return __paint.stats().frames - n; })()`);
    const f1 = await h.shot();
    after = meanOklab(f1, inBox(f1, boxes.card));
    expect(h.errors).toEqual([]);
  } finally {
    await h.close();
  }
  // Set on <html> before any page script runs, as setPalette writes them, so the painter reads them at start.
  // The parser makes <html> after init scripts run, so set them as it appears (before the page's module scripts).
  const init = `new MutationObserver((_, o) => { const el = document.documentElement; if (!el) return; o.disconnect(); for (const [k, v] of Object.entries(${JSON.stringify(SWAP)})) el.style.setProperty(k, v); }).observe(document, { childList: true });`;
  const fresh = await openPage(`${server.url}/${PAGE}`, { ...VIEW, seed: 1, initScript: init });
  let want: number[];
  try {
    const boxes = await fresh.hook<{ card: Box }>("window.__tone");
    // The swapped tokens were there from the start: no palette change was needed to reach them.
    expect(await fresh.hook<string>(`getComputedStyle(document.documentElement).getPropertyValue("--accent").trim()`)).toBe(SWAP["--accent"]);
    const f = await fresh.shot();
    expect(fresh.errors).toEqual([]);
    want = meanOklab(f, inBox(f, boxes.card));
  } finally {
    await fresh.close();
  }
  return { drawn, moved: oklabDistance(before, after), offFresh: oklabDistance(after, want) };
}

describe("tone: the card follows a token swap within one frame", () => {
  it("tone.html: one redraw carries the swap, and the card then matches a page opened with the swapped tokens", async () => {
    const r = await swap(PAGE);
    const visible = threshold("palette.visibleMove", null);
    console.log(`TONE swap ${PAGE}: frames drawn by the swap ${r.drawn}, card moved ${r.moved.toFixed(4)}, off the fresh page's card ${r.offFresh.toFixed(5)}`);
    expect(r.drawn).toBe(1);
    expect(r.moved).toBeGreaterThan(visible);
    expect(r.offFresh).toBeLessThan(visible);
  });

  it("the planted fault tone-read-once keeps the old card after the swap", async () => {
    const r = await swap(READ_ONCE);
    const visible = threshold("palette.visibleMove", null);
    console.log(`TONE swap ${READ_ONCE}: frames drawn by the swap ${r.drawn}, card moved ${r.moved.toFixed(4)}, off the fresh page's card ${r.offFresh.toFixed(5)}`);
    expect(r.moved).toBeLessThan(visible);
    expect(r.offFresh).toBeGreaterThan(visible);
  });
});

/**
 * The dial's reach on a page: the mean per-pixel OKLab distance between its frames at detail 0 and detail 1 (frozen,
 * t 2, seed 1, text hidden, ink and finish grain off, as the detail check reads them).
 */
async function dialReach(page: string, dark: boolean): Promise<number> {
  const h = await openPage(`${server.url}/${page}`, { ...VIEW, seed: 1, detail: 0, dark });
  try {
    await h.hook("__paint.setInk(false)");
    await h.hook("__paint.setGrain(0)");
    const a = await h.shot();
    await h.hook("__paint.setDetail(1)");
    const b = await h.shot();
    expect(h.errors).toEqual([]);
    let sum = 0;
    for (let i = 0; i < a.w * a.h; i++) {
      const p = srgbToOklab(a.data[i * 4]!, a.data[i * 4 + 1]!, a.data[i * 4 + 2]!);
      const q = srgbToOklab(b.data[i * 4]!, b.data[i * 4 + 1]!, b.data[i * 4 + 2]!);
      sum += oklabDistance(p, q);
    }
    return sum / (a.w * a.h);
  } finally {
    await h.close();
  }
}

describe("tone: the detail dial reaches a toned matte on a ramp stop", () => {
  it.each([false, true])("tone-stop.html dark=%s: the dial moves the frame at tone 0.25 (a ramp stop)", async (dark) => {
    const atStop = await dialReach(`${STOP}?tone=0.25`, dark);
    const atGround = await dialReach(`${STOP}?tone=0`, dark);
    console.log(`TONE dial ${STOP} ${dark ? "dark" : "light"}: reach ${atStop.toFixed(5)} at tone 0.25, ${atGround.toFixed(5)} at tone 0`);
    expect(atGround).toBeGreaterThan(0);
    expect(atStop).toBeGreaterThan(0);
  });

  it("tone-stop.html (matte at tone 0.25) passes the detail check", async () => {
    const r = await gate(path.join(ROOT, STOP), { baseUrl: server.url }, CHECKS.filter((c) => c.name === "detail"));
    const res = r.results.find((c) => c.name === "detail")!;
    console.log(`TONE detail ${STOP}: ${res.status}\n  ${res.line}`);
    expect(res.status).toBe("pass");
  });
});
