import type { Material } from "../types.ts";
import { type ToneOptions } from "./tone.ts";
export type GlassOptions = ToneOptions & {
    /** Short-side units over which the frost spreads light from behind (0 clear glass; about half a tile reads as a diffuser). */
    frost: number;
    /** 0..1: the share of the light behind the glass passes to the viewer; default 0.9. */
    transmit?: number;
    /** -1..1: how much more (or, negative, less) light the rim passes than the face; default 0.6. */
    rim?: number;
    /** Short-side units: the rim's width inside the coverage edge; default 0.008. */
    rimWidth?: number;
    /** 0..1: the front sheen's strength; default 0.3. */
    gloss?: number;
    /**
     * 0..1: how unevenly the frost's fine etch passes light, at detail 1 (scaled by the detail dial, so detail 0 has
     * none); default 0.15. Fine structure only: it moves the light passed by up to this share, pixel to pixel.
     */
    etch?: number;
};
export declare function glass(opts: GlassOptions): Material;
