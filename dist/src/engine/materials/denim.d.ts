import type { Material } from "../types.ts";
import { type ToneOptions } from "./tone.ts";
export type DenimOptions = ToneOptions & {
    /** 0..1, how far wear lightens the dye on the highest relief (default 0.4). */
    wear?: number;
    /**
     * The warp's dye: `'ink'` (default) is the ink token; `'accent0'` is the ramp's middle stop, which is the page's
     * accent when it declares one (with two accents it is their OKLab mix).
     */
    dye?: "ink" | "accent0";
};
export declare function denim(opts?: DenimOptions): Material;
