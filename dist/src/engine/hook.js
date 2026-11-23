/** The ink source a `setInk` call names, checked: anything but "text" or "picture" throws (checks call the hook by string, so a typo would otherwise be a silent no-op). */
export function checkInkSource(source) {
    if (source === "text" || source === "picture")
        return source;
    throw new Error(`setInk: unknown ink source ${JSON.stringify(source)}; use "text" or "picture"`);
}
export const SHEET_GRID = 64;
const BINS = 1024;
/** Luminance percentiles (Rec. 709 weights on the encoded 0..1 values) from a 1024-bin histogram. */
export function lumaPercentiles(data, ps) {
    const hist = new Uint32Array(BINS);
    const n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
        const l = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
        hist[Math.min(BINS - 1, Math.floor(l * BINS))]++;
    }
    return ps.map((p) => {
        const want = p * n;
        let seen = 0;
        for (let b = 0; b < BINS; b++) {
            seen += hist[b];
            if (seen >= want)
                return (b + 0.5) / BINS;
        }
        return 1;
    });
}
/** A light's props with each per-frame prop (a function of t, as a moving glow's `at`) read at time `t`. */
export function propsNow(props, t) {
    return Object.fromEntries(Object.entries(props).map(([k, v]) => [k, typeof v === "function" ? v(t) : v]));
}
function withProps(l, props) {
    const next = { ...l.props, ...props };
    return l.with ? l.with(next) : { ...l, props: next };
}
/** Installs `window.__paint` for this engine (the latest painter on a page owns it). `ready` starts false. */
export function installHook(e) {
    const lightAt = (i) => {
        const l = e.lights()[i];
        if (!l)
            throw new RangeError(`__paint: no light at index ${i}`);
        return l;
    };
    const replaceLight = (i, l) => {
        const ls = e.lights().slice();
        ls[i] = l;
        e.setLights(ls);
    };
    const hook = {
        ready: false,
        setTime: (t) => e.setTime(t),
        setPointerPath: (path) => e.setPointerPath(path),
        setTilt: (deg) => e.setTilt(deg),
        tilt: () => {
            const [a, b] = e.tilt();
            return [a, b];
        },
        tiltOptions: () => {
            const t = e.tiltOptions();
            return t ? { max: t.max, drive: t.drive } : null;
        },
        setLight: (i, props) => replaceLight(i, withProps(lightAt(i), props)),
        moveLight(i, step) {
            const l = lightAt(i);
            if (!l.testPositions)
                throw new Error(`__paint.moveLight: light ${i} (${l.id}) declares no test positions`);
            replaceLight(i, withProps(l, l.testPositions(step)));
        },
        setPalette(tokens) {
            for (const [k, v] of Object.entries(tokens))
                document.documentElement.style.setProperty(k, v);
            e.paletteChanged();
        },
        tokens() {
            const t = e.tokens();
            return t ? { ground: t.ground, ink: t.ink, accents: [...t.accents] } : null;
        },
        setDetail: (d) => e.setDetail(d),
        detail: () => e.detail(),
        setInk: (on, source) => e.setInk(on, source === undefined ? undefined : checkInkSource(source)),
        grain: () => e.grain(),
        setGrain: (g) => e.setGrain(g),
        screen: () => e.screen(),
        setScreen: (on) => e.setScreen(on === true),
        stats() {
            const { data } = e.readCanvas();
            const [p5, p50, p95, p99] = lumaPercentiles(data, [0.05, 0.5, 0.95, 0.99]);
            return { p5, p50, p95, p99, ...e.info() };
        },
        sheet: () => ({ w: SHEET_GRID, h: SHEET_GRID, ...e.sheetGrid(SHEET_GRID) }),
        sheetRegion: (x, y, w, h) => e.sheetRegion(x, y, w, h),
        laws: () => e.laws(),
        lights: () => e.lights().map((l) => {
            const region = l.region?.(e.time());
            return { id: l.id, laws: [...l.laws], props: structuredClone(propsNow(l.props, e.time())), ...(region ? { region: { at: [region.at[0], region.at[1]], radius: region.radius } } : {}) };
        }),
        materials: () => e.materials().map((m) => ({ id: m.id, laws: [...m.laws], ...(m.film ? { film: { range: [m.film.range[0], m.film.range[1]], ior: m.film.ior, base: m.film.base } } : {}) })),
        motion: () => e.motion(),
    };
    window.__paint = hook;
    return hook;
}
