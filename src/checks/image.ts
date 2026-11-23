// Pixel helpers the checks share: luminance, OKLab, run length, blur, gradient and high-pass. All plain arrays,
// so a unit test needs no browser.
import type { Rgba } from "./harness.ts";

type Nums = ArrayLike<number>;

/** A gradient this small is float noise, not a slope. */
const FLAT_EPS = 1e-6;

/** Rec. 709 luma of the encoded 8-bit values, 0..1 (the weights the engine's own percentiles use). */
export function luminance(f: Rgba): Float32Array {
  const out = new Float32Array(f.w * f.h);
  for (let i = 0; i < out.length; i++) {
    out[i] = (0.2126 * f.data[i * 4]! + 0.7152 * f.data[i * 4 + 1]! + 0.0722 * f.data[i * 4 + 2]!) / 255;
  }
  return out;
}

/** Population standard deviation. */
export function std(v: Nums): number {
  const n = v.length;
  if (n === 0) return 0;
  let s = 0;
  let s2 = 0;
  for (let i = 0; i < n; i++) {
    s += v[i]!;
    s2 += v[i]! * v[i]!;
  }
  const m = s / n;
  return Math.sqrt(Math.max(0, s2 / n - m * m));
}

/** Mean absolute difference over RGB of two same-size frames, 0..1. */
export function meanAbsDiff(a: Rgba, b: Rgba): number {
  if (a.w !== b.w || a.h !== b.h) throw new Error(`frames differ in size: ${a.w}x${a.h} vs ${b.w}x${b.h}`);
  let s = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    for (let c = 0; c < 3; c++) s += Math.abs(a.data[i + c]! - b.data[i + c]!);
  }
  return s / ((a.data.length / 4) * 3 * 255);
}

const toLinear = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** An 8-bit sRGB colour in OKLab, [L, a, b]. */
export function srgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Mean OKLab of a frame, over every pixel or only those `keep` selects (pixel index). */
export function meanOklab(f: Rgba, keep?: (i: number) => boolean): [number, number, number] {
  let L = 0;
  let a = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < f.w * f.h; i++) {
    if (keep && !keep(i)) continue;
    const [l, aa, bb] = srgbToOklab(f.data[i * 4]!, f.data[i * 4 + 1]!, f.data[i * 4 + 2]!);
    L += l;
    a += aa;
    b += bb;
    n++;
  }
  return n === 0 ? [0, 0, 0] : [L / n, a / n, b / n];
}

export const oklabDistance = (p: Nums, q: Nums): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);

/** Mean OKLab distance of every pixel to one OKLab colour. */
export function meanDistanceTo(f: Rgba, target: Nums): number {
  let s = 0;
  for (let i = 0; i < f.w * f.h; i++) {
    s += oklabDistance(srgbToOklab(f.data[i * 4]!, f.data[i * 4 + 1]!, f.data[i * 4 + 2]!), target);
  }
  return s / (f.w * f.h);
}

/**
 * The palette check's smoke measure (S3): the share of pixels whose OKLab distance from `before` to `after` is at
 * least `visible`.
 */
export function movedShare(before: Rgba, after: Rgba, visible: number): number {
  if (after.w !== before.w || after.h !== before.h) throw new Error(`frames differ in size: ${before.w}x${before.h} vs ${after.w}x${after.h}`);
  const n = before.w * before.h;
  let moved = 0;
  for (let i = 0; i < n; i++) {
    const p = srgbToOklab(before.data[i * 4]!, before.data[i * 4 + 1]!, before.data[i * 4 + 2]!);
    const q = srgbToOklab(after.data[i * 4]!, after.data[i * 4 + 1]!, after.data[i * 4 + 2]!);
    if (oklabDistance(p, q) >= visible) moved++;
  }
  return moved / n;
}

/** One number per pixel, packing 8-bit RGB: two pixels share a level only when all three channels match. */
export function levels(f: Rgba): Uint32Array {
  const out = new Uint32Array(f.w * f.h);
  for (let i = 0; i < out.length; i++) out[i] = (f.data[i * 4]! << 16) | (f.data[i * 4 + 1]! << 8) | f.data[i * 4 + 2]!;
  return out;
}

/**
 * The longest run of one level along a row, in px. Runs never cross a row. With `mask`, only pixels where
 * the mask is non-zero count, and a masked-out pixel ends the run.
 */
export function longestRun(v: Nums, w: number, h: number, mask?: ArrayLike<number>): number {
  let best = 0;
  for (let y = 0; y < h; y++) {
    let run = 0;
    let prev = NaN;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask && !mask[i]) {
        run = 0;
        prev = NaN;
        continue;
      }
      run = v[i] === prev ? run + 1 : 1;
      prev = v[i]!;
      if (run > best) best = run;
    }
  }
  return best;
}

/**
 * The longest run of one level along a row that has the shape of a quantised ramp: the pixel just outside each
 * end differs from the run by exactly one 8-bit step (largest channel gap 1), one end darker and the other lighter.
 * A flat fill, an edge (a bigger step) or a ridge (both ends on one side) is not banding and counts 0. Only
 * pixels where `mask` is non-zero take part in a run.
 */
export function longestStaircaseRun(f: Rgba, mask?: ArrayLike<number>): number {
  const lv = levels(f);
  const gap = (from: number, to: number): { max: number; sum: number } => {
    let max = 0;
    let sum = 0;
    for (let c = 0; c < 3; c++) {
      const d = f.data[to * 4 + c]! - f.data[from * 4 + c]!;
      max = Math.max(max, Math.abs(d));
      sum += d;
    }
    return { max, sum };
  };
  let best = 0;
  for (let y = 0; y < f.h; y++) {
    let start = -1;
    const close = (endX: number) => {
      if (start < 0) return;
      const n = endX - start + 1;
      if (n > best && start > 0 && endX < f.w - 1) {
        const left = gap(y * f.w + start, y * f.w + start - 1);
        const right = gap(y * f.w + endX, y * f.w + endX + 1);
        if (left.max === 1 && right.max === 1 && Math.sign(left.sum) * Math.sign(right.sum) < 0) best = n;
      }
      start = -1;
    };
    for (let x = 0; x < f.w; x++) {
      const i = y * f.w + x;
      if (mask && !mask[i]) {
        close(x - 1);
        continue;
      }
      if (start >= 0 && lv[i] !== lv[i - 1]) close(x - 1);
      if (start < 0) start = x;
    }
    close(f.w - 1);
  }
  return best;
}

/** Box blur with a window of 2r+1 px (edge pixels repeat), separable, through prefix sums. */
export function boxBlur(src: Nums, w: number, h: number, r: number): Float64Array {
  const pass = (input: Nums, out: Float64Array, len: number, count: number, stride: number, step: number) => {
    const prefix = new Float64Array(len + 1);
    for (let line = 0; line < count; line++) {
      const base = line * stride;
      for (let i = 0; i < len; i++) prefix[i + 1] = prefix[i]! + input[base + i * step]!;
      for (let i = 0; i < len; i++) {
        const lo = i - r;
        const hi = i + r;
        // Clamp the window to the line, and count the repeated edge pixel for every step outside.
        const a = Math.max(lo, 0);
        const b = Math.min(hi, len - 1);
        let sum = prefix[b + 1]! - prefix[a]!;
        if (lo < 0) sum += -lo * input[base]!;
        if (hi > len - 1) sum += (hi - (len - 1)) * input[base + (len - 1) * step]!;
        out[base + i * step] = sum / (2 * r + 1);
      }
    }
  };
  const mid = new Float64Array(w * h);
  const out = new Float64Array(w * h);
  pass(src, mid, w, h, w, 1);
  pass(mid, out, h, w, 1, w);
  return out;
}

/** Central-difference gradient magnitude, per px (edge pixels use the one-sided difference). */
export function gradientMagnitude(v: Nums, w: number, h: number): Float64Array {
  const out = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - 1);
      const x1 = Math.min(w - 1, x + 1);
      const y0 = Math.max(0, y - 1);
      const y1 = Math.min(h - 1, y + 1);
      const gx = (v[y * w + x1]! - v[y * w + x0]!) / (x1 - x0 || 1);
      const gy = (v[y1 * w + x]! - v[y0 * w + x]!) / (y1 - y0 || 1);
      out[y * w + x] = Math.hypot(gx, gy);
    }
  }
  return out;
}

/**
 * Pixels on a smooth, slow slope: the gradient of a (2r+1) px box blur is non-zero but below `smoothMax`.
 * A large `blurRadius` keeps the inside of a wide band in the mask.
 */
export function smoothMask(lum: Nums, w: number, h: number, blurRadius: number, smoothMax: number): Uint8Array {
  const g = gradientMagnitude(boxBlur(lum, w, h, blurRadius), w, h);
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) mask[i] = g[i]! > FLAT_EPS && g[i]! < smoothMax ? 1 : 0;
  return mask;
}

/** The frame minus its 3 x 3 box blur: what is left once the slow shape is gone (grain, fibre, noise). */
export function highPass(lum: Nums, w: number, h: number): Float64Array {
  const blur = boxBlur(lum, w, h, 1);
  const out = new Float64Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = lum[i]! - blur[i]!;
  return out;
}

export const highPassStd = (lum: Nums, w: number, h: number): number => std(highPass(lum, w, h));

/** A rectangle in px of a frame: left, top, width, height. */
export type Box = { x: number; y: number; w: number; h: number };

/**
 * How far the fine texture of `b` sits from that of `a`: the lag (dx right, dy down, in px) with the highest
 * normalised cross-correlation of their fine detail (each frame minus its box blur of radius `radius`, default 4,
 * a 9 x 9 box, so lighting and macro shape do not count) over `box` of `a`, among the lags `candidates` lists. A
 * texture whose features are wider than the box (matte's tone noise) needs a larger `radius`: the box must be wider
 * than the features it keeps. `box` must stay inside both frames at every candidate lag. `score` is the peak's
 * correlation (-1..1); `at` gives the correlation at any listed lag.
 * The shared measure for "the texture moved with the surface" (test/pages/carry.test.ts).
 */
export function textureShift(a: Rgba, b: Rgba, box: Box, candidates: [number, number][], radius = 4): { dx: number; dy: number; score: number; at: Map<string, number> } {
  const fine = (f: Rgba) => {
    const lum = luminance(f);
    const blur = boxBlur(lum, f.w, f.h, radius);
    const out = new Float64Array(lum.length);
    for (let i = 0; i < out.length; i++) out[i] = lum[i]! - blur[i]!;
    return out;
  };
  const fa = fine(a);
  const fb = fine(b);
  const at = new Map<string, number>();
  let best = { dx: 0, dy: 0, score: -Infinity };
  for (const [dx, dy] of candidates) {
    let sab = 0;
    let saa = 0;
    let sbb = 0;
    for (let y = box.y; y < box.y + box.h; y++) {
      for (let x = box.x; x < box.x + box.w; x++) {
        const va = fa[y * a.w + x]!;
        const vb = fb[(y + dy) * b.w + x + dx]!;
        sab += va * vb;
        saa += va * va;
        sbb += vb * vb;
      }
    }
    const score = sab / Math.sqrt(saa * sbb || 1);
    at.set(`${dx},${dy}`, score);
    if (score > best.score) best = { dx, dy, score };
  }
  return { ...best, at };
}

/** Every integer lag within `r` px (Chebyshev) of each centre, once: the candidate list for `textureShift`. */
export function lagsAround(centres: [number, number][], r: number): [number, number][] {
  const seen = new Set<string>();
  const out: [number, number][] = [];
  for (const [cx, cy] of centres)
    for (let dy = cy - r; dy <= cy + r; dy++)
      for (let dx = cx - r; dx <= cx + r; dx++) {
        const k = `${dx},${dy}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push([dx, dy]);
      }
  return out;
}
