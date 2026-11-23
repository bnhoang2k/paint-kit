import type { PaletteSource } from "./palette.ts";
import type { Law, Light, Material } from "./types.ts";
export type FallbackInput = {
    palette: PaletteSource;
    materials: Material[];
    lights: Light[];
    /** The pixel ratio the engine would have used, for `stats().dpr`. */
    dpr: number;
};
export type Fallback = {
    dispose(): void;
};
export declare const lawsOf: (materials: Material[], lights: Light[]) => Law[];
export declare function enterFallback(canvas: HTMLCanvasElement, input: FallbackInput): Fallback;
