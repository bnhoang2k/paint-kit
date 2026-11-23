import type { Field, SheetChannel, Uniforms } from "../types.ts";
export type ShapeOptions = {
    glsl: string;
    uniforms?: Uniforms;
    writes: SheetChannel[];
    /**
     * Drawn at the rest position that rest writers left (see `PRELUDE`'s note), so the shape's relief is the flat
     * sheet's and moves with the surface. Default false: a page's own shape is a layer of its own (water over a
     * card) unless it says it is the sheet. Ignored by a shape that writes "rest" itself.
     */
    carried?: boolean;
};
export declare function shape(opts: ShapeOptions): Field;
/**
 * A sheet of paper with a gentle macro warp (`warp` 0..1) that drifts slowly, and fibre micro relief that the
 * detail dial scales. Macro relief stays at every detail level. It is carried: on a page whose fields move the
 * surface (write "rest"), the warp moves with it.
 */
export declare function sheet(opts: {
    warp: number;
}): Field;
