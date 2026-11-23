import type { Field } from "../types.ts";
export type TextOptions = {
    selector?: string;
    /**
     * The words ride the moved surface (default true): each pixel reads the text at its rest position. False keeps
     * the words at their HTML boxes whatever the surface does (a label laid over the paint, not printed on it).
     */
    carried?: boolean;
};
export declare function text(opts?: TextOptions): Field;
