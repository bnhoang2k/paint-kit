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
export declare const STEP: number;
export declare const MAX_DT: number;
/** The most fixed ticks a stateful field runs in one live draw when it is behind (made again mid-run). */
export declare const MAX_CATCHUP = 4;
/**
 * A stateful field's step counter. Steps are counted in fixed STEP ticks, never per rendered frame: a draw at time
 * `t` runs the field up to `round(t / STEP)` ticks, so live frames of any length and a replay (one tick per draw)
 * reach the same tick count at the same `t`. A draw with `dt` 0 runs nothing; a draw far behind runs at most
 * `maxCatchup` ticks, so it never stalls a frame.
 */
export declare function tickClock(maxCatchup?: number): {
    readonly ticks: number;
    advance(t: number, dt: number): number;
};
export declare function createLoop(h: LoopHooks, opts?: LoopOptions): Loop;
