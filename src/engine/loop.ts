// The frame loop and the clock. It owns start, stop, freezing, pausing while the tab is hidden, resting under
// reduced motion and render-on-demand; the engine supplies what a frame is. Live frames step by the real time
// since the last frame, clamped to 1/30 s. A frozen or resting clock never ticks: changes redraw once, on demand.

export type Motion = "live" | "still" | "paused";

export type LoopHooks = {
  /** Steps every field by `dt` to time `t` and draws a frame. `dt` 0 steps nothing. */
  frame(t: number, dt: number): void;
  /** Re-runs fields that keep state from their seed to `t` in fixed 1/60 s steps, then draws the frame at `t`. */
  replay(t: number): void;
  /**
   * The frozen clock moves on from `from` (whose frame `replay(from)` or `forward` drew, nothing changed since) to
   * `to` >= `from`: steps fields that keep state on from where they are, then draws the frame at `to`. It must
   * draw what `replay(to)` draws. Unset: `replay(to)`.
   */
  forward?(from: number, to: number): void;
  /** Draws the current sheet again (shade pass only), for a change of light, palette or finish. */
  redraw(): void;
  onError(e: unknown): void;
  /** Asked after each live frame; true stops the loop for good (reduced motion, and every field settled). */
  rest?(): boolean;
};

export type LoopOptions = {
  /** Stop drawing while `document.hidden`, and go on when visible again. Default true. */
  pauseHidden?: boolean;
};

export type Loop = {
  readonly t: number;
  readonly frozen: boolean;
  /** Runs live from the current time. Does nothing while frozen. */
  start(): void;
  stop(): void;
  /**
   * Freezes the clock at `t` and draws the deterministic frame there. Already frozen at or before `t`, it steps on
   * from there (`forward`), so stepping a frozen page frame by frame costs each tick once, not every tick per frame.
   */
  freeze(t: number): void;
  /**
   * Rests the clock at `t` with the deterministic frame there (the frame `freeze(t)` draws), without freezing it:
   * a later `start` runs live on from `t`. Reduced motion settles stateful fields this way.
   */
  settle(t: number): void;
  /** The sheet is stale (resize, detail, new fields): draw it again at the current time without stepping. */
  refresh(): void;
  /** The look changed but the sheet did not: draw now unless a running loop will draw next frame anyway. */
  redraw(): void;
  motion(): Motion;
  dispose(): void;
};

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
export function tickClock(maxCatchup = MAX_CATCHUP): { readonly ticks: number; advance(t: number, dt: number): number } {
  let ticks = 0;
  return {
    get ticks() {
      return ticks;
    },
    advance(t, dt) {
      if (!(dt > 0)) return 0;
      const n = Math.max(0, Math.min(Math.round(t / STEP) - ticks, maxCatchup));
      ticks += n;
      return n;
    },
  };
}

export function createLoop(h: LoopHooks, opts: LoopOptions = {}): Loop {
  const pauseHidden = opts.pauseHidden ?? true;
  let t = 0;
  let frozen = false;
  /** The loop is meant to run (started, not stopped); it may still be paused while the tab is hidden. */
  let live = false;
  /** A frame is requested. */
  let running = false;
  let raf = 0;
  let last = 0;

  const guard = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      stop();
      h.onError(e);
    }
  };

  const tick = (now: number) => {
    raf = 0;
    if (!running) return;
    raf = requestAnimationFrame(tick);
    const dt = last ? Math.min((now - last) / 1000, MAX_DT) : STEP;
    last = now;
    t += dt;
    guard(() => h.frame(t, dt));
    if (running && h.rest?.()) stop();
  };

  const run = () => {
    if (running) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(tick);
  };
  const halt = () => {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };
  const hidden = () => pauseHidden && document.hidden;
  const onVisibility = () => {
    if (!live) return;
    if (hidden()) halt();
    else run();
  };
  if (pauseHidden) document.addEventListener("visibilitychange", onVisibility);

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
      if (live || frozen) return;
      live = true;
      if (!hidden()) run();
    },
    stop,
    freeze(at) {
      stop();
      const from = t;
      const on = frozen && h.forward !== undefined && at >= from;
      frozen = true;
      t = Math.max(0, at);
      if (on) h.forward!(from, t);
      else h.replay(t);
    },
    settle(at) {
      stop();
      t = Math.max(0, at);
      h.replay(t);
    },
    refresh() {
      if (frozen) h.replay(t);
      else guard(() => h.frame(t, 0));
    },
    redraw() {
      if (!running) h.redraw();
    },
    motion() {
      // Paused only while the loop is meant to run but the tab is hidden; a frozen or resting page is still.
      if (running) return "live";
      return live ? "paused" : "still";
    },
    dispose() {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    },
  };
}
