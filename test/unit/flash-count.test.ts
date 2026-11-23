// The flash check's counting core (src/checks/flash-count.ts) on synthetic frame sequences: the WCAG 2.3.1 rule
// (pairs of opposing transitions, 10% luminance, darker state below 0.80, saturated red, 25% of a 341 x 256 CSS px
// window, any 1 s) without a browser. Frames are 60 fps; one frame is FPS-th of a second.
import { describe, expect, it } from "vitest";
import { cellsOf, countFlashes, FLASH_RULE, transitions } from "../../src/checks/flash-count.ts";
import type { Rgba } from "../../src/checks/harness.ts";

const FPS = 60;
const W = 960;
const H = 600;

type Rgb = [number, number, number];
type Patch = { x: number; y: number; w: number; h: number; rgb: Rgb; checker?: { side: number; phase: 0 | 1; other: Rgb } };

/** A W x H frame of one 8-bit colour, with an optional rectangle of another (or of a checkerboard of two). */
function frame(rgb: Rgb, patch?: Patch): Rgba {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const inside = patch && x >= patch.x && x < patch.x + patch.w && y >= patch.y && y < patch.y + patch.h;
      const k = patch?.checker;
      const odd = k ? ((Math.floor((x - patch.x) / k.side) + Math.floor((y - patch.y) / k.side) + k.phase) & 1) === 1 : false;
      const c = inside ? (odd ? k!.other : patch.rgb) : rgb;
      const o = (y * W + x) * 4;
      data[o] = c[0];
      data[o + 1] = c[1];
      data[o + 2] = c[2];
      data[o + 3] = 255;
    }
  return { w: W, h: H, data };
}

const LIGHT: [number, number, number] = [245, 245, 245];
const DARK: [number, number, number] = [30, 30, 30];

/** `seconds` of a square wave at `hz` flashes per second between two frames. */
function wave(hz: number, a: Rgba, b: Rgba, seconds = 2): ReturnType<typeof cellsOf>[] {
  const ca = cellsOf(a);
  const cb = cellsOf(b);
  const out = [];
  for (let i = 0; i <= seconds * FPS; i++) out.push(Math.floor((i / FPS) * hz * 2 + 1e-9) % 2 === 0 ? ca : cb);
  return out;
}

describe("transitions (adjacent peaks and valleys, WCAG 2.3.1 Note 2)", () => {
  it("counts a slow ramp once, from valley to peak", () => {
    const s = Float32Array.from([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.4, 0.3, 0.2]);
    expect(transitions(s, 0.1).map((t) => [t.a, t.b])).toEqual([[0, 5], [5, 8]]);
  });

  it("merges a reversal smaller than the transition size into the leg around it", () => {
    const s = Float32Array.from([0, 0.06, 0.05, 0.12, 0.0]);
    expect(transitions(s, 0.1).map((t) => [t.a, t.b])).toEqual([[0, 3], [3, 4]]);
  });

  it("finds nothing in a change under the transition size", () => {
    expect(transitions(Float32Array.from([0.3, 0.35, 0.31, 0.38]), 0.1)).toEqual([]);
  });
});

describe("countFlashes", () => {
  it("fails a full-frame 5 Hz light/dark swap: 5 general flashes per s", () => {
    const r = countFlashes(wave(5, frame(LIGHT), frame(DARK)), FPS);
    expect(r.general.flashes).toBe(5);
    expect(r.general.flashes).toBeGreaterThan(FLASH_RULE.maxPerSecond);
    expect(r.red.flashes).toBe(0);
  });

  it("passes 2 Hz and 3 Hz (no more than three), fails 4 Hz", () => {
    expect(countFlashes(wave(2, frame(LIGHT), frame(DARK)), FPS).general.flashes).toBe(2);
    expect(countFlashes(wave(3, frame(LIGHT), frame(DARK)), FPS).general.flashes).toBe(3);
    expect(countFlashes(wave(4, frame(LIGHT), frame(DARK)), FPS).general.flashes).toBe(4);
  });

  it("does not count a swap whose darker state is at or above 0.80", () => {
    // sRGB 235 is relative luminance 0.83; 255 is 1.0: a 17% change, but the darker state is not below 0.80.
    expect(countFlashes(wave(5, frame([255, 255, 255]), frame([235, 235, 235])), FPS).general.flashes).toBe(0);
  });

  it("does not count a 5 Hz patch under 25% of every 341 x 256 window, and counts one over it", () => {
    // 160 x 120 px is 22% of a 341 x 256 window; 200 x 140 px is 32%.
    const small = countFlashes(wave(5, frame(DARK), frame(DARK, { x: 400, y: 240, w: 160, h: 120, rgb: LIGHT })), FPS);
    expect(small.general.share).toBeLessThan(FLASH_RULE.areaShare);
    expect(small.general.flashes).toBeLessThanOrEqual(FLASH_RULE.maxPerSecond);
    const big = countFlashes(wave(5, frame(DARK), frame(DARK, { x: 400, y: 240, w: 200, h: 140, rgb: LIGHT })), FPS);
    expect(big.general.share).toBeGreaterThan(FLASH_RULE.areaShare);
    expect(big.general.flashes).toBe(5);
  });

  it("counts a saturated red / grey swap of equal luminance as red flashes only", () => {
    const r = countFlashes(wave(5, frame([255, 0, 0]), frame([128, 128, 128])), FPS);
    expect(r.general.flashes).toBe(0);
    expect(r.red.flashes).toBe(5);
  });

  it("does not count a grey / blue swap as red, however fast", () => {
    expect(countFlashes(wave(5, frame([60, 60, 200]), frame([128, 128, 128])), FPS).red.flashes).toBe(0);
  });

  it("passes 4 Hz over 22% of a window and fails it over 32% (the boundary of both rules)", () => {
    const small = countFlashes(wave(4, frame(DARK), frame(DARK, { x: 400, y: 240, w: 160, h: 120, rgb: LIGHT })), FPS);
    expect(small.general.share).toBeLessThan(FLASH_RULE.areaShare);
    expect(small.general.flashes).toBeLessThanOrEqual(FLASH_RULE.maxPerSecond);
    const big = countFlashes(wave(4, frame(DARK), frame(DARK, { x: 400, y: 240, w: 200, h: 140, rgb: LIGHT })), FPS);
    expect(big.general.share).toBeGreaterThan(FLASH_RULE.areaShare);
    expect(big.general.flashes).toBe(4);
  });

  // A checkerboard that swaps phase at 5 Hz over 200 x 132 px (30% of a 341 x 256 window). WCAG exempts it only when
  // its squares are under 0.1 degree (3.41 CSS px), so 2 px squares pass and 4 px and 12 px squares fail, at any
  // offset from the sampling grid (0, 1 and 2 px).
  const checker = (side: number, dx: number) => {
    const p = (phase: 0 | 1): Patch => ({ x: 400 + dx, y: 240 + dx, w: 200, h: 132, rgb: LIGHT, checker: { side, phase, other: DARK } });
    return countFlashes(wave(5, frame(DARK, p(0)), frame(DARK, p(1))), FPS);
  };
  for (const dx of [0, 1, 2]) {
    it(`fails a 5 Hz checkerboard of 4 px squares over 30% of a window (offset ${dx} px)`, () => {
      const r = checker(4, dx);
      expect(r.general.flashes, JSON.stringify(r.general)).toBe(5);
      expect(r.general.share).toBeGreaterThan(FLASH_RULE.areaShare);
    });
    it(`fails a 5 Hz checkerboard of 12 px squares over 30% of a window (offset ${dx} px)`, () => {
      const r = checker(12, dx);
      expect(r.general.flashes, JSON.stringify(r.general)).toBe(5);
      expect(r.general.share).toBeGreaterThan(FLASH_RULE.areaShare);
    });
    it(`passes a 5 Hz checkerboard of 2 px squares (under 0.1 degree, exempt) over 30% of a window (offset ${dx} px)`, () => {
      const r = checker(2, dx);
      expect(r.general.flashes, JSON.stringify(r.general)).toBeLessThanOrEqual(FLASH_RULE.maxPerSecond);
      // Only the boxes at the patch's corners, where the pattern is cut, keep a swing: a few samples, far under 25%.
      expect(r.general.share).toBeLessThan(0.01);
    });
  }

  it("pins paint-kit's concurrency reading: staggered 4 Hz pulses never lit on the same frame still fail", () => {
    // Four 86 x 80 px groups (7.9% of a window each, 31.5% together) pulse light 3 frames in 15 (4 Hz), staggered so
    // no two are lit at once. Under "lit on the same frame" this passes (7.9% at a time). Under paint-kit's reading
    // (a sample counts when it flashes often enough in the same 1 s span, whatever its phase) it fails. The reading
    // is stricter than the text, and this test keeps it from loosening unseen.
    const dark = cellsOf(frame(DARK));
    const lit = [0, 1, 2, 3].map((g) => cellsOf(frame(DARK, { x: 400 + g * 86, y: 240, w: 86, h: 80, rgb: LIGHT })));
    const frames = Array.from({ length: 2 * FPS + 1 }, (_, i) => {
      const g = Math.floor((i % 15) / 3);
      return g < 4 ? lit[g]! : dark;
    });
    const r = countFlashes(frames, FPS);
    expect(r.general.flashes).toBe(4);
    expect(r.general.share).toBeGreaterThan(FLASH_RULE.areaShare);
    // Control: one group alone (the most lit on any frame) passes, so the fail comes from adding the phases.
    const one = countFlashes(frames.map((f) => (f === lit[0] ? f : dark)), FPS);
    expect(one.general.flashes).toBeLessThanOrEqual(FLASH_RULE.maxPerSecond);
  });

  it("finds nothing on a still page", () => {
    const r = countFlashes(wave(0, frame(LIGHT), frame(DARK)), FPS);
    expect([r.general.flashes, r.red.flashes]).toEqual([0, 0]);
  });
});
