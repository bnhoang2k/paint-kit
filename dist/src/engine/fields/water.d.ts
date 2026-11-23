import type { Field, PerFrame } from "../types.ts";
export type WaterOptions = {
    /** Wave crests per short side of the canvas, for the base wavelength; the swell runs 0.67 to 1.8 times this. */
    waves: number;
    /** Rate: at 1 a base wave's period is 2 s; 0 holds the surface still. */
    speed: number;
    /** Wave height, 0 (a still pool) to 1: it scales every wave's slope. */
    depth: number;
    /**
     * Where the surface holds under reduced motion, in seconds (default 1). The engine rests on `setTime` there; the
     * field never reads the media query itself.
     */
    settle?: number;
    /**
     * Depth of the floor under the surface, short-side units, or a function of t (a floor that comes up); default 1.
     * It sets the focus: the caustic lines are sharpest near the waves' focal depth (1.0 at waves 6, depth 0.6; at 0.6
     * the same waves give soft pools of light).
     */
    floor?: PerFrame<number>;
    /** The water's refractive index (default 1.33, water). */
    ior?: number;
    /**
     * The floor pictures' offset on the floor (the material's `under` and the rise map together), short-side units
     * [x right, y up], or a function of t; default [0, 0].
     */
    shift?: PerFrame<[number, number]>;
    /**
     * Per-pixel floor height. `map`'s red channel (0..1, drawn at the canvas's aspect like `under`, rows top down) times
     * `height` (short-side units, or a function of t) is how far that point sits above the floor: the floor's depth
     * there is `floor - height x red`, never under 0. Red 0 (or no `rise`) is the plain floor. The map uploads once;
     * a card rises by `height`, per frame, through a uniform.
     */
    rise?: {
        map: TexImageSource;
        height: PerFrame<number>;
    };
    /**
     * A lifted layer, seen through the water at its own depth: `picture` holds its tone in red (a ramp position, as
     * `under`) and its coverage in green (0 floor, 1 layer), drawn at the canvas's aspect, rows top down, uploaded
     * once. `rise` (short-side units, or a function of t) is how far it lies above the floor: its depth is
     * `floor - rise`, never under 0. A negative rise is read as 0 (the layer lies on the floor), not thrown: it is
     * read per frame, and an easing that overshoots must not stop the page. Where a `rise` map lifts the floor above
     * the layer, the floor hides the layer there. `shift` moves it on its own (short-side units [x right, y up], or a
     * function of t); default the field's `shift`. The material and the light draw it with no option of their own.
     */
    layer?: {
        picture: TexImageSource;
        rise: PerFrame<number>;
        shift?: PerFrame<[number, number]>;
    };
};
export declare function water(opts: WaterOptions): Field;
