import { describe, expect, it } from "vitest";
import type { Rgba } from "../../src/checks/harness.ts";
import { outlineRipple } from "../../src/checks/outline.ts";

// A dark card (luma 20) on a light floor (luma 200), 1 px soft edges: each pixel's coverage by the card is the
// share of it inside `inside(x, y)`, sampled 8 x 8.
function card(w: number, h: number, inside: (x: number, y: number) => boolean): Rgba {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let c = 0;
      for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) if (inside(x + (i + 0.5) / 8, y + (j + 0.5) / 8)) c++;
      const v = Math.round(200 + (20 - 200) * (c / 64));
      data.set([v, v, v, 255], (y * w + x) * 4);
    }
  return { w, h, data };
}
const BOX = { x0: 50, y0: 40, x1: 150, y1: 160 };
const OPTS = { cut: 60 / 255, corner: 10, reach: 20 };

describe("outline ripple", () => {
  it("a straight box reads no ripple on any edge", () => {
    const f = card(200, 200, (x, y) => x >= 50 && x < 150 && y >= 40 && y < 160);
    const r = outlineRipple(f, BOX, OPTS);
    for (const k of ["top", "left", "right", "bottom"] as const) expect(r[k], k).toBeLessThan(0.1);
  });

  it("a wavy top edge reads its peak to peak, sub-pixel, and the other edges stay straight", () => {
    // Top edge y = 40 + 3 sin(x / 8): peak to peak 6 px.
    const f = card(200, 200, (x, y) => x >= 50 && x < 150 && y >= 40 + 3 * Math.sin(x / 8) && y < 160);
    const r = outlineRipple(f, BOX, OPTS);
    expect(r.top).toBeGreaterThan(5.6);
    expect(r.top).toBeLessThan(6.4);
    expect(r.left).toBeLessThan(0.1);
    expect(r.bottom).toBeLessThan(0.1);
  });

  it("a wavy right edge reads on the right only", () => {
    const f = card(200, 200, (x, y) => x >= 50 && x < 150 + 2 * Math.cos(y / 6) && y >= 40 && y < 160);
    const r = outlineRipple(f, BOX, OPTS);
    expect(r.right).toBeGreaterThan(3.6);
    expect(r.right).toBeLessThan(4.4);
    expect(r.top).toBeLessThan(0.1);
  });

  it("an edge that is not there reads NaN, not 0", () => {
    const f = card(200, 200, () => false);
    expect(outlineRipple(f, BOX, OPTS).top).toBeNaN();
  });
});
