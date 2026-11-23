import type { Material } from "../types.ts";
export type WaterMaterialOptions = {
    under: HTMLCanvasElement;
};
export declare function water(opts: WaterMaterialOptions): Material;
