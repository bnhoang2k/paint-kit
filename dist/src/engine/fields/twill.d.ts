import type { Field } from "../types.ts";
import { TWILL_RATIO } from "../glsl/twill.ts";
export { TWILL_RATIO };
export type TwillOptions = {
    /** Wales (diagonal ribs) per short side of the canvas; 48 puts one every 12.5 px on a 600 px side. */
    wales: number;
    /** The wales' angle on screen, degrees anticlockwise from the x axis; 63 is a right-hand twill. */
    angle: number;
    /** Depth of the cloth's macro drape, 0 (flat) to 1 (deep folds). The weave's own depth is fixed. */
    scale: number;
};
export declare function twill(opts: TwillOptions): Field;
