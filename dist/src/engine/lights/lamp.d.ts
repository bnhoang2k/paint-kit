import { type Vec3 } from "../palette.ts";
import type { Light } from "../types.ts";
import { type ShadowOptions } from "./basic.ts";
export type LampOptions = {
    at: Vec3;
    aim: Vec3;
    /** Half angle of the cone, in degrees. */
    cone: number;
    /** Width of the cone's soft edge, in degrees, inside `cone`: full light at `cone - soft`, none at `cone`. */
    soft: number;
    /** How bright a flat sheet is at the aim point. Nearer the bulb it is brighter, farther it is dimmer. */
    level: number;
    kelvin: number;
    /** 0..1, how far the kelvin colour is tinted toward the ground's hue (default 0.15, as the key light). */
    tint?: number;
    /** 0..1, how much of its specular term the lamp gives (default 1); as the key light's `specular`. */
    specular?: number;
    /** The lamp casts a shadow from the sheet's height, away from its bulb; as the key light's `shadow`. */
    shadow?: ShadowOptions | null;
};
/** Page frame to sheet space: x right, y up, z toward the viewer, in short-side units, centred. */
export declare function pageToSheet([x, y, z]: Vec3, aspect: number): Vec3;
/** Sheet space back to the page frame. */
export declare function sheetToPage([x, y, z]: Vec3, aspect: number): Vec3;
/**
 * Where a ray from the lamp meets the sheet (z 0), as a page-frame point [x, y], or null if the ray misses it.
 * The ray is the lamp's aim turned by `offDeg` degrees. Along the aim (default), positive turns it farther from
 * the lamp's foot (the point on the sheet under the bulb), so `-k, 0, k` give three points at growing distance.
 * `across` turns it sideways instead; positive turns toward screen right when the lamp aims down the page.
 * `aspect` is the canvas width / height. The sheet's own height is ignored (it is a few thousandths).
 */
export declare function lampSheetPoint(lamp: Pick<LampOptions, "at" | "aim">, aspect: number, offDeg?: number, across?: boolean): [number, number] | null;
/**
 * The point on the ring `offDeg` degrees off the lamp's aim, at azimuth `azimuthDeg` around the aim, where it meets
 * the sheet (or null). Azimuth 0 turns along the aim away from the foot, 90 across toward screen right (as
 * `lampSheetPoint`'s `across`), 180 along toward the foot and 270 across toward screen left. At the four quarter
 * turns the point is exactly `lampSheetPoint`'s: 0 is `(offDeg)`, 180 `(-offDeg)`, 90 `(offDeg, true)` and 270
 * `(-offDeg, true)`, since the turn's cosine and sine are taken exact there (Phase 2 Task 2d: the falloff law's
 * outside probe sweeps this ring, and a page the old four-turn probe read keeps its point).
 */
export declare function lampRingPoint(lamp: Pick<LampOptions, "at" | "aim">, aspect: number, offDeg: number, azimuthDeg: number): [number, number] | null;
/**
 * A spot light; see the file header for the frame of `at` and `aim`. Test positions: the declared lamp, and the
 * lamp slid a quarter of the view along x toward the middle, its aim sliding with it (a lamp moving on a rail;
 * ruled by the Task 5 driver over the plan's "slides its `at`", so the pool of light moves rather than pivots).
 */
export declare function lamp(opts: LampOptions, declared?: LampOptions): Light;
