// The burn law's pure helpers (Phase 2 Task 21): the five frozen times, the burned share's largest drop (a), the distance
// from the front, the scorch reading (b), the ember reading by distance from the front (c) and the verdict.
// test/pages/burn.test.ts runs the law end to end on burn.html and its planted faults.
import { describe, expect, it } from "vitest";
import {
  BURN_MIN_PX,
  burnTimes,
  burnVerdict,
  emberReading,
  frontDistance,
  scorchReading,
  shareDrop,
  type BurnFrame,
  type BurnReading,
  type EmberReading,
} from "../../src/checks/relight.ts";
import type { Rgba } from "../../src/checks/harness.ts";

/** A w x h frame where pixel (x, y) has the RGB `rgb(x, y)`. */
const frame = (w: number, h: number, rgb: (x: number, y: number) => [number, number, number]): Rgba => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = rgb(x, y);
      data.set([r, g, b, 255], (y * w + x) * 4);
    }
  return { w, h, data } as unknown as Rgba;
};
const grey = (v: number) => () => [v, v, v] as [number, number, number];
const lin = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const LIM = { jitter: 0.02, scorch: 0.01, band: 0.01, fade: 0.5 };
const EMBER_OK: EmberReading = { warmth: 0.01, near: 5000, diff: 0, beyond: 5000, inner: 0.1, innerN: 3000, outer: 0.01, outerN: 3000, fade: 0.1 };
const OK: BurnReading = { times: [1, 2, 3, 4, 5], shares: [0, 0.1, 0.2, 0.3, 0.4], scorch: { drop: 0.05, n: 5000 }, ember: EMBER_OK };

describe("burn law helpers (Phase 2 Task 21)", () => {
  it("burnTimes: five times across the alive window, else t 1 to 5", () => {
    expect(burnTimes({ t0: 0, t1: 8 })).toEqual([0, 2, 4, 6, 8]);
    expect(burnTimes()).toEqual([1, 2, 3, 4, 5]);
    expect(burnTimes({ rests: "still" })).toEqual([1, 2, 3, 4, 5]);
  });

  it("shareDrop: the largest drop between neighbours, 0 when the share only grows", () => {
    expect(shareDrop([0.1, 0.2, 0.15, 0.3, 0.25])).toBeCloseTo(0.05, 10);
    expect(shareDrop([0, 0.1, 0.1, 0.4, 0.9])).toBe(0);
    expect(shareDrop([0.5, 0.2])).toBeCloseTo(0.3, 10);
  });

  it("frontDistance: Euclidean distance to the nearest reached texel, in short-side units", () => {
    // 10 x 5: column 0 burned (param 0.3), the rest ahead (code 0). Short side 5.
    const w = 10;
    const h = 5;
    const code = Array.from({ length: w * h }, (_, k) => (k % w === 0 ? 0.3 : 0));
    const d = frontDistance(code, w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) expect(d[y * w + x]).toBeCloseTo(x / 5, 9);
    // A single burned texel (param 0.5) at (7, 2): distances are hypotenuses.
    const one = Array.from({ length: w * h }, (_, k) => (k === 2 * w + 7 ? 0.5 : 0));
    const e = frontDistance(one, w, h);
    expect(e[0]).toBeCloseTo(Math.hypot(7, 2) / 5, 9);
    expect(e[4 * w + 9]).toBeCloseTo(Math.hypot(2, 2) / 5, 9);
    // Ground or a hole (coverage under full, code -1) is not the front: a card's edge on the ground is not reached by
    // the burn (Task 21 fix round 1, I1). Column 0 burned, column 9 ground: (8, y) is 8 texels from the front, not 1.
    const ground = Array.from({ length: w * h }, (_, k) => (k % w === 0 ? 0.3 : k % w === 9 ? -1 : 0));
    expect(frontDistance(ground, w, h)[2 * w + 8]).toBeCloseTo(8 / 5, 9);
    expect([...frontDistance(new Array(w * h).fill(-1), w, h)].every((v) => v === Infinity)).toBe(true);
    // Nothing reached: no front, so no distance.
    expect([...frontDistance(new Array(w * h).fill(0), w, h)].every((v) => v === Infinity)).toBe(true);
  });

  it("scorchReading: the same pixels from param 0 to param in (0, 0.5), mean relative luminance drop", () => {
    const tex = (code: number[]) => ({ w: 4, h: 1, code });
    const frames: BurnFrame[] = [
      { t: 1, tex: tex([0, 0, 0, -1]), on: null, off: frame(4, 1, grey(200)) },
      // Pixel 0 enters the band (0.2): read. Pixel 1 is past half the band (0.6): not read. Pixel 2 is still ahead.
      { t: 2, tex: tex([0.2, 0.6, 0, -1]), on: null, off: frame(4, 1, grey(100)) },
    ];
    const r = scorchReading(frames);
    expect(r.n).toBe(1);
    expect(r.drop).toBeCloseTo(lin(200) - lin(100), 6);
    // A clean wipe: the band pixel keeps its luminance.
    const clean = scorchReading([frames[0]!, { ...frames[1]!, off: frame(4, 1, (x) => (x === 0 ? [200, 200, 200] : [100, 100, 100])) }]);
    expect(clean).toEqual({ drop: 0, n: 1 });
  });

  it("emberReading: warmth near the front, nothing beyond, the added light fading out to reach", () => {
    // 20 x 10, column 0 burned; short side 10, reach 1: near is x 1 to 5 (d under 0.6), beyond x 13+; the fade's inner
    // quarter is x 1 and 2 (d under 0.25), its outer quarter x 8 and 9 (d 0.75 to 1).
    const w = 20;
    const h = 10;
    const tex = { w, h, code: Array.from({ length: w * h }, (_, k) => (k % w === 0 ? 0.3 : 0)) };
    const off = frame(w, h, grey(128));
    const warm = (x: number) => (x === 0 ? 0 : Math.max(0, 40 * (1 - x / 10)));
    const honest = emberReading([{ t: 1, tex, on: frame(w, h, (x) => [128 + warm(x), 128, 128 - warm(x) / 2]), off }], [1, 0], 1);
    expect(honest.near).toBe(5 * h);
    expect(honest.beyond).toBe(7 * h);
    expect(honest.innerN).toBe(2 * h);
    expect(honest.outerN).toBe(2 * h);
    expect(honest.warmth).toBeGreaterThan(0);
    expect(honest.diff).toBe(0);
    expect(honest.fade).toBeGreaterThan(0);
    expect(honest.fade).toBeLessThan(0.5);
    // No falloff: the same light everywhere ahead. Beyond changes, and the fade reads 1.
    const flat = emberReading([{ t: 1, tex, on: frame(w, h, (x) => (x === 0 ? [128, 128, 128] : [160, 128, 112])), off }], [1, 0], 1);
    expect(flat.diff).toBeGreaterThan(0.01);
    expect(flat.fade).toBeCloseTo(1, 9);
    // A step: flat out to reach, then nothing. Beyond reads 0, so only the fade (1) tells it from a falloff.
    const step = emberReading([{ t: 1, tex, on: frame(w, h, (x) => (x === 0 || x >= 10 ? [128, 128, 128] : [160, 128, 112])), off }], [1, 0], 1);
    expect(step.diff).toBe(0);
    expect(step.warmth).toBeGreaterThan(0);
    expect(step.fade).toBeCloseTo(1, 9);
    // A dark ember: on equals off, no light near, so no fade to read.
    const dark = emberReading([{ t: 1, tex, on: off, off }], [1, 0], 1);
    expect(dark.warmth).toBe(0);
    expect(dark.inner).toBe(0);
    expect(dark.fade).toBeNull();
    // Warmth is read toward the ember's hue: the same change against a hue the other way reads negative.
    expect(emberReading([{ t: 1, tex, on: frame(w, h, (x) => [128 + warm(x), 128, 128 - warm(x) / 2]), off }], [-1, 0], 1).warmth).toBeLessThan(0);
  });

  it("burnVerdict: each part fails or reads partial by its own name", () => {
    expect(burnVerdict(OK, LIM).status).toBe("pass");
    const a = burnVerdict({ ...OK, shares: [0, 0.2, 0.1, 0.3, 0.4] }, LIM);
    expect(a.status).toBe("fail");
    expect(a.line).toMatch(/\(a\) FAIL/);
    expect(a.measured["burn.jitter"]).toBeCloseTo(0.1, 10);
    const still = burnVerdict({ ...OK, shares: [0.3, 0.3, 0.3, 0.3, 0.3] }, LIM);
    expect(still.status).toBe("partial");
    expect(still.line).toMatch(/\(a\) PARTIAL/);
    const b = burnVerdict({ ...OK, scorch: { drop: 0.005, n: 5000 } }, LIM);
    expect(b.status).toBe("fail");
    expect(b.line).toMatch(/\(b\) FAIL/);
    expect(burnVerdict({ ...OK, scorch: { drop: 0.05, n: BURN_MIN_PX - 1 } }, LIM).line).toMatch(/\(b\) PARTIAL/);
    const cold = burnVerdict({ ...OK, ember: { ...EMBER_OK, warmth: 0 } }, LIM);
    expect(cold.status).toBe("fail");
    expect(cold.line).toMatch(/\(c\) FAIL.*warm/);
    const wide = burnVerdict({ ...OK, ember: { ...EMBER_OK, diff: 0.05 } }, LIM);
    expect(wide.status).toBe("fail");
    expect(wide.line).toMatch(/\(c\) FAIL.*beyond/);
    const stepped = burnVerdict({ ...OK, ember: { ...EMBER_OK, fade: 0.9 } }, LIM);
    expect(stepped.line).toMatch(/\(c\) FAIL: the light the ember adds does not fade/);
    expect(stepped.measured["burn.ember.fade"]).toBe(0.9);
    expect(burnVerdict({ ...OK, ember: { ...EMBER_OK, inner: 0, fade: null } }, LIM).line).toMatch(/\(c\) FAIL.*adds no light near the front/);
    expect(burnVerdict({ ...OK, ember: { ...EMBER_OK, outerN: BURN_MIN_PX - 1 } }, LIM).line).toMatch(/\(c\) PARTIAL/);
    const empty = burnVerdict({ ...OK, ember: { ...EMBER_OK, beyond: 0 } }, LIM);
    expect(empty.status).toBe("partial");
    expect(empty.line).toMatch(/\(c\) PARTIAL/);
    expect(burnVerdict({ ...OK, ember: { why: "no ember light on the page" } }, LIM).line).toMatch(/\(c\) PARTIAL: no ember light/);
    // A fail outranks a partial.
    expect(burnVerdict({ ...OK, scorch: { drop: 0, n: 5000 }, ember: { ...EMBER_OK, beyond: 0 } }, LIM).status).toBe("fail");
  });
});
