import { hasHook, open, round, sleep } from "./frames.js";
import { meanAbsDiff } from "./image.js";
import { threshold } from "./threshold.js";
import { TICKS_PER_SECOND } from "../bar.js";
const NAME = "still";
// Headless pages are never hidden, so the check owns document.hidden and document.visibilityState.
const HIDDEN_INIT = `
  Object.defineProperty(document, "hidden", { configurable: true, get: () => globalThis.__fakeHidden === true });
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (globalThis.__fakeHidden === true ? "hidden" : "visible") });`;
const flip = (hidden) => `globalThis.__fakeHidden = ${hidden}; document.dispatchEvent(new Event("visibilitychange"))`;
const TWO_FRAMES = "new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))";
const result = (status, line, measured) => ({ name: NAME, status, line: `${NAME}: ${line}`, measured });
/** Reduced motion: two frames 2 s apart (after the first frames have settled) are identical. Returns the difference. */
async function reducedDiff(h) {
    return (await reducedFrames(h)).diff;
}
async function reducedFrames(h) {
    await h.hook(TWO_FRAMES);
    const a = await h.shot();
    await sleep(2000);
    const last = await h.shot();
    return { diff: meanAbsDiff(a, last), last };
}
export const check = async (target, opts) => {
    const reducedMax = threshold("still.reducedDiff", target.bar);
    const hiddenMax = threshold("still.hiddenFrames", target.bar);
    const heldMax = threshold("still.heldDiff", target.bar);
    const problems = [];
    const measured = {};
    const r = await open(target, opts, { reduced: true });
    try {
        if (!(await hasHook(r)))
            return result("partial", "the page has no window.__paint hook, so its loop cannot be read", {});
        const red = await reducedFrames(r);
        measured.reducedDiff = red.diff;
        if (red.diff > reducedMax)
            problems.push(`reduced motion still moves: frames 2 s apart differ by ${round(red.diff, 6)}, over ${reducedMax}`);
        // A page with a settle time rests on the frame setTime gives there (the held picture): compare with a frozen open
        // at the declared time. Times are compared in whole ticks, the engine's unit.
        measured.engineSettle = (await r.hook("__paint.stats()")).settle ?? 0;
        measured.settle = target.bar ? (target.bar.settle ?? 0) : measured.engineSettle;
        const ticks = (s) => Math.round(s * TICKS_PER_SECOND);
        if (ticks(measured.engineSettle) !== ticks(measured.settle)) {
            problems.push(`the engine settles at ${round(measured.engineSettle, 3)} s, but bar.json declares ${measured.settle > 0 ? `${round(measured.settle, 3)} s` : "none"}`);
        }
        if (measured.settle > 0) {
            // The frozen frame is a redraw: setTime at the settle time, then the shot. A fresh open's first frame is the
            // same kind of draw as the rested one (the first after load), so an engine whose first draw is wrong would
            // agree with itself; a replay is what the rested frame must equal.
            const f = await open(target, opts, { t: measured.settle });
            try {
                await f.hook(`__paint.setTime(${measured.settle})`);
                measured.heldDiff = meanAbsDiff(red.last, await f.shot());
            }
            finally {
                await f.close();
            }
            if (measured.heldDiff > heldMax) {
                problems.push(`the reduced-motion frame is not the held one: it differs from the frozen frame at the settle time ${round(measured.settle, 3)} s by ${round(measured.heldDiff, 6)}, over ${heldMax}`);
            }
        }
    }
    finally {
        await r.close();
    }
    // Hidden tab: the loop must be running before the flip (frames drawn in ~300 ms), and then stop.
    const h = await open(target, opts, { initScript: HIDDEN_INIT });
    try {
        const frames = async () => (await h.hook("__paint.stats()")).frames;
        const first = await frames();
        await sleep(300);
        const before = await frames();
        measured.framesBeforeFlip = before - first;
        if (before - first <= 0)
            return result("partial", "the page drew no frames in 300 ms while visible, so a hidden tab cannot be told from a loop that never runs", measured);
        await h.hook(flip(true));
        const flipped = await frames();
        await sleep(1000);
        const after = await frames();
        measured.hiddenFrames = after - flipped;
        if (after - flipped > hiddenMax)
            problems.push(`a hidden tab still draws: ${after - flipped} frames in 1 s, over ${hiddenMax}`);
    }
    finally {
        await h.close();
    }
    const held = measured.settle > 0
        ? `; rested frame vs the frozen frame at the settle time ${round(measured.settle, 3)} s: differ by ${round(measured.heldDiff, 6)}`
        : " (no settle time: it rests on its first frame)";
    const facts = `reduced-motion frames 2 s apart differ by ${round(measured.reducedDiff, 6)}${held}; ${measured.hiddenFrames} frames drawn in 1 s hidden (${measured.framesBeforeFlip} in 300 ms visible)`;
    return problems.length > 0 ? result("fail", `${problems.join("; ")} (${facts})`, measured) : result("pass", facts, measured);
};
/** A control runs the reduced-motion half only: the drape leans on the browser to throttle a hidden tab. */
export const controlCheck = async (target, opts) => {
    const reducedMax = threshold("still.reducedDiff", target.bar);
    const r = await open(target, opts, { reduced: true });
    try {
        const diff = await reducedDiff(r);
        const facts = `reduced-motion frames 2 s apart differ by ${round(diff, 6)}; hidden-tab half does not apply to a control`;
        return diff > reducedMax
            ? result("fail", `reduced motion still moves: frames 2 s apart differ by ${round(diff, 6)}, over ${reducedMax} (${facts})`, { reducedDiff: diff })
            : result("pass", facts, { reducedDiff: diff });
    }
    finally {
        await r.close();
    }
};
