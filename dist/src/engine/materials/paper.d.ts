import type { Material } from "../types.ts";
import { type ToneOptions } from "./tone.ts";
export type PaperOptions = ToneOptions & {
    /** 0..1, how strongly the fibres tilt the light at detail 1 (default 1). */
    fibre?: number;
    /** 0..1, how much light the sheet lets through, which softens its shading round slopes (default 0.3). */
    translucency?: number;
    /** Read the sheet's param as scorch (fields.burn): above 0 the paper's lightness falls toward 0. Default false. */
    scorch?: boolean;
};
export declare function paper(opts?: PaperOptions): Material;
