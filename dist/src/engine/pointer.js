// The engine-owned pointer: a lagged copy of the page's pointer, stepped on the engine's fixed 1/60 s ticks, so
// `setTime(t)` replays it exactly. Lights read it per draw through their `pointer` hook (uniforms only, no rebuild).
//
// Where its target comes from:
// - Live (the loop runs): raw `pointermove` positions, as canvas fractions. Each live frame steps the eased pointer
//   by the ticks the clock crossed: x += (target - x) * ease, once per tick.
// - Frozen (`?t=`, `setTime`) or resting: a declared path, or the rest point. A replay to t starts at the rest
//   point and steps every tick up to round(t / STEP) with the path's position at that tick's time, so the same t
//   always gives the same pointer. Raw input does not reach a frozen page.
// The checks set the path through the hook (`__paint.setPointerPath`), in viewport fractions; bar.json declares
// it as `flash.pointer`.
//
// Frame: x 0 left to 1 right, y 0 top to 1 bottom, as fractions of the canvas (the lamp's and the glow's frame).
import { STEP } from "./loop.js";
/** The per-tick ease for an exponential lag with time constant `tau` seconds (bar 01's lamp: tau 0.1 s). */
export const easeOfTau = (tau) => (tau > 0 ? 1 - Math.exp(-STEP / tau) : 1);
/** The path's position at time `t`: the first stop before it, the last after it, a straight line between. */
export function pathAt(path, t) {
    const first = path[0];
    if (t <= first.t)
        return [first.x, first.y];
    for (let i = 1; i < path.length; i++) {
        const b = path[i];
        if (t <= b.t) {
            const a = path[i - 1];
            const u = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
            return [a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u];
        }
    }
    const last = path[path.length - 1];
    return [last.x, last.y];
}
export function createPointer(opts = {}) {
    const ease = Math.min(1, Math.max(1e-6, opts.ease ?? 1));
    const rest = opts.rest ? [opts.rest[0], opts.rest[1]] : [0.5, 0.5];
    let x = rest[0];
    let y = rest[1];
    let target = [...rest];
    let ticks = 0;
    let path = null;
    const step = (tx, ty) => {
        x += (tx - x) * ease;
        y += (ty - y) * ease;
    };
    return {
        at: () => [x, y],
        input(px, py) {
            target = [px, py];
        },
        setPath(p) {
            path = p && p.length > 0 ? p.map((s) => ({ ...s })) : null;
        },
        advance(t, dt) {
            if (!(dt > 0))
                return;
            const to = Math.round(t / STEP);
            // A long gap (the tab was hidden) needs at most this many ticks to land within 1e-6 of the target.
            const n = Math.min(to - ticks, Math.ceil(Math.log(1e-6) / Math.log(1 - Math.min(ease, 1 - 1e-9))));
            for (let k = 0; k < n; k++)
                step(target[0], target[1]);
            ticks = Math.max(ticks, to);
        },
        replay(t) {
            [x, y] = rest;
            const n = Math.round(t / STEP);
            for (let k = 1; k <= n; k++) {
                const [tx, ty] = path ? pathAt(path, k * STEP) : rest;
                step(tx, ty);
            }
            ticks = n;
            target = path ? pathAt(path, n * STEP) : [...rest];
        },
        uniforms(lights, base, t) {
            return base.map((u, i) => {
                const l = lights[i];
                if (!l?.pointer && !l?.frame)
                    return u;
                return { ...u, ...l.pointer?.([x, y]), ...l.frame?.(t, [x, y]) };
            });
        },
    };
}
/**
 * Feeds a canvas's pointer from the window's `pointermove` events (anywhere on the page, as the reference does),
 * as fractions of the canvas box. Returns the unsubscribe.
 */
export function listenPointer(canvas, p) {
    const on = (e) => {
        const r = canvas.getBoundingClientRect();
        if (r.width > 0 && r.height > 0)
            p.input((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    };
    addEventListener("pointermove", on);
    return () => removeEventListener("pointermove", on);
}
/** A path in viewport fractions (bar.json, the checks) as canvas fractions, against the canvas box now. */
export function viewportToCanvas(path, canvas) {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, r.width);
    const h = Math.max(1, r.height);
    return path.map((s) => ({ t: s.t, x: (s.x * innerWidth - r.left) / w, y: (s.y * innerHeight - r.top) / h }));
}
// Tilt (Phase 2 Task 11; Task 16, the owner's pick at bar 10's look review): the eased pointer tips the surface about the
// canvas centre, so the shade pass turns the surface's normal and groove direction by the tilt (`tiltTurn`), as a card
// tipped in the hand under fixed room lights; the eye stays at +z, the lights stay in the room's frame, and no geometry
// moves (the sheet, the shadow march and the text stay where they are). A tilt is [a, b] in degrees: a about the
// vertical axis, positive when the right side goes away from the viewer; b about the horizontal axis, positive when
// the top goes away.
/**
 * The tilt's one sign. +1: the side the pointer is on goes away from the viewer, as a card held in the hand tips when
 * you press the side your finger is on. -1 would bring that side toward the viewer instead. The owner judges the feel
 * (Phase 2 Task 16); flip it here and nowhere else.
 */
export const TILT_SENSE = 1;
const clampUnit = (v) => Math.min(1, Math.max(-1, v));
/**
 * The tilt the pointer asks for, in degrees: the canvas centre is flat, a canvas edge is `max`, and past the edge it
 * holds `max`. Pointer x is 0 left to 1 right, y 0 top to 1 bottom (canvas fractions).
 */
export function tiltOfPointer([x, y], max) {
    return [TILT_SENSE * max * clampUnit(2 * (x - 0.5)), TILT_SENSE * max * clampUnit(2 * (0.5 - y))];
}
/**
 * The rotation R that tips a surface by `[a, b]` degrees, as 9 numbers in column order (GLSL's `mat3`): first b about
 * the horizontal axis (the top goes away), then a about the vertical one (the right side goes away). R carries the
 * flat card's normal +z to (sin a cos b, sin b, cos a cos b): a card whose right side went away faces right, one whose
 * top went away faces up. The room's frame is the sheet's: x right, y up, z toward the viewer. The eye, held at +z,
 * sits at R^T z = (-sin a, -sin b cos a, cos a cos b) as the turned card sees it (the view the Task 11 tilt turned).
 * [0, 0] gives exactly the identity.
 */
export function tiltTurn([a, b]) {
    const ra = (a * Math.PI) / 180;
    const rb = (b * Math.PI) / 180;
    const [ca, sa, cb, sb] = [Math.cos(ra), Math.sin(ra), Math.cos(rb), Math.sin(rb)];
    // Columns of Ry(a) Rx(-b): R x, R y, R z.
    return [ca, 0, -sa, -sa * sb, cb, -ca * sb, sa * cb, sb, ca * cb];
}
/**
 * `PaintOptions.tilt` checked: null when unset; a `max` outside 0..89 or a `drive` that is neither throws. `ease` is
 * the page's `pointer.ease`, the tilt's one ease: with drive "pointer" it must lag (a finite ease above 0 and under 1: 0 freezes the tilt, below 0 overshoots), or a leave would
 * snap the surface flat in one tick and an entry would jump (Review Focus 3), so an unset or whole ease throws.
 */
export function checkTilt(t, ease) {
    if (t === undefined || t === null)
        return null;
    if (!Number.isFinite(t.max) || t.max < 0 || t.max > 89)
        throw new RangeError(`paint-kit: tilt.max is degrees from 0 to 89, got ${t.max}`);
    if (t.drive !== "pointer" && t.drive !== "none")
        throw new RangeError(`paint-kit: tilt.drive is "pointer" or "none", got ${JSON.stringify(t.drive)}`);
    if (t.drive === "pointer" && !(ease !== undefined && Number.isFinite(ease) && ease > 0 && ease < 1))
        throw new RangeError(`paint-kit: tilt.drive "pointer" eases with the pointer, and a page that tilts sets \`pointer.ease\` above 0 and under 1 (easeOfTau); got ${ease === undefined ? "none (1, no lag)" : ease}, which would snap the tilt flat on leave`);
    return { max: t.max, drive: t.drive };
}
const CENTRE = [0.5, 0.5];
/**
 * The tilt's eased pointer: a second engine pointer (`createPointer`, with the page's pointer ease), resting at the
 * canvas centre, where the tilt is flat, so it eases, steps on the clock's ticks and replays exactly as the pointer
 * does. A leave sets its target to the centre, so it eases back by the same ease and never jumps.
 * `leaveSnaps` is the test fault 'tilt-leave-snaps': a leave puts the tilt at rest at once.
 */
export function createTilt(ease, leaveSnaps = false) {
    const make = () => createPointer({ ...(ease === undefined ? {} : { ease }), rest: CENTRE });
    let p = make();
    let held = null;
    let path = null;
    let lastT = 0;
    return {
        at: (opts) => (held ? [held[0], held[1]] : opts.drive === "pointer" ? tiltOfPointer(p.at(), opts.max) : [0, 0]),
        hold(deg) {
            held = deg ? [deg[0], deg[1]] : null;
        },
        input: (x, y) => p.input(x, y),
        leave() {
            if (!leaveSnaps)
                return p.input(CENTRE[0], CENTRE[1]);
            // The fault: a fresh pointer at rest, on the clock's tick, as if the tilt had jumped there.
            p = make();
            p.setPath(path);
            p.replay(0);
            p.advance(lastT, lastT);
        },
        setPath(next) {
            path = next;
            p.setPath(next);
        },
        advance(t, dt) {
            if (dt > 0)
                lastT = t;
            p.advance(t, dt);
        },
        replay(t) {
            lastT = t;
            p.replay(t);
        },
    };
}
/**
 * Feeds the tilt from the window's `pointermove` events: a position on the canvas tips it, and a position off the
 * canvas, the pointer leaving the page, or the window losing focus is a leave. Returns the unsubscribe.
 */
export function listenTilt(canvas, tilt) {
    const move = (e) => {
        const r = canvas.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        if (r.width > 0 && r.height > 0 && x >= 0 && x <= 1 && y >= 0 && y <= 1)
            tilt.input(x, y);
        else
            tilt.leave();
    };
    const leave = () => tilt.leave();
    const root = document.documentElement;
    addEventListener("pointermove", move);
    root.addEventListener("pointerleave", leave);
    addEventListener("blur", leave);
    return () => {
        removeEventListener("pointermove", move);
        root.removeEventListener("pointerleave", leave);
        removeEventListener("blur", leave);
    };
}
