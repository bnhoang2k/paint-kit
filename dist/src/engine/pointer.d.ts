import type { Light, TiltOptions, Uniforms } from "./types.ts";
export type PointerOptions = {
    /**
     * The share of the way to the target the eased pointer moves each 1/60 s tick, over 0 up to 1. 1 (the default) is
     * no lag. Bar 06's reference eases by 0.25 per frame (95% of a jump in 10 ticks). A lag given as a time constant
     * tau in seconds is `easeOfTau(tau)`.
     */
    ease?: number;
    /** Where the pointer rests before any input, in canvas fractions. Default [0.5, 0.5]. */
    rest?: [number, number];
};
/** One stop of a pointer path: at time `t` (s) the pointer is at (x, y). Between stops it moves in a straight line. */
export type PointerStop = {
    t: number;
    x: number;
    y: number;
};
/** The per-tick ease for an exponential lag with time constant `tau` seconds (bar 01's lamp: tau 0.1 s). */
export declare const easeOfTau: (tau: number) => number;
/** The path's position at time `t`: the first stop before it, the last after it, a straight line between. */
export declare function pathAt(path: readonly PointerStop[], t: number): [number, number];
export type Pointer = {
    /** The eased pointer now, in canvas fractions. */
    at(): [number, number];
    /** A raw position from the page (canvas fractions). Live frames ease toward it. */
    input(x: number, y: number): void;
    /** The path frozen frames replay (canvas fractions), or null for the rest point. */
    setPath(path: readonly PointerStop[] | null): void;
    /** A live frame at time t: steps the ticks the clock crossed since the last call. `dt` 0 steps nothing. */
    advance(t: number, dt: number): void;
    /** The deterministic pointer at t: from the rest point, every tick up to t, toward the path (or the rest point). */
    replay(t: number): void;
    /**
     * Each light's uniforms as drawn at time `t`: its `pointer` hook's values for the eased pointer laid over them, then
     * its `frame` hook's (time and eased pointer). The one place per-draw light uniforms are made.
     */
    uniforms(lights: readonly Light[], base: readonly Uniforms[], t: number): Uniforms[];
};
export declare function createPointer(opts?: PointerOptions): Pointer;
/**
 * Feeds a canvas's pointer from the window's `pointermove` events (anywhere on the page, as the reference does),
 * as fractions of the canvas box. Returns the unsubscribe.
 */
export declare function listenPointer(canvas: HTMLCanvasElement, p: Pointer): () => void;
/** A path in viewport fractions (bar.json, the checks) as canvas fractions, against the canvas box now. */
export declare function viewportToCanvas(path: readonly PointerStop[], canvas: HTMLCanvasElement): PointerStop[];
/**
 * The tilt's one sign. +1: the side the pointer is on goes away from the viewer, as a card held in the hand tips when
 * you press the side your finger is on. -1 would bring that side toward the viewer instead. The owner judges the feel
 * (Phase 2 Task 16); flip it here and nowhere else.
 */
export declare const TILT_SENSE = 1;
/**
 * The tilt the pointer asks for, in degrees: the canvas centre is flat, a canvas edge is `max`, and past the edge it
 * holds `max`. Pointer x is 0 left to 1 right, y 0 top to 1 bottom (canvas fractions).
 */
export declare function tiltOfPointer([x, y]: [number, number], max: number): [number, number];
/**
 * The rotation R that tips a surface by `[a, b]` degrees, as 9 numbers in column order (GLSL's `mat3`): first b about
 * the horizontal axis (the top goes away), then a about the vertical one (the right side goes away). R carries the
 * flat card's normal +z to (sin a cos b, sin b, cos a cos b): a card whose right side went away faces right, one whose
 * top went away faces up. The room's frame is the sheet's: x right, y up, z toward the viewer. The eye, held at +z,
 * sits at R^T z = (-sin a, -sin b cos a, cos a cos b) as the turned card sees it (the view the Task 11 tilt turned).
 * [0, 0] gives exactly the identity.
 */
export declare function tiltTurn([a, b]: [number, number]): number[];
/**
 * `PaintOptions.tilt` checked: null when unset; a `max` outside 0..89 or a `drive` that is neither throws. `ease` is
 * the page's `pointer.ease`, the tilt's one ease: with drive "pointer" it must lag (a finite ease above 0 and under 1: 0 freezes the tilt, below 0 overshoots), or a leave would
 * snap the surface flat in one tick and an entry would jump (Review Focus 3), so an unset or whole ease throws.
 */
export declare function checkTilt(t: TiltOptions | null | undefined, ease?: number): TiltOptions | null;
export type Tilt = {
    /** The tilt now, in degrees: the held one (`hold`), else the eased pointer's under `opts` ([0, 0] for drive "none"). */
    at(opts: TiltOptions): [number, number];
    /** Holds a tilt over the pointer, at once (the hook's `setTilt`); null hands it back to the eased pointer. */
    hold(deg: [number, number] | null): void;
    /** A raw pointer position on the canvas (canvas fractions). */
    input(x: number, y: number): void;
    /** The pointer left the canvas: the tilt eases back to flat, by the pointer's ease. */
    leave(): void;
    setPath(path: readonly PointerStop[] | null): void;
    advance(t: number, dt: number): void;
    replay(t: number): void;
};
/**
 * The tilt's eased pointer: a second engine pointer (`createPointer`, with the page's pointer ease), resting at the
 * canvas centre, where the tilt is flat, so it eases, steps on the clock's ticks and replays exactly as the pointer
 * does. A leave sets its target to the centre, so it eases back by the same ease and never jumps.
 * `leaveSnaps` is the test fault 'tilt-leave-snaps': a leave puts the tilt at rest at once.
 */
export declare function createTilt(ease?: number, leaveSnaps?: boolean): Tilt;
/**
 * Feeds the tilt from the window's `pointermove` events: a position on the canvas tips it, and a position off the
 * canvas, the pointer leaving the page, or the window losing focus is a leave. Returns the unsubscribe.
 */
export declare function listenTilt(canvas: HTMLCanvasElement, tilt: Tilt): () => void;
