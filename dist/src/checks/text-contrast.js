import { hasHook, hideText, open, round, sleep } from "./frames.js";
import { parseCssColor } from "../engine/palette.js";
import { threshold } from "./threshold.js";
const NAME = "text-contrast";
const result = (status, line, measured) => ({ name: NAME, status, line: `${NAME}: ${line}`, measured });
/** The selectors for each kind. */
export function textSelectors(target) {
    if (target.bar?.text)
        return { always: target.bar.text.always, lit: target.bar.text.lit };
    return { always: ['[data-paint-ink]:not([data-paint-text="lit"])', '[data-paint-text="always"]'], lit: ['[data-paint-text="lit"]'] };
}
/** WCAG relative luminance of an 8-bit sRGB pixel. */
const lin = (v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const relLum = (f, o) => 0.2126 * lin(f.data[o]) + 0.7152 * lin(f.data[o + 1]) + 0.0722 * lin(f.data[o + 2]);
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
/** The p-th percentile (0..1) of the values, by sort. */
function percentile(v, p) {
    const s = v.slice().sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))];
}
/**
 * Luma (Rec. 709 on the encoded values, as the engine's own stats) p95 minus p5 over the frame, or over the pixels
 * `region` marks (1) when it is given.
 */
export function lumaRange(f, region = null) {
    const hist = new Uint32Array(1024);
    let n = 0;
    for (let i = 0; i < f.w * f.h; i++) {
        if (region && !region[i])
            continue;
        const o = i * 4;
        hist[Math.min(1023, Math.floor(((0.2126 * f.data[o] + 0.7152 * f.data[o + 1] + 0.0722 * f.data[o + 2]) / 255) * 1024))]++;
        n++;
    }
    const at = (p) => {
        let seen = 0;
        for (let b = 0; b < 1024; b++)
            if ((seen += hist[b]) >= p * n)
                return (b + 0.5) / 1024;
        return 1;
    };
    return at(0.95) - at(0.05);
}
async function boxesOf(h, sel) {
    return h.hook(`(() => {
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
function regions(m, w, h, k) {
    const r = (k - 1) / 2;
    const core = new Uint8Array(w * h);
    for (let y = r; y < h - r; y++) {
        for (let x = r; x < w - r; x++) {
            let all = 1;
            for (let dy = -r; dy <= r && all; dy++)
                for (let dx = -r; dx <= r; dx++)
                    if (!m[(y + dy) * w + x + dx]) {
                        all = 0;
                        break;
                    }
            core[y * w + x] = all;
        }
    }
    return dilate(core, w, h, r);
}
/** Square dilation of a 0/1 map by `r` texels (separable running counts); off the map counts as 0. */
function dilate(m, w, h, r) {
    const rows = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
        let n = 0;
        const at = (x) => (x >= 0 && x < w ? m[y * w + x] : 0);
        for (let x = -r; x < r; x++)
            n += at(x);
        for (let x = 0; x < w; x++) {
            n += at(x + r);
            rows[y * w + x] = n > 0 ? 1 : 0;
            n -= at(x - r);
        }
    }
    const out = new Uint8Array(w * h);
    for (let x = 0; x < w; x++) {
        let n = 0;
        const at = (y) => (y >= 0 && y < h ? rows[y * w + x] : 0);
        for (let y = -r; y < r; y++)
            n += at(y);
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
export function paintTexels(cov, w, h, full = threshold("relight.fullCoverage", null), r = PAINT_RAMP) {
    const bare = new Uint8Array(w * h);
    const whole = new Uint8Array(w * h);
    let any = false;
    for (let t = 0; t < w * h; t++) {
        const c = cov[t] ?? 0;
        if (c > 0)
            any = true;
        bare[t] = c > 0 ? 0 : 1;
        whole[t] = c >= full ? 1 : 0;
    }
    if (!any)
        return null;
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
async function paintMask(h, view, w, hgt, dpr) {
    const cov = await h.hook(`__paint.sheetRegion(0, 0, ${view.cw}, ${view.ch}).coverage`);
    const texels = paintTexels(cov, view.sw, view.sh);
    if (!texels)
        return null;
    const out = new Uint8Array(w * hgt);
    for (let y = 0; y < hgt; y++) {
        const ry = (y + 0.5) / dpr - view.cy;
        if (ry < 0 || ry >= view.ch)
            continue;
        const ty = Math.min(view.sh - 1, Math.floor((ry * view.sh) / view.ch));
        for (let x = 0; x < w; x++) {
            const rx = (x + 0.5) / dpr - view.cx;
            if (rx < 0 || rx >= view.cw)
                continue;
            const tx = Math.min(view.sw - 1, Math.floor((rx * view.sw) / view.cw));
            if (texels[ty * view.sw + tx])
                out[y * w + x] = 1;
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
export function mudOf(f, paint, min) {
    const frameRange = lumaRange(f);
    if (!paint)
        return { range: frameRange, frameRange, paint: 0, scoped: false, small: false };
    let n = 0;
    for (let p = 0; p < f.w * f.h; p++)
        n += paint[p];
    const share = n / (f.w * f.h);
    const scoped = n < f.w * f.h;
    return { range: n > 0 ? lumaRange(f, paint) : frameRange, frameRange, paint: share, scoped, small: share < min };
}
/** Scores every box in one colour scheme; returns the scores and the floor's reading. */
async function scoreScheme(target, opts, dark) {
    const bar = target.bar;
    const t = bar && "t0" in bar.alive ? bar.alive.t0 : 1;
    const h = await open(target, opts, { t, dark });
    try {
        if (!(await hasHook(h)))
            throw new Error("the page has no window.__paint hook");
        const boxes = await boxesOf(h, textSelectors(target));
        const view = await h.hook("(() => { const r = document.querySelector('canvas').getBoundingClientRect(); const s = __paint.stats(); return { cw: r.width, ch: r.height, cx: r.x, cy: r.y, sw: s.sheetW, sh: s.sheetH }; })()");
        const sx = view.sw / view.cw;
        const sy = view.sh / view.ch;
        // Glyph cores are the text field's ink alone: read with the picture ink (halftone dots) off.
        await h.hook('__paint.setInk(false, "picture")');
        const regions = [];
        for (const b of boxes)
            regions.push(await h.hook(`__paint.sheetRegion(${b.x - view.cx}, ${b.y - view.cy}, ${b.w}, ${b.h})`));
        await h.hook('__paint.setInk(true, "picture")');
        await hideText(h);
        const on = await h.shot();
        // "off" is the paint: the text ink off, the picture ink on. The floor reads it, and glyphs are scored against it.
        await h.hook('__paint.setInk(false, "text")');
        const off = await h.shot();
        await h.hook('__paint.setInk(true, "text")');
        const dpr = on.w / Math.max(1, (await h.hook("innerWidth")));
        const offLum = [];
        for (let i = 0; i < off.w * off.h; i++)
            offLum.push(relLum(off, i * 4));
        const litMin = threshold("text.litLevel", bar) * percentile(offLum, 0.99);
        const core = threshold("text.inkCore", bar);
        const scored = boxes.map((b, k) => {
            const large = b.size >= 24 || (b.size >= 18.66 && b.weight >= 700);
            const need = threshold(large ? "text.large" : "text.normal", bar);
            // The region the hook read, as readRegion clamps it, in sheet px.
            const x0 = Math.max(0, Math.min(view.sw - 1, Math.floor((b.x - view.cx) * sx)));
            const y0 = Math.max(0, Math.min(view.sh - 1, Math.floor((b.y - view.cy) * sy)));
            const rw = Math.max(1, Math.min(view.sw - x0, Math.round(b.w * sx)));
            const ink = regions[k].ink;
            const pxOf = (i, j) => {
                const px = Math.min(on.w - 1, Math.floor(((x0 + i + 0.5) / sx + view.cx) * dpr));
                const py = Math.min(on.h - 1, Math.floor(((y0 + j + 0.5) / sy + view.cy) * dpr));
                return (py * on.w + px) * 4;
            };
            const ratios = [];
            const hasCores = ink.some((v) => v >= core);
            if (hasCores) {
                for (let n = 0; n < ink.length; n++) {
                    if (ink[n] < core)
                        continue;
                    const o = pxOf(n % rw, Math.floor(n / rw));
                    const bg = relLum(off, o);
                    if (b.kind === "lit" && bg < litMin)
                        continue;
                    ratios.push(ratio(relLum(on, o), bg));
                }
            }
            else {
                const c = parseCssColor(b.colour);
                const tl = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
                const transparent = /rgba\(\s*0,\s*0,\s*0,\s*0\s*\)|transparent|\/\s*0\s*\)/.test(b.colour);
                if (transparent)
                    return { box: b, ink: false, score: 1, need, pixels: 0 };
                for (let n = 0; n < ink.length; n++) {
                    const o = pxOf(n % rw, Math.floor(n / rw));
                    if (b.kind === "lit" && relLum(off, o) < litMin)
                        continue;
                    ratios.push(ratio(tl, relLum(on, o)));
                }
            }
            return { box: b, ink: hasCores, score: ratios.length > 0 ? percentile(ratios, 0.1) : null, need, pixels: ratios.length };
        });
        // The paint's range: the ink-off frame, so text cannot stand in for light structure, over the mud region.
        const mud = mudOf(off, await paintMask(h, view, off.w, off.h, dpr), threshold("text.rangePaintMin", bar));
        return { scored, mud, errors: [...h.errors] };
    }
    finally {
        await h.close();
    }
}
export const check = async (target, opts) => {
    const floor = threshold("text.rangeFloor", target.bar);
    const paintMin = threshold("text.rangePaintMin", target.bar);
    const measured = {};
    const problems = [];
    const unscored = [];
    const facts = [];
    for (const dark of [false, true]) {
        const scheme = dark ? "dark" : "light";
        let s;
        try {
            s = await scoreScheme(target, opts, dark);
        }
        catch (e) {
            if (e.message.includes("no window.__paint"))
                return result("partial", "the page has no window.__paint hook, so the ink cannot be turned off", {});
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
        }
        else if (mud.range < floor)
            problems.push(`${scheme}: the paint's luminance range (p95 - p5)${where} ${round(mud.range)} is under the floor ${floor}, so the page is mud`);
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
            if (x.score < x.need)
                problems.push(`${scheme}: ${what} reaches ${x.score.toFixed(2)}:1 at its worst tenth, needs ${x.need}`);
        });
        if (s.scored.length === 0)
            parts.push("text on the page but none marked for scoring, floor only");
        facts.push(`${scheme}: ${parts.join(", ")}`);
    }
    const line = facts.join("; ");
    if (problems.length > 0)
        return result("fail", `${[...problems, ...unscored].join("; ")} (${line})`, measured);
    if (unscored.length > 0)
        return result("partial", `${unscored.join("; ")} (${line})`, measured);
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
export const applies = async (target, opts) => {
    if (target.bar?.text && target.bar.text.always.length + target.bar.text.lit.length > 0)
        return true;
    const bar = target.bar;
    const h = await open(target, opts, { t: bar && "t0" in bar.alive ? bar.alive.t0 : 1 });
    try {
        return (await h.hook(VISIBLE_TEXT)) > 0 ? true : { skip: NO_TEXT };
    }
    finally {
        await h.close();
    }
};
/** A control has no hook and no ink text to score: only the range floor, on one live frame with its text hidden. */
export const controlCheck = async (target, opts) => {
    const floor = threshold("text.rangeFloor", target.bar);
    const h = await open(target, opts);
    try {
        await sleep(500);
        await hideText(h);
        const range = lumaRange(await h.shot());
        const line = `range ${round(range)} (floor ${floor}); the control has no ink text to score`;
        if (range < floor)
            return result("fail", `the paint's luminance range (p95 - p5) ${round(range)} is under the floor ${floor}`, { range });
        return result("pass", line, { range });
    }
    finally {
        await h.close();
    }
};
