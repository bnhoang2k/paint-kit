import { describe, expect, it } from "vitest";
import { boxBlur, gradientMagnitude, highPassStd, lagsAround, longestRun, longestStaircaseRun, luminance, meanAbsDiff, meanOklab, smoothMask, textureShift } from "../../src/checks/image.ts";
import type { Rgba } from "../../src/checks/harness.ts";

const solid = (w: number, h: number, r: number, g: number, b: number): Rgba => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([r, g, b, 255], i * 4);
  return { w, h, data };
};

describe("image helpers", () => {
  it("longest run counts one level", () => {
    // Row 0 holds 7,7,7 then 8,8 (a run of 3); row 1 holds 5 four times (a run of 4); runs never cross rows.
    const levels = [7, 7, 7, 8, 8, 5, 5, 5, 5, 6];
    expect(longestRun(levels, 5, 2)).toBe(4);
    expect(longestRun([1, 1, 1, 1, 2, 2], 3, 2)).toBe(3);
  });

  it("longest run honours the mask", () => {
    const levels = [4, 4, 4, 4, 4, 4];
    const mask = Uint8Array.from([1, 1, 0, 1, 1, 1]);
    expect(longestRun(levels, 6, 1, mask)).toBe(3);
  });

  it("high-pass std of flat image is 0", () => {
    const lum = luminance(solid(16, 16, 120, 130, 140));
    expect(highPassStd(lum, 16, 16)).toBe(0);
  });

  it("high-pass std of a checkerboard is above 0", () => {
    const lum = new Float32Array(64);
    for (let i = 0; i < 64; i++) lum[i] = ((i % 8) + Math.floor(i / 8)) % 2;
    expect(highPassStd(lum, 8, 8)).toBeGreaterThan(0.2);
  });

  it("box blur keeps a flat image flat and gradient of flat is 0", () => {
    const flat = new Float32Array(100).fill(0.4);
    expect([...boxBlur(flat, 10, 10, 3)].every((v) => Math.abs(v - 0.4) < 1e-6)).toBe(true);
    expect(Math.max(...gradientMagnitude(flat, 10, 10))).toBe(0);
  });

  it("smooth mask selects a gentle ramp and rejects a flat field and a hard edge", () => {
    const w = 64;
    const h = 8;
    const ramp = new Float32Array(w * h);
    const step = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        ramp[y * w + x] = x / 1000;
        step[y * w + x] = x < 32 ? 0 : 1;
      }
    const count = (m: Uint8Array) => m.reduce((s, v) => s + v, 0);
    expect(count(smoothMask(new Float32Array(w * h), w, h, 4, 0.01))).toBe(0);
    expect(count(smoothMask(ramp, w, h, 4, 0.01))).toBeGreaterThan(w * h * 0.5);
    expect(count(smoothMask(step, w, h, 4, 0.01))).toBeLessThan(w * h * 0.5);
  });

  it("meanAbsDiff and meanOklab", () => {
    const a = solid(4, 4, 255, 255, 255);
    expect(meanAbsDiff(a, solid(4, 4, 255, 255, 255))).toBe(0);
    expect(meanAbsDiff(a, solid(4, 4, 0, 0, 0))).toBeCloseTo(1, 6);
    const white = meanOklab(a);
    expect(white[0]).toBeCloseTo(1, 2);
    expect(Math.abs(white[1])).toBeLessThan(0.01);
  });

  // One row of grey levels as a frame.
  const row = (...v: number[]): Rgba => {
    const data = new Uint8ClampedArray(v.length * 4);
    v.forEach((g, i) => data.set([g, g, g, 255], i * 4));
    return { w: v.length, h: 1, data };
  };
  const all = (n: number) => new Uint8Array(n).fill(1);

  it("staircase run counts a quantised ramp: one step darker on one end, one lighter on the other", () => {
    expect(longestStaircaseRun(row(4, 5, 5, 5, 6), all(5))).toBe(3);
  });

  it("staircase run ignores a flat plateau and a run with two same-side neighbours", () => {
    expect(longestStaircaseRun(row(9, 5, 5, 5, 5, 9), all(6))).toBe(0); // steps of 4: an edge, not a ramp
    expect(longestStaircaseRun(row(4, 5, 5, 5, 4), all(5))).toBe(0); // both neighbours darker: a ridge
    expect(longestStaircaseRun(row(5, 5, 5, 5, 5), all(5))).toBe(0); // no ends: a flat fill
  });

  it("staircase run keeps the longest qualifying run only", () => {
    expect(longestStaircaseRun(row(1, 2, 2, 3, 3, 3, 3, 4, 9, 9), all(10))).toBe(4);
  });
});

describe("textureShift", () => {
  // Seeded noise, and the same noise moved right 5 and down 3 px: the peak must sit at (5, 3), not at (0, 0).
  const noise = (w: number, h: number, ox: number, oy: number) => {
    const data = new Uint8ClampedArray(w * h * 4);
    const at = (x: number, y: number) => {
      const s = Math.sin((x - ox) * 12.9898 + (y - oy) * 78.233) * 43758.5453;
      return s - Math.floor(s);
    };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set([at(x, y) * 255, at(x, y) * 255, at(x, y) * 255, 255], (y * w + x) * 4);
    return { w, h, data };
  };
  it("finds the lag the fine texture moved by", () => {
    const r = textureShift(noise(80, 60, 0, 0), noise(80, 60, 5, 3), { x: 10, y: 10, w: 50, h: 35 }, lagsAround([[0, 0], [5, 3]], 2));
    expect([r.dx, r.dy]).toEqual([5, 3]);
    expect(r.score).toBeGreaterThan(0.99);
    expect(r.at.get("0,0")!).toBeLessThan(0.2);
  });
  it("a wider box (radius) reads a coarse texture", () => {
    // A smooth 2-D wave about 24 px per half period (no fine detail), moved right 4 px and down 2 px: a 33 x 33
    // box (radius 16) keeps it and finds the move.
    const stripes = (ox: number, oy: number) => {
      const w = 120, h = 100;
      const data = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = 128 + 50 * Math.sin(((x - ox) * 2 * Math.PI) / 48) + 50 * Math.sin(((y - oy) * 2 * Math.PI) / 44); data.set([v, v, v, 255], (y * w + x) * 4); }
      return { w, h, data };
    };
    const r = textureShift(stripes(0, 0), stripes(4, 2), { x: 30, y: 30, w: 60, h: 40 }, lagsAround([[0, 0], [4, 2]], 2), 16);
    expect([r.dx, r.dy]).toEqual([4, 2]);
  });
  it("lists each lag once", () => {
    expect(lagsAround([[0, 0], [1, 0]], 1)).toHaveLength(12);
  });
});
