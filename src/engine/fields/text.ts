// `text`: an ink field fed by the page's own HTML text. Elements matching the selector (default
// `[data-paint-ink]`) are drawn into a 2D canvas at the places the browser laid their words out, and the canvas's
// coverage becomes the sheet's ink channel, so the page's lights fall on the words. While WebGL runs the HTML copy
// is made transparent (it stays selectable and readable by screen readers): each matched element carries the
// `data-paint-inked` attribute, and one injected rule makes it and all its children transparent with a layered
// `!important`, so styled children (`<a>`, `<em>`) and author `!important` rules are covered. The element's own inline colour is
// saved, overridden with an inline `!important` (which beats an author's inline `!important`), and put back exactly.
// `dispose` gives every touched element back; the engine disposes fields on context loss before its fallback.
//
// Placement copies the browser's layout rather than redoing it: each word's box comes from Range.getClientRects
// on its text node, so wrapping, line breaks, justification and letter spacing are the browser's. A word split
// over two lines (a hyphen break) is drawn one character at a time. Font, weight, size, style and letter and word
// spacing come from the text node's computed style; the baseline sits where the font's ascent puts it in the box.
// text-transform is applied with its context: capitalize raises only a word's first letter, even when the word is
// drawn in pieces, and a transform that changes length (uppercase "ß" is "SS") is drawn no wider than its box.
// The layout is read again on a resize of any matched element or of the page, a loaded font, a window resize or
// a scroll; each asks the engine for one redraw.
// The text is printed on the sheet, so it is carried: on a page whose fields move the surface (write "rest"), each
// pixel reads the text where its point sat on the flat sheet, and the words sway and lift with a strip.
import { HEADER, VS_FULLSCREEN, bindTexture, locations, program, quad } from "../gl.ts";
import { GLSL_SHEET, sheetDefines } from "../sheet.ts";
import type { Field } from "../types.ts";

export type TextOptions = {
  selector?: string;
  /**
   * The words ride the moved surface (default true): each pixel reads the text at its rest position. False keeps
   * the words at their HTML boxes whatever the surface does (a label laid over the paint, not printed on it).
   */
  carried?: boolean;
};

const FS = /* glsl */ `
uniform sampler2D uText;
#ifdef PK_CARRIED
uniform sampler2D uRest;
#endif
out vec4 o;
void main() {
  // The 2D canvas is the sheet's size and uploaded flipped, so texel and fragment line up one to one.
#ifdef PK_CARRIED
  // Read where this point sat on the flat sheet, filtered, so a sub-pixel sway moves the words smoothly.
  float a = texture(uText, (gl_FragCoord.xy + restOffsetHere(uRest)) / vec2(textureSize(uText, 0))).a;
#else
  float a = texelFetch(uText, ivec2(gl_FragCoord.xy), 0).a;
#endif
  o = sheetEncode(vec4(0.0, 1.0, a, -1.0)); // height 0, coverage 1, slot none: ink only
}
`;

type Layout = { ctx: CanvasRenderingContext2D; w: number; h: number };

const spacing = (v: string) => (v === "normal" ? "0px" : v);

/** The text the browser shows for `data[from, to)` under `text-transform: how`. Capitalize looks at the character
 * before `from`, so a word drawn in pieces gets one capital, at its start. */
function shown(data: string, from: number, to: number, how: string): string {
  const s = data.slice(from, to);
  if (how === "uppercase") return s.toUpperCase();
  if (how === "lowercase") return s.toLowerCase();
  if (how === "capitalize") {
    let out = "";
    for (let k = from; k < to; ) {
      const ch = String.fromCodePoint(data.codePointAt(k)!);
      out += k === 0 || /\s/.test(data[k - 1]!) ? ch.toUpperCase() : ch;
      k += ch.length;
    }
    return out;
  }
  return s;
}

const HIDDEN = "data-paint-inked";
let hideUsers = 0;
let hideStyle: HTMLStyleElement | null = null;
/** Adds the one rule that hides marked text and its children; the returned function removes it with its last user. */
function useHideRule(): () => void {
  if (hideUsers++ === 0) {
    hideStyle = document.createElement("style");
    hideStyle.dataset.paintKit = "text";
    // An `!important` rule in a cascade layer beats every unlayered `!important` rule whatever its specificity
    // (`.note em { color: red !important }` included), and the first layer declared beats later ones, so the
    // style goes first in <head>.
    hideStyle.textContent = `@layer paint-kit-ink { [${HIDDEN}], [${HIDDEN}] * { color: transparent !important; } }`;
    document.head.prepend(hideStyle);
  }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    if (--hideUsers === 0) {
      hideStyle?.remove();
      hideStyle = null;
    }
  };
}

/** Draws every matched element's text at its laid-out place. `origin` is the paint canvas's client box. */
function drawText(l: Layout, els: HTMLElement[], origin: DOMRect): void {
  const { ctx, w, h } = l;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const sx = w / Math.max(1, origin.width);
  const sy = h / Math.max(1, origin.height);
  // Client px to sheet px.
  ctx.setTransform(sx, 0, 0, sy, -origin.left * sx, -origin.top * sy);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  const range = document.createRange();
  for (const el of els) {
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walk.nextNode() as Text | null; node; node = walk.nextNode() as Text | null) {
      const parent = node.parentElement;
      if (!parent) continue;
      const cs = getComputedStyle(parent);
      if (cs.visibility !== "visible") continue;
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      ctx.letterSpacing = spacing(cs.letterSpacing);
      ctx.wordSpacing = spacing(cs.wordSpacing);
      const m = ctx.measureText("Hg");
      const asc = m.fontBoundingBoxAscent;
      const content = asc + m.fontBoundingBoxDescent;
      // The browser paints a line from its top snapped to a whole CSS px, then the ascent, then snaps the baseline to
      // a whole device px (half up). Measured at dpr 1.5 and 1.25 (2026-11-13): with the unsnapped top, a line whose
      // top sits at 139.44 css drew one device row low (234.66 rounds to 235; the browser's is (139 + 17) * 1.5 = 234).
      const baseline = (r: DOMRect) => Math.round((Math.round(r.top) + (r.height - content) / 2 + asc - origin.top) * sy) / sy + origin.top;
      const data = node.data;
      const how = cs.textTransform;
      /** Draws `data[from, to)` in the box the browser gave it. */
      const put = (from: number, to: number, r: DOMRect) => {
        if (r.width <= 0) return;
        const str = shown(data, from, to, how);
        // A transform that changed the length shows text the DOM offsets do not describe: keep it inside its box.
        if (str.length !== to - from && ctx.measureText(str).width > r.width) ctx.fillText(str, r.left, baseline(r), r.width);
        else ctx.fillText(str, r.left, baseline(r));
      };
      for (const word of data.matchAll(/\S+/g)) {
        const at = word.index;
        const end = at + word[0].length;
        range.setStart(node, at);
        range.setEnd(node, end);
        const rects = range.getClientRects();
        if (rects.length === 0) continue;
        if (rects.length === 1) {
          put(at, end, rects[0]!);
          continue;
        }
        // Split over lines: one character (code point) at a time, each at its own box.
        for (let k = at; k < end; ) {
          const n = data.codePointAt(k)! > 0xffff ? 2 : 1;
          range.setStart(node, k);
          range.setEnd(node, k + n);
          put(k, k + n, range.getBoundingClientRect());
          k += n;
        }
      }
    }
  }
  range.detach();
}

export function text(opts: TextOptions = {}): Field {
  const selector = opts.selector ?? "[data-paint-ink]";
  const carries = opts.carried ?? true;
  return {
    kind: "ink",
    writes: ["ink"],
    init(gl, fctx) {
      const canvas = document.createElement("canvas");
      const c2d = canvas.getContext("2d");
      if (!c2d) throw new Error("paint-kit: fields.text needs a 2D canvas context");
      const layout: Layout = { ctx: c2d, w: 0, h: 0 };
      const glCanvas = gl.canvas as HTMLCanvasElement;
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      // Linear for the carried read; the uncarried one fetches its texel, which filtering does not touch.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      let built: { float: boolean; carried: boolean; prog: WebGLProgram; loc: ReturnType<typeof locations> } | undefined;
      let dirty = true;
      const elements = () => Array.from(document.querySelectorAll<HTMLElement>(selector));
      // Each hidden element's own inline colour, to put back exactly.
      const saved = new Map<HTMLElement, { value: string; priority: string }>();
      const releaseRule = useHideRule();
      const hide = (el: HTMLElement) => {
        if (!saved.has(el)) saved.set(el, { value: el.style.getPropertyValue("color"), priority: el.style.getPropertyPriority("color") });
        el.setAttribute(HIDDEN, "");
        el.style.setProperty("color", "transparent", "important");
      };
      const show = (el: HTMLElement) => {
        const c = saved.get(el);
        saved.delete(el);
        el.removeAttribute(HIDDEN);
        if (c?.value) el.style.setProperty("color", c.value, c.priority);
        else el.style.removeProperty("color");
      };

      const stale = () => {
        dirty = true;
        fctx.invalidate();
      };
      const ro = new ResizeObserver(stale);
      // Observing only new elements: an observer fires once when it starts watching, so re-observing all of
      // them on every layout would ask for a redraw after every redraw.
      const watched = new Set<Element>();
      const observe = (els: Element[]) => {
        for (const el of els) {
          if (watched.has(el)) continue;
          watched.add(el);
          ro.observe(el);
        }
      };
      observe([document.documentElement, ...elements()]);
      const fonts = document.fonts;
      fonts?.addEventListener("loadingdone", stale);
      window.addEventListener("resize", stale);
      window.addEventListener("scroll", stale, { passive: true });

      const relayout = (w: number, h: number) => {
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        layout.w = w;
        layout.h = h;
        const els = elements();
        const now = new Set(els);
        // An element that no longer matches shows its text again.
        for (const el of [...saved.keys()]) if (!now.has(el)) show(el);
        for (const el of els) hide(el);
        observe(els);
        drawText(layout, els, glCanvas.getBoundingClientRect());
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        dirty = false;
      };

      return {
        stateful: false,
        draw(sheet) {
          if (dirty || layout.w !== sheet.w || layout.h !== sheet.h) relayout(sheet.w, sheet.h);
          const carried = carries && !!sheet.rest && sheet.readsRest;
          if (!built || built.float !== sheet.float || built.carried !== carried) {
            if (built) gl.deleteProgram(built.prog);
            const prog = program(gl, VS_FULLSCREEN, HEADER + (carried ? "#define PK_CARRIED\n" : "") + sheetDefines(sheet.float) + GLSL_SHEET + FS);
            built = { float: sheet.float, carried, prog, loc: locations(gl, prog) };
          }
          sheet.out.bind();
          gl.useProgram(built.prog);
          if (carried) bindTexture(gl, built.loc("uRest"), 1, sheet.rest!.tex);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.uniform1i(built.loc("uText"), 0);
          quad(gl);
        },
        resize() {
          dirty = true;
        },
        dispose() {
          ro.disconnect();
          watched.clear();
          fonts?.removeEventListener("loadingdone", stale);
          window.removeEventListener("resize", stale);
          window.removeEventListener("scroll", stale);
          for (const el of [...saved.keys()]) show(el);
          releaseRule();
          if (built) gl.deleteProgram(built.prog);
          built = undefined;
          gl.deleteTexture(tex);
        },
      };
    },
  };
}
