import { type PaletteTokens, type Vec3 } from "../engine/palette.ts";
import type { Check } from "./types.ts";
type Kind = "css" | "js";
/**
 * Findings for one text: `where:line what`. Custom property declarations are stripped first (they are the palette).
 * A hex colour counts only in a value position: in CSS, between `:` and the `;` or `}` that ends the declaration
 * (so a selector such as `#add` is never a hex colour); in script, anywhere except inside the string of a selector
 * call such as `querySelector('#add')`.
 */
export declare function scanText(raw: string, where: string, firstLine?: number, kind?: Kind): string[];
/** The static half over an html text: inline style blocks, style attributes and scripts. */
export declare function scanHtml(html: string, where: string): string[];
/** Static half over the target's html (a path under the repo root) and, with a bar, its local .js, .glsl and .css files. */
export declare function staticFindings(htmlFile: string, hasBar: boolean): string[];
/**
 * Far colours for every token, from each token's own OKLCH (S3): ground to the pole farther from its own lightness,
 * ink to the other pole (so ground and ink never share one), each accent by `farAccent`.
 */
export declare function farColours(lch: Vec3[]): string[];
/**
 * An accent's far colour, from its own OKLCH: the farther of the two pole lightnesses (the light pole under the
 * poles' midpoint, 0.625, else the dark pole), its own chroma, its hue turned 180 degrees. Chroma and hue are rounded to 4 and 2 decimals.
 */
export declare function farAccent([L, C, h]: Vec3): string;
/** A line naming both lists when a bar's token names differ from the names the painter reads; null when they agree or the painter lists none. */
export declare function tokenMismatch(barTokens: PaletteTokens | null, listed: PaletteTokens | null): string | null;
/** Engine functions page code may not call (S1): every function palette.ts exports except `fromPage`. */
export declare const COLOUR_API: string[];
/**
 * S1 and S2 over one script or shader text: `{ reads, lights }`, each finding `where:line what`. Comments are
 * removed first; a `uniform vec3` or `uniform vec4` (with or without a precision qualifier) is a colour uniform
 * unless its own line carries `// not-colour: <reason>`.
 */
export declare function structureFindings(raw: string, where: string, firstLine?: number): {
    reads: string[];
    lights: string[];
};
/** S1 and S2 over the target's html scripts and, with a bar, its local .js and .glsl files. */
export declare function structureOf(htmlFile: string, hasBar: boolean): {
    reads: string[];
    lights: string[];
};
export declare const check: Check;
export {};
