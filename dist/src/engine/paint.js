// paint(): wires palette, fields, sheet, shade pass and frame loop to one canvas, and installs the hook.
import { enterFallback, lawsOf } from "./fallback.js";
import { DEFAULT_GRAIN } from "./finish.js";
import { mulberry32 } from "./glsl/noise.js";
import { installHook } from "./hook.js";
import { STEP, createLoop } from "./loop.js";
import { MIN_CELL } from "./fields/halftone.js";
import { rampAt, rampColours } from "./palette.js";
import { checkTilt, createPointer, createTilt, listenPointer, listenTilt, tiltTurn, viewportToCanvas } from "./pointer.js";
import { assertOneShadow, createShade } from "./shade.js";
import { createSheet } from "./sheet.js";
export const MAX_DPR = 1.5;
/**
 * The test seam's planted faults. Each switches off exactly the one behaviour it names, so a check can be
 * shown to fail: `nofinish` the finish (grain, shoulder, dither), `nopalette` following the page's tokens,
 * `runs-hidden` the pause while hidden, `dpr3` the pixel-ratio cap, `nofallback` the fallback, and
 * `ignores-reduced` the stop under reduced motion, `detail-dead` the detail dial (fields and shade keep the
 * detail the page's code declares; `?detail=` and `setDetail` reach nothing), and `spec-fixed-light` the key's
 * highlight following the key (its specular lobe uses the key's declared direction, test position 0, not its
 * moved one; its diffuse light still moves); `stale-picture` switches off the fields' palette hook (a palette change only
 * re-shades: the halftone's function source is not called again, so its picture keeps the old tokens' tone);
 * `stateless-settle-ignored` reads settle times from stateful fields only, so a stateless timeline field's settle
 * time is dropped and reduced motion rests on its first live frame; `settle-tick-off` puts the settle time one tick
 * early, reported and rested on alike (an engine whose settle drifts while agreeing with itself);
 * `static-caustics` makes `lights.throughWater` draw a caustic baked once: read at t = 0 and laid at each pixel's own
 * point, not at the floor point seen through the water (an overlay), while the surface, its refraction of the
 * floor and its glints still move; `layer-at-floor` reads the water field's lifted layer at the floor's full depth,
 * not its own (the floor less its rise), so its outline ripples as the floor would ripple it; `picture-on-active-unit` uploads a material's picture on the active texture
 * unit (the sheet's) instead of its own, so the first draw after a new material object reads the picture as the
 * sheet and every later draw is right (the frame a reduced-motion user rests on is wrong); `rest-ignored` makes every
 * reader of the rest image (carried fields, the materials' texture) read the screen position while rest writers
 * still write, so a moved surface slides under a texture pinned to the screen; `rest-ignored-<material>` (paper,
 * matte, denim, sheen) does that for the one material's texture only (it reads `s.q` for `s.rest`), while the
 * carried fields and every other material still read the rest position; `detail-tone-shift` restores the matte and
 * paper materials' old dial-driven colour variation, which was not zero-mean (matte mixed toward ramp stop 1 by
 * `detail * 0.1 * v` with v in 0..1, paper by `detail * (0.05 + 0.04 * f0)`), so raising the dial moved the page's mean
 * tone as well as its fine structure (Phase 2 Task 2c); `tone-read-once` resolves the materials against the ramp
 * (their `resolve`: the engine materials' `tone`) once, when they are first drawn, and never again when the ramp
 * rebuilds, so after a palette change every material keeps the colour its tone had under the old tokens while the
 * lights, the ink and the bare ground follow the new ones (Phase 2 Task 6). The shadow faults (Phase 2 Task 7), each on
 * the light that casts: `shadow-baked` casts the shadow from the light's declared place (its test position 0) and
 * holds it there, as a shadow painted into the colour would stay, while the light's own shading still moves;
 * `shadow-same-side` runs the shadow march away from the light (the offset's sign flipped), so the shadow falls on
 * the light's side; `shadow-spec-only` lets the shadow attenuate only the light's highlight, not its diffuse light;
 * `shadow-reads-ink` makes the march read the sheet's ink channel as height, so printed text casts a shadow;
 * `shadow-ground-leak` darkens the bare ground (coverage 0) by the shadow with `shadow.ground` off, so a card on
 * the bare ground casts a shadow the page never asked for.
 * `halftone-lit-fixed` (Phase 2 Task 8) sizes the halftone screen's dots (`finish.halftone`) from the colour before
 * light (the unlit albedo on its ground) while they still print the lit colour, so the dots keep their size whatever
 * the light does: a screen before light dressed as one after it.
 * The tilt faults (Phase 2 Task 11; Task 16): `tilt-surface-fixed` keeps the shade pass's surface unturned (its tilt
 * the identity) on a page that tilts, while `tilt()` still reports the tilt, so the surface never looks turned;
 * `tilt-leave-snaps` puts the tilt at rest the moment the pointer leaves the canvas, instead of easing it there.
 * The iridescence faults (Phase 2 Task 14), each in the foil's grating (glsl/grating.ts, materials/foil.ts):
 * `iridescence-clock` cycles each band's wavelength on the paint clock, a Polychrome-style hue cycle on time;
 * `iridescence-pointer-x` replaces the grating's colour with a rainbow keyed to the engine pointer's x and the pixel's
 * place across the canvas, with no light direction, view or groove in it; `iridescence-no-groove` runs every groove up
 * the sheet whatever the direction image says, so the foil's colour ignores the groove direction;
 * `iridescence-white` flattens each grating band to its own luminance with the same lobe: a groove-aware white
 * highlight, as a metal brushed along the grooves gives, with no colour from the grating; `iridescence-flat-normal`
 * takes the grooves' frame (and so the grating's u) from the flat sheet, ignoring the surface normal;
 * `iridescence-place-hue` adds to each band's centre wavelength an offset that ramps with the pixel's x across the
 * canvas (glsl/grating.ts PLACE_HUE_SLOPE), so foil of one groove and u shows another colour at another place.
 * The film faults (Phase 2 Task 18), in the film's lobe (glsl/film.ts) and its material (materials/film.ts):
 * `film-place-hue` adds to the OPD an offset that ramps with the pixel's x (glsl/film.ts `filmPlaceHueSlope`);
 * `film-clock` cycles the OPD on the paint clock, 120 nm a second; `film-no-thickness` sets the thickness to the range's
 * middle and ignores `param`; `film-no-angle` takes no angle, so the colour comes from `param` alone;
 * `film-view-normal` reads n.v in place of v.h.
 */
export const TEST_FAULTS = ["nofinish", "nopalette", "runs-hidden", "dpr3", "nofallback", "ignores-reduced", "detail-dead", "spec-fixed-light", "stale-picture", "stateless-settle-ignored", "settle-tick-off", "static-caustics", "layer-at-floor", "picture-on-active-unit", "rest-ignored", "rest-ignored-paper", "rest-ignored-matte", "rest-ignored-denim", "rest-ignored-sheen", "detail-tone-shift", "tone-read-once", "shadow-baked", "shadow-same-side", "shadow-spec-only", "shadow-reads-ink", "shadow-ground-leak", "halftone-lit-fixed", "tilt-surface-fixed", "tilt-leave-snaps", "iridescence-clock", "iridescence-pointer-x", "iridescence-no-groove", "iridescence-white", "iridescence-flat-normal", "iridescence-place-hue", "film-place-hue", "film-clock", "film-no-thickness", "film-no-angle", "film-view-normal"];
/** The test faults the shade source switches on with a `#define` (read by the lights' and materials' GLSL). */
const FAULT_DEFINES = {
    "static-caustics": "#define PK_FAULT_STATIC_CAUSTICS\n",
    "layer-at-floor": "#define PK_FAULT_LAYER_AT_FLOOR\n",
    "detail-tone-shift": "#define PK_FAULT_DETAIL_TONE_SHIFT\n",
    "shadow-same-side": "#define PK_FAULT_SHADOW_SAME_SIDE\n",
    "shadow-spec-only": "#define PK_FAULT_SHADOW_SPEC_ONLY\n",
    "shadow-reads-ink": "#define PK_FAULT_SHADOW_READS_INK\n",
    "shadow-ground-leak": "#define PK_FAULT_SHADOW_GROUND_LEAK\n",
    "halftone-lit-fixed": "#define PK_FAULT_HALFTONE_LIT_FIXED\n",
    "iridescence-clock": "#define PK_FAULT_IRIDESCENCE_CLOCK\n",
    "iridescence-pointer-x": "#define PK_FAULT_IRIDESCENCE_POINTER_X\n",
    "iridescence-no-groove": "#define PK_FAULT_IRIDESCENCE_NO_GROOVE\n",
    "iridescence-white": "#define PK_FAULT_IRIDESCENCE_WHITE\n",
    "iridescence-flat-normal": "#define PK_FAULT_IRIDESCENCE_FLAT_NORMAL\n",
    "iridescence-place-hue": "#define PK_FAULT_IRIDESCENCE_PLACE_HUE\n",
    "film-place-hue": "#define PK_FAULT_FILM_PLACE_HUE\n",
    "film-clock": "#define PK_FAULT_FILM_CLOCK\n",
    "film-no-thickness": "#define PK_FAULT_FILM_NO_THICKNESS\n",
    "film-no-angle": "#define PK_FAULT_FILM_NO_ANGLE\n",
    "film-view-normal": "#define PK_FAULT_FILM_VIEW_NORMAL\n",
};
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const urlNumber = (q, k) => {
    const v = q.get(k);
    const n = v === null || v.trim() === "" ? NaN : Number(v);
    return Number.isFinite(n) ? n : undefined;
};
/** The screen's per-slot weights for the shade pass: 1 for each listed slot, 0 for the rest; every slot when unset. */
const slotWeights = (slots) => [0, 1, 2, 3].map((i) => (slots === undefined || slots.includes(i) ? 1 : 0));
/** Throws on options no frame could draw, before anything starts. */
function check(o) {
    const n = o.materials?.length ?? 0;
    if (n < 1 || n > 4)
        throw new RangeError(`paint-kit: paint takes 1 to 4 materials, got ${n}`);
    assertOneShadow(o.lights ?? []);
    const ht = o.finish?.halftone;
    if (ht) {
        for (const k of ["cell", "angle", "ground"])
            if (!Number.isFinite(ht[k]))
                throw new RangeError(`paint-kit: finish.halftone.${k} must be a number, got ${ht[k]}`);
        if (ht.slots !== undefined) {
            if (!Array.isArray(ht.slots) || ht.slots.length === 0)
                throw new RangeError("paint-kit: finish.halftone.slots must list at least one slot, or be left out for every slot");
            for (const s of ht.slots)
                if (!Number.isInteger(s) || s < 0 || s >= n)
                    throw new RangeError(`paint-kit: finish.halftone.slots: ${s} is not a material slot (0 to ${n - 1})`);
        }
    }
}
/** `ease`: the pointer ease in force (paint's `pointer.ease`, fixed at start), which a tilt driven by the pointer needs. */
function resolve(o, url, ease) {
    check(o);
    return {
        seed: (url && urlNumber(url, "seed")) ?? o.seed,
        detail: clamp01((url && urlNumber(url, "detail")) ?? o.detail ?? 0.5),
        palette: o.palette,
        fields: o.fields,
        materials: o.materials,
        lights: o.lights,
        grain: o.finish?.grain ?? DEFAULT_GRAIN,
        halftone: o.finish?.halftone ?? null,
        sheetScale: o.sheetScale ?? 1,
        tilt: checkTilt(o.tilt, ease),
    };
}
function settings(url) {
    const fault = globalThis.__PAINT_TEST_FAULT;
    return {
        startT: urlNumber(url, "t") ?? null,
        noFloat: url.get("nofloat") === "1",
        fault: TEST_FAULTS.find((f) => f === fault) ?? "",
    };
}
/** `stateful` unset: fields that grow or move points keep state. */
const stateful = (r) => r.rt.stateful ?? (r.field.kind === "grown" || r.field.kind === "points");
/** Calls `onChange` when `devicePixelRatio` changes (zoom, a move to another screen). Returns the unsubscribe. */
function watchPixelRatio(onChange) {
    let mq = null;
    const arm = () => {
        mq?.removeEventListener("change", fire);
        mq = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
        mq.addEventListener("change", fire);
    };
    function fire() {
        arm();
        onChange();
    }
    arm();
    return () => mq?.removeEventListener("change", fire);
}
export function paint(canvas, opts) {
    const url = new URLSearchParams(location.search);
    const env = settings(url);
    let o = resolve(opts, url, opts.pointer?.ease);
    // The detail-dead fault: the dial is wired to nothing, so the page's declared detail stays.
    const declaredDetail = clamp01(opts.detail ?? 0.5);
    const dial = () => {
        if (env.fault === "detail-dead")
            o.detail = declaredDetail;
    };
    dial();
    const maxDpr = env.fault === "dpr3" ? Infinity : MAX_DPR;
    const followsPalette = env.fault !== "nopalette";
    const fallbackOn = env.fault !== "nofallback";
    const fallbackInput = () => ({ palette: o.palette, materials: o.materials, lights: o.lights, dpr: Math.min(window.devicePixelRatio || 1, maxDpr) });
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false, premultipliedAlpha: false });
    if (!gl) {
        if (!fallbackOn)
            throw new Error("paint-kit: WebGL2 is not available");
        const fb = enterFallback(canvas, fallbackInput());
        return { set() { }, dispose: () => fb.dispose(), maxTextureSize: 0 };
    }
    const float = !env.noFloat && gl.getExtension("EXT_color_buffer_float") !== null;
    if (!float) {
        // The page's one warning for the whole no-float path: fields read `ctx.float` and stay silent. It names grown
        // fields only on a page that runs one (at start).
        const grown = o.fields.some((f) => f.kind === "grown") ? " and grown fields draw nothing" : "";
        console.warn(`paint-kit: float render targets (EXT_color_buffer_float) are off, so the sheet is RGBA8${grown ? "," : " and"} relief is coarser${grown}.`);
    }
    const measure = () => {
        const raw = window.devicePixelRatio || 1;
        const dpr = Math.min(raw, maxDpr);
        const cssW = Math.max(1, canvas.clientWidth);
        const cssH = Math.max(1, canvas.clientHeight);
        return {
            raw,
            dpr,
            cssW,
            cssH,
            w: Math.max(1, Math.round(cssW * dpr)),
            h: Math.max(1, Math.round(cssH * dpr)),
            sw: Math.max(1, Math.round(cssW * dpr * o.sheetScale)),
            sh: Math.max(1, Math.round(cssH * dpr * o.sheetScale)),
        };
    };
    let size = measure();
    const fieldSize = { w: size.sw, h: size.sh, dpr: size.dpr };
    const needsDir = () => o.fields.some((f) => f.writes.includes("direction"));
    const writesRest = (f) => f.writes.includes("rest");
    const readsRest = env.fault !== "rest-ignored";
    const needsParam = () => o.fields.some((f) => f.writes.includes("param"));
    const makeSheet = () => createSheet(gl, size.sw, size.sh, float, needsDir(), o.fields.some(writesRest), readsRest, needsParam());
    const applySize = () => {
        canvas.width = size.w;
        canvas.height = size.h;
        Object.assign(fieldSize, { w: size.sw, h: size.sh, dpr: size.dpr });
    };
    applySize();
    const shade = createShade(gl, float, env.fault !== "nofinish", FAULT_DEFINES[env.fault] ?? "", env.fault === "picture-on-active-unit", env.fault.startsWith("rest-ignored-") ? env.fault.slice("rest-ignored-".length) : "");
    let sheet = makeSheet();
    let ramp = o.palette.read();
    let lightUniforms = [];
    let materialUniforms = [];
    let inkOn = true;
    // The halftone screen drawn (`setScreen`): the detail check reads its shares with the whole finish off.
    let screenShown = true;
    let frames = 0;
    const specFixed = env.fault === "spec-fixed-light";
    const resolveLights = () => (lightUniforms = o.lights.map((l) => (l.resolve ? l.resolve(ramp) : l.uniforms)));
    // The light uniforms as drawn now. The "spec-fixed-light" fault keeps the key's lobe at its declared direction,
    // laid last so a key's own per-draw hooks (`follow`) cannot move it.
    // The "shadow-baked" fault holds the casting light's shadow march (its "ray" uniforms) at its declared place.
    const bakedShadow = env.fault === "shadow-baked";
    const rayOf = (l) => Object.fromEntries(Object.entries(l.uniforms).filter(([k]) => k.startsWith("ray")));
    const drawnLights = () => {
        const us = pointer.uniforms(o.lights, lightUniforms, loop.t);
        if (!specFixed && !bakedShadow)
            return us;
        return us.map((u, i) => {
            const l = o.lights[i];
            let v = u;
            if (specFixed && l.id === "key" && l.testPositions)
                v = { ...v, specDir: l.testPositions(0).dir };
            if (bakedShadow && l.shadow && l.testPositions && l.with)
                v = { ...v, ...rayOf(l.with(l.testPositions(0))) };
            return v;
        });
    };
    resolveLights();
    // The materials' palette uniforms (their tone), resolved against the ramp: at start, and again whenever the ramp
    // rebuilds or the materials change. The "tone-read-once" fault skips the rebuild after a palette change.
    const toneFollows = env.fault !== "tone-read-once";
    const resolveMaterials = () => (materialUniforms = o.materials.map((m) => (m.resolve ? { ...m.uniforms, ...m.resolve(ramp) } : m.uniforms)));
    resolveMaterials();
    // The engine-owned pointer, stepped on the clock's ticks (pointer.ts).
    const pointer = createPointer(opts.pointer);
    const unlistenPointer = listenPointer(canvas, pointer);
    // The tilt's own eased pointer, with the pointer's ease (pointer.ts `createTilt`). It runs on every page, so a
    // `set({ tilt })` finds it in step; only a page with a `tilt` option draws it.
    const tilt = createTilt(opts.pointer?.ease, env.fault === "tilt-leave-snaps");
    const unlistenTilt = listenTilt(canvas, tilt);
    const tiltNow = () => (o.tilt ? tilt.at(o.tilt) : [0, 0]);
    const surfaceFixed = env.fault === "tilt-surface-fixed";
    // The "iridescence-pointer-x" fault keys the foil's colour to the eased pointer's x (glsl/grating.ts).
    const pointerFault = env.fault === "iridescence-pointer-x";
    // A field's own redraw request (text reflowed): one refresh per task, none once disposed.
    let invalidQueued = false;
    let disposed = false;
    const invalidate = () => {
        if (invalidQueued || disposed)
            return;
        invalidQueued = true;
        queueMicrotask(() => {
            invalidQueued = false;
            if (!disposed && !fallback)
                loop.refresh();
        });
    };
    // A field's settle time changed (a waiting burn started): under reduced motion, rest on the new settle frame, as after
    // a re-init through `set`; otherwise redraw, as `invalidate`. One per task, none once disposed.
    let resettleQueued = false;
    const resettle = () => {
        if (resettleQueued || disposed)
            return;
        resettleQueued = true;
        queueMicrotask(() => {
            resettleQueued = false;
            if (disposed || fallback)
                return;
            if (!settleIfReduced(true))
                loop.refresh();
        });
    };
    const initField = (field, i) => {
        const ctx = { seed: o.seed, rand: mulberry32(o.seed + Math.imul(i + 1, 0x9e3779b9)), detail: o.detail, size: fieldSize, float, invalidate, resettle, colours: () => rampColours(ramp) };
        const rt = field.init(gl, ctx);
        if (writesRest(field) && !rt.drawRest)
            throw new Error(`paint-kit: a ${field.kind} field writes "rest" but has no drawRest`);
        return { field, ctx, rt };
    };
    let runs = o.fields.map(initField);
    const disposeRuns = () => runs.forEach((r) => r.rt.dispose());
    // Ink shown by source (`setInk(on, source)`): a hidden source's ink is not committed to the sheet.
    const inkShown = { text: true, picture: true };
    const inkSourceOf = (f) => (f.kind === "ink" ? "text" : "picture");
    // Every rest pass draws first (in list order), so every field can be carried by the rest image they leave. Then
    // every field's other passes draw and commit in list order, so slot and direction (last writer wins) keep the
    // list's precedence. A field that writes only "rest" has nothing to commit.
    const restOnly = (f) => f.writes.every((c) => c === "rest");
    const drawFields = (t, dt, only) => {
        sheet.begin();
        for (const r of runs)
            if (writesRest(r.field) && (!only || only(r)))
                r.rt.drawRest(sheet, t, dt);
        for (const r of runs) {
            if ((only && !only(r)) || restOnly(r.field))
                continue;
            sheet.clearOut();
            r.rt.draw(sheet, t, dt);
            sheet.commit(inkShown[inkSourceOf(r.field)] ? r.field.writes : r.field.writes.filter((c) => c !== "ink"));
        }
    };
    const shadeNow = () => shade.draw({
        sheet,
        width: size.w,
        height: size.h,
        ramp,
        materials: o.materials,
        materialUniforms,
        lights: o.lights,
        lightUniforms: drawnLights(),
        fields: o.fields,
        time: loop.t,
        detail: o.detail,
        seed: o.seed,
        grain: o.grain,
        // The screen's cell in buffer px (a cell under MIN_CELL CSS px draws as MIN_CELL, as fields.halftone's), its
        // ground read off the ramp now, so it follows a palette change like every other colour.
        screen: o.halftone && screenShown
            ? { cell: Math.max(MIN_CELL, o.halftone.cell) * size.dpr, angle: (o.halftone.angle * Math.PI) / 180, ground: rampAt(ramp, o.halftone.ground), slots: slotWeights(o.halftone.slots) }
            : null,
        inkOn,
        tilt: o.tilt ? tiltTurn(surfaceFixed ? [0, 0] : tiltNow()) : null,
        ...(pointerFault ? { faultPointer: pointer.at() } : {}),
    });
    // Reduced motion: after a live frame, rest once every field has settled (a field without `settled` after one frame).
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    // Read once here, then kept by the change event. Reading `reduced.matches` again (each live frame) updates the
    // list's cached value, and on a page with any stylesheet media query (a `prefers-color-scheme` block is enough)
    // Chromium then sends no change event for it, so a switch on mid-run went unseen.
    let reducedOn = reduced.matches;
    const restsWhenReduced = env.fault !== "ignores-reduced";
    const frame = (t, dt) => {
        // Pixel-ratio changes that come with no event (devtools emulation) are caught by the next live frame.
        if ((window.devicePixelRatio || 1) !== size.raw)
            resize(false);
        pointer.advance(t, dt);
        tilt.advance(t, dt);
        drawFields(t, dt);
        shadeNow();
        frames++;
    };
    const loop = createLoop({
        rest: () => restsWhenReduced && reducedOn && runs.every((r) => r.rt.settled?.() ?? true),
        frame,
        replay(t) {
            // Fields that keep state start again from their seed and step in fixed 1/60 s ticks up to t.
            // A page with no stateful field steps no ticks: each of its frames depends on t alone, so one draw at t is it.
            pointer.replay(t);
            tilt.replay(t);
            runs = runs.map((r, i) => (stateful(r) ? (r.rt.dispose(), initField(r.field, i)) : r));
            const n = Math.round(t / STEP);
            if (runs.some(stateful))
                for (let k = 1; k < n; k++)
                    drawFields(k * STEP, STEP, stateful);
            drawFields(t, n > 0 ? STEP : 0);
            shadeNow();
            frames++;
        },
        forward(from, t) {
            // The ticks `replay(t)` would run after those `replay(from)` ran: every frozen change of field state (detail,
            // size, palette hooks, `set`) refreshes through `replay`, so the fields are at `from`'s tick.
            pointer.replay(t);
            tilt.replay(t);
            const n = Math.round(t / STEP);
            if (runs.some(stateful))
                for (let k = Math.round(from / STEP) + 1; k < n; k++)
                    drawFields(k * STEP, STEP, stateful);
            drawFields(t, n > 0 ? STEP : 0);
            shadeNow();
            frames++;
        },
        redraw() {
            shadeNow();
            frames++;
        },
        onError: (e) => console.error(e),
    }, { pauseHidden: env.fault !== "runs-hidden" });
    /**
     * The page's settle time: the largest `settleTicks` of the fields it runs now, in seconds. Stateless fields count
     * too: a timeline field (a frame from t alone) declares where its picture holds.
     */
    const countsSettle = (r) => env.fault !== "stateless-settle-ignored" || stateful(r);
    const tickOff = env.fault === "settle-tick-off" ? 1 : 0;
    const settleTime = () => Math.max(0, Math.max(0, ...runs.map((r) => (countsSettle(r) ? (r.rt.settleTicks ?? 0) : 0))) - tickOff) * STEP;
    /**
     * Reduced motion with a settle time: rest on the frame `setTime` gives there. Stateful fields replay to it once;
     * stateless ones draw once at it, stepping no ticks. `fresh` false (reduced motion switched on mid-run) on a page
     * with a stateful field: a clock already at or past the settle time stops where it is, because live ticks run in
     * fixed steps and the live frame already is `setTime(t)`'s; a replay from tick 0 would cost every tick up to now
     * in one task. A page with no stateful field settles at the settle time even then: one draw, and its frame there
     * is the held one (a timeline field may have moved on past it). `fresh` true (start, or a re-init through `set`):
     * the fields are at tick 0, so they settle at the settle time. A frozen clock stays where it is; pages with no
     * settle time keep the live path, which rests after one frame.
     */
    const settleIfReduced = (fresh) => {
        const at = settleTime();
        if (!restsWhenReduced || !reducedOn || loop.frozen || at <= 0)
            return false;
        if (!fresh && loop.t >= at && runs.some(stateful))
            loop.stop();
        else
            loop.settle(at);
        return true;
    };
    // Motion allowed again: go on from where the clock rested (a frozen clock stays frozen). Reduced motion switched
    // on: settle at once, as paint() does at start.
    const onReducedChange = () => {
        reducedOn = reduced.matches;
        if (!reducedOn)
            loop.start();
        else
            settleIfReduced(false);
    };
    reduced.addEventListener("change", onReducedChange);
    /**
     * After a new palette is read: fields that build from the palette (the halftone's function source) build again.
     * True when any did, so the sheet must be drawn again, not only re-shaded.
     */
    const callsPaletteHooks = env.fault !== "stale-picture";
    const paletteFields = () => {
        const hooked = callsPaletteHooks ? runs.filter((r) => r.rt.palette) : [];
        for (const r of hooked)
            r.rt.palette();
        return hooked.length > 0;
    };
    const onPalette = () => {
        if (!followsPalette)
            return;
        try {
            ramp = o.palette.read();
        }
        catch (e) {
            console.error(e);
            return;
        }
        resolveLights();
        if (toneFollows)
            resolveMaterials();
        if (paletteFields())
            loop.refresh();
        else
            loop.redraw();
    };
    let unwatch = followsPalette ? o.palette.watch(onPalette) : () => { };
    /** Re-measures; on a new size, makes a new sheet and (unless `draw` is false) draws it. */
    function resize(draw = true) {
        const next = measure();
        size.raw = next.raw;
        if (next.w === size.w && next.h === size.h && next.sw === size.sw && next.sh === size.sh)
            return;
        size = next;
        applySize();
        sheet.dispose();
        sheet = makeSheet();
        for (const r of runs)
            r.rt.resize(size.sw, size.sh);
        if (draw)
            loop.refresh();
    }
    const ro = new ResizeObserver(() => resize());
    ro.observe(canvas);
    // A pixel-ratio change alone leaves the CSS box as it was, so the ResizeObserver does not fire.
    const unwatchDpr = watchPixelRatio(() => resize());
    // After context loss the painter is the fallback's: GL calls would only fail.
    let fallback = null;
    const stopAll = () => {
        disposed = true;
        loop.dispose();
        reduced.removeEventListener("change", onReducedChange);
        ro.disconnect();
        unwatchDpr();
        unlistenPointer();
        unlistenTilt();
        unwatch();
        canvas.removeEventListener("webglcontextlost", onLost);
    };
    function onLost() {
        stopAll();
        // Fields give back what they changed outside the canvas (the text field's hidden HTML text). Their GL deletes
        // on a lost context do nothing.
        disposeRuns();
        fallback = enterFallback(canvas, fallbackInput());
    }
    if (fallbackOn)
        canvas.addEventListener("webglcontextlost", onLost);
    // Read once, while the context is live: the limit is the context's and does not change (a lost context reads null).
    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const painter = {
        maxTextureSize,
        set(p) {
            if (fallback)
                return;
            const prev = o;
            // `finish` merges into the one in force: a set that names only the grain (setGrain) keeps the screen.
            o = resolve({ ...prev, ...p, finish: { grain: prev.grain, halftone: prev.halftone, ...p.finish } }, undefined, opts.pointer?.ease);
            dial();
            const paletteNew = followsPalette && p.palette !== undefined && p.palette !== prev.palette;
            if (paletteNew) {
                unwatch();
                unwatch = o.palette.watch(onPalette);
                ramp = o.palette.read();
            }
            resolveLights();
            // New materials resolve against the ramp as it is; a new palette re-resolves the kept ones (not under the fault).
            if (p.materials !== undefined || (paletteNew && toneFollows))
                resolveMaterials();
            const sheetStale = p.fields !== undefined || (p.seed !== undefined && p.seed !== prev.seed);
            // Fields made again below build from the new palette at init; fields kept build from it here.
            const rebuilt = !sheetStale && paletteNew && paletteFields();
            if (sheetStale) {
                disposeRuns();
                sheet.dispose();
                sheet = makeSheet();
                runs = o.fields.map(initField);
            }
            if (p.detail !== undefined)
                for (const r of runs)
                    r.ctx.detail = o.detail;
            if (p.sheetScale !== undefined && p.sheetScale !== prev.sheetScale)
                resize();
            // A re-init starts the fields again from tick 0: under reduced motion, settle them again (the settle time
            // comes from the new fields).
            if (sheetStale && settleIfReduced(true))
                return;
            if (sheetStale || rebuilt || p.detail !== undefined)
                loop.refresh();
            else
                loop.redraw();
        },
        dispose() {
            if (fallback)
                return fallback.dispose();
            stopAll();
            disposeRuns();
            sheet.dispose();
            shade.dispose();
            if (window.__paint === hook)
                delete window.__paint;
        },
    };
    const hideInk = (s) => (inkOn ? s : { ...s, ink: s.ink.map(() => 0) });
    const engine = {
        setTime: (t) => loop.freeze(t),
        time: () => loop.t,
        setPointerPath(path) {
            const canvasPath = path ? viewportToCanvas(path, canvas) : null;
            pointer.setPath(canvasPath);
            tilt.setPath(canvasPath);
            if (loop.frozen)
                loop.refresh();
        },
        setTilt(deg) {
            if (!o.tilt)
                throw new Error("__paint.setTilt: this page has no tilt option (PaintOptions.tilt)");
            if (deg !== null && !(Array.isArray(deg) && deg.length === 2 && deg.every((v) => Number.isFinite(v) && Math.abs(v) <= 89)))
                throw new RangeError(`__paint.setTilt: a tilt is [degrees, degrees], each from -89 to 89, or null; got ${JSON.stringify(deg)}`);
            tilt.hold(deg);
            loop.redraw();
        },
        tilt: tiltNow,
        tiltOptions: () => o.tilt,
        lights: () => o.lights,
        setLights: (lights) => painter.set({ lights }),
        setDetail: (detail) => painter.set({ detail }),
        detail: () => o.detail,
        setInk(on, source) {
            if (source === undefined)
                inkOn = on;
            else {
                inkShown[source] = on;
                // The fields again at the current time, stepping nothing (dt 0), so the sheet holds only the ink shown.
                if (!fallback && !disposed)
                    drawFields(loop.t, 0);
            }
            loop.redraw();
        },
        // The nofinish fault draws no finish, so no grain, whatever the page declares.
        grain: () => (env.fault === "nofinish" ? 0 : o.grain),
        setGrain: (grain) => painter.set({ finish: { grain } }),
        screen: () => o.halftone !== null && screenShown,
        setScreen(on) {
            screenShown = on;
            loop.redraw();
        },
        paletteChanged: onPalette,
        tokens: () => o.palette.tokens ?? null,
        readCanvas() {
            // The drawing buffer is not preserved, so draw and read in the same task.
            shadeNow();
            const data = new Uint8Array(size.w * size.h * 4);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.readPixels(0, 0, size.w, size.h, gl.RGBA, gl.UNSIGNED_BYTE, data);
            return { w: size.w, h: size.h, data };
        },
        // While the ink is hidden the hook reads it as 0, as the shade pass sees it.
        sheetGrid: (n) => hideInk(sheet.readGrid(n)),
        sheetRegion(x, y, w, h) {
            const sx = size.sw / size.cssW;
            const sy = size.sh / size.cssH;
            return hideInk(sheet.readRegion(x * sx, y * sy, w * sx, h * sy));
        },
        laws: () => lawsOf(o.materials, o.lights),
        materials: () => o.materials,
        motion: () => loop.motion(),
        info: () => ({ frames, dpr: size.dpr, webgl: true, sheetW: size.sw, sheetH: size.sh, compiles: shade.compiles(), settle: settleTime() }),
    };
    const hook = installHook(engine);
    // The first frame fails the same way on both paths: paint() takes itself down and throws, so the page gets
    // one error and no loop that would log it again every frame.
    // Reduced motion with fields that grow to a settle time rests on that frame (settleIfReduced).
    let settled = false;
    try {
        if (env.startT !== null)
            loop.freeze(env.startT);
        else if (!(settled = settleIfReduced(true)))
            frame(0, 0);
    }
    catch (e) {
        painter.dispose();
        throw e;
    }
    if (env.startT === null && !settled)
        loop.start();
    hook.ready = true;
    return painter;
}
