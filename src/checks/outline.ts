// How much a dark shape's outline ripples: the measure behind "the card's outline wobbles 7% of its width" (bar 05,
// review-bar-05.md; the reference ripples 2 to 4%). For each edge of the shape's rest box, scan in from outside
// along every column (top, bottom) or row (left, right), corners left out, to the first pixel darker than `cut`,
// placed to a sub-pixel by linear interpolation of the luma across the crossing. The edge's ripple is the peak to
// peak of those positions, px. Plain arrays, so a unit test needs no browser.
import type { Rgba } from "./harness.ts";
import { luminance } from "./image.ts";

/** The shape's rest box, px, `x1` and `y1` exclusive. */
export type Box = { x0: number; y0: number; x1: number; y1: number };
export type RippleOpts = {
  /** Luma 0..1 under which a pixel is the shape (the review's measure: 60 / 255). */
  cut: number;
  /** Px left out at each end of every edge (the rounded corners). */
  corner: number;
  /** Px searched on each side of the rest edge: the scan starts `reach` outside and stops `reach` inside. */
  reach: number;
};
export type Ripple = { top: number; left: number; right: number; bottom: number };

/**
 * Peak to peak of each edge's position, px. An edge read in fewer than half its scan lines is NaN (no shape there),
 * never 0, so a missing shape cannot pass as a straight one.
 */
export function outlineRipple(f: Rgba, box: Box, o: RippleOpts): Ripple {
  const lum = luminance(f);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= f.w || y >= f.h ? NaN : lum[y * f.w + x]!);
  // First crossing under the cut along a line from `from` towards `to` (inclusive), as a position on that line.
  const cross = (read: (s: number) => number, from: number, to: number): number => {
    const step = to >= from ? 1 : -1;
    let prev = read(from);
    for (let s = from + step; step > 0 ? s <= to : s >= to; s += step) {
      const v = read(s);
      if (Number.isNaN(v)) return NaN;
      if (v < o.cut) {
        const k = prev > v ? (prev - o.cut) / (prev - v) : 1;
        return s - step + step * k;
      }
      prev = v;
    }
    return NaN;
  };
  const p2p = (xs: number[], lines: number) => {
    const ok = xs.filter((x) => Number.isFinite(x));
    return ok.length * 2 < lines ? NaN : Math.max(...ok) - Math.min(...ok);
  };
  const cols: number[] = [];
  for (let x = Math.ceil(box.x0 + o.corner); x < box.x1 - o.corner; x++) cols.push(x);
  const rows: number[] = [];
  for (let y = Math.ceil(box.y0 + o.corner); y < box.y1 - o.corner; y++) rows.push(y);
  const y0 = Math.round(box.y0), y1 = Math.round(box.y1), x0 = Math.round(box.x0), x1 = Math.round(box.x1);
  return {
    top: p2p(cols.map((x) => cross((y) => at(x, y), y0 - o.reach, y0 + o.reach)), cols.length),
    bottom: p2p(cols.map((x) => cross((y) => at(x, y), y1 + o.reach, y1 - o.reach)), cols.length),
    left: p2p(rows.map((y) => cross((x) => at(x, y), x0 - o.reach, x0 + o.reach)), rows.length),
    right: p2p(rows.map((y) => cross((x) => at(x, y), x1 + o.reach, x1 - o.reach)), rows.length),
  };
}
