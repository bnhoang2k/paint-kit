// The flash check's counting core (WCAG 2.3.1, "general flash and red flash thresholds"), with no browser: frames
// in, flash counts out. The check (flash.ts) feeds it stepped page frames; a script can feed it captured PNG frames.
//
// The rule, from the WCAG 2.2 definition (Notes 1 to 3), with paint-kit's reading where the text leaves a choice:
// - Sampling: each frame is read as the mean linear sRGB of a box of `cell` CSS px (4), taken every `stride` CSS px
//   (2). The box removes WCAG's exempt fine patterns (squares under 0.1 degree, 3.41 CSS px): any pattern that repeats
//   every 4, 2 or 1 px, such as a 2 px or 1 px checkerboard, averages to its exact mean in every box, at any offset.
//   A pattern of 4 px squares or larger keeps its full swing in some boxes; the boxes where it balances form lines
//   one sample wide, which the closing below fills.
// - Per sample, a transition is the change between adjacent peaks and valleys of a value over time (Note 2). A
//   reversal smaller than the transition size does not end a leg (hysteresis), so pixel noise cannot split one
//   change into two small ones. The legs then always alternate in direction, so the counted transitions / 2 is the
//   number of opposing pairs. The tracker runs online, frame by frame: it keeps a few numbers per sample and the
//   frames where counted transitions end, never the frames themselves.
// - General: the value is relative luminance; a transition counts when it is 0.10 or more and its darker state is
//   below 0.80. Red: the value is the u'v' distance from the sample's first saturated red state (R/(R+G+B) >= 0.8); a
//   transition counts when it is more than 0.2 and one of its states is saturated red (Note 3). Before that first
//   red state the sample's u'v' range is kept as a box, so the leg into it is counted from the box's farthest corner
//   (at most one leg too many, never one too few).
// - A flash is two opposing transitions, so the flashes in a 1 s span are its counted transitions / 2.
// - Area: a window of 341 x 256 CSS px (the 10 degree field, Note 1) at a stride of one sample. A window flashes k
//   times in a span when the samples that flash k times or more in it cover more than 25% of 341 x 256 CSS px (the
//   .006 sr limit), each sample covering stride x stride px. Before the area is summed, the map of such samples is
//   closed (dilated, then eroded, by one sample), so one-sample gaps inside a flashing pattern count as flashing.
// - Concurrency is paint-kit's reading, stricter than the text in two named ways. WCAG counts "the combined area of
//   flashes occurring concurrently and contiguously". Here a sample counts toward a window when it flashes often
//   enough in the same 1 s span, whatever its phase (not only when lit on the same frame), and the samples need
//   not be contiguous. Both choices can only fail a page the text might pass, never pass one it fails.
import type { Rgba } from "./harness.ts";
import table from "./thresholds.json" with { type: "json" };

type Entry = { value: number; why: string };
const T = table as Record<string, Entry>;
const v = (k: string): number => {
  const e = T[k];
  if (!e) throw new Error(`unknown threshold "${k}"`);
  return e.value;
};

export type FlashRule = {
  maxPerSecond: number;
  areaShare: number;
  window: { width: number; height: number };
  lumaDelta: number;
  darkMax: number;
  redRatio: number;
  redChroma: number;
  /** Sampling box side in CSS px. */
  cell: number;
  /** Sampling step in CSS px (also the window stride and the area each sample covers). */
  stride: number;
};

/** The rule from thresholds.json (a bar may override entries through the check). */
export const FLASH_RULE: FlashRule = {
  maxPerSecond: v("flash.maxPerSecond"),
  areaShare: v("flash.areaShare"),
  window: { width: v("flash.windowWidth"), height: v("flash.windowHeight") },
  lumaDelta: v("flash.lumaDelta"),
  darkMax: v("flash.darkMax"),
  redRatio: v("flash.redRatio"),
  redChroma: v("flash.redChroma"),
  cell: v("flash.cell"),
  stride: v("flash.stride"),
};

/** One frame sampled: relative luminance, R/(R+G+B), and CIE 1976 u'v' per sample (all from linear sRGB means). */
export type Cells = { cols: number; rows: number; y: Float32Array; ratio: Float32Array; u: Float32Array; v: Float32Array };

// sRGB decode, as WCAG's relative luminance definition gives it.
const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LIN[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
// D65 white: the chromaticity given to a black sample, whose own is undefined.
const D65 = { u: 0.1978, v: 0.4683 };

// Summed-area tables for the three channels, kept between frames of one size.
let satW = 0;
let satH = 0;
let SAT: [Float64Array, Float64Array, Float64Array] | null = null;

/**
 * Samples a frame: the mean of each `rule.cell` CSS px box, every `rule.stride` CSS px. `scale` is frame pixels per
 * CSS px. Boxes that would run past the frame's edge are dropped.
 */
export function cellsOf(img: Rgba, rule: Pick<FlashRule, "cell" | "stride"> = FLASH_RULE, scale = 1): Cells {
  const side = Math.max(1, Math.round(rule.cell * scale));
  const step = Math.max(1, Math.round(rule.stride * scale));
  const { w, h, data: d } = img;
  const cols = w >= side ? Math.floor((w - side) / step) + 1 : 0;
  const rows = h >= side ? Math.floor((h - side) / step) + 1 : 0;
  const W1 = w + 1;
  if (!SAT || satW !== w || satH !== h) {
    const n = W1 * (h + 1);
    SAT = [new Float64Array(n), new Float64Array(n), new Float64Array(n)];
    satW = w;
    satH = h;
  }
  const [SR, SG, SB] = SAT;
  for (let y = 0; y < h; y++) {
    let r = 0;
    let g = 0;
    let b = 0;
    const o0 = y * w * 4;
    const up = y * W1;
    const at = (y + 1) * W1;
    for (let x = 0; x < w; x++) {
      const o = o0 + x * 4;
      r += LIN[d[o]!]!;
      g += LIN[d[o + 1]!]!;
      b += LIN[d[o + 2]!]!;
      SR[at + x + 1] = SR[up + x + 1]! + r;
      SG[at + x + 1] = SG[up + x + 1]! + g;
      SB[at + x + 1] = SB[up + x + 1]! + b;
    }
  }
  const n = cols * rows;
  const Y = new Float32Array(n);
  const ratio = new Float32Array(n);
  const u = new Float32Array(n);
  const vv = new Float32Array(n);
  const area = side * side;
  const box = (S: Float64Array, x0: number, y0: number) => (S[(y0 + side) * W1 + x0 + side]! - S[y0 * W1 + x0 + side]! - S[(y0 + side) * W1 + x0]! + S[y0 * W1 + x0]!) / area;
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const x0 = i * step;
      const y0 = j * step;
      const r = box(SR, x0, y0);
      const g = box(SG, x0, y0);
      const b = box(SB, x0, y0);
      const X = 0.4124 * r + 0.3576 * g + 0.1805 * b;
      const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const Z = 0.0193 * r + 0.1192 * g + 0.9505 * b;
      const den = X + 15 * L + 3 * Z;
      const c = j * cols + i;
      Y[c] = L;
      ratio[c] = r + g + b > 0 ? r / (r + g + b) : 0;
      u[c] = den > 1e-9 ? (4 * X) / den : D65.u;
      vv[c] = den > 1e-9 ? (9 * L) / den : D65.v;
    }
  return { cols, rows, y: Y, ratio, u, v: vv };
}

/** One transition: from frame `a` (a peak or valley) to frame `b` (the next one of the other kind). */
export type Transition = { a: number; b: number; from: number; to: number };
type Emit = (cell: number, aF: number, aV: number, aX: number, bF: number, bV: number, bX: number) => void;

/**
 * The online leg tracker, one per sample. Before the first leg it holds the lowest (a) and highest (b) value so far;
 * after, `a` is the leg's start and `b` its running extreme. `x` is a side value kept with each end (the red ratio).
 */
class Legs {
  readonly dir: Int8Array;
  readonly aF: Int32Array;
  readonly bF: Int32Array;
  readonly aV: Float32Array;
  readonly bV: Float32Array;
  readonly aX: Float32Array;
  readonly bX: Float32Array;
  readonly on: Uint8Array;
  private readonly size: number;
  private readonly strict: boolean;
  constructor(n: number, size: number, strict: boolean) {
    this.size = size;
    this.strict = strict;
    this.dir = new Int8Array(n);
    this.aF = new Int32Array(n);
    this.bF = new Int32Array(n);
    this.aV = new Float32Array(n);
    this.bV = new Float32Array(n);
    this.aX = new Float32Array(n);
    this.bX = new Float32Array(n);
    this.on = new Uint8Array(n);
  }
  private big(d: number) {
    return this.strict ? d > this.size : d >= this.size;
  }
  /** Starts sample `c` with a low end (frame aF) and a high end (frame bF), as if both were already seen. */
  begin(c: number, aF: number, aV: number, aX: number, bF: number, bV: number, bX: number) {
    this.on[c] = 1;
    this.dir[c] = 0;
    this.aF[c] = aF;
    this.aV[c] = aV;
    this.aX[c] = aX;
    this.bF[c] = bF;
    this.bV[c] = bV;
    this.bX[c] = bX;
    this.settle(c);
  }
  /** Before the first leg: once low and high are a leg apart, the earlier one is the start. */
  private settle(c: number) {
    if (this.dir[c] !== 0 || !this.big(this.bV[c]! - this.aV[c]!)) return;
    if (this.bF[c]! > this.aF[c]!) this.dir[c] = 1;
    else {
      this.dir[c] = -1;
      this.swap(c);
    }
  }
  private swap(c: number) {
    const f = this.aF[c]!;
    const val = this.aV[c]!;
    const x = this.aX[c]!;
    this.aF[c] = this.bF[c]!;
    this.aV[c] = this.bV[c]!;
    this.aX[c] = this.bX[c]!;
    this.bF[c] = f;
    this.bV[c] = val;
    this.bX[c] = x;
  }
  push(c: number, f: number, val: number, x: number, emit: Emit) {
    if (!this.on[c]) return this.begin(c, f, val, x, f, val, x);
    const d = this.dir[c]!;
    if (d === 0) {
      if (val < this.aV[c]!) (this.aF[c] = f), (this.aV[c] = val), (this.aX[c] = x);
      if (val > this.bV[c]!) (this.bF[c] = f), (this.bV[c] = val), (this.bX[c] = x);
      return this.settle(c);
    }
    const ext = this.bV[c]!;
    if (d === 1 ? val > ext : val < ext) {
      this.bF[c] = f;
      this.bV[c] = val;
      this.bX[c] = x;
    } else if (this.big(Math.abs(ext - val))) {
      emit(c, this.aF[c]!, this.aV[c]!, this.aX[c]!, this.bF[c]!, ext, this.bX[c]!);
      this.aF[c] = this.bF[c]!;
      this.aV[c] = ext;
      this.aX[c] = this.bX[c]!;
      this.bF[c] = f;
      this.bV[c] = val;
      this.bX[c] = x;
      this.dir[c] = -d;
    }
  }
  /** The last leg counts if it reaches the size, even with no reversal after it. */
  flush(emit: Emit) {
    for (let c = 0; c < this.dir.length; c++) {
      if (this.dir[c] !== 0 && this.big(Math.abs(this.bV[c]! - this.aV[c]!))) emit(c, this.aF[c]!, this.aV[c]!, this.aX[c]!, this.bF[c]!, this.bV[c]!, this.bX[c]!);
    }
  }
}

/**
 * Transitions in a series: the legs between adjacent peaks and valleys whose size reaches `size` (or exceeds it,
 * when `strict`). A reversal smaller than `size` does not end a leg. The last leg counts if it reaches `size`, even
 * with no reversal after it. (The same tracker the counter runs online.)
 */
export function transitions(s: Float32Array, size: number, strict = false): Transition[] {
  const out: Transition[] = [];
  const legs = new Legs(1, size, strict);
  const emit: Emit = (_c, aF, aV, _ax, bF, bV) => out.push({ a: aF, b: bF, from: aV, to: bV });
  for (let i = 0; i < s.length; i++) legs.push(0, i, s[i]!, 0, emit);
  if (s.length >= 2) legs.flush(emit);
  return out;
}

/** The worst window: flashes per s (counted transitions / 2) reached over more than the area share, and where. */
export type FlashMeasure = {
  flashes: number;
  /**
   * The largest flashing area in any window, as a share of 341 x 256 CSS px, among samples that flash more than
   * `maxPerSecond` in one span (fails above `areaShare`).
   */
  share: number;
  /** The worst window's top-left in CSS px, and its span's first frame (-1 when nothing flashes). */
  x: number;
  y: number;
  frame: number;
};

export type FlashReport = { general: FlashMeasure; red: FlashMeasure; frames: number; cols: number; rows: number };

/** A growable list of (sample, frame) pairs: where counted transitions end. */
class Ends {
  cell = new Int32Array(1024);
  frame = new Int32Array(1024);
  n = 0;
  add(c: number, f: number) {
    if (this.n === this.cell.length) {
      const grow = (a: Int32Array) => {
        const b = new Int32Array(a.length * 2);
        b.set(a);
        return b;
      };
      this.cell = grow(this.cell);
      this.frame = grow(this.frame);
    }
    this.cell[this.n] = c;
    this.frame[this.n] = f;
    this.n++;
  }
}

/** Counts flashes frame by frame. `push` each frame in order (all the same size), then `report`. */
export class FlashCounter {
  private F = 0;
  private cols = 0;
  private rows = 0;
  private general!: Legs;
  private red!: Legs;
  private gEnds = new Ends();
  private rEnds = new Ends();
  // Red: the sample's first saturated red state, and its u'v' range before it.
  private anchored!: Uint8Array;
  private u0!: Float32Array;
  private v0!: Float32Array;
  private box!: Float32Array; // umin, umax, vmin, vmax per sample
  private onGeneral: Emit;
  private onRed: Emit;
  private readonly fps: number;
  private readonly rule: FlashRule;

  constructor(fps: number, rule: FlashRule = FLASH_RULE) {
    this.fps = fps;
    this.rule = rule;
    this.onGeneral = (c, _aF, aV, _ax, bF, bV) => {
      if (Math.min(aV, bV) < this.rule.darkMax) this.gEnds.add(c, bF);
    };
    this.onRed = (c, _aF, _aV, aX, bF, _bV, bX) => {
      if (aX >= this.rule.redRatio || bX >= this.rule.redRatio) this.rEnds.add(c, bF);
    };
  }

  push(cells: Cells): void {
    const f = this.F++;
    if (f === 0) {
      this.cols = cells.cols;
      this.rows = cells.rows;
      const n = cells.cols * cells.rows;
      this.general = new Legs(n, this.rule.lumaDelta, false);
      this.red = new Legs(n, this.rule.redChroma, true);
      this.anchored = new Uint8Array(n);
      this.u0 = new Float32Array(n);
      this.v0 = new Float32Array(n);
      this.box = new Float32Array(n * 4);
      for (let c = 0; c < n; c++) this.box.set([Infinity, -Infinity, Infinity, -Infinity], c * 4);
    } else if (cells.cols !== this.cols || cells.rows !== this.rows) throw new Error("FlashCounter: frames differ in size");
    const n = this.cols * this.rows;
    const { y, ratio, u, v: vv } = cells;
    const R = this.rule.redRatio;
    for (let c = 0; c < n; c++) {
      this.general.push(c, f, y[c]!, 0, this.onGeneral);
      const uc = u[c]!;
      const vc = vv[c]!;
      const rc = ratio[c]!;
      if (this.anchored[c]) {
        this.red.push(c, f, Math.hypot(uc - this.u0[c]!, vc - this.v0[c]!), rc, this.onRed);
        continue;
      }
      const b = c * 4;
      if (rc < R) {
        const bx = this.box;
        if (uc < bx[b]!) bx[b] = uc;
        if (uc > bx[b + 1]!) bx[b + 1] = uc;
        if (vc < bx[b + 2]!) bx[b + 2] = vc;
        if (vc > bx[b + 3]!) bx[b + 3] = vc;
        continue;
      }
      // The first saturated red state: distances are measured from it. The states before it are known only by their
      // u'v' box, so the leg into it starts at the box's farthest corner, one frame back.
      this.anchored[c] = 1;
      this.u0[c] = uc;
      this.v0[c] = vc;
      const bx = this.box;
      const far = bx[b]! <= bx[b + 1]! ? Math.hypot(Math.max(Math.abs(bx[b]! - uc), Math.abs(bx[b + 1]! - uc)), Math.max(Math.abs(bx[b + 2]! - vc), Math.abs(bx[b + 3]! - vc))) : 0;
      this.red.begin(c, f, 0, rc, f - 1, far, 0);
    }
  }

  report(): FlashReport {
    if (this.F === 0) throw new Error("countFlashes: no frames");
    this.general.flush(this.onGeneral);
    this.red.flush(this.onRed);
    return { general: this.measure(this.gEnds), red: this.measure(this.rEnds), frames: this.F, cols: this.cols, rows: this.rows };
  }

  private measure(ends: Ends): FlashMeasure {
    const { cols, rows, F, rule } = this;
    const best: FlashMeasure = { flashes: 0, share: 0, x: 0, y: 0, frame: -1 };
    if (ends.n === 0) return best;
    const n = cols * rows;
    const ww = Math.min(cols, Math.round(rule.window.width / rule.stride));
    const wh = Math.min(rows, Math.round(rule.window.height / rule.stride));
    // The window's area limit in samples (M2: in CSS px², against 341 x 256 itself, not the sample-rounded window).
    const field = rule.window.width * rule.window.height;
    const px = rule.stride * rule.stride;
    const span = Math.min(this.fps, F);
    const failAt = 2 * rule.maxPerSecond + 1; // transitions in a span that make more than maxPerSecond flashes
    // Ends bucketed by frame.
    const start = new Int32Array(F + 2);
    for (let i = 0; i < ends.n; i++) start[ends.frame[i]! + 1]!++;
    for (let f = 0; f <= F; f++) start[f + 1]! += start[f]!;
    const byFrame = new Int32Array(ends.n);
    const fill = start.slice();
    for (let i = 0; i < ends.n; i++) byFrame[fill[ends.frame[i]!]!++] = ends.cell[i]!;
    const count = new Int32Array(n);
    const add = (f: number, k: number) => {
      if (f < 0 || f >= F) return 0;
      for (let i = start[f]!; i < start[f + 1]!; i++) count[byFrame[i]!]! += k;
      return start[f + 1]! - start[f]!;
    };
    const map = new Uint8Array(n);
    const tmp = new Uint8Array(n);
    const sat = new Int32Array((cols + 1) * (rows + 1));
    /** The largest flashing area (in samples) of any window, among samples with at least `k` transitions, and where. */
    const worst = (k: number): { area: number; x: number; y: number } => {
      for (let c = 0; c < n; c++) map[c] = count[c]! >= k ? 1 : 0;
      close(map, tmp, cols, rows);
      for (let r = 0; r < rows; r++) {
        let run = 0;
        for (let c = 0; c < cols; c++) {
          run += map[r * cols + c]!;
          sat[(r + 1) * (cols + 1) + c + 1] = sat[r * (cols + 1) + c + 1]! + run;
        }
      }
      let w = { area: 0, x: 0, y: 0 };
      for (let r = 0; r + wh <= rows; r++)
        for (let c = 0; c + ww <= cols; c++) {
          const a = sat[(r + wh) * (cols + 1) + c + ww]! - sat[r * (cols + 1) + c + ww]! - sat[(r + wh) * (cols + 1) + c]! + sat[r * (cols + 1) + c]!;
          if (a > w.area) w = { area: a, x: c, y: r };
        }
      return w;
    };
    for (let f = 0; f < span; f++) add(f, 1);
    let changed = true;
    for (let s0 = 0; s0 + span <= F; s0++) {
      if (s0 > 0) {
        const out = add(s0 - 1, -1);
        const inn = add(s0 + span - 1, 1);
        changed = out + inn > 0;
      }
      // The same counts as the last span give the same result.
      if (!changed) continue;
      let top = 0;
      for (let c = 0; c < n; c++) if (count[c]! > top) top = count[c]!;
      if (top === 0) continue;
      const over = worst(failAt);
      best.share = Math.max(best.share, (over.area * px) / field);
      // The most transitions whose samples cover more than the area share of one window: the window's count here.
      for (let k = Math.max(1, Math.round(best.flashes * 2) + 1); k <= top; k++) {
        const w = worst(k);
        if (w.area * px <= rule.areaShare * field) break;
        Object.assign(best, { flashes: k / 2, x: w.x * rule.stride, y: w.y * rule.stride, frame: s0 });
      }
    }
    return best;
  }
}

/** Closes a 0/1 map in place by one sample (3 x 3 dilation, then erosion; outside the frame counts as set for the erosion). */
function close(m: Uint8Array, t: Uint8Array, cols: number, rows: number): void {
  const pass = (src: Uint8Array, dst: Uint8Array, dx: number, dy: number, max: boolean, edge: number) => {
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const at = (cc: number, rr: number) => (cc < 0 || rr < 0 || cc >= cols || rr >= rows ? edge : src[rr * cols + cc]!);
        const a = at(c - dx, r - dy);
        const b = src[r * cols + c]!;
        const d = at(c + dx, r + dy);
        dst[r * cols + c] = max ? a | b | d : a & b & d;
      }
  };
  pass(m, t, 1, 0, true, 0);
  pass(t, m, 0, 1, true, 0);
  pass(m, t, 1, 0, false, 1);
  pass(t, m, 0, 1, false, 1);
}

/** Counts general and red flashes over `frames` (consecutive, `fps` per second, all the same size). */
export function countFlashes(frames: Iterable<Cells>, fps: number, rule: FlashRule = FLASH_RULE): FlashReport {
  const counter = new FlashCounter(fps, rule);
  for (const f of frames) counter.push(f);
  return counter.report();
}
