import type { PaletteSource, Ramp } from "./palette.ts";
import type { PointerOptions } from "./pointer.ts";
import type { Sheet } from "./sheet.ts";
export type Law = "relief" | "falloff" | "highlight" | "tint" | "caustic" | "transmit" | "shadow" | "iridescence" | "burn";
export type Uniforms = Record<string, number | number[]>;
/**
 * What a field writes. "rest" is the rest image: per pixel, where that point of the surface sat on the flat sheet
 * (see sheet.ts). A field that writes it is drawn before every other field, at the screen position; fields that
 * are carried (fields.sheet, fields.twill, fields.text, a shape with `carried: true`) and every material's texture
 * then read the rest position, so texture moves with the surface while lights use the moved surface's normal.
 * "param" is a free 0..1 number per pixel that a material reads as `s.param` (see sheet.ts): it overwrites where the
 * writing field's coverage is above 0.5, and reads 0 where no field wrote it.
 */
export type SheetChannel = "height" | "coverage" | "ink" | "slot" | "direction" | "rest" | "param";
export type FieldContext = {
    seed: number;
    /**
     * Seeded random numbers, 0..1, a fresh stream from the seed at each `init`. `setTime` re-inits only stateful
     * fields, so only they draw the same numbers again on a replay; a field that is not stateful should use
     * `rand` in `init` alone.
     */
    rand(): number;
    /** Live: the engine updates `detail` and `size` in place, so read them at draw time. */
    detail: number;
    size: {
        w: number;
        h: number;
        dpr: number;
    };
    /**
     * Float render targets are on (EXT_color_buffer_float, and no `?nofloat=1`). Without them the engine has already
     * said so in its one console warning, so a field that cannot run without them draws nothing and stays silent.
     */
    float: boolean;
    /**
     * The field's input changed outside the engine (page text reflowed, a font loaded): draw the sheet again at the
     * current time. Calls in one task are merged into one redraw. Safe to call after dispose (it does nothing).
     */
    invalidate(): void;
    /**
     * The field's settle time changed (a waiting burn started): under reduced motion the engine rests on the frame at
     * the new settle time, as after a re-init through `Painter.set`; otherwise it draws the sheet again, as `invalidate`.
     * Safe to call after dispose (it does nothing).
     */
    resettle(): void;
    /**
     * The palette as the engine read it last, as CSS colour strings (`rgb()` of the clipped sRGB the browser paints):
     * ground, ink and the five ramp stops. For a field that builds a source picture from the palette (the halftone's
     * tone), so page code never reads the tokens itself (the palette check's static rule).
     */
    colours(): RampColours;
};
/** The palette as CSS colour strings: see `FieldContext.colours`. */
export type RampColours = {
    ground: string;
    ink: string;
    stops: string[];
};
export type FieldRuntime = {
    /**
     * Draws this field's own layer into `sheet.out` (and `sheet.outDir` when it writes direction or param), encoded
     * with the GLSL `sheetEncode` (`dirEncode` for direction, `paramEncode` for param). The engine then blends it into `sheet.a` by the blend rule. `dt` 0 steps nothing.
     * Before each call the engine clears `out` to the "no effect" layer (height 0, coverage 1, ink 0, slot none,
     * direction none), so a field may draw only part of the sheet.
     */
    draw(sheet: Sheet, t: number, dt: number): void;
    /**
     * A field that writes "rest" draws only its rest pass here, straight into `sheet.rest` (no commit). The engine
     * calls it for every rest writer, in list order, before any field's `draw`; `draw` then draws the field's other
     * passes in list order, so commit order (slot and direction go to the last writer) stays the list's.
     */
    drawRest?(sheet: Sheet, t: number, dt: number): void;
    resize(w: number, h: number): void;
    dispose(): void;
    settled?(): boolean;
    /**
     * True when a draw depends on earlier draws (a simulation). `setTime` replays such fields from their seed.
     * Unset, it is true for fields of kind `grown` and `points`, and false otherwise.
     */
    stateful?: boolean;
    /**
     * The field's settle time, in fixed 1/60 s ticks: where its picture holds. Under reduced motion the engine takes
     * the largest settle time on the page and rests on the frame `setTime` gives there: stateful fields replay to it
     * once; a stateless field (a timeline whose frame depends on t alone) is drawn once at it, with no tick replay.
     * A stateful field pairs it with `settled()`, true from that tick count on. Fields and pages never read
     * `prefers-reduced-motion` themselves.
     */
    settleTicks?: number;
    /**
     * Called when the palette changes (the page's tokens change, or `Painter.set({ palette })`), after the engine has
     * read the new palette, so `ctx.colours()` gives it. A field that built something from the palette at init (the
     * halftone's function source) builds it again here; the engine then redraws the sheet. Unset, a palette change
     * only re-shades.
     */
    palette?(): void;
};
/** Where printed ink comes from: "text" from the text field (kind "ink"), "picture" from any other field (halftone dots). */
export type InkSource = "text" | "picture";
export type Field = {
    kind: "shape" | "points" | "grown" | "ink";
    writes: SheetChannel[];
    init(gl: WebGL2RenderingContext, ctx: FieldContext): FieldRuntime;
    /**
     * GLSL this field shares with the shade pass, so a material or light can evaluate the field's own formula at any
     * point and time (the water's surface at a refracted point) instead of reading the sheet's half-float height.
     * `glsl` is stitched in once per distinct source, before the materials; each key of `uniforms` is set on the
     * uniform of that name every shade draw (the field's settings, so they stay uniforms; time is `uTime`).
     * `frame(t)` gives uniforms read per shade draw at the paint's time, over `uniforms` (a floor that comes up).
     * `textures` are pictures the chunk samples, each bound to the sampler of its key's name (`uniform sampler2D
     * <key>`), uploaded once per record as `Material.textures` are.
     */
    shade?: {
        glsl: string;
        uniforms: Uniforms;
        frame?(t: number): Uniforms;
        textures?: Record<string, TexImageSource>;
    };
};
/**
 * A setting read per shade draw: a value, or a function of the paint's time in seconds (a card that rises, a floor
 * that comes up). Per-frame change goes through uniforms this way, never through a new material or light.
 */
export type PerFrame<T> = T | ((t: number) => T);
/**
 * A material for one slot. `glsl` defines `MatOut mat_$(Surf s)`. Every `$` is replaced by `<id>_<slot>`, and
 * each key of `uniforms` is set on the uniform `u_<id>_<slot>_<key>` (declare it as `u_$_<key>`). A material
 * starts from `matBase(s, tone)` (its base colour, a linear vec3) or `matBase(s)` (the ground).
 */
export type Material = {
    id: string;
    glsl: string;
    uniforms: Uniforms;
    laws: Law[];
    /** Uniforms read per shade draw at the paint's time, over `uniforms` and the resolved ones (named the same way). */
    frame?(t: number): Uniforms;
    /**
     * Uniforms from the palette, laid over `uniforms` (named the same way): as `Light.resolve`, the engine calls it at
     * start and again whenever the ramp rebuilds (the page's tokens change, `Painter.set` with a new palette or new
     * materials), so what it gives follows the tokens. The engine's materials resolve their `tone` here.
     */
    resolve?(ramp: Ramp): Uniforms;
    /**
     * Pictures the material samples, each bound to the sampler `u_$_<key>` (declare `uniform sampler2D u_$_<key>`):
     * uploaded once, linear and clamped, rows top down as drawn (uv y up). A new material object uploads again.
     */
    textures?: Record<string, TexImageSource>;
    /**
     * The material's highlight is a diffraction grating's (`materials.foil`): the shade pass then compiles the grating
     * lobe and the spectrum (`PK_GRATING`), and every light's highlight is coloured by it wherever the material sets
     * MatOut's `diffract` above 0. Structural: changing it recompiles. Unset on every other material, whose pages
     * compile none of it.
     */
    grating?: true;
    /**
     * The material's highlight is a thin film's (`materials.film`): the shade pass then compiles the film lobe and the
     * spectrum (`PK_FILM`), and every light's highlight is coloured by it wherever the material sets MatOut's `filmShare`
     * above 0. `range` is the thickness in nm at param 0 and 1, `ior` the film's index and `base` what lies under it. The
     * relight check reads this data through `__paint.materials()`. Unset on every other material.
     */
    film?: {
        range: [number, number];
        ior: number;
        base: "metal" | "dielectric";
    };
};
/**
 * A light. `glsl` defines `LightSum light_$(Surf s, MatOut m)`, which the shade pass adds up. `$` becomes
 * `<id>_<index>`; uniforms are named as for materials. `props` are the declared settings; `resolve` turns them
 * into uniforms against the palette (colour from kelvin, tinted toward the ramp), `with` makes the same light with
 * other props (the hook's `setLight`), and `testPositions` gives the two positions `moveLight` uses.
 */
export type Light = {
    id: string;
    glsl: string;
    uniforms: Uniforms;
    laws: Law[];
    props: Record<string, unknown>;
    resolve?(ramp: Ramp): Uniforms;
    with?(props: Record<string, unknown>): Light;
    testPositions?(step: 0 | 1): Record<string, unknown>;
    /**
     * Where the light falls at paint time `t`, for the tint law: a circle, `at` in page fractions (x right, y down) and
     * `radius` in short-side units, as `lights.glow`'s props. A light whose light is not a glow's circle (`lights.ember`,
     * which lights a band along a moving front) gives it here; unset, the law reads `props.at` and `props.radius`.
     */
    region?(t: number): {
        at: [number, number];
        radius: number;
    };
    /** Uniforms from the engine's eased pointer (canvas fractions), laid over `uniforms` at each draw; see pointer.ts. */
    pointer?(p: [number, number]): Uniforms;
    /**
     * Uniforms read per shade draw at the paint's time and the engine's eased pointer (canvas fractions), over the
     * resolved ones and the `pointer` hook's (named the same way). The engine's moving lights (a glow with a moving
     * `at` or a `follow`, a key with a `follow`) compute their position here, from their own props, so `with` keeps it.
     */
    frame?(t: number, pointer: [number, number]): Uniforms;
    /**
     * The light sits behind the sheet. Its `diffuse` term is then the light reaching the sheet's back at the point it
     * is evaluated, not light on the front: the shade pass adds none of it to the front, and a material passes it to
     * the viewer by its `transmit` (MatOut), spread over its `frost` radius (backlit glass). Opaque materials pass
     * none, so a light behind shows only through glass. It is structural: changing it recompiles.
     */
    behind?: boolean;
    /**
     * The light casts a shadow from the sheet's height (its `shadow` prop: `lights.key` and `lights.lamp` take one).
     * Its GLSL then also defines `vec4 ray_$(Surf s)`, the unit direction from the point toward the light (xyz) and the
     * farthest the shadow march may run across the sheet (w, short-side units), and declares `uniform float u_$_soft`.
     * The shade pass multiplies the light's diffuse and highlight by what the march leaves (light, then shadow).
     * `ground`: the shadow also darkens the bare ground (coverage 0), by a multiply, never lighter. Structural:
     * changing it recompiles. At most one light per paint casts (`assertOneShadow`).
     */
    shadow?: {
        ground: boolean;
    };
    /**
     * The light gives off light of its own over the bare ground: its GLSL adds to `pkEmit`, which the shade pass adds after
     * the coverage mix (`PK_EMIT`), so it shows where no surface is (`lights.ember`'s specks). Structural: changing it recompiles.
     */
    emits?: boolean;
};
/**
 * The halftone screen after light (`PaintOptions.finish.halftone`). After light (shadows included) and before grain,
 * the lit colour is screened: each cell of a square grid prints one dot of the lit colour on the `ground` tone (the
 * bed), sized so the cell brightens as the light grows (finish.ts `screenArea`; luminance as Rec. 709 weights on the
 * displayed, sRGB-encoded colour, as `fields.halftone` reads its source). A dot lighter than the bed grows with the
 * light; a dot darker than it shrinks (a negative print). So brighter lit areas print more light. `fields.halftone`
 * screens a picture before the light; this screens the lit result.
 */
export type HalftoneFinish = {
    /** Grid pitch in CSS px; under 1 draws as 1 (`fields.halftone`'s `MIN_CELL`). */
    cell: number;
    /** The grid's angle, degrees anticlockwise from the x axis (as `fields.halftone`). */
    angle: number;
    /** The tone the dots sit on: a ramp position, 0 the ground token to 1 the ink token (`rampAt`). */
    ground: number;
    /**
     * The material slots the screen prints on (indexes into `PaintOptions.materials`); unset, every slot. A pixel of
     * another slot keeps its lit colour. Printed ink (the sheet's ink channel: text, picture dots) is never screened.
     */
    slots?: number[];
};
export type PaintOptions = {
    seed: number;
    /** 0 flat .. 1 near-photo; default 0.5. Changes micro relief only. */
    detail?: number;
    palette: PaletteSource;
    fields: Field[];
    /** 1..4 materials; the index is the sheet's material slot. */
    materials: Material[];
    lights: Light[];
    /**
     * `grain`: seeded luminance grain, default 0.04. `halftone`: the halftone screen after light (finish.ts,
     * `HalftoneFinish`); `null` or absent, no screen. `Painter.set` merges `finish` into the one in force, so a set
     * that names only `grain` keeps the screen, and `halftone: null` removes it.
     */
    finish?: {
        grain?: number;
        halftone?: HalftoneFinish | null;
    };
    /** Sheet size as a fraction of the drawing buffer; default 1. */
    sheetScale?: number;
    /** The engine-owned pointer's lag and rest point (pointer.ts); lights with a `pointer` hook follow it. */
    pointer?: PointerOptions;
    /**
     * The pointer tips the surface (pointer.ts, `TiltOptions`): the shade pass turns the surface's normal and groove
     * direction by the tilt (pointer.ts `tiltTurn`), as a card tipped under fixed room lights; the eye stays at +z, the
     * lights stay, and no geometry moves. Unset: no tilt, and the page draws exactly as before.
     */
    tilt?: TiltOptions;
};
/**
 * Tilt: the engine's eased pointer tips the surface about the canvas centre by up to `max` degrees, a canvas edge
 * giving the whole of it, and the surface eases back to flat when the pointer leaves the canvas. It eases with the
 * pointer's own ease (`PointerOptions.ease`), so a page that tilts with `drive: "pointer"` must set an ease under 1:
 * `paint()` throws otherwise (at 1 a leave would snap flat in one tick). `drive: "none"`: the pointer tips nothing,
 * and only the hook's `setTilt` does. Turning tilt on or off recompiles the shade pass.
 */
export type TiltOptions = {
    /** The most the surface tips, in degrees, 0 up to 89. */
    max: number;
    drive: "pointer" | "none";
};
export type Painter = {
    set(p: Partial<PaintOptions>): void;
    dispose(): void;
    /**
     * The most pixels the GPU takes on one side of a picture (a material's or a field's texture): MAX_TEXTURE_SIZE of
     * the painter's own WebGL2 context, read once when it is made, so a page sizes its pictures without a context of
     * its own. At least 2048 wherever WebGL2 runs; 0 when the painter draws the fallback (no WebGL2), which uploads no
     * pictures.
     */
    readonly maxTextureSize: number;
};
export type PaintStats = {
    p5: number;
    p50: number;
    p95: number;
    p99: number;
    frames: number;
    dpr: number;
    webgl: boolean;
    sheetW: number;
    sheetH: number;
    /** Times the shade pass has compiled its program; it recompiles only when the material or light list changes. */
    compiles: number;
    /** The page's settle time in seconds (the largest field `settleTicks`); reduced motion rests there. 0: none. */
    settle: number;
};
export type SheetSample = {
    height: number[];
    coverage: number[];
    ink: number[];
    slot: number[];
    /** The param channel at the same points, 0..1: 0 where no field wrote it, and everywhere on a page with no writer. */
    param: number[];
    /**
     * The direction image at the same points, when any field writes direction: (x right, y up) in sheet space.
     * Length 0 is "none"; a field may write a length under 1 to grade how strongly the surface runs that way
     * (the twill writes 1 on warp floats, 0.6 on weft).
     */
    dir?: [number, number][];
};
