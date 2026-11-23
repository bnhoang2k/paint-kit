import { openPage } from "./harness.js";
/** Software WebGL is slow, so checks look at a small viewport at device pixel ratio 1 unless they say otherwise. */
export const VIEW = { dpr: 1, width: 960, height: 600 };
/**
 * The frame a target opens at: the bar's declared `view` (bar.json, for a bar designed at another size, such as a
 * phone screen) at device ratio 1, else VIEW. Every check and the sheet start from this.
 */
export const viewOf = (target) => target.bar?.view ? { dpr: VIEW.dpr, width: target.bar.view.width, height: target.bar.view.height } : { ...VIEW };
/**
 * A smaller frame with the view's aspect and about `area` pixels, in whole pixels. Checks that open a page small to
 * save time (hygiene at device ratio 3, the sheet's cells) use it, so a portrait bar stays portrait: no stretch.
 */
export function scaledView(view, area) {
    const aspect = view.width / view.height;
    const height = Math.round(Math.sqrt(area / aspect));
    return { width: Math.round(height * aspect), height };
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/**
 * Open options for a target: the view (`viewOf`), the seed and the detail (a control gets neither). The seed is `opts.seed`
 * (the gate runs a bar at every seed in bar.json, check-fix (g)), else the bar's first, else 1.
 */
export function pageOpts(target, opts, extra = {}) {
    const o = viewOf(target);
    if (!target.control) {
        o.seed = opts.seed ?? target.bar?.seeds[0] ?? 1;
        if (target.bar)
            o.detail = target.bar.detail;
        if (opts.detail !== undefined)
            o.detail = opts.detail;
    }
    if (opts.readyTimeout !== undefined)
        o.readyTimeout = opts.readyTimeout;
    if (opts.dark)
        o.dark = true;
    return Object.assign(o, extra);
}
export const open = (target, opts, extra = {}) => openPage(target.url, pageOpts(target, opts, extra));
export const hasHook = (h) => h.hook("window.__paint !== undefined");
/**
 * Hides everything except canvases, so a frame shows the painted surface alone (the heading would
 * otherwise dominate a standard-deviation reading). `body` itself is hidden too, so text sitting directly in it
 * (a bare text node, which `body *` does not match) is hidden as well. Idempotent.
 */
export async function hideText(h) {
    await h.page.addStyleTag({ content: "body, body * { visibility: hidden !important; } canvas { visibility: visible !important; }" });
}
export const round = (n, d = 4) => n.toFixed(d);
