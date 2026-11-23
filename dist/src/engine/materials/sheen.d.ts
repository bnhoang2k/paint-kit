import type { Material } from "../types.ts";
import { type ToneOptions } from "./tone.ts";
export type SheenOptions = ToneOptions & {
    /** 0..1: the highlight's width (0.1 polished, 0.5 satin). */
    roughness: number;
    /** 0..1: how far the highlight streaks along the grain (0 round). */
    anisotropy: number;
};
export declare function sheen(opts: SheenOptions): Material;
