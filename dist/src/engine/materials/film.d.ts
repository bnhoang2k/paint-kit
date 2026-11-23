import type { Material } from "../types.ts";
import type { PullTarget } from "../spectrum.ts";
import { type ToneOptions } from "./tone.ts";
/** The default `roughness`. Builder: foil's default, the same satin lobe, chosen before any film was read. */
export declare const FILM_ROUGHNESS = 0.3;
export type FilmOptions = ToneOptions & {
    /** The film's thickness in nm at param 0 and at param 1. A reversed range runs the thickness the other way. */
    range: [number, number];
    /** The film's index of refraction, 1 or more. */
    ior: number;
    /** What lies under the film: `"metal"` (iron, a conductor) or `"dielectric"` (a clear base of index 1.5). */
    base: "metal" | "dielectric";
    /** 0..1: how far the film's colour is pulled toward the page's ramp (0 the raw spectrum). */
    pull: number;
    /** Where the pull goes: `"nearest"` ramp stop, or the `"ground"`'s hue (`pullToRamp`). */
    pullTarget: PullTarget;
    /** 0..1: the width of the highlight; default 0.3 (builder). */
    roughness?: number;
};
export declare function film(opts: FilmOptions): Material;
