import { hasHook, hideText, open, round, sleep } from "./frames.js";
import { highPassStd, longestStaircaseRun, luminance, smoothMask } from "./image.js";
import { threshold } from "./threshold.js";
const NAME = "banding-grain";
/** A 32 px box blur is a window of 2 x 16 + 1 px: a large scale, so the inside of a wide band still counts. */
const BLUR_RADIUS = 16;
const result = (status, line, measured) => ({ name: NAME, status, line: `${NAME}: ${line}`, measured });
/** The staircase run of a frame inside its smooth-slope mask, and the share of pixels in that mask. */
export function bandingOf(frame, smoothMax) {
    const lum = luminance(frame);
    const mask = smoothMask(lum, frame.w, frame.h, BLUR_RADIUS, smoothMax);
    let n = 0;
    for (const m of mask)
        n += m;
    return { run: longestStaircaseRun(frame, mask), share: n / mask.length };
}
/** The finish's grain: high-pass std of the luminance of `frame` (declared grain) minus `bare` (grain 0, else the same). */
export function finishGrain(frame, bare) {
    const a = luminance(frame);
    const b = luminance(bare);
    const d = new Float64Array(a.length);
    for (let i = 0; i < d.length; i++)
        d[i] = a[i] - b[i];
    return highPassStd(d, frame.w, frame.h);
}
export const check = async (target, opts) => {
    const { bar } = target;
    const smoothMax = threshold("banding.smoothMax", bar);
    const maxRun = threshold("banding.maxRun", bar);
    const floor = threshold("grain.floor", bar);
    const ceiling = threshold("grain.ceiling", bar);
    const t0 = bar?.alive && "t0" in bar.alive ? bar.alive.t0 : 1;
    const measured = {};
    const problems = [];
    const facts = [];
    for (const scheme of ["light", "dark"]) {
        const h = await open(target, opts, { t: t0, dark: scheme === "dark" });
        let frame;
        let bare;
        let declared;
        try {
            if (!(await hasHook(h)))
                return result("partial", "the page has no window.__paint hook, so the frame cannot be frozen", {});
            await hideText(h);
            declared = await h.hook("__paint.grain()");
            frame = await h.shot();
            await h.hook("__paint.setGrain(0)");
            bare = await h.shot();
        }
        finally {
            await h.close();
        }
        const { run, share } = bandingOf(frame, smoothMax);
        const grain = finishGrain(frame, bare);
        measured[`run.${scheme}`] = run;
        measured[`grain.${scheme}`] = grain;
        measured[`share.${scheme}`] = share;
        measured.declared = declared;
        if (run > maxRun)
            problems.push(`banding (${scheme}): a quantised run of ${run} px is over ${maxRun}`);
        if (grain < floor)
            problems.push(`grain (${scheme}): high-pass std ${round(grain, 5)} is under ${floor}, so the frame has no grain`);
        if (grain > ceiling)
            problems.push(`grain (${scheme}): high-pass std ${round(grain, 5)} is over ${ceiling}, so the grain is too loud`);
        facts.push(`${scheme} run ${run} px, grain std ${round(grain, 5)}`);
    }
    const summary = `${facts.join("; ")} (run limit ${maxRun}, grain range ${floor} to ${ceiling}; grain read as the frame at finish grain ${measured.declared} minus the frame at 0)`;
    return problems.length > 0 ? result("fail", `${problems.join("; ")} (${summary})`, measured) : result("pass", summary, measured);
};
/** A control has no grain to judge: the banding half only, read live. */
export const controlCheck = async (target, opts) => {
    const smoothMax = threshold("banding.smoothMax", target.bar);
    const maxRun = threshold("banding.maxRun", target.bar);
    const h = await open(target, opts);
    let frame;
    try {
        await hideText(h);
        await sleep(300);
        frame = await h.shot();
    }
    finally {
        await h.close();
    }
    const { run, share } = bandingOf(frame, smoothMax);
    const summary = `live run ${run} px (run limit ${maxRun}; grain half does not apply to a control)`;
    const measured = { "run.live": run, "share.live": share };
    return run > maxRun ? result("fail", `banding (live): a quantised run of ${run} px is over ${maxRun} (${summary})`, measured) : result("pass", summary, measured);
};
