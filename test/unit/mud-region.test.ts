// text-contrast's range floor reads the paint alone (checks-scope round; region by the owner's "Tiles only
// (Recommended)"): the pure reading, on built frames and coverage grids. test/pages/glass.test.ts covers it end to
// end on bar 06's composition (test/faults/glimmer-flat must fail); test/pages/paper.test.ts on paper-mud-partial.
import { describe, expect, it } from "vitest";
import { lumaRange, mudOf, PAINT_RAMP, PAINT_REGION, paintTexels } from "../../src/checks/text-contrast.ts";
import { threshold } from "../../src/checks/threshold.ts";

const MIN = threshold("text.rangePaintMin", null);

const W = 100;
const H = 50;
/** A grey frame of `ground`, with the pixels `paint` marks set by `tone(x, y)`. */
function frame(ground: number, paint: Uint8Array, tone: (x: number, y: number) => number) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let p = 0; p < W * H; p++) {
    const v = paint[p] ? tone(p % W, Math.floor(p / W)) : ground;
    data.fill(v, p * 4, p * 4 + 3);
    data[p * 4 + 3] = 255;
  }
  return { w: W, h: H, data };
}
/** A square of side `s` at the frame's centre, about `s * s / (W * H)` of it. */
const square = (s: number) => {
  const m = new Uint8Array(W * H);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) m[(y + (H - s) / 2) * W + x + (W - s) / 2] = 1;
  return m;
};

describe("the range floor's region", () => {
  it("reads a small lit cluster on its own pixels, where the whole frame lands on the bare ground", () => {
    const paint = square(10); // 2% of the frame
    const f = frame(20, paint, (x) => 40 + x * 4); // a ramp across the tile
    const m = mudOf(f, paint, MIN);
    expect(m.scoped).toBe(true);
    expect(m.paint).toBeCloseTo(0.02, 5);
    expect(m.frameRange).toBeLessThan(0.01); // p5 and p95 both on the ground
    expect(m.range).toBeGreaterThan(0.1);
  });

  it("a flat tile far from the ground's tone has no range: the ground is not paint", () => {
    const paint = square(10);
    const f = frame(20, paint, () => 220);
    expect(mudOf(f, paint, MIN).range).toBeLessThan(0.01);
  });

  it("a fully covered frame, or one with no paint, reads the whole frame as before", () => {
    const all = new Uint8Array(W * H).fill(1);
    const f = frame(0, all, (x, y) => (x + y) * 2);
    expect(mudOf(f, all, MIN)).toMatchObject({ range: lumaRange(f), frameRange: lumaRange(f), paint: 1, scoped: false, small: false });
    expect(mudOf(f, null, MIN)).toMatchObject({ range: lumaRange(f), paint: 0, scoped: false, small: false });
  });

  it("paint under text.rangePaintMin of the frame is small: reported, not judged", () => {
    const paint = square(6); // 36 of 5000 px, 0.7%
    const m = mudOf(frame(20, paint, (x) => 40 + x * 4), paint, MIN);
    expect(m.paint).toBeLessThan(MIN);
    expect(m.small).toBe(true);
    expect(mudOf(frame(20, square(10), () => 220), square(10), MIN).small).toBe(false); // 2%
  });
});

describe("which texels are paint", () => {
  // A coverage grid: `bg` everywhere, `inner` on a box, and a one-texel anti-alias ring of `edge` around the box.
  const grid = (bg: number, inner: number, edge: number) => {
    const c = new Float32Array(W * H).fill(bg);
    for (let y = 10; y < 40; y++) for (let x = 30; x < 70; x++) c[y * W + x] = y === 10 || y === 39 || x === 30 || x === 69 ? edge : inner;
    return c;
  };
  const count = (m: Uint8Array | null) => (m ? m.reduce((a, b) => a + b, 0) : -1);

  it("a page cannot steer the region by coverage: a 0.99 field around a fully covered patch is all paint", () => {
    // paper-mud-partial's lever on 2fac119: coverage 0.99 over the mud, 1 on a small ramp patch.
    const m = paintTexels(grid(0.99, 1, 1), W, H);
    expect(count(m)).toBe(W * H);
  });

  it("drops the anti-alias edge by its own coverage: a ramp texel between bare and full goes, the full rim stays", () => {
    expect(PAINT_RAMP).toBe(2);
    const m = paintTexels(grid(0, 1, 0.5), W, H)!;
    // The box is 40 x 30 with a one-texel edge ring at 0.5, bare outside and full inside: the ring goes, 38 x 28 stays.
    expect(count(m)).toBe(38 * 28);
    expect(m[10 * W + 30]).toBe(0); // the edge texel
    expect(m[11 * W + 31]).toBe(1); // the full texel just inside it (8b6c77c's 2-texel shrink dropped it)
  });

  // Checks fix round 2 (review-checks-fix1 Minor 1): 8b6c77c shrank the paint by a 5 x 5 window, so a coverage-0 hole
  // every 5 texels dropped all of a 0.99 mud field, and the floor read a small full patch alone (the review's probe
  // rr-pin.mjs: paint share 0.047, the patch). A hole must cost only itself.
  it("pin-holes cannot steer the region: a 0.99 field with a hole every 5 texels stays paint", () => {
    const w = 960;
    const h = 600;
    const c = new Float32Array(w * h).fill(0.99);
    for (let y = 0; y < h; y += 5) for (let x = 0; x < w; x += 5) c[y * w + x] = 0;
    for (let y = 440; y < 560; y++) for (let x = 700; x < 900; x++) c[y * w + x] = 1; // 4.2% full patch
    const share = count(paintTexels(c, w, h)) / (w * h);
    expect(share).toBeGreaterThan(0.9);
  });

  // Checks fix round 3 (review-checks-fix2 Minor 1): a second lattice of full dots at (2, 2) mod 5 put a bare and a
  // full texel within 2 of every 0.99 texel, and the whole field dropped on 799f2f2 (the review's probe: paint share
  // 0.0865, the patch 0.482 of it). A bare or full texel now counts only inside a 3 x 3 region of its kind.
  it("a lattice of full dots beside the pin-holes cannot steer the region: single texels are not regions", () => {
    expect(PAINT_REGION).toBe(3);
    const w = 960;
    const h = 600;
    const c = new Float32Array(w * h).fill(0.99);
    for (let y = 0; y < h; y += 5) for (let x = 0; x < w; x += 5) c[y * w + x] = 0;
    for (let y = 2; y < h; y += 5) for (let x = 2; x < w; x += 5) c[y * w + x] = 1;
    for (let y = 440; y < 560; y++) for (let x = 700; x < 900; x++) c[y * w + x] = 1; // 4.2% full patch
    const share = count(paintTexels(c, w, h)) / (w * h);
    expect(share).toBeGreaterThan(0.9); // the field less its holes (4%)
  });

  it("a fully covered sheet loses nothing at its border; a sheet with no coverage has no paint", () => {
    expect(count(paintTexels(new Float32Array(W * H).fill(1), W, H))).toBe(W * H);
    expect(paintTexels(new Float32Array(W * H), W, H)).toBeNull();
  });
});
