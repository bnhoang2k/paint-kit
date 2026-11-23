import type { Field, RampColours } from "../types.ts";
export type HalftoneOptions = {
    /**
     * The picture: its luminance sets the tone. Drawn from page shapes into a canvas, or a decoded bitmap; or a
     * function the engine calls with the palette as CSS colours, for a picture toned from the palette (page code may
     * not read the tokens itself). The engine calls it at init and again on every palette change, so the tone follows
     * the tokens. The tone is coverage, not colour (the dots print in the live ink token).
     */
    source: HTMLCanvasElement | ImageBitmap | ((colours: RampColours) => HTMLCanvasElement | ImageBitmap);
    /**
     * Grid pitch in CSS px (the screen ruling). Halving it puts four dots where one was. A function is called with
     * the frame's t at every draw (a timeline: a bar stepping coarse to fine), so it must depend on t alone.
     */
    cell: number | ((t: number) => number);
    /** The grid's angle, degrees anticlockwise from the x axis; 45 is the classic single-ink screen. */
    angle: number;
    /** 0 a pale dot field .. 1 full strength: scales every dot's area. A function of t, as for `cell`. */
    grow: number | ((t: number) => number);
};
/** The ink film's height at detail 1, in short-side units: about a fifth of a CSS px on a 600 px side. */
export declare const INK_FILM = 0.0003;
/**
 * The smallest cell, CSS px. The field draws n x n instanced dots, n = sheet diagonal / cell (sheet px) + 2, so the
 * count grows as 1 / cell^2: about 1.3 million at cell 1 on 960 x 600. A smaller cell (or 0, or a negative one)
 * draws as this one, and a cell never falls under one sheet pixel (a sheetScale under 1 cannot shrink it further).
 */
export declare const MIN_CELL = 1;
export declare function halftone(opts: HalftoneOptions): Field;
