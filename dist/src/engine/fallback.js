// The plain fallback, for a browser without WebGL2 or a context the browser took back. The canvas goes, the
// canvas's parent shows the ground token, and the page's own HTML text shows in the ink token. The hook stays,
// so checks can still read the page: it reports `webgl: false` and a still page.
import { installHook } from "./hook.js";
export const lawsOf = (materials, lights) => [
    ...new Set([...materials.flatMap((m) => m.laws), ...lights.flatMap((l) => l.laws)]),
];
const encode = (v) => {
    const c = Math.min(1, Math.max(0, v));
    return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));
};
/** The ground as a CSS colour. Linear sRGB channels, so no conversion is lost on the way. */
const cssColour = (c) => `color(srgb-linear ${c.map((v) => v.toFixed(5)).join(" ")})`;
export function enterFallback(canvas, input) {
    canvas.style.display = "none";
    document.documentElement.dataset.paint = "fallback";
    // The text field shows its own elements again when it is disposed (the engine disposes fields before this on
    // context loss); without WebGL at the start no field ran, so no text was hidden.
    const parent = canvas.parentElement;
    let ground = null;
    const paintGround = () => {
        try {
            ground = input.palette.read().ground;
        }
        catch (e) {
            console.error(e);
            return;
        }
        if (parent)
            parent.style.backgroundColor = cssColour(ground);
    };
    paintGround();
    const unwatch = input.palette.watch(paintGround);
    const hook = installHook({
        setTime() { },
        time: () => 0,
        setPointerPath() { },
        // The fallback draws the flat ground: nothing to tip.
        setTilt() { },
        tilt: () => [0, 0],
        tiltOptions: () => null,
        lights: () => input.lights,
        setLights() { },
        setDetail() { },
        // The fallback draws no fine structure: its dial reads 0.
        detail: () => 0,
        setInk() { },
        // The fallback draws the ground only: no finish, so no grain.
        grain: () => 0,
        setGrain() { },
        // No finish, so no screen.
        screen: () => false,
        setScreen() { },
        paletteChanged: paintGround,
        tokens: () => input.palette.tokens ?? null,
        // What shows where the canvas was: the ground, one pixel of it.
        readCanvas: () => ({ w: 1, h: 1, data: Uint8Array.of(...(ground ?? [0, 0, 0]).map(encode), 255) }),
        sheetGrid: () => ({ height: [], coverage: [], ink: [], slot: [], param: [] }),
        sheetRegion: () => ({ height: [], coverage: [], ink: [], slot: [], param: [] }),
        laws: () => lawsOf(input.materials, input.lights),
        materials: () => input.materials,
        motion: () => "still",
        info: () => ({ frames: 0, dpr: input.dpr, webgl: false, sheetW: 0, sheetH: 0, compiles: 0, settle: 0 }),
    });
    hook.ready = true;
    return {
        dispose() {
            unwatch();
            if (window.__paint === hook)
                delete window.__paint;
        },
    };
}
