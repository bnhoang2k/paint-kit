import type { Light } from "../types.ts";
export type ThroughWaterOptions = {
    /** 0..1, how much of the caustic the light draws (default 1). */
    caustic?: number;
};
export declare function throughWater(light: Light, opts?: ThroughWaterOptions): Light;
