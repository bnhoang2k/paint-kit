import type { Rgba } from "./harness.ts";
import type { Applies, Check, Target } from "./types.ts";
type Kind = "always" | "lit";
/** The selectors for each kind. */
export declare function textSelectors(target: Target): Record<Kind, string[]>;
/**
 * Luma (Rec. 709 on the encoded values, as the engine's own stats) p95 minus p5 over the frame, or over the pixels
 * `region` marks (1) when it is given.
 */
export declare function lumaRange(f: Rgba, region?: Uint8Array | null): number;
/**
 * The floor's reading of one frame: the range over the paint, the whole frame's beside it, and the paint's share.
 * `small`: there is paint, but under `text.rangePaintMin` of the frame, so `range` is reported and not judged.
 */
type Mud = {
    range: number;
    frameRange: number;
    paint: number;
    scoped: boolean;
    small: boolean;
};
/**
 * How far the anti-alias ramp reaches, in sheet texels on the square around an edge texel (checks fix round 2).
 * Stated from the shape fields' edge, not from any page's reading: the edge is 1 - smoothstep(-aa, aa, d) with aa one
 * texel (relight.fullCoverage's reason), so a ramp texel (0 < coverage < 1) has d in (-1, 1) texels; each step on the
 * square moves d by up to |cos| + |sin| >= 1, so within 2 steps one way d >= 1 (coverage 0) and the other d <= -1
 * (full coverage). At sheetScale 1 a texel is one device pixel.
 */
export declare const PAINT_RAMP = 2;
/**
 * The smallest uniform region that counts as ramp evidence, texels a side (checks fix round 3, review-checks-fix2
 * Minor 1, stated before measuring): a bare or full texel counts only when it belongs to a PAINT_REGION x
 * PAINT_REGION block of texels of its own kind, wholly on the sheet. 3 is the smallest block a single dot or a
 * one-texel line cannot form, so a lattice of pin-holes or of full dots carries no weight. A real one-texel ramp has
 * real ground outside it and a real body inside it: on a straight or 45-degree edge the texel PAINT_RAMP steps out
 * (in) belongs to a 3 x 3 block further out (in), so PAINT_RAMP stays 2. A larger block would keep as paint the ramp
 * of any body 3 to 4 texels thick, mixing the ground into the floor's reading.
 */
export declare const PAINT_REGION = 3;
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
export declare function paintTexels(cov: ArrayLike<number>, w: number, h: number, full?: number, r?: number): Uint8Array | null;
/**
 * The floor's reading of a frame, given which of its pixels are paint (`paintMask`; null when the sheet has none):
 * p95 - p5 over the paint, or over the whole frame when there is no paint (nothing to scope to). A fully covered
 * frame is all paint, so it reads as the whole frame did before the checks-scope round. Paint under `min` of the
 * frame is `small`: its range is reported, and the check does not judge it.
 */
export declare function mudOf(f: Rgba, paint: Uint8Array | null, min: number): Mud;
export declare const check: Check;
/**
 * Counts the page's visible text, as a layout test (a box at least 1 px each way), not a visibility test, so it
 * errs toward applying: text in the document and in every open shadow root (walked recursively), non-empty
 * `::before` / `::after` content, and the labels of form controls (an input's value or placeholder, a textarea's).
 * Script, style, noscript and template contents do not count. Canvas-drawn text cannot be seen by any DOM test;
 * the spec puts page text in the HTML.
 */
export declare const VISIBLE_TEXT = "(() => {\n  const skip = new Set([\"SCRIPT\", \"STYLE\", \"NOSCRIPT\", \"TEMPLATE\"]);\n  const sized = (r) => r.width >= 1 && r.height >= 1;\n  const pseudo = (el, which) => {\n    const c = getComputedStyle(el, which).content;\n    return c && c !== \"none\" && c !== \"normal\" && c !== '\"\"' && c !== \"''\";\n  };\n  let n = 0;\n  const visit = (root) => {\n    const walk = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);\n    for (let node = walk.nextNode(); node; node = walk.nextNode()) {\n      if (node.nodeType === Node.TEXT_NODE) {\n        if (!node.textContent || !node.textContent.trim()) continue;\n        if (node.parentElement && skip.has(node.parentElement.tagName)) continue;\n        const range = document.createRange();\n        range.selectNodeContents(node);\n        if ([...range.getClientRects()].some(sized)) n++;\n        continue;\n      }\n      const el = node;\n      if (skip.has(el.tagName)) continue;\n      if (el.shadowRoot) visit(el.shadowRoot);\n      if (!sized(el.getBoundingClientRect())) continue;\n      if (pseudo(el, \"::before\") || pseudo(el, \"::after\")) n++;\n      if ((el.tagName === \"INPUT\" || el.tagName === \"TEXTAREA\") && ((el.value || \"\").trim() || (el.placeholder || \"\").trim())) n++;\n    }\n  };\n  visit(document.body);\n  return n;\n})()";
export declare const NO_TEXT = "does not apply: the page has no text (no visible text and no bar.text), so there is no text for the range floor to keep readable";
/**
 * Whether the check applies to a non-control page: always when the bar declares text; else when the page shows
 * any visible text (`VISIBLE_TEXT`). It is read once, at the bar's t0 (else t 1), frozen, at the first seed, in the
 * light scheme only: text shown in dark alone is not seen. A text node the ink field hides (transparent colour)
 * still has its box, so ink text counts.
 */
export declare const applies: Applies;
/** A control has no hook and no ink text to score: only the range floor, on one live frame with its text hidden. */
export declare const controlCheck: Check;
export {};
