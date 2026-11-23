import { hasHook, hideText, open, round } from "./frames.js";
import { boxBlur, luminance } from "./image.js";
import * as relight from "./relight.js";
import { threshold } from "./threshold.js";
import { joinSchemes, SCHEMES } from "./types.js";
const NAME = "detail";
const T = 2;
const BLUR_RADIUS = 4;
const LEVELS = [0, 0.5, 1];
const result = (status, line, measured) => ({ name: NAME, status, line: `${NAME}: ${line}`, measured });
/** Energy of (luminance minus its 4 px blur) over the energy of luminance about its mean; 0 for a flat frame. */
export function highFrequencyShare(f) {
    const lum = luminance(f);
    const blur = boxBlur(lum, f.w, f.h, BLUR_RADIUS);
    let mean = 0;
    for (const v of lum)
        mean += v / lum.length;
    let fine = 0;
    let total = 0;
    for (let i = 0; i < lum.length; i++) {
        fine += (lum[i] - blur[i]) ** 2;
        total += (lum[i] - mean) ** 2;
    }
    return total > 0 ? fine / total : 0;
}
const NO_HOOK = "the page has no window.__paint hook, so its detail cannot be set";
/**
 * The high-frequency share at one dial level, read as this check reads it: frozen at t 2, text hidden, all ink off,
 * the whole finish off (grain 0, halftone screen hidden). `null` when the page has no hook. scripts/measure.mjs reads its detail cells through this too.
 */
export async function shareAt(target, opts, detail, dark) {
    const h = await open(target, opts, { t: T, detail, dark });
    let frame;
    try {
        if (!(await hasHook(h)))
            return null;
        await hideText(h);
        // All ink off: text ink is not paint (text-contrast's floor turns it off too; picture ink, such as halftone
        // dots, is paint there). detail turns picture ink off as well, for its own reason: ink spread softens glyph
        // edges as detail rises, which would lower the share on a page whose frame is mostly text (the paper-mud
        // faults), and dots, which do not change with the dial, could dilute its rise. Not re-measured with dots on.
        await h.hook("__paint.setInk(false)");
        await h.hook("__paint.setGrain(0)");
        await h.hook("__paint.setScreen(false)");
        frame = await h.shot();
    }
    finally {
        await h.close();
    }
    return highFrequencyShare(frame);
}
/** detail in one colour scheme: the shares at detail 0, 0.5 and 1 and relight at detail 0, all opened in `scheme`. */
async function checkScheme(target, opts, scheme) {
    const minRise = threshold("detail.minRise", target.bar);
    const dark = scheme === "dark";
    const shares = [];
    for (const d of LEVELS) {
        const share = await shareAt(target, opts, d, dark);
        if (share === null)
            return { scheme, status: "partial", line: NO_HOOK, measured: {}, noHook: true };
        shares.push(share);
    }
    const [s0, s5, s1] = shares;
    const rise = s0 > 0 ? (s1 - s0) / s0 : 0;
    const measured = { "share.0": s0, "share.0.5": s5, "share.1": s1, rise };
    const atZero = await relight.checkScheme(target, { ...opts, detail: 0 }, scheme);
    measured["relight0.fail"] = atZero.status === "fail" ? 1 : 0;
    const relightLine = `at detail 0 relight: ${atZero.line}`;
    let relightProblem = "";
    if (atZero.status === "fail") {
        const own = await relight.checkScheme(target, opts, scheme);
        measured["relightOwn.fail"] = own.status === "fail" ? 1 : 0;
        if (own.status !== "fail")
            relightProblem = "at detail 0 the page fails relight, though it passes at its own detail: its macro relief does not survive the dial";
    }
    const facts = `high-frequency share (finish grain and screen off) ${round(s0)} / ${round(s5)} / ${round(s1)} at detail 0 / 0.5 / 1, relative rise ${round(rise)} (minimum ${minRise})`;
    const problems = [];
    if (!(s0 < s5 && s5 < s1))
        problems.push("the high-frequency share does not rise strictly with the dial");
    else if (rise < minRise)
        problems.push(`the high-frequency share does not rise enough: a relative rise of ${round(rise)} from detail 0 to 1, under ${minRise}`);
    if (relightProblem)
        problems.push(relightProblem);
    return problems.length
        ? { scheme, status: "fail", line: `${problems.join("; ")} (${facts}; ${relightLine})`, measured }
        : { scheme, status: "pass", line: `${facts}; ${relightLine}`, measured };
}
export const check = async (target, opts) => {
    const parts = [];
    for (const scheme of SCHEMES) {
        const part = await checkScheme(target, opts, scheme);
        if (part.noHook)
            return result("partial", NO_HOOK, {});
        parts.push(part);
    }
    return joinSchemes(NAME, parts);
};
