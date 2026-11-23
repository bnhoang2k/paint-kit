import { type Ramp, type Vec3 } from "../palette.ts";
import type { BurnField } from "../fields/burn.ts";
import type { Light } from "../types.ts";
export type EmberOptions = {
    /** The burn whose front glows. It must be in the page's fields. */
    field: BurnField;
    /** Kelvin at the edge of the glow (at `reach`) and at its hot core (the front). Each at least 798 (the Draper point). */
    kelvin: [number, number];
    /** How much the glow adds to a white surface at the front. */
    level: number;
    /** How far the glow reaches from the front, short-side units. */
    reach: number;
    /**
     * 0..1, how far the heat colour is pulled toward the page's nearest ramp stop. Default 0.25. Builder: enough to lean
     * the orange into the page's palette while a dull red still reads as heat; picked before any check ran.
     */
    pull?: number;
    /**
     * Short-side units: the width of the band the glow lights across the sheet, centred on the page. Default the
     * sheet's width. A card narrower than the page sets its own width, so the tint law's circle (`region`) holds the
     * lit band and no more: with the page's width the circle would hold the whole frame and the law could not read what
     * lies beyond it. It sets that circle only and clips no light, so it must cover all the page's paper.
     */
    span?: number;
    /** A thin, hot line on the hole's edge. Unset, there is none. */
    rim?: EmberRim;
    /** Glowing specks on the bare ground behind the front. They need the burn's `linger`. Unset, there are none. */
    specks?: EmberSpecks;
};
export type EmberRim = {
    /** The line's width, short-side units, above 0. */
    width: number;
    /** How much brighter than `level` the line is, above 0. */
    gain: number;
    /** Kelvin at the line's outer edge and at its hot core. Each at least 798. */
    kelvin: [number, number];
};
export type EmberSpecks = {
    /** How much brighter than `level` a speck is, above 0. */
    gain: number;
    /** 0..1: the share of grid cells that hold a speck at detail 1. Specks are fine structure: detail 0 keeps `SPECK_DETAIL_FLOOR` of them. */
    density: number;
    /** Half the width and height of the area that held paper, short-side units about the page centre. No speck starts outside it. */
    box: [number, number];
    /** Kelvin of a cooling speck and of a fresh one. Each at least 798. */
    kelvin: [number, number];
};
/** Heat colour at `k` kelvin, pulled toward the ramp by `pull` and scaled to luminance 1. */
export declare function emberColour(k: number, ramp: Ramp, pull: number): Vec3;
/** The circle holding every pixel the ember lights at `t`, in the glow's frame: `at` page fractions, `radius` short-side units. */
export declare function emberRegion(field: BurnField, reach: number, t: number, span?: number, behind?: number): {
    at: [number, number];
    radius: number;
};
export declare function ember(opts: EmberOptions): Light;
