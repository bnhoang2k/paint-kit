import { type Ramp, type Vec3 } from "../palette.ts";
import type { Light } from "../types.ts";
/** `kelvin` light tinted by `tint` 0..1 toward the ground's hue and chroma, at the light's own lightness. */
export declare function paletteLight(kelvin: number, tint: number, ramp: Ramp): Vec3;
/** A light's `specular` prop as its uniform: 0..1, default 1. */
export declare const specularOf: (v: number | undefined) => number;
export declare function ambient(level: number): Light;
export type KeyOptions = {
    dir: Vec3;
    level: number;
    kelvin?: number;
    tint?: number;
    /**
     * 0..1, how much of its specular term (the highlight) the light gives; default 1. Pages leave it alone: the
     * relight check's highlight law switches it to 0 to read the highlight alone (frame on minus frame off).
     */
    specular?: number;
    /**
     * Tilt with the engine's eased pointer (pointer.ts): the light's direction is `dir` + follow x (pointer x - 0.5,
     * 0.5 - pointer y, 0), read per draw, its diffuse and its highlight alike. At the pointer's rest (the centre) it is
     * `dir`. Unset: the light keeps `dir`.
     */
    follow?: number;
    /**
     * The light casts a shadow from the sheet's height (Phase 2 Task 7): it falls on the side away from the light, moves
     * against it, and softens with height. `soft`: short-side units of penumbra per unit of the blocker's height above
     * the receiver (0 is a hard edge). `ground` (default false): the shadow also darkens the bare ground (coverage 0),
     * which otherwise stays unlit. Declares the shadow law. `null` or unset: no shadow (the relight check's shadow law
     * reads the frame with `setLight(i, { shadow: null })`).
     */
    shadow?: ShadowOptions | null;
};
/** A light's shadow: see `KeyOptions.shadow`. */
export type ShadowOptions = {
    soft: number;
    ground?: boolean;
};
/** The structural shadow flag (`Light.shadow`) and the uniforms of a light's `shadow` option, or nothing without one. */
export declare function shadowOf(sh: ShadowOptions | null | undefined): {
    shadow?: {
        ground: boolean;
    };
    soft?: number;
};
/**
 * A directional light. `dir` points from the surface toward the light (x right, y up, z toward the viewer).
 * `level` is how bright a flat sheet is under it: slopes facing the light get more, slopes facing away less.
 * Test positions: the declared `dir`, and that `dir` swung 60 degrees about the view axis.
 */
export declare function key(opts: KeyOptions, declared?: KeyOptions): Light;
