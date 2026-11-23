// `burn`: a front that eats the sheet. It starts at the bottom edge or at a point, moves at `speed` short-side units
// per second, and is ragged by a seeded noise (`rag`). Where the front has passed, the field writes `param` = time
// since it passed over `scorch` seconds (0 at the front, 1 `scorch` seconds later), which `materials.paper({ scorch })`
// reads to darken the paper; where param reaches 1 the paper is gone (coverage 0) and the page's ground shows. So the
// order from the unburned paper is: front, scorch band, hole. Paper ahead of the front is untouched.
//
// Arrival: each point has an arrival distance A(q), its distance from the start (the bottom edge, or the start point)
// plus the rag noise. The front stands at distance D(t), and a point has burned when D(t) - A(q) is at least the band
// `speed x scorch`. A(q) is a formula, so the shade pass evaluates it too (`Field.shade`): `lights.ember` reads the
// same front.
//
// Time: the front moves in fixed 1/60 s ticks from its start, D(t) = speed x (ticks since the start) x 1/60, so it
// only ever advances, a live page and `setTime(t)` reach the same front at the same t on any machine, and a resize
// keeps it (the front is a function of the tick count, not of the sheet: nothing to rebuild). It keeps no simulation
// state, so the engine does not replay it (`stateful` false) and a frozen page draws it once. It declares
// `settleTicks`, the tick at which the whole sheet has burned, once it has started.
//
// Start: `startAt` is the paint time in seconds the burn starts at. `null` waits: the card stays whole until the
// page calls `start()` (the burn then starts at the paint time of the latest frame) or sets a new field with a
// number through `Painter.set({ fields })`. A second `start()` on a started burn is ignored. The start time is kept
// on the field, so `setTime` and a re-init give the same burn. `start()` asks the engine to re-settle
// (`FieldContext.resettle`): under reduced motion the page then rests on the end state at once.
//
// Tear: `tear` adds wide slow layers and fine ridged layers to the arrival distance, so the front starts in spots, races
// and stalls, opens holes ahead of itself, leaves islands behind, and has a jagged edge. The arrival map never changes
// over time, so a torn front still only advances. At `tear` 0 the arrival is the rag's alone.
//
// Linger: `linger` is how far the front travels after a point's paper is gone while the embers there still glow
// (`lights.ember`'s specks). The settle time includes it, so a page rests only after the last ember is out.
//
// One burn field per page: the shade chunk's names (`pkBurn*`) are shared.
import { STEP } from "../loop.js";
import { shape } from "./shape.js";
/**
 * The rag's largest shift of the front, short-side units, at rag 1. Builder: picked by eye before any check ran. A
 * tenth of the short side reads as a torn, wandering edge on a card; much more lets the noise pull islands ahead of
 * the front (A(q)'s slope across the front stays near 1 at this size and these two wavelengths).
 */
export const RAG_AMP = 0.08;
/** Wavelength of the rag's two layers, as frequencies in cycles per short-side unit. Builder: a slow wander plus tears. */
const RAG_FREQ = [2.5, 7];
/**
 * The tear's wide layers' largest shift at tear 1, short-side units. Set by measurement against the reference
 * (bars/12-burn-card/study.md's clip), whose front spreads 39-57% of the card's width from high to low. On a 0.53 wide card,
 * over seeds 1 to 3 and three times mid-burn, 0.13 spread a mean of 23% and at most 38%, 0.20 a mean of 28%, 0.26 a mean of
 * 37% and at most 59%, and 0.32 no wider (36%, 59%). So 0.26, the smallest that reaches the reference's range.
 */
export const TEAR_WIDE = 0.26;
/** The tear's fine ridged layers: cycles per short-side unit and largest shift. Builder: picked by eye against the reference's jagged edge. */
const TEAR_FINE = [[13, 0.022], [29, 0.011], [61, 0.0055], [127, 0.0028]];
/** The fine layers' largest shift together, short-side units. */
export const TEAR_FINE_AMP = TEAR_FINE.reduce((s, [, a]) => s + a, 0);
/** The front's distance before the start: far behind every point, so nothing burns and the ember lights nothing. */
const WAITING = -1e3;
/**
 * The arrival formula, shared by the field's draw and the shade pass (lights.ember). `q`: short-side units, centred,
 * y up (a shape's `q`, the shade's `s.q`); `res`: the sheet's size.
 */
export const GLSL_BURN = /* glsl */ `
uniform vec3 pkBurnFrom; // not-colour: x 0 the bottom edge, 1 a point; yz the point in page fractions (y down)
uniform float pkBurnRag, pkBurnD, pkBurnBand, pkBurnTear, pkBurnLinger;
vec2 pkBurnOff() { return vec2(hash11(uSeed * 1.37 + 3.1), hash11(uSeed * 2.11 + 8.7)) * 100.0; }
// The arrival without the tear's fine layers: cheap enough to read many times per pixel (the ember's specks).
float pkBurnCoarse(vec2 q, vec2 res) {
  vec2 sc = res / min(res.x, res.y);
  float d = pkBurnFrom.x < 0.5 ? q.y + 0.5 * sc.y : length(q - vec2((pkBurnFrom.y - 0.5) * sc.x, (0.5 - pkBurnFrom.z) * sc.y));
  vec2 off = pkBurnOff();
  float n = 0.65 * snoise(q * ${RAG_FREQ[0].toFixed(2)} + off) + 0.35 * snoise(q * ${RAG_FREQ[1].toFixed(2)} - off);
  float a = d + pkBurnRag * ${RAG_AMP.toFixed(4)} * n;
  if (pkBurnTear <= 0.0) return a;
  // The wide layers, warped so the tongues bend instead of standing in rows.
  vec2 w = q + 0.06 * vec2(snoise(q * 3.1 + off.yx), snoise(q * 3.1 - off.yx + 7.0));
  return a + pkBurnTear * ${TEAR_WIDE.toFixed(4)} * (0.72 * snoise(w * 1.7 + off * 0.37) + 0.28 * snoise(w * 4.6 - off * 0.61));
}
float pkBurnArrival(vec2 q, vec2 res) {
  float a = pkBurnCoarse(q, res);
  if (pkBurnTear <= 0.0) return a;
  vec2 off = pkBurnOff();
  float fine = 0.0;
${TEAR_FINE.map(([f, amp], i) => `  fine += ${amp.toFixed(4)} * (1.0 - 2.0 * abs(snoise(q * ${f.toFixed(1)} + off * ${(0.53 + i * 0.29).toFixed(2)})));`).join("\n")}
  return a + pkBurnTear * fine;
}
`;
const FIELD = /* glsl */ `
// Distance the front has moved past this point, over the band: the param, and gone at 1.
float burnPast(vec2 q) { return (pkBurnD - pkBurnArrival(q, uRes)) / pkBurnBand; }
vec4 field(vec2 uv, vec2 q) {
  // Coverage falls from 1 to 0 over one sheet px at the hole's edge, so the edge does not stair-step.
  float e = (1.0 - burnPast(q)) * pkBurnBand;
  // A torn front's slope varies, so its edge is measured by the arrival's own change per sheet px.
  float px = pkBurnTear > 0.0 ? e / max(fwidth(e), 1e-6) : e * min(uRes.x, uRes.y);
  return vec4(0.0, clamp(px + 0.5, 0.0, 1.0), 0.0, -1.0);
}
float fieldParam(vec2 uv, vec2 q) { return clamp(burnPast(q), 0.0, 1.0); }
`;
const bad = (what, v) => {
    throw new RangeError(`paint-kit: burn ${what}, got ${String(v)}`);
};
export function burn(opts) {
    const { from, speed, rag, scorch } = opts;
    if (from !== "bottom" && !(Array.isArray(from) && from.length === 2 && from.every(Number.isFinite)))
        bad('from is "bottom" or [x, y]', JSON.stringify(from));
    if (!(Number.isFinite(speed) && speed > 0))
        bad("speed is above 0", speed);
    if (!(Number.isFinite(rag) && rag >= 0 && rag <= 1))
        bad("rag is 0..1", rag);
    if (!(Number.isFinite(scorch) && scorch > 0))
        bad("scorch is above 0 seconds", scorch);
    if (opts.startAt !== null && !Number.isFinite(opts.startAt))
        bad("startAt is a time in seconds or null", opts.startAt);
    const tear = opts.tear ?? 0;
    const linger = opts.linger ?? 0;
    if (!(Number.isFinite(tear) && tear >= 0 && tear <= 1))
        bad("tear is 0..1", tear);
    if (!(Number.isFinite(linger) && linger >= 0))
        bad("linger is 0 or above", linger);
    const maxShift = rag * RAG_AMP + tear * (TEAR_WIDE + TEAR_FINE_AMP);
    let startAt = opts.startAt;
    // A negative lead: the front's distance at the start. A positive lead moves the start time back instead.
    let startOffset = 0;
    let lastT = 0;
    let ctx;
    const band = speed * scorch;
    const fromU = from === "bottom" ? [0, 0, 0] : [1, from[0], from[1]];
    // The front at t: whole ticks since the start, so it advances in fixed steps and never moves back.
    const front = (t) => (startAt === null || t < startAt ? WAITING : startOffset + speed * Math.max(0, Math.round(t / STEP) - Math.round(startAt / STEP)) * STEP);
    // Set per draw; the shape reads them at each draw.
    const uniforms = { pkBurnFrom: fromU, pkBurnRag: rag, pkBurnD: WAITING, pkBurnBand: band, pkBurnTear: tear, pkBurnLinger: linger };
    const inner = shape({ writes: ["coverage", "param"], uniforms, glsl: GLSL_BURN + FIELD });
    /** Short-side units from the start to the farthest corner, plus the rag: where the whole sheet has burned. */
    const farthest = () => {
        const s = ctx?.size;
        if (!s || !(s.w > 0 && s.h > 0))
            return 0;
        const sc = [s.w / Math.min(s.w, s.h), s.h / Math.min(s.w, s.h)];
        if (from === "bottom")
            return sc[1] + maxShift;
        const p = [(from[0] - 0.5) * sc[0], (0.5 - from[1]) * sc[1]];
        const corners = [-1, 1].flatMap((x) => [-1, 1].map((y) => Math.hypot((x * sc[0]) / 2 - p[0], (y * sc[1]) / 2 - p[1])));
        return Math.max(...corners) + maxShift;
    };
    const field = {
        kind: "shape",
        writes: ["coverage", "param"],
        get startAt() {
            return startAt;
        },
        band,
        maxShift,
        linger,
        opts,
        front,
        size: () => (ctx ? { w: ctx.size.w, h: ctx.size.h } : null),
        frontNow: () => front(lastT),
        start(lead = 0) {
            if (!Number.isFinite(lead))
                bad("start lead is a finite number", lead);
            if (startAt !== null)
                return; // a started burn ignores a second start
            startOffset = Math.min(0, lead);
            startAt = lastT - Math.max(0, lead) / speed;
            // The settle time is now the end of the burn: under reduced motion the engine rests there (the end state).
            ctx?.resettle();
        },
        shade: {
            glsl: GLSL_BURN,
            uniforms: { pkBurnFrom: fromU, pkBurnRag: rag, pkBurnBand: band, pkBurnTear: tear, pkBurnLinger: linger },
            frame: (t) => ({ pkBurnD: front(t) }),
        },
        init(gl, c) {
            ctx = c;
            const rt = inner.init(gl, c);
            return {
                stateful: false,
                get settleTicks() {
                    return startAt === null ? 0 : Math.round(startAt / STEP) + Math.ceil((farthest() + band + linger - startOffset) / speed / STEP);
                },
                draw(sheet, t, dt) {
                    lastT = t;
                    uniforms.pkBurnD = front(t);
                    rt.draw(sheet, t, dt);
                },
                // The front is a function of the tick count, not of the sheet: a new size keeps the burned state.
                resize: (w, h) => rt.resize(w, h),
                dispose: () => rt.dispose(),
            };
        },
    };
    return field;
}
