// Tilt (Phase 2 Task 11; Task 16: the surface turns, the owner's pick at bar 10's look review): the eased pointer tips
// the surface, and the shade pass turns the surface's normal and groove direction by that rotation while the eye, the
// lights and the geometry stay. On test/pages/tilt.html (one sheen dome under a fixed key light, a 480 x 300 card in
// the middle of a 960 x 600 view, tilt max 20, pointer ease from tau 0.1 s):
// - `setTilt` moves the sheen's highlight with no light move, as far as a hand calculation from the dome and the key
//   says for a turned surface (about twice the view-only tilt's move); `null` hands back.
// - `?matte` (the card flat and matte): the diffuse light changes with the tilt, brighter as the card faces the key.
// - the pointer leaving the card eases the tilt back to rest, never snapping (Review Focus 3); the planted fault
//   `tilt-leave-snaps` (a snap to rest) fails that test, and `tilt-surface-fixed` (the surface stays flat) the first.
// - under reduced motion the page is one still frame, and the still check passes on it.
// - a page with no `tilt` option reports [0, 0] and refuses `setTilt`.
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CHECKS, resolveTarget, runEntry } from "../../src/checks/gate.ts";
import { closeBrowsers, openPage, type OpenOpts, type PageHandle, type Rgba } from "../../src/checks/harness.ts";
import { meanAbsDiff } from "../../src/checks/image.ts";
import { serveRoot } from "../../src/checks/serve.ts";
import { easeOfTau } from "../../src/engine/pointer.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");
const VIEW: OpenOpts = { dpr: 1, width: 960, height: 600 };
// The card's box in CSS px (tilt.html), and the page's tilt numbers.
const CARD = { x: 240, y: 150, w: 480, h: 300 };
const MAX = 20;
const EASE = easeOfTau(0.1);

let server: { url: string; close(): Promise<void> };
const url = (page = "tilt", query = "") => `${server.url}/test/pages/${page}.html${query}`;

beforeAll(async () => {
  server = await serveRoot(ROOT);
});
afterAll(async () => {
  await server?.close();
  await closeBrowsers();
});

async function withPage(u: string, opts: OpenOpts, fn: (h: PageHandle) => Promise<void>) {
  const h = await openPage(u, { ...VIEW, ...opts });
  try {
    await fn(h);
  } finally {
    await h.close();
  }
}
const faultScript = (f: string) => `globalThis.__PAINT_TEST_FAULT = ${JSON.stringify(f)};`;

/** The highlight's place: the centroid of the card's brightest 1% of pixels (Rec. 709 luminance), in CSS px. */
function highlight(f: Rgba): { x: number; y: number } {
  const lum: { l: number; x: number; y: number }[] = [];
  for (let y = CARD.y; y < CARD.y + CARD.h; y++) {
    for (let x = CARD.x; x < CARD.x + CARD.w; x++) {
      const o = (y * f.w + x) * 4;
      lum.push({ l: 0.2126 * f.data[o]! + 0.7152 * f.data[o + 1]! + 0.0722 * f.data[o + 2]!, x, y });
    }
  }
  lum.sort((a, b) => b.l - a.l);
  const top = lum.slice(0, Math.ceil(lum.length * 0.01));
  return { x: top.reduce((s, p) => s + p.x, 0) / top.length, y: top.reduce((s, p) => s + p.y, 0) / top.length };
}

type Tilt = [number, number];
const tiltNow = (h: PageHandle) => h.hook<Tilt>("__paint.tilt()");

/**
 * The tilt the highlight test turns by: 8 degrees, where the turned highlight stays well inside the dome (the dome's
 * steepest normal, at its rim, leans 14.9 degrees; at the page's max of 20 the surface's highlight would need a normal
 * leaning about 20 degrees and would leave the dome). Builder: chosen from the dome's geometry, before measuring.
 */
const DEG = 8;

/** The highlight's moves under setTilt([DEG, 0]) and setTilt([0, DEG]) from setTilt([0, 0]), and whether the lights held. */
async function highlightMoves(h: PageHandle) {
  const lights = await h.hook<unknown>("__paint.lights()");
  await h.hook("__paint.setTilt([0, 0])");
  const flat = await h.shot();
  await h.hook(`__paint.setTilt([${DEG}, 0])`);
  const right = await h.shot();
  await h.hook(`__paint.setTilt([0, ${DEG}])`);
  const up = await h.shot();
  const [f, r, u] = [flat, right, up].map(highlight) as [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }];
  return { dxRight: r.x - f.x, dyUp: u.y - f.y, lightsHeld: JSON.stringify(await h.hook<unknown>("__paint.lights()")) === JSON.stringify(lights), flat };
}

/**
 * The hand calculation of the highlight's place on tilt.html's dome, in CSS px from the card's centre (x right, y up),
 * written here from the page's geometry, not from the engine. The dome is h(q) = 0.06 (1 - |q|^2 / 0.45^2) in
 * short-side units, so its normal is (k x, k y, 1) normalised, k = 2 x 0.06 / 0.45^2. A round highlight peaks where
 * the normal is the half vector h of the light l and the eye: k x = h.x / h.z. The key is tilt.html's dir
 * (0.15, 0.2, 1), normalised. A tilt [a, b] is the rotation R: b about the horizontal axis (top away), then a about
 * the vertical one (right side away), so R^T z = (-sin a, -sin b cos a, cos a cos b).
 * - `surface` (the engine since Task 16): the card turns by R under a fixed eye and light, so the dome's own normal must
 *   be R^T (l + z): the light and the eye as the turned card sees them.
 * - `view` (Task 11's view-only tilt, for comparison): the light held in the card's frame and the eye at R^T z, so
 *   h = l + R^T z.
 * The card's short side is 300 CSS px (one short-side unit).
 */
function highlightAt([a, b]: [number, number], how: "surface" | "view"): { x: number; y: number } {
  const k = (2 * 0.06) / (0.45 * 0.45);
  const ln = Math.hypot(0.15, 0.2, 1);
  const l = [0.15 / ln, 0.2 / ln, 1 / ln];
  const [ra, rb] = [(a * Math.PI) / 180, (b * Math.PI) / 180];
  // R^T v: undo a about the vertical axis, then b about the horizontal one.
  const unturn = (v: number[]) => {
    const x1 = v[0]! * Math.cos(ra) - v[2]! * Math.sin(ra);
    const z1 = v[0]! * Math.sin(ra) + v[2]! * Math.cos(ra);
    const y2 = v[1]! * Math.cos(rb) - z1 * Math.sin(rb);
    const z2 = v[1]! * Math.sin(rb) + z1 * Math.cos(rb);
    return [x1, y2, z2];
  };
  const h = how === "surface" ? unturn([l[0]!, l[1]!, l[2]! + 1]) : ((e) => [l[0]! + e[0]!, l[1]! + e[1]!, l[2]! + e[2]!])(unturn([0, 0, 1]));
  return { x: ((h[0]! / h[2]!) / k) * CARD.h, y: ((h[1]! / h[2]!) / k) * CARD.h };
}

describe("tilt", () => {
  it("setTilt moves the sheen's highlight as far as the hand calculation says for a turned surface, with no light move; null hands back to the pointer", async () => {
    await withPage(url(), { t: 0 }, async (h) => {
      const m = await highlightMoves(h);
      const flat = highlightAt([0, 0], "surface");
      const want = { dx: highlightAt([DEG, 0], "surface").x - flat.x, dyUp: highlightAt([0, DEG], "surface").y - flat.y };
      const viewOnly = { dx: highlightAt([DEG, 0], "view").x - flat.x, dyUp: highlightAt([0, DEG], "view").y - flat.y };
      console.log(
        `highlight move at ${DEG} degrees: right tilt dx ${m.dxRight.toFixed(1)} px, up tilt dy ${m.dyUp.toFixed(1)} px (screen y down); ` +
          `hand calculation, surface turned: dx ${want.dx.toFixed(1)}, dy ${(-want.dyUp).toFixed(1)}; view turned (Task 11): dx ${viewOnly.dx.toFixed(1)}, dy ${(-viewOnly.dyUp).toFixed(1)}`,
      );
      expect(m.lightsHeld).toBe(true);
      // Within 15% of the turned surface's hand calculation (builder: the centroid of the brightest 1% against the
      // lobe's peak, over the pixel grid; Task 11's reading sat 5% off its own hand calculation). The view-only tilt
      // predicts about half the move, outside that band. The screen's y runs down, the card's up.
      expect(Math.abs(m.dxRight - want.dx)).toBeLessThan(0.15 * Math.abs(want.dx));
      expect(Math.abs(-m.dyUp - want.dyUp)).toBeLessThan(0.15 * Math.abs(want.dyUp));
      expect(Math.abs(viewOnly.dx - want.dx)).toBeGreaterThan(0.15 * Math.abs(want.dx));
      expect(Math.abs(viewOnly.dyUp - want.dyUp)).toBeGreaterThan(0.15 * Math.abs(want.dyUp));
      expect(await tiltNow(h)).toEqual([0, DEG]);
      // null: back to the pointer, which rests at the centre on a frozen page with no path.
      await h.hook("__paint.setTilt(null)");
      expect(await tiltNow(h)).toEqual([0, 0]);
      expect(meanAbsDiff(await h.shot(), m.flat)).toBe(0);
      expect(h.errors).toEqual([]);
    });
  });

  it("the planted fault tilt-surface-fixed (the surface stays flat) leaves the highlight where it was", async () => {
    await withPage(url(), { t: 0, initScript: faultScript("tilt-surface-fixed") }, async (h) => {
      const m = await highlightMoves(h);
      expect(m.dxRight).toBe(0);
      expect(m.dyUp).toBe(0);
    });
  });

  /** The card's mean linear luminance (Rec. 709 on the sRGB-decoded channels). */
  const meanLinear = (f: Rgba) => {
    const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    let s = 0;
    for (let y = CARD.y; y < CARD.y + CARD.h; y++)
      for (let x = CARD.x; x < CARD.x + CARD.w; x++) {
        const o = (y * f.w + x) * 4;
        s += 0.2126 * lin(f.data[o]!) + 0.7152 * lin(f.data[o + 1]!) + 0.0722 * lin(f.data[o + 2]!);
      }
    return s / (CARD.w * CARD.h);
  };

  it("on a flat matte card the diffuse light changes with the tilt: brighter as the card faces the key, darker as it turns away", async () => {
    await withPage(url("tilt", "?matte"), { t: 0 }, async (h) => {
      const at = async (d: Tilt) => (await h.hook(`__paint.setTilt(${JSON.stringify(d)})`), meanLinear(await h.shot()));
      const flat = await at([0, 0]);
      const away = await at([0, -MAX]);
      const left = await at([-MAX, 0]);
      const right = await at([MAX, 0]);
      // The key (0.15, 0.2, 1) normalised; a turned card's normal is R z = (sin a cos b, sin b, cos a cos b). The matte
      // diffuse is (n.l + wrap) / (1 + wrap), wrap 0.15 (materials.matte). With no ambient the darker frame's share of
      // the flat one would be this; the ambient (0.2) only brings it closer to 1.
      const ln = Math.hypot(0.15, 0.2, 1);
      const lit = (nx: number, ny: number, nz: number) => ((nx * 0.15 + ny * 0.2 + nz) / ln + 0.15) / 1.15;
      const r = (MAX * Math.PI) / 180;
      const keyOnly = lit(0, -Math.sin(r), Math.cos(r)) / lit(0, 0, 1);
      console.log(`matte diffuse (mean linear luminance): flat ${flat.toFixed(5)}, top toward the viewer ${away.toFixed(5)} (share ${(away / flat).toFixed(4)}, key alone ${keyOnly.toFixed(4)}), left away ${left.toFixed(5)}, right away ${right.toFixed(5)}`);
      // The view-only tilt left matte exactly as it was (the eye is not in diffuse light).
      expect(away / flat).toBeLessThan(0.98);
      expect(away / flat).toBeGreaterThan(keyOnly - 0.01);
      // The key comes from the right (x 0.15): the card whose right side went away faces it more than the one whose left did.
      expect(right).toBeGreaterThan(left);
      expect(h.errors).toEqual([]);
    });
  });

  /** Live: tip the card fully right, then leave it; the tilt about the vertical axis, once per frame, after leaving. */
  async function leaveTrace(h: PageHandle): Promise<{ before: number; trace: number[] }> {
    await h.page.mouse.move(CARD.x + CARD.w - 1, CARD.y + CARD.h / 2);
    await h.page.waitForFunction(`window.__paint.tilt()[0] > ${0.95 * MAX}`, undefined, { timeout: 20_000 });
    const before = (await tiltNow(h))[0];
    // Off the card, still inside the view: the page's pointer has left the canvas.
    await h.page.mouse.move(CARD.x + CARD.w + 100, CARD.y + CARD.h / 2);
    const trace = await h.hook<number[]>(`new Promise((done) => {
      const out = [];
      const step = () => { out.push(window.__paint.tilt()[0]); out.length < 16 ? requestAnimationFrame(step) : done(out); };
      requestAnimationFrame(step);
    })`);
    return { before, trace };
  }

  it("the pointer leaving the card eases the tilt back to rest, never snapping (Review Focus 3)", async () => {
    await withPage(url(), {}, async (h) => {
      const { before, trace } = await leaveTrace(h);
      console.log(`leave: before ${before.toFixed(3)}, per frame ${trace.map((v) => v.toFixed(2)).join(" ")}`);
      // A live frame is at most 1/30 s, two ticks (three to allow for the rounding of t): per frame the tilt keeps at
      // least (1 - ease)^3 of itself, and never grows.
      const keep = (1 - EASE) ** 3;
      let prev = before;
      for (const v of trace) {
        expect(v).toBeLessThanOrEqual(prev + 1e-9);
        expect(v).toBeGreaterThanOrEqual(prev * keep - 1e-9);
        prev = v;
      }
      expect(trace.at(-1)!).toBeLessThan(before);
      await h.page.waitForFunction(`Math.abs(window.__paint.tilt()[0]) < ${0.01 * MAX}`, undefined, { timeout: 20_000 });
      expect(h.errors).toEqual([]);
    });
  });

  it("the planted fault tilt-leave-snaps (a jump to rest) fails the leave's ease", async () => {
    await withPage(url(), { initScript: faultScript("tilt-leave-snaps") }, async (h) => {
      const { before, trace } = await leaveTrace(h);
      const keep = (1 - EASE) ** 3;
      expect(trace[0]!).toBeLessThan(before * keep);
      expect(trace[0]!).toBe(0);
    });
  });

  it("under reduced motion the tilted page is one still frame, whatever the pointer does", async () => {
    await withPage(url(), { reduced: true }, async (h) => {
      const framesOf = async () => (await h.hook<{ frames: number }>("__paint.stats()")).frames;
      await h.page.waitForFunction(`window.__paint.motion() === "still"`, undefined, { timeout: 20_000 });
      const a = await h.shot("tilt-reduced-a");
      const framesA = await framesOf();
      await h.page.mouse.move(CARD.x + CARD.w - 1, CARD.y + 1);
      await h.page.waitForTimeout(1500);
      const b = await h.shot("tilt-reduced-b");
      expect(meanAbsDiff(a, b)).toBe(0);
      expect(await framesOf()).toBe(framesA);
      expect(await tiltNow(h)).toEqual([0, 0]);
      expect(await h.hook<string>("__paint.motion()")).toBe("still");
      expect(h.errors).toEqual([]);
    });
  });

  it("the still check passes on the tilt page", async () => {
    const r = await runEntry(CHECKS.find((c) => c.name === "still")!, resolveTarget(path.join(ROOT, "test/pages/tilt.html"), {}, server.url), {});
    console.log(r.line);
    expect(r.status).toBe("pass");
  });

  it("a page with no tilt option reports [0, 0] and refuses setTilt", async () => {
    await withPage(url("core"), { t: 0 }, async (h) => {
      expect(await tiltNow(h)).toEqual([0, 0]);
      await expect(h.hook("__paint.setTilt([10, 0])")).rejects.toThrow(/no tilt option/);
    });
  });

  it("the tilt page in light and dark (for the report's look)", async () => {
    for (const dark of [false, true]) {
      await withPage(url(), { t: 0, dark }, async (h) => {
        await h.hook(`__paint.setTilt([${MAX * 0.6}, ${MAX * 0.3}])`);
        await h.shot(dark ? "tilt-dark" : "tilt-light");
        expect(h.errors).toEqual([]);
      });
    }
  });
});
