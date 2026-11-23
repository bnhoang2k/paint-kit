// text-contrast: the page's text stays readable on the paint, and the paint keeps a luminance range.
//
// Which text: with a bar, the elements matching `bar.text.always` and `bar.text.lit`. Without one, every
// `[data-paint-ink]` element counts as "always", except one marked `data-paint-text="lit"`, which is "lit"; an
// element marked `data-paint-text="always"` without `data-paint-ink` is scored as plain HTML text.
//
// How, in light and dark, frozen, with the page's HTML text hidden so each frame shows the paint alone:
// - Ink text (the box has glyph-core pixels: text-field ink >= `text.inkCore` in `sheetRegion`, read with the
//   picture ink off): render with the text ink on and off (the picture ink stays on, so a caption over halftone
//   dots is judged against the dots); each glyph-core pixel gives a WCAG contrast ratio between the two frames.
//   The box's score is the 10th percentile.
// - Plain HTML text (no glyph cores): its computed colour against every background pixel in its box (ink on); the
//   score is the 10th percentile of those ratios, so the worst tenth of the background decides.
// - "always" boxes need `text.normal` (4.5), or `text.large` (3.0) for large text: computed font size at least 24 px,
//   or at least 18.66 px and bold (WCAG's definition of large text).
// - "lit" boxes are scored only on pixels the light reaches: where the ink-off frame's relative luminance is at least
//   `text.litLevel` of that frame's 99th percentile. A fraction, not an absolute level: a light ink on a dark
//   ground and a dark ink on a light ground are lit at very different levels. A lit box the light misses entirely
//   cannot be scored, so it makes the check partial and the line names its selector; it never passes silently.
// - Floor, on every page the check applies to: the paint's luma p95 minus p5 must be at least `text.rangeFloor`.
//   The paint is the frame with the text ink off and the picture ink on, so a page of text over flat paint cannot
//   pass on its words' contrast alone, and a printed picture (halftone dots) counts. The floor reads the paint, not
//   the area behind the text (the spec words it as "The paint's luminance range"), so picture ink anywhere lends
//   range, as a shape field's relief already could; the glyph scores judge what is behind the words.
//   Which pixels (checks-scope round, 2026-11-15, the owner's ruling "Fix the check", for bar 06's tiles on a bare
//   page): the paint alone, the pixels the sheet fully covers (`paintMask`), not the whole empty screen. Where the
//   sheet covers under 5% of the frame, a whole-frame p95 lands on the bare ground whatever the paint does. The ground
//   around the paint is left out too: with it, p95 - p5 reads the paint against the ground, which a paint flattened
//   to one tone far from the ground's keeps in full (test/faults/glimmer-flat measured 0.61 light / 0.35 dark that
//   way, over the floor). A fully covered page is all paint and reads the whole frame, as before; so does a page with
//   no fully covered pixel. The line gives the paint's share and the whole frame's range beside the paint's.
//   The region was then settled by the owner's later answer "Tiles only (Recommended)": the floor reads the paint, not a
//   ground band.
//   Checks fix round 1 (2026-11-15): which texels are paint is no longer a coverage level the page sets. Paint was
//   every sheet texel with coverage above 0, shrunk by 2 texels to drop the anti-alias edge. Before, the paint was
//   coverage at least `relight.fullCoverage`, so a page could write 0.99 over a mud field and 1 on a small ramp
//   patch, and the floor read the patch alone and passed (paper-mud-partial, 0.694 light / 0.652 dark on 2fac119).
//   Checks fix round 2 (review-checks-fix1 Minor 1): the shrink was a window, so a coverage-0 pin-hole every 5
//   texels dropped all of a 0.99 field (paper-mud-pinhole). Now an edge texel is dropped by its own coverage: under
//   full, with both a bare and a full texel within 2 (an anti-alias ramp; see `paintTexels`). A 0.99 field is paint
//   and a pin-hole costs only itself. When some texel is paint but the paint is under `text.rangePaintMin` (1%) of
//   the frame, the floor cannot judge it: that scheme is partial, named, never a pass. A page with no texel above
//   coverage 0 reads the whole frame, as before.
//   Checks fix round 3 (review-checks-fix2 Minor 1): a second lattice of full dots beside the pin-holes dropped the
//   field again (paper-mud-lattice), so the bare and the full texel now count only inside a 3 x 3 uniform region
//   (`PAINT_REGION`). Known limit: a feathered edge wider than about 4 texels keeps its middle as paint (no bare or
//   full texel within 2 at all); the review's probe read 7% of the paint so at a 14-texel feather. No planted page
//   uses it yet.
//   On a control (no hook, so no way to turn ink off, and no ink text) only this floor runs, on the whole live frame.
//
// Where it applies (`applies`, read by the gate from the CHECKS registry; check-fix (f)). The floor guards text
// legibility, not "mud" on every page. The spec (2026-11-13-phase-1-surfaces-design.md) decides it:
// - Anti-goals: "Passing by mud: dimming or flattening a paint so a contrast or banding check passes. Every gate
//   that could be passed this way carries a floor (see the checks)." The floor is the contrast check's guard
//   against gaming (its row's column "Floor against gaming"), so it has no job where there is no contrast to game.
// - The grown-field proof: "`text-contrast` does not apply: the page has no text." Goal 4: the grown field "passes
//   every check that applies to a page without text".
// So a page with no visible text and no `bar.text` is skipped, with that reason. "Text" is any visible text on the
// page, marked or not: a page of plain HTML text over flat paint still runs, and fails, the floor. The control is
// not affected: its registry entry runs the floor by name (spec: "the range floor of `text-contrast` (it has no ink
// text to score)").
//
// Halftone ink is paint (driver ruling, check-fix (f) fix round 1, after the review judged it consistent with the
// spec): bar 03 is "points field, ink on paper" and "A picture arrives as a halftone grid", so the dots are the
// picture the text sits on. The sheet's one ink channel ("B | ink (0..1 printed coverage: text, halftone dots)")
// is storage, not a ruling that dots are text. Text ink is told from picture ink by where it comes from (the
// engine's `setInk(on, "text" | "picture")`: the text field's ink against any other field's), never by the
// `bar.text` selectors: an unscored inked paragraph is still text and lends the floor nothing.
import type { PageHandle, Rgba } from "./harness.ts";
import { hasHook, hideText, open, round, sleep } from "./frames.ts";
import { parseCssColor } from "../engine/palette.ts";
import { threshold } from "./threshold.ts";
import type { Applies, Check, CheckResult, Target } from "./types.ts";

const NAME = "text-contrast";
const result = (status: CheckResult["status"], line: string, measured: Record<string, number>): CheckResult => ({ name: NAME, status, line: `${NAME}: ${line}`, measured });

type Kind = "always" | "lit";
type Box = { kind: Kind; selector: string; label: string; x: number; y: number; w: number; h: number; colour: string; size: number; weight: number };

/** The selectors for each kind. */
export function textSelectors(target: Target): Record<Kind, string[]> {
  if (target.bar?.text) return { always: target.bar.text.always, lit: target.bar.text.lit };
  return { always: ['[data-paint-ink]:not([data-paint-text="lit"])', '[data-paint-text="always"]'], lit: ['[data-paint-text="lit"]'] };
}

/** WCAG relative luminance of an 8-bit sRGB pixel. */
const lin = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const relLum = (f: Rgba, o: number) => 0.2126 * lin(f.data[o]!) + 0.7152 * lin(f.data[o + 1]!) + 0.0722 * lin(f.data[o + 2]!);
const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** The p-th percentile (0..1) of the values, by sort. */
function percentile(v: number[], p: number): number {
  const s = v.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))]!;
}

/**
 * Luma (Rec. 709 on the encoded values, as the engine's own stats) p95 minus p5 over the frame, or over the pixels
 * `region` marks (1) when it is given.
 */
export function lumaRange(f: Rgba, region: Uint8Array | null = null): number {
  const hist = new Uint32Array(1024);
  let n = 0;
  for (let i = 0; i < f.w * f.h; i++) {
    if (region && !region[i]) continue;
    const o = i * 4;
    hist[Math.min(1023, Math.floor(((0.2126 * f.data[o]! + 0.7152 * f.data[o + 1]! + 0.0722 * f.data[o + 2]!) / 255) * 1024))]!++;
    n++;
  }
  const at = (p: number) => {
    let seen = 0;
    for (let b = 0; b < 1024; b++) if ((seen += hist[b]!) >= p * n) return (b + 0.5) / 1024;
    return 1;
  };
  return at(0.95) - at(0.05);
}

async function boxesOf(h: PageHandle, sel: Record<Kind, string[]>): Promise<Box[]> {
  return h.hook<Box[]>(`(() => {
    const sel = ${JSON.stringify(sel)};
    const seen = new Set();
    const out = [];
    for (const kind of ["lit", "always"]) {
      for (const s of sel[kind]) {
        for (const el of document.querySelectorAll(s)) {
          if (seen.has(el)) continue;
          seen.add(el);
          const r = el.getBoundingClientRect();
          if (r.width < 1 || r.height < 1) continue;
          const cs = getComputedStyle(el);
          const label = el.tagName.toLowerCase() + ' "' + (el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 24) + '"';
          out.push({ kind, selector: s, label, x: r.x, y: r.y, w: r.width, h: r.height, colour: cs.color, size: parseFloat(cs.fontSize), weight: Number(cs.fontWeight) || 400 });
        }
      }
    }
    return out;
  })()`);
}

type Scored = { box: Box; ink: boolean; score: number | null; need: number; pixels: number };

/**
 * The floor's reading of one frame: the range over the paint, the whole frame's beside it, and the paint's share.
 * `small`: there is paint, but under `text.rangePaintMin` of the frame, so `range` is reported and not judged.
 */
type Mud = { range: number; frameRange: number; paint: number; scoped: boolean; small: boolean };

/**
 * How far the anti-alias ramp reaches, in sheet texels on the square around an edge texel (checks fix round 2).
 * Stated from the shape fields' edge, not from any page's reading: the edge is 1 - smoothstep(-aa, aa, d) with aa one
 * texel (relight.fullCoverage's reason), so a ramp texel (0 < coverage < 1) has d in (-1, 1) texels; each step on the
 * square moves d by up to |cos| + |sin| >= 1, so within 2 steps one way d >= 1 (coverage 0) and the other d <= -1
 * (full coverage). At sheetScale 1 a texel is one device pixel.
 */
export const PAINT_RAMP = 2;

/**
 * The smallest uniform region that counts as ramp evidence, texels a side (checks fix round 3, review-checks-fix2
 * Minor 1, stated before measuring): a bare or full texel counts only when it belongs to a PAINT_REGION x
 * PAINT_REGION block of texels of its own kind, wholly on the sheet. 3 is the smallest block a single dot or a
 * one-texel line cannot form, so a lattice of pin-holes or of full dots carries no weight. A real one-texel ramp has
 * real ground outside it and a real body inside it: on a straight or 45-degree edge the texel PAINT_RAMP steps out
 * (in) belongs to a 3 x 3 block further out (in), so PAINT_RAMP stays 2. A larger block would keep as paint the ramp
 * of any body 3 to 4 texels thick, mixing the ground into the floor's reading.
 */
export const PAINT_REGION = 3;

/**
 * The texels of a 0/1 map that belong to some `k` x `k` block wholly set and wholly on the map (a morphological
 * opening by a `k` x `k` square; `k` odd). Off the map counts as unset.
 */
function regions(m: Uint8Array, w: number, h: number, k: number): Uint8Array {
  const r = (k - 1) / 2;
  const core = new Uint8Array(w * h);
  for (let y = r; y < h - r; y++) {
    for (let x = r; x < w - r; x++) {
      let all = 1;
      for (let dy = -r; dy <= r && all; dy++) for (let dx = -r; dx <= r; dx++) if (!m[(y + dy) * w + x + dx]) { all = 0; break; }
      core[y * w + x] = all;
    }
  }
  return dilate(core, w, h, r);
}

/** Square dilation of a 0/1 map by `r` texels (separable running counts); off the map counts as 0. */
function dilate(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const rows = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let n = 0;
    const at = (x: number) => (x >= 0 && x < w ? m[y * w + x]! : 0);
    for (let x = -r; x < r; x++) n += at(x);
    for (let x = 0; x < w; x++) {
      n += at(x + r);
      rows[y * w + x] = n > 0 ? 1 : 0;
      n -= at(x - r);
    }
  }
  const out = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    let n = 0;
    const at = (y: number) => (y >= 0 && y < h ? rows[y * w + x]! : 0);
    for (let y = -r; y < r; y++) n += at(y);
    for (let y = 0; y < h; y++) {
      n += at(y + r);
      out[y * w + x] = n > 0 ? 1 : 0;
      n -= at(y - r);
    }
  }
  return out;
}

/**
 * The sheet texels the floor reads as paint (checks fix round 2, review-checks-fix1 Minor 1): every texel with
 * coverage above 0 that is not an edge texel. An edge texel is judged by its own coverage, not by a window: it is
 * under `full` (relight.fullCoverage, within half an 8-bit level of 1) and it lies on an anti-alias ramp, with both
 * a bare texel (coverage 0) and a full one within `r` (PAINT_RAMP) on the square around it. A ramp runs from full to
 * bare; a field held at one level under 1 is not a ramp, so a 0.99 mud field is paint (paper-mud-partial), and a
 * coverage-0 pin-hole in it costs only itself (paper-mud-pinhole: 8b6c77c's 5 x 5 shrink dropped the whole field).
 * The bare and the full texel count only inside a uniform region (PAINT_REGION, checks fix round 3): a lattice of
 * full dots beside the pin-holes dropped the whole field on 799f2f2 (paper-mud-lattice).
 * A full texel is never dropped, so a tile's rim is paint. Texels off the sheet are neither bare nor full. Null when
 * no texel has coverage above 0.
 */
export function paintTexels(cov: ArrayLike<number>, w: number, h: number, full: number = threshold("relight.fullCoverage", null), r: number = PAINT_RAMP): Uint8Array | null {
  const bare = new Uint8Array(w * h);
  const whole = new Uint8Array(w * h);
  let any = false;
  for (let t = 0; t < w * h; t++) {
    const c = cov[t] ?? 0;
    if (c > 0) any = true;
    bare[t] = c > 0 ? 0 : 1;
    whole[t] = c >= full ? 1 : 0;
  }
  if (!any) return null;
  const nearBare = dilate(regions(bare, w, h, PAINT_REGION), w, h, r);
  const nearFull = dilate(regions(whole, w, h, PAINT_REGION), w, h, r);
  const out = new Uint8Array(w * h);
  for (let t = 0; t < w * h; t++) {
    const c = cov[t] ?? 0;
    out[t] = c > 0 && !(c < full && nearBare[t] && nearFull[t]) ? 1 : 0;
  }
  return out;
}

/**
 * The frame pixels the range floor reads (checks-scope round, the owner's rulings "Fix the check" and "Tiles only
 * (Recommended)"): the paint alone, the frame pixels over a `paintTexels` texel. Each frame pixel maps to the sheet
 * texel under it, as relight maps them; a pixel outside the canvas shows the page, not the sheet. Null when no texel
 * is paint (nothing to scope to).
 */
async function paintMask(h: PageHandle, view: { cw: number; ch: number; cx: number; cy: number; sw: number; sh: number }, w: number, hgt: number, dpr: number): Promise<Uint8Array | null> {
  const cov = await h.hook<number[]>(`__paint.sheetRegion(0, 0, ${view.cw}, ${view.ch}).coverage`);
  const texels = paintTexels(cov, view.sw, view.sh);
  if (!texels) return null;
  const out = new Uint8Array(w * hgt);
  for (let y = 0; y < hgt; y++) {
    const ry = (y + 0.5) / dpr - view.cy;
    if (ry < 0 || ry >= view.ch) continue;
    const ty = Math.min(view.sh - 1, Math.floor((ry * view.sh) / view.ch));
    for (let x = 0; x < w; x++) {
      const rx = (x + 0.5) / dpr - view.cx;
      if (rx < 0 || rx >= view.cw) continue;
      const tx = Math.min(view.sw - 1, Math.floor((rx * view.sw) / view.cw));
      if (texels[ty * view.sw + tx]) out[y * w + x] = 1;
    }
  }
  return out;
}

/**
 * The floor's reading of a frame, given which of its pixels are paint (`paintMask`; null when the sheet has none):
 * p95 - p5 over the paint, or over the whole frame when there is no paint (nothing to scope to). A fully covered
 * frame is all paint, so it reads as the whole frame did before the checks-scope round. Paint under `min` of the
 * frame is `small`: its range is reported, and the check does not judge it.
 */
export function mudOf(f: Rgba, paint: Uint8Array | null, min: number): Mud {
  const frameRange = lumaRange(f);
  if (!paint) return { range: frameRange, frameRange, paint: 0, scoped: false, small: false };
  let n = 0;
  for (let p = 0; p < f.w * f.h; p++) n += paint[p]!;
  const share = n / (f.w * f.h);
  const scoped = n < f.w * f.h;
  return { range: n > 0 ? lumaRange(f, paint) : frameRange, frameRange, paint: share, scoped, small: share < min };
}

/** Scores every box in one colour scheme; returns the scores and the floor's reading. */
async function scoreScheme(target: Target, opts: Parameters<Check>[1], dark: boolean): Promise<{ scored: Scored[]; mud: Mud; errors: string[] }> {
  const bar = target.bar;
  const t = bar && "t0" in bar.alive ? bar.alive.t0 : 1;
  const h = await open(target, opts, { t, dark });
  try {
    if (!(await hasHook(h))) throw new Error("the page has no window.__paint hook");
    const boxes = await boxesOf(h, textSelectors(target));
    const view = await h.hook<{ cw: number; ch: number; sw: number; sh: number; cx: number; cy: number }>(
      "(() => { const r = document.querySelector('canvas').getBoundingClientRect(); const s = __paint.stats(); return { cw: r.width, ch: r.height, cx: r.x, cy: r.y, sw: s.sheetW, sh: s.sheetH }; })()",
    );
    const sx = view.sw / view.cw;
    const sy = view.sh / view.ch;
    // Glyph cores are the text field's ink alone: read with the picture ink (halftone dots) off.
    await h.hook('__paint.setInk(false, "picture")');
    const regions: { ink: number[] }[] = [];
    for (const b of boxes) regions.push(await h.hook<{ ink: number[] }>(`__paint.sheetRegion(${b.x - view.cx}, ${b.y - view.cy}, ${b.w}, ${b.h})`));
    await h.hook('__paint.setInk(true, "picture")');
    await hideText(h);
    const on = await h.shot();
    // "off" is the paint: the text ink off, the picture ink on. The floor reads it, and glyphs are scored against it.
    await h.hook('__paint.setInk(false, "text")');
    const off = await h.shot();
    await h.hook('__paint.setInk(true, "text")');
    const dpr = on.w / Math.max(1, (await h.hook<number>("innerWidth")));

    const offLum: number[] = [];
    for (let i = 0; i < off.w * off.h; i++) offLum.push(relLum(off, i * 4));
    const litMin = threshold("text.litLevel", bar) * percentile(offLum, 0.99);
    const core = threshold("text.inkCore", bar);
    const scored: Scored[] = boxes.map((b, k) => {
      const large = b.size >= 24 || (b.size >= 18.66 && b.weight >= 700);
      const need = threshold(large ? "text.large" : "text.normal", bar);
      // The region the hook read, as readRegion clamps it, in sheet px.
      const x0 = Math.max(0, Math.min(view.sw - 1, Math.floor((b.x - view.cx) * sx)));
      const y0 = Math.max(0, Math.min(view.sh - 1, Math.floor((b.y - view.cy) * sy)));
      const rw = Math.max(1, Math.min(view.sw - x0, Math.round(b.w * sx)));
      const ink = regions[k]!.ink;
      const pxOf = (i: number, j: number) => {
        const px = Math.min(on.w - 1, Math.floor(((x0 + i + 0.5) / sx + view.cx) * dpr));
        const py = Math.min(on.h - 1, Math.floor(((y0 + j + 0.5) / sy + view.cy) * dpr));
        return (py * on.w + px) * 4;
      };
      const ratios: number[] = [];
      const hasCores = ink.some((v) => v >= core);
      if (hasCores) {
        for (let n = 0; n < ink.length; n++) {
          if (ink[n]! < core) continue;
          const o = pxOf(n % rw, Math.floor(n / rw));
          const bg = relLum(off, o);
          if (b.kind === "lit" && bg < litMin) continue;
          ratios.push(ratio(relLum(on, o), bg));
        }
      } else {
        const c = parseCssColor(b.colour);
        const tl = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
        const transparent = /rgba\(\s*0,\s*0,\s*0,\s*0\s*\)|transparent|\/\s*0\s*\)/.test(b.colour);
        if (transparent) return { box: b, ink: false, score: 1, need, pixels: 0 };
        for (let n = 0; n < ink.length; n++) {
          const o = pxOf(n % rw, Math.floor(n / rw));
          if (b.kind === "lit" && relLum(off, o) < litMin) continue;
          ratios.push(ratio(tl, relLum(on, o)));
        }
      }
      return { box: b, ink: hasCores, score: ratios.length > 0 ? percentile(ratios, 0.1) : null, need, pixels: ratios.length };
    });
    // The paint's range: the ink-off frame, so text cannot stand in for light structure, over the mud region.
    const mud = mudOf(off, await paintMask(h, view, off.w, off.h, dpr), threshold("text.rangePaintMin", bar));
    return { scored, mud, errors: [...h.errors] };
  } finally {
    await h.close();
  }
}

export const check: Check = async (target, opts) => {
  const floor = threshold("text.rangeFloor", target.bar);
  const paintMin = threshold("text.rangePaintMin", target.bar);
  const measured: Record<string, number> = {};
  const problems: string[] = [];
  const unscored: string[] = [];
  const facts: string[] = [];
  for (const dark of [false, true]) {
    const scheme = dark ? "dark" : "light";
    let s;
    try {
      s = await scoreScheme(target, opts, dark);
    } catch (e) {
      if ((e as Error).message.includes("no window.__paint")) return result("partial", "the page has no window.__paint hook, so the ink cannot be turned off", {});
      throw e;
    }
    const mud = s.mud;
    measured[`${scheme}.range`] = mud.range;
    measured[`${scheme}.frameRange`] = mud.frameRange;
    measured[`${scheme}.paint`] = mud.paint;
    const where = mud.scoped ? ` over the paint (${round(mud.paint, 3)} of the frame)` : "";
    if (mud.small) {
      // Too little paint to judge: never a pass, and not the whole frame either, which reads the bare ground.
      unscored.push(`${scheme}: the paint covers ${round(mud.paint, 4)} of the frame, under ${paintMin}, so its luminance range cannot be judged`);
    } else if (mud.range < floor) problems.push(`${scheme}: the paint's luminance range (p95 - p5)${where} ${round(mud.range)} is under the floor ${floor}, so the page is mud`);
    const parts = [
      mud.scoped
        ? `range ${round(mud.range)} over the paint (${round(mud.paint, 3)} of the frame${mud.small ? `, under ${paintMin}: not judged` : ""}; whole frame ${round(mud.frameRange)})`
        : `range ${round(mud.range)}`,
    ];
    s.scored.forEach((x, i) => {
      const key = `${scheme}.${x.box.kind}${i}`;
      measured[`${key}.pixels`] = x.pixels;
      const what = `${x.box.kind} ${x.box.label} (${x.ink ? "ink" : "html"})`;
      if (x.score === null) {
        // Not scorable is not a pass: the check cannot say this text reads.
        const why = x.box.kind === "lit" ? `the light reaches none of ${x.box.selector}` : `no pixels of ${x.box.selector} are on the canvas`;
        parts.push(`${what} not scored: ${why}`);
        unscored.push(`${scheme}: ${what}: ${why}`);
        return;
      }
      measured[`${key}.score`] = x.score;
      parts.push(`${what} ${x.score.toFixed(2)}`);
      if (x.score < x.need) problems.push(`${scheme}: ${what} reaches ${x.score.toFixed(2)}:1 at its worst tenth, needs ${x.need}`);
    });
    if (s.scored.length === 0) parts.push("text on the page but none marked for scoring, floor only");
    facts.push(`${scheme}: ${parts.join(", ")}`);
  }
  const line = facts.join("; ");
  if (problems.length > 0) return result("fail", `${[...problems, ...unscored].join("; ")} (${line})`, measured);
  if (unscored.length > 0) return result("partial", `${unscored.join("; ")} (${line})`, measured);
  return result("pass", line, measured);
};

/**
 * Counts the page's visible text, as a layout test (a box at least 1 px each way), not a visibility test, so it
 * errs toward applying: text in the document and in every open shadow root (walked recursively), non-empty
 * `::before` / `::after` content, and the labels of form controls (an input's value or placeholder, a textarea's).
 * Script, style, noscript and template contents do not count. Canvas-drawn text cannot be seen by any DOM test;
 * the spec puts page text in the HTML.
 */
export const VISIBLE_TEXT = `(() => {
  const skip = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"]);
  const sized = (r) => r.width >= 1 && r.height >= 1;
  const pseudo = (el, which) => {
    const c = getComputedStyle(el, which).content;
    return c && c !== "none" && c !== "normal" && c !== '""' && c !== "''";
  };
  let n = 0;
  const visit = (root) => {
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    for (let node = walk.nextNode(); node; node = walk.nextNode()) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (!node.textContent || !node.textContent.trim()) continue;
        if (node.parentElement && skip.has(node.parentElement.tagName)) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        if ([...range.getClientRects()].some(sized)) n++;
        continue;
      }
      const el = node;
      if (skip.has(el.tagName)) continue;
      if (el.shadowRoot) visit(el.shadowRoot);
      if (!sized(el.getBoundingClientRect())) continue;
      if (pseudo(el, "::before") || pseudo(el, "::after")) n++;
      if ((el.tagName === "INPUT" || el.tagName === "TEXTAREA") && ((el.value || "").trim() || (el.placeholder || "").trim())) n++;
    }
  };
  visit(document.body);
  return n;
})()`;

export const NO_TEXT = "does not apply: the page has no text (no visible text and no bar.text), so there is no text for the range floor to keep readable";

/**
 * Whether the check applies to a non-control page: always when the bar declares text; else when the page shows
 * any visible text (`VISIBLE_TEXT`). It is read once, at the bar's t0 (else t 1), frozen, at the first seed, in the
 * light scheme only: text shown in dark alone is not seen. A text node the ink field hides (transparent colour)
 * still has its box, so ink text counts.
 */
export const applies: Applies = async (target, opts) => {
  if (target.bar?.text && target.bar.text.always.length + target.bar.text.lit.length > 0) return true;
  const bar = target.bar;
  const h = await open(target, opts, { t: bar && "t0" in bar.alive ? bar.alive.t0 : 1 });
  try {
    return (await h.hook<number>(VISIBLE_TEXT)) > 0 ? true : { skip: NO_TEXT };
  } finally {
    await h.close();
  }
};

/** A control has no hook and no ink text to score: only the range floor, on one live frame with its text hidden. */
export const controlCheck: Check = async (target, opts) => {
  const floor = threshold("text.rangeFloor", target.bar);
  const h = await open(target, opts);
  try {
    await sleep(500);
    await hideText(h);
    const range = lumaRange(await h.shot());
    const line = `range ${round(range)} (floor ${floor}); the control has no ink text to score`;
    if (range < floor) return result("fail", `the paint's luminance range (p95 - p5) ${round(range)} is under the floor ${floor}`, { range });
    return result("pass", line, { range });
  } finally {
    await h.close();
  }
};
