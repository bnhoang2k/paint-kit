// The frame loop and the clock. It owns start, stop, freezing, pausing while the tab is hidden, resting under
// reduced motion and render-on-demand; the engine supplies what a frame is. Live frames step by the real time
// since the last frame, clamped to 1/30 s. A frozen or resting clock never ticks: changes redraw once, on demand.
export const STEP = 1 / 60;
export const MAX_DT = 1 / 30;
/** The most fixed ticks a stateful field runs in one live draw when it is behind (made again mid-run). */
export const MAX_CATCHUP = 4;
/**
 * A stateful field's step counter. Steps are counted in fixed STEP ticks, never per rendered frame: a draw at time
 * `t` runs the field up to `round(t / STEP)` ticks, so live frames of any length and a replay (one tick per draw)
 * reach the same tick count at the same `t`. A draw with `dt` 0 runs nothing; a draw far behind runs at most
 * `maxCatchup` ticks, so it never stalls a frame.
 */
export function tickClock(maxCatchup = MAX_CATCHUP) {
    let ticks = 0;
    return {
        get ticks() {
            return ticks;
        },
        advance(t, dt) {
            if (!(dt > 0))
                return 0;
            const n = Math.max(0, Math.min(Math.round(t / STEP) - ticks, maxCatchup));
            ticks += n;
            return n;
        },
    };
}
export function createLoop(h, opts = {}) {
    const pauseHidden = opts.pauseHidden ?? true;
    let t = 0;
    let frozen = false;
    /** The loop is meant to run (started, not stopped); it may still be paused while the tab is hidden. */
    let live = false;
    /** A frame is requested. */
    let running = false;
    let raf = 0;
    let last = 0;
    const guard = (fn) => {
        try {
            fn();
        }
        catch (e) {
            stop();
            h.onError(e);
        }
    };
    const tick = (now) => {
        raf = 0;
        if (!running)
            return;
        raf = requestAnimationFrame(tick);
        const dt = last ? Math.min((now - last) / 1000, MAX_DT) : STEP;
        last = now;
        t += dt;
        guard(() => h.frame(t, dt));
        if (running && h.rest?.())
            stop();
    };
    const run = () => {
        if (running)
            return;
        running = true;
        last = 0;
        raf = requestAnimationFrame(tick);
    };
    const halt = () => {
        running = false;
        if (raf)
            cancelAnimationFrame(raf);
        raf = 0;
    };
    const hidden = () => pauseHidden && document.hidden;
    const onVisibility = () => {
        if (!live)
            return;
        if (hidden())
            halt();
        else
            run();
    };
    if (pauseHidden)
        document.addEventListener("visibilitychange", onVisibility);
    function stop() {
        live = false;
        halt();
    }
    return {
        get t() {
            return t;
        },
        get frozen() {
            return frozen;
        },
        start() {
            if (live || frozen)
                return;
            live = true;
            if (!hidden())
                run();
        },
        stop,
        freeze(at) {
            stop();
            const from = t;
            const on = frozen && h.forward !== undefined && at >= from;
            frozen = true;
            t = Math.max(0, at);
            if (on)
                h.forward(from, t);
            else
                h.replay(t);
        },
        settle(at) {
            stop();
            t = Math.max(0, at);
            h.replay(t);
        },
        refresh() {
            if (frozen)
                h.replay(t);
            else
                guard(() => h.frame(t, 0));
        },
        redraw() {
            if (!running)
                h.redraw();
        },
        motion() {
            // Paused only while the loop is meant to run but the tab is hidden; a frozen or resting page is still.
            if (running)
                return "live";
            return live ? "paused" : "still";
        },
        dispose() {
            stop();
            document.removeEventListener("visibilitychange", onVisibility);
        },
    };
}
