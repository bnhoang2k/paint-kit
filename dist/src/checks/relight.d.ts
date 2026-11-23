import { type LampOptions } from "../engine/lights/lamp.ts";
import { type Vec3 } from "../engine/palette.ts";
import type { Law } from "../engine/types.ts";
import type { PageHandle, Rgba } from "./harness.ts";
import { type Check, type CheckOpts, type CheckStatus, type Scheme, type SchemePart, type Target } from "./types.ts";
export type LightInfo = {
    id: string;
    laws: Law[];
    props: Record<string, unknown>;
    region?: {
        at: [number, number];
        radius: number;
    };
};
type LawResult = {
    status: CheckStatus;
    line: string;
    measured: Record<string, number>;
};
/** Least-squares slope of y on x. */
export declare function slope(x: number[], y: number[]): number;
/**
 * The highlight's centroid [x, y] in px: the centroid of `on` minus `off` (linear luminance, positive part, as
 * weights), where the two frames differ only by a light's specular term. Null when the light adds no highlight.
 * `keep(pixel index)` limits it to some pixels (one material's slot).
 */
export declare function specularCentroid(on: Rgba, off: Rgba, keep?: (pixel: number) => boolean): [number, number] | null;
/**
 * Centroid [x, y] in px of the brightest `share` of the kept pixels (by luminance), ties included; all pixels when
 * `keep` is not given. The 1% default is the spec's (header, highlight (b)). Null when no pixel is kept.
 */
export declare function brightCentroid(lum: ArrayLike<number>, w: number, h: number, share?: number, keep?: (pixel: number) => boolean): [number, number] | null;
/** What the highlight law read at the key's two test positions (`dir`: the key's direction there). */
export type HighlightReading = {
    /** The specular difference's centroid at each position, null where the key adds no highlight. */
    specular: [[number, number] | null, [number, number] | null];
    /** The brightest-1% centroid of the key-only frame's fully covered pixels at each position, null with none. */
    bright: [[number, number] | null, [number, number] | null];
    /** How many frame pixels (b) reads: those whose sheet coverage is at least `relight.fullCoverage`. */
    read: number;
    dir: [number[], number[]];
    /** Declaring materials ("id (slot k)") whose slot has pixels on the frame but no specular difference there. */
    dull: string[];
    /** Declaring materials whose slot has no pixels on the frame. */
    offFrame: string[];
    /** Per declaring material on the frame: its own slot's specular and brightest-1% centroids at each position. */
    slots: {
        name: string;
        slot: number;
        specular: [[number, number] | null, [number, number] | null];
        bright: [[number, number] | null, [number, number] | null];
    }[];
};
/** Shift of centroid `a` to `b` along the light's screen motion (its direction's x right, y up; screen y runs down). */
export declare function shiftAlong(a: [number, number], b: [number, number], d0: number[], d1: number[]): number;
/** The highlight law's verdict: both conditions must pass; each failing one is named. */
export declare function highlightVerdict(r: HighlightReading, minShift: number, minBright: number): LawResult;
export declare const hueDistance: (p: number, q: number) => number;
/** The CPU twin of the GLSL `ramp(t)`: t 0..1 walks the 5 stops, mixed in OKLab. */
export declare function rampAt(stops: Vec3[], t: number): Vec3;
/** The relief law's reading: the frames' mean absolute RGB difference over their mean RGB brightness (no unit; 0 when both are black). */
export declare function reliefChange(a: Rgba, b: Rgba): number;
export type ReliefReading = {
    diff: number;
    raw: number;
    brightness: number;
    range: number;
};
/** The relief law's verdict from its reading: height range over `range`, relative change over `diff`, raw change over `raw`. */
export declare function reliefVerdict(r: ReliefReading, lim: {
    diff: number;
    raw: number;
    range: number;
}, mover?: string): LawResult;
/**
 * The falloff law's span rule, per page: the page's noise is the rms of its widest fit's log residuals (`widest`; the
 * declared fit's when the widest has none). A narrow fit's own rms is not a safe noise measure: the overhead fault's
 * declared cone (span 0.0217, rms 0.0052 at seed 2) misses its exponent by about 1.2 where 2 x 0.0052 / 0.0217 = 0.48
 * predicts much less (header, falloff). The declared cone is read when its samples span at least `ratio` x that noise; else the
 * cone is opened (`open`). Either fit resolves the falloff only when its own span is at least `ratio` x `noise`.
 */
export declare function falloffPlan(declared: {
    span: number;
    rms: number;
}, widest: {
    rms: number;
}, ratio: number): {
    open: boolean;
    noise: number;
};
/**
 * The falloff law's slot rule (Phase 2 Task 2d): the material slot the lamp's declared full-light pool mostly falls on.
 * Of the sheet texels (`grid`, the whole page, rows top down) that are fully covered (coverage at least 1, as a kept
 * sample must be) and whose centre, seen from the bulb, lies within `cone - soft` degrees of the lamp's aim, it is the
 * slot with the most texels; a tie goes to the lower slot. -1 when no texel qualifies. A texel's centre is
 * ((x + 0.5) / w, (y + 0.5) / h) in the page frame at z 0 (the sheet's own height is ignored, as in
 * `lampSheetPoint`). The falloff fit then leaves out every sample whose patch has a texel on any other slot.
 * Self-contained (no imports; it repeats `pageToSheet`'s scale), because the check runs its source in the page so the
 * whole sheet is not copied out to node (copying it made relight about 4 x slower on lights.html: 37.6 s, not 8.8 s).
 */
export declare function poolSlot(grid: {
    slot: ArrayLike<number>;
    coverage: ArrayLike<number>;
    w: number;
    h: number;
}, lamp: Pick<LampOptions, "at" | "aim" | "cone" | "soft">, aspect: number): number;
/**
 * The azimuths (degrees around the aim; 0 along away from the foot, 90 across toward screen right) the falloff law's
 * outside probe tries on the 1.5 x cone ring, in order: the four turns the probe always tried, in their old order
 * (along away from the foot, along toward it, across right, across left), then the rest of the ring every 15 degrees.
 * The first that lands on the page is read, so a page whose old probe found a point keeps that point (Phase 2 Task 2d).
 */
export declare const OUTSIDE_AZIMUTHS: readonly number[];
/** The caustic alone per pixel: linear luminance on over off, minus 1; NaN where off is under CAUSTIC_DARK. */
export declare function causticAlone(on: Rgba, off: Rgba): Float32Array;
/** The brightest `share` of the pixels `keep` marks (finite values only), ties included, as a 0/1 mask, and its cut. */
export declare function brightMask(v: Float32Array, keep: Uint8Array, share?: number): {
    mask: Uint8Array;
    cut: number;
};
/**
 * Guo-Hall thinning (algorithm A1, 1989) of a 0/1 mask (w x h, rows top down) to a one-pixel skeleton; the mask is
 * not changed. Guo-Hall, not Zhang-Suen: Zhang-Suen erases a line two pixels thick on a diagonal step entirely
 * (it read 200 px wide in test/unit/relight.test.ts, a thin line taken for a pool of light).
 */
export declare function skeleton(mask: Uint8Array, w: number, h: number): Uint8Array;
/**
 * Length of a skeleton in px: each link between neighbouring skeleton pixels counts once, 1 for a side step and
 * sqrt 2 for a diagonal one, a diagonal only when neither pixel beside it is on the skeleton (else the corner's two
 * side steps already join them). At least 1 for a skeleton with any pixel (a disc thins to a point).
 */
export declare function skeletonLength(sk: Uint8Array, w: number, h: number): number;
/**
 * Mean width of the lines a mask forms, px: its area over its skeleton's length (0 for an empty mask). The caustic
 * law's old thin half; it is kept for test/pages/water.test.ts, whose exposure guard shows it moving with exposure.
 */
export declare function lineWidth(mask: Uint8Array, w: number, h: number): number;
/** Intersection over union of two 0/1 masks (0 when both are empty). */
export declare function overlap(a: Uint8Array, b: Uint8Array): number;
/** What the caustic law read: the brightest 5%'s overlap across the two times, and each time's concentration. */
export type CausticReading = {
    overlap: number;
    concentration: [number, number];
};
/** The caustic law's verdict: both conditions must pass; each failing one is named. */
export declare function causticVerdict(r: CausticReading, minConcentration: number, maxOverlap: number, level?: number): LawResult;
/** True when a pixel `keep` marks reaches the finish's knee in any channel (8-bit), where light cannot be read back. */
export declare function reachesKnee(fr: Rgba, keep: Uint8Array): boolean;
/**
 * True when the finish's knee can change what the caustic law reads (header, caustic; Phase 2 Task 4). Only the
 * pixels the law reads count (`keep`: water, readable in both caustic-off frames). One of them biases the read when it
 * reaches the knee in its caustic-off frame (its ratio is then raised, unbounded), or in a caustic-on frame with its
 * c - 1 at or under that frame's cut. The knee only lowers an on frame, so a pixel clipped above the cut would read
 * above it unclipped too: the cut and the brightest 5% (concentration and overlap) are exact. A clipped pixel the law
 * leaves out changes nothing.
 */
export declare function kneeBiases(on: [Rgba, Rgba], off: [Rgba, Rgba], v: [Float32Array, Float32Array], keep: Uint8Array): boolean;
/** What `readCaustic` took: the caustic alone at the two times, the water's readable pixels, and the light's level. */
export type CausticFrames = {
    v: [Float32Array, Float32Array];
    w: number;
    h: number;
    keep: Uint8Array;
    level: number;
    clear: boolean;
};
/**
 * The caustic law's exposure (header, caustic): every light but light `i` off, grain 0, light `i` at `level` x its
 * declared level, or, when `level` is not given, halved from 1 until the knee cannot change what the law reads
 * (`kneeBiases`; `clear` false when it still can at the last level). Puts the lights and the grain back before it
 * returns.
 */
export declare function readCaustic(h: PageHandle, lights: LightInfo[], i: number, level?: number): Promise<CausticFrames>;
/** One light behind's reading for (b): its glowing pixels' overlap between its two test positions, read alone. */
export type TransmitMove = {
    light: number;
    overlap: number | null;
    gain: [number, number];
    level: number;
    clear: boolean;
};
/** (c) per light behind: the ground's mean change inside that light's own radius (all lights behind off together). */
export type TransmitGround = {
    light: number;
    outside: number;
};
/** `tiles`: (d)'s tile faces (`tileFaces`) at each moment read (TILE_MOMENTS), faces in no order. */
export type TransmitReading = {
    share: number | null;
    grounds: TransmitGround[];
    peak: number;
    moves: TransmitMove[];
    tiles: TileMoment[];
};
/**
 * (c)'s ground readings: for each light behind, the mean absolute 8-bit change (0..1) between `on` and `off` over the
 * pixels outside the glass inside that light's own circle (`radius` short-side units about `at`, page fractions), or
 * over the whole frame when the light has no `at` or no `radius` (a light with no place lights everywhere it can).
 */
export declare function transmitGrounds(on: Rgba, off: Rgba, glassPx: Uint8Array, lights: {
    light: number;
    at?: [number, number] | undefined;
    radius?: number | undefined;
}[]): TransmitGround[];
/**
 * (d) judges the tiles' variation at a moment only with at least this many tiles: the smallest n where the lower
 * quartile (index floor(0.25 (n - 1))) is not the dimmest tile (checks fix round 3, review-checks-fix2 I2).
 */
export declare const MIN_TILES = 5;
/**
 * (d1): a tile is blown to white when its white face (the mean dimmest channel: every channel) reaches 252 / 255,
 * within 3 levels of 255 (checks fix round 3, review-checks-fix2 I1, stated before measuring; the channel corrected
 * after the first measurement, header (d)). From the finish (src/engine/finish.ts,
 * knee 0.8 linear, out = k + 0.2 (1 - exp(-(c - k) / 0.2))): the shoulder's output reaches 252 at a linear input of
 * 1.2, 1.5 x the knee's, and from there a doubling of the light moves it under 3 levels: the tile has stopped
 * answering more light. The shoulder is per channel, so this is asked of every channel. 252 is OKLab L 0.991 for a
 * neutral, within half a palette.visibleMove (0.02) of white. The face is a mean over the grain (colourless, OKLab L):
 * at the default grain (0.04) a fully blown face reads 253.3 (the grain dips under 255 and clips over it), so a
 * blown tile clears 252 by 1.3 levels; a page with grain over about 0.07 cannot reach
 * it (a known limit). Not the knee (231, where the shoulder starts): bar 06's wash alone puts every tile over it
 * (glimmer-flat-white). Not derived from bar 06, glass.html or any fault.
 */
export declare const TILE_WHITE: number;
/** (d) is read at these times: the check's frozen T and one second either side (checks fix round 3, Minor 4). */
export declare const TILE_MOMENTS: number[];
/** One tile's (d) faces over its centre patch: `luma` the mean encoded Rec. 709 luma, `white` the mean dimmest channel (both 0..1). */
export type TileFace = {
    luma: number;
    white: number;
};
/** (d) at one moment: its time and the faces read on the frame there. */
export type TileMoment = {
    t: number;
    faces: TileFace[];
};
/**
 * (d)'s tile faces on the frame `fr`: the 4-connected components of `full` (the fully covered glass pixels), each
 * read as a tile when it does not touch the frame's border and the FACE x FACE patch about its centroid (rounded)
 * lies wholly in it. Over that patch a tile's luma face is the mean encoded Rec. 709 luma and its white face the mean
 * of each pixel's dimmest channel, so the rim and the grain do not decide it. Returns one face per tile read.
 */
export declare function tileFaces(fr: Rgba, full: Uint8Array): TileFace[];
/** (d)'s statistics at one moment: the whitest white face, the brightest luma face, the lower-quartile luma face (dimmest first, index floor(0.25 (n - 1))) and the spread between those two. Null under MIN_TILES. */
export declare function tileSpread(faces: TileFace[]): {
    n: number;
    white: number;
    top: number;
    low: number;
    spread: number;
} | null;
/**
 * The transmit law's verdict: (a), (b) and (c) must all pass; each failing one is named. (b) holds for every light
 * behind: one whose glow does not move, or adds nothing, fails it. `transmit.overlap`, `.level` are the worst over
 * the lights behind (the largest overlap, the lowest level); each light's are kept as `transmit.overlap.<light>`.
 * (c) takes the largest of the per-light ground readings (`transmit.outside`); each is `transmit.outside.<light>`.
 * (d) judges each moment with at least MIN_TILES faces (`tileSpread`) and passes when one meets (d1) and (d2)
 * together; when no moment has MIN_TILES faces, the law is partial ("too few tiles to judge variation").
 */
export declare function transmitVerdict(r: TransmitReading, minShare: number, maxOverlap: number, band: number, minSpread: number): LawResult;
/** The shadow mask: pixels darker with the shadow on than off by more than `dark` (relative, in linear luminance). */
export type ShadowMaskReading = {
    share: number;
    centroid: [number, number] | null;
    depth: number;
};
/**
 * The shadow law's mask from the frames with the shadow on and off: its share of the frame, its centroid in px, and
 * the deepest relative darkening on the frame (`depth`, with or without a mask). A pixel black in the off frame cannot
 * be read as a share of its light and is left out; a pixel the shadow lightens is not darker and is not kept.
 */
export declare function shadowMask(on: Rgba, off: Rgba, dark: number): ShadowMaskReading;
/** What the sheet's height says about a shadow: see `shadowOracle`. Points are page fractions (x right, y down). */
export type ShadowGeometry = {
    share: number;
    centroid: [number, number] | null;
    raised: [number, number] | null;
};
/**
 * The geometric shadow the sheet's height casts, as the shading pass's march (shade.ts SHADOW_MARCH) finds it with a
 * hard edge: from each texel, `march.steps` samples toward the light, evenly from `march.start` texels out to where
 * the ray has risen to `march.top` (or, for a lamp, to its foot), the texel in shadow when a sample's height stands
 * above the ray. `light` is a key's `dir` (x right, y up, z toward the viewer) or a lamp's `at` (the page frame:
 * x, y fractions with y down, z height in short-side units). Gives the share of texels in shadow and their centroid,
 * and the raised region's centroid: the texels above the middle of the height range (null on a sheet of one height).
 * `grid` is the sheet at its own resolution, rows top down, as `__paint.sheetRegion` reads it. A texel with coverage
 * 0 (the bare ground) receives no shadow unless `light.ground` is on (the light's `shadow.ground`), as the shading
 * pass draws it: the ground there is drawn unlit and unshadowed. It still blocks by its height. Without `coverage`
 * every texel receives. Self-contained (no imports), because the law runs its source in the page so the whole sheet
 * is not copied out to node.
 */
export declare function shadowOracle(grid: {
    height: ArrayLike<number>;
    coverage?: ArrayLike<number>;
    w: number;
    h: number;
}, light: {
    dir?: number[];
    at?: number[];
    ground?: boolean;
}, march: {
    steps: number;
    top: number;
    start: number;
}): {
    share: number;
    centroid: [number, number] | null;
    raised: [number, number] | null;
};
/**
 * One test position of the shadow law: the mask, the share of the frame the sheet's height blocks (`predicted`), the
 * raised region's centroid in px, and the unit screen direction away from the light there (px, y down; null when the
 * light gives none, a lamp straight above the raised centroid).
 */
export type ShadowFrame = {
    mask: ShadowMaskReading;
    predicted: number;
    raised: [number, number] | null;
    away: [number, number] | null;
};
/** The shadow law's reading: the sheet's height range, the two test positions, and the light's screen move between them (px, y down). */
export type ShadowReading = {
    range: number;
    frames: ShadowFrame[];
    move: [number, number];
};
/** The shadow law's verdict (header, shadow): the floor, then (a) and (b) at both test positions. */
export declare function shadowVerdict(r: ShadowReading, lim: {
    dark: number;
    shift: number;
    none: number;
    minRelief: number;
}): LawResult;
/** Degrees per groove-direction bin of the iridescence law's groups: the spec's "same groove" is within 5 degrees. */
export declare const GROOVE_BIN = 5;
/** Degrees per normal bin (the normal's tilt about each sheet axis): the spec's "same normal" is within 2 degrees. */
export declare const NORMAL_BIN = 2;
/** Groove-share bin (the direction's length, the grating's share of the highlight): a graded groove is another groove. */
export declare const GROOVE_SHARE_BIN = 0.1;
/**
 * (b)'s grating bin: u = |X.(l + v)| in steps of 0.0025. The first order shows lambda = d u, so at the widest spacing
 * the spec allows (2.0 um, materials.foil FOIL_SPACING) one step moves it 2000 x 0.0025 = 5 nm, one step of the CIE
 * 1931 table (5 nm). Task 14 fix round 2: the plan's 2-degree normal bin was too coarse for a grating, as 2 degrees of
 * normal moves the first order about 50 nm.
 */
export declare const GRATING_U_BIN = 0.0025;
/**
 * (d): two groups' grooves are apart when their directions differ by at least this many degrees. Plan: the plan's
 * Task 14 sets 30 (the spec says only "different groove directions"). The comparison runs on the 5-degree bin
 * centres (GROOVE_BIN), so two pixels' true grooves at the cut differ by about 25 to 35 degrees; "at least" because on
 * bin centres "more than 30" would mean 35 or more, a boundary the plan never set.
 */
export declare const GROOVE_APART = 30;
/**
 * The fewest frame pixels a group needs to be judged in (b) and (d). Builder: 400 px puts at least about 200 in each
 * half (b) compares, so the film grain and the finish's grain (zero-mean, a few pixels across) average out of a half's
 * mean; a smaller group (a rim's slope ring, a corner) is left out of (b) and (d), never failed by them.
 */
export declare const GROOVE_MIN_PX = 400;
/**
 * The distance of two OKLab colours in the chroma plane alone (a, b; lightness left out). The iridescence law reads
 * (a), (b) and (d) here: a grating's colour is hue and chroma, and a groove-aware white highlight (a band flattened to
 * its luminance, or an anisotropic metal) moves and differs in lightness alone (test/faults/iridescence-white).
 */
export declare const chromaDistance: (p: ArrayLike<number>, q: ArrayLike<number>) => number;
/**
 * (a) per point (Task 14 round 4, the owner: "Per-point change"): the mean, over the pixels `keep` holds, of each pixel's
 * own chroma distance (`chromaDistance`) between frames `a` and `b`. Not the change of the mean: two frames whose pixels
 * trade colours keep their mean and still read their whole change here. On the same frames it is never under the
 * change of the mean (the norm of a mean is at most the mean of the norms). 0 when no pixel is kept.
 */
export declare function pointChromaShift(a: Rgba, b: Rgba, keep: (p: number) => boolean): number;
/** One group of foil texels: its groove bin (degrees 0..180, 0 when it has no grooves), share bin and normal bin (degrees). */
export type FoilGroup = {
    groove: number;
    share: number;
    normal: [number, number];
};
/** One (b) group of foil texels: its groove bin, share bin and grating bin `u` (X.(l + v), see `foilTexels`). */
export type FoilUGroup = {
    groove: number;
    share: number;
    u: number;
};
/**
 * The foil texels of the sheet, by group: `id` per texel, rows top down (-1 not foil), and the groups; with a light,
 * `uid` and `ugroups` too, the texels by groove, share and grating bin (for (b)).
 */
export type FoilTexels = {
    id: number[];
    groups: FoilGroup[];
    uid?: number[];
    ugroups?: FoilUGroup[];
    w: number;
    h: number;
};
/**
 * The iridescence law's foil texels and their groups. A texel is foil when its slot is in `slots` (a material that
 * declares the law), its coverage is at least `full` and it holds no ink (ink covers the foil: materials.foil). Its
 * group is its groove direction (the direction image's angle, 0..180 degrees, binned by `bin.groove`; a sheet with no
 * direction image runs every groove along +x at share 1, as the shade pass does), its groove share (the direction's
 * length, capped at 1, binned by `bin.share`; share 0 has no grooves and groove 0) and its normal's tilt about each
 * sheet axis (atan of the height's central-difference slope in short-side units, as the shade pass's normal, binned
 * by `bin.normal`). `grid` is the sheet at its own resolution, rows top down, as `__paint.sheetRegion` reads it.
 *
 * With `light` (`l` the unit direction to the key in the sheet's frame: x right, y up, z toward the viewer; the eye v
 * is +z; `turn`, the tilt's rotation as rows, `turnOfTilt`, turns the surface's normal and grooves, none the identity),
 * each texel also gets its grating bin for (b): from the grating equation for a
 * reflection grating, d (sin theta_i + sin theta_m) = m lambda (Stam, "Diffraction Shaders", GPU Gems chapter 8), the
 * two sines across the grooves are X.l and X.v, so the order m shows lambda = d |X.(l + v)| / m, and every point with
 * the same groove spacing and the same u = |X.(l + v)| shows the same wavelengths. X is the unit direction across the
 * grooves in the surface's tangent plane: the normal n from the height's central difference, the groove G from the
 * direction image laid into that plane (G - n (G.n), normalised), and X = n x G, n and G first turned by `turn` (the
 * card turned under a fixed eye and light). u is binned by `bin.u`. Written here
 * from the equation and the frame's own geometry, never from the engine's grating code: a bug in the engine must not
 * also live in its judge. Self-contained (no imports): the law runs its source in the page.
 */
export declare function foilTexels(grid: {
    height: ArrayLike<number>;
    coverage: ArrayLike<number>;
    ink: ArrayLike<number>;
    slot: ArrayLike<number>;
    dir?: ArrayLike<ArrayLike<number>>;
    w: number;
    h: number;
}, slots: number[], full: number, bin: {
    groove: number;
    share: number;
    normal: number;
    u: number;
}, light?: {
    l: number[];
    turn?: number[][];
}): {
    id: number[];
    groups: {
        groove: number;
        share: number;
        normal: [number, number];
    }[];
    uid?: number[];
    ugroups?: {
        groove: number;
        share: number;
        u: number;
    }[];
    w: number;
    h: number;
};
/**
 * Each frame pixel's foil group (-1: not foil), frame pixels mapped to sheet texels as the highlight law maps them.
 * `ids` is the per-texel group list to map (`t.id` unless given: `t.uid` for (b)).
 */
export declare function pixelGroups(t: FoilTexels, fw: number, fh: number, ids?: ArrayLike<number>): Int32Array;
/**
 * Per texel, 1 where two reads of the sheet (`__paint.sheetRegion`, same region, `w` x `h`, rows top down) agree
 * exactly in height, coverage, slot, ink, direction and param (a film's thickness) at that texel and at every texel within `reach` of it (a
 * square), else 0: the surface held there between them. The neighbours count because a pixel's colour reads them: the
 * shade pass's normal is a central difference over +-1 texel (+-3 on the 8-bit sheet) and the sheet is sampled
 * bilinearly, so a texel whose own height held by chance while the ground around it moved still turns. A still field
 * draws the same values again, so exact equality; a drifting one changes them. Self-contained (no imports): the law
 * runs its source in the page.
 */
export declare function sheetHeld(a: {
    height: ArrayLike<number>;
    coverage: ArrayLike<number>;
    slot: ArrayLike<number>;
    ink: ArrayLike<number>;
    dir?: ArrayLike<ArrayLike<number>>;
    param?: ArrayLike<number>;
}, b: {
    height: ArrayLike<number>;
    coverage: ArrayLike<number>;
    slot: ArrayLike<number>;
    ink: ArrayLike<number>;
    dir?: ArrayLike<ArrayLike<number>>;
    param?: ArrayLike<number>;
}, w: number, h: number, reach: number): number[];
/** Texels around a foil texel that must hold for (c): the 8-bit sheet's normal stencil, +-3 (shade.ts K), covers the float sheet's +-1 and the bilinear sample. */
export declare const HELD_REACH = 3;
/** The difference in degrees of two groove directions, which are lines (0 and 180 are one direction): 0..90. */
export declare const grooveApart: (a: number, b: number) => number;
/**
 * One group's colour on a frame: its pixel count, its mean OKLab colour, and `spread`, the larger chroma distance
 * (`chromaDistance`) between its halves' mean colours, split once at the group's median column and once at its median row (null when a
 * half would hold under a quarter of `GROOVE_MIN_PX`). Region means, so the zero-mean grain does not decide it.
 */
export type GroupColour = {
    n: number;
    mean: Vec3;
    spread: number | null;
};
export declare function groupColours(f: Rgba, ids: Int32Array, count: number): GroupColour[];
/** (b): the group that differs most within itself, of the groups of at least `GROOVE_MIN_PX` pixels; null when none can be read. */
export declare function grooveMatch(colours: GroupColour[]): {
    spread: number;
    group: number;
} | null;
/**
 * (d): the largest grooved group (share above 0) of at least `GROOVE_MIN_PX` pixels, and the largest grooved group of
 * that size with the same normal and groove share whose groove direction is at least `GROOVE_APART` degrees from it,
 * so only the groove differs between them; the chroma distance (`chromaDistance`) of their mean colours. Null when no such pair exists.
 */
export declare function grooveApartPair(groups: FoilGroup[], colours: GroupColour[]): {
    dist: number;
    first: number;
    second: number;
    angle: number;
} | null;
/**
 * (e)'s span in u: two grating bins of one groove region must be at least this far apart to be compared. Task 14 fix
 * round 3: at the narrowest spacing the spec allows (1.0 um, materials.foil FOIL_SPACING) the first order moves
 * 1000 x 0.02 = 20 nm, four steps of the CIE 1931 table (5 nm): a shift a grating's colour shows.
 */
export declare const U_SPAN = 0.02;
/**
 * (e): in each groove region (groove bin and share above 0), the most-populated grating bin of at least
 * `GROOVE_MIN_PX` pixels, and the most-populated such bin at least `U_SPAN` from it in u; the chroma distance of their
 * mean colours. The smallest over the regions that have such a pair decides; null when no region spans `U_SPAN`
 * (a flat foil under a directional key has one u per groove, so there is nothing to compare).
 */
export declare function uSpread(ugroups: FoilUGroup[], colours: GroupColour[]): {
    dist: number;
    du: number;
    groove: number;
} | null;
/**
 * The iridescence law's reading: `foil` foil pixels on the frame; (a) `light`, the mean over the foil pixels of each
 * pixel's chroma distance between the key's test positions (`pointChromaShift`), and `tilt`, the same between tilt
 * [0, 0] and [max / 2, 0] (null on a page that does not tilt: no `tilt` option, or `max` 0); (c) `time`, the mean
 * absolute 8-bit difference (0..1) between t and t + 1 of the foil pixels whose texel did not change (null when none is
 * left: the surface moves with the clock), and `still`, their share of the foil pixels; (b) `match`, the largest
 * half-to-half spread in one group of groove, share and u (null when no group can be read); (d) `apart`, the distance
 * between the two largest groups whose grooves are apart (null when there is no such pair); (e) `spread`, the chroma
 * distance of two grating bins of one groove `U_SPAN` or more apart (null when no groove spans that: not read).
 */
export type IridescenceReading = {
    foil: number;
    light: number;
    tilt: number | null;
    time: number | null;
    still: number;
    match: {
        spread: number;
        groove: number;
        u: number;
        n: number;
    } | null;
    apart: {
        dist: number;
        grooves: [number, number];
        angle: number;
    } | null;
    spread: {
        dist: number;
        du: number;
        groove: number;
    } | null;
};
/** The limits of the iridescence law's verdict, one per condition's threshold (header, iridescence). */
export type IridescenceLimits = {
    shift: number;
    match: number;
    apart: number;
    band: number;
    spread: number;
};
/** The line (e) gives when no groove spans `U_SPAN` in u: not read, the verdict comes from (a) to (d). */
export declare const E_NOT_READ = "(e) not read: no groove spans 0.02 in u";
/**
 * The iridescence law's verdict (header, iridescence): (a) to (e) on the reading. A fail line lists only the
 * conditions that fail, each with its reading; (e) unread is said in a pass or partial line and decides nothing.
 */
export declare function iridescenceVerdict(r: IridescenceReading, lim: IridescenceLimits, mover?: string): LawResult;
/**
 * The rotation that turns the surface for a tilt [a, b] in degrees, as REFERENCE.md documents the tilt (Task 16): b
 * about the horizontal axis (the top goes away), then a about the vertical one (the right side goes away), so the flat
 * card's normal +z turns to (sin a cos b, sin b, cos a cos b); the eye stays at +z. Rows of the 3 x 3 matrix, in the
 * sheet's frame (x right, y up, z toward the viewer). Written here from that contract, not imported from the engine.
 */
export declare function turnOfTilt([a, b]: [number, number]): number[][];
/**
 * The film branch of the iridescence law (Phase 2 Task 18, task-18-law-design.md). A film's colour is set by its
 * optical path difference (OPD), so the law bins the film by OPD and reads the highlight alone. Every number here is
 * geometry, a citation or a builder value named as one. The limits are `FilmLimits`: this file holds none of their
 * values.
 */
/** OPD per bin, nm: 5 nm of first-order bright wavelength at phase 0, one step of the CIE 1931 table. */
export declare const FILM_OPD_BIN = 5;
/** Degrees position B turns the key from position A in the x-z plane. Builder: it sets no limit, as (e) is a ratio. */
export declare const FILM_KEY_TURN = 30;
/**
 * The dimmest mean highlight a bin or a half is read at, linear light. Builder: under it, rounding decides the tint.
 */
export declare const FILM_SPEC_MIN: number;
/** (d)'s distance along the ramp, nm of OPD: half a wave at 550 nm, the research file's coating example. Builder. */
export declare const FILM_APART = 275;
/** (d) reads a slot whose OPD spans at least this, nm: four bins. */
export declare const FILM_MIN_SPAN = 20;
/** The line (e) gives when it is not read: the verdict then comes from (a) to (d). */
export declare const FILM_E_NOT_READ = "(e) not read: the key's turn moves the film along its own ramp too little to tell from the page's own noise";
/**
 * The film's optical path difference in nm, at thickness `d` nm and index `ior` under a key at direction `l` (outside
 * index 1): OPD = 2 ior d cos(theta_t). The eye is at +z and a rough film shows the facets whose normal is the half
 * vector, so cos^2(theta_i) = (v.h)^2 = (1 + l.z) / 2 for a unit l, and Snell's law gives theta_t. Only the key's angle
 * off the eye enters. Written from the equation, never from the engine's film code.
 */
export declare function filmOpd(d: number, ior: number, l: readonly number[]): number;
/** The film texels of the sheet: `k` each texel's index (rows top down), its `slot`, `param` and n.v at tilt [0, 0]. */
export type FilmTexels = {
    k: number[];
    slot: number[];
    param: number[];
    nv: number[];
    w: number;
    h: number;
};
/**
 * The iridescence law's film texels: a texel is film when its slot is in `slots`, its coverage is at least `full` and
 * it holds no ink (foil's rule). The normal comes from the height's central difference in short-side units, as
 * `foilTexels`. Self-contained (no imports): the law runs its source in the page.
 */
export declare function filmTexels(grid: {
    height: ArrayLike<number>;
    coverage: ArrayLike<number>;
    ink: ArrayLike<number>;
    slot: ArrayLike<number>;
    param: ArrayLike<number>;
    w: number;
    h: number;
}, slots: number[], full: number): {
    k: number[];
    slot: number[];
    param: number[];
    nv: number[];
    w: number;
    h: number;
};
/**
 * The key's two positions: A the declared direction (unit), B that direction rotated `turn` degrees in the x-z plane,
 * toward the side of its x (+x when x is 0), or back toward the eye when the key is over 45 degrees off it.
 */
export declare function filmKeyTurn(dir: readonly number[], turn?: number): {
    a: Vec3;
    b: Vec3;
};
/**
 * The tint of a linear colour: (a / L, b / L) in OKLab. OKLab is a cube root, so a scale moves L, a and b alike and the
 * tint holds: the lobe's brightness across a bin does not read as colour.
 */
export declare function filmTint(c: readonly number[]): [number, number];
/**
 * One 8-bit tint step of a bin: the largest tint change that one encoded level on one channel of the on-frame makes on
 * the bin's mean highlight `h`. `on` is the bin's mean on-frame colour, linear.
 */
export declare function filmTintStep(h: readonly number[], on: readonly number[]): number;
/**
 * The frames the film's bins read: the key's specular on and off, at positions A and B, in one light and one detail.
 */
export type FilmFrames = {
    onA: Rgba;
    offA: Rgba;
    onB: Rgba;
    offB: Rgba;
};
/**
 * The film's frame pixels, parallel lists: pixel index, slot, `param` (the film's thickness, 0 to 1), OPD at
 * positions A and B, and n.v.
 */
export type FilmPixels = {
    px: ArrayLike<number>;
    slot: ArrayLike<number>;
    param: ArrayLike<number>;
    opdA: ArrayLike<number>;
    opdB: ArrayLike<number>;
    nv: ArrayLike<number>;
};
/** A bin at one key position: its mean highlight, mean on-frame colour (both linear), readable pixels and luminance. */
export type FilmPlace = {
    h: Vec3;
    on: Vec3;
    n: number;
    lum: number;
};
/** One half of a bin's split at A: its mean OPD at A (a mean over its pixels) and the tint of its mean highlight. */
export type FilmHalf = {
    opd: number;
    tint: readonly number[];
};
/** A bin's halves at A by each split (null when a half cannot be read). */
export type FilmSplits = {
    column: readonly [FilmHalf, FilmHalf] | null;
    row: readonly [FilmHalf, FilmHalf] | null;
    nv: readonly [FilmHalf, FilmHalf] | null;
};
/**
 * One OPD bin: its slot, mean OPD at A (`opd`) and at B (`opdB`), the pixels readable at A (`n`), whether it counts at
 * each position, its tint at A, and its halves at A by column, row and n.v, which (b) reads.
 */
export type FilmBin = {
    slot: number;
    opd: number;
    opdB: number;
    n: number;
    counted: boolean;
    countedB: boolean;
    a: FilmPlace;
    b: FilmPlace;
    tint: readonly number[];
    splits: FilmSplits;
};
/**
 * The film's bins, by slot and round(OPD at A / `FILM_OPD_BIN`), sorted by slot and OPD: what (b), (d) and (e) read.
 * A pixel over the knee at A is left out of its bin. A bin counts at a position as `filmCounts`. Each bin at A is
 * split at its median column, its median row (as `groupColours`) and its median n.v; a half reads with a quarter of
 * `GROOVE_MIN_PX` pixels and a mean highlight of at least `FILM_SPEC_MIN`, and keeps its own mean OPD at A.
 */
export declare function filmBins(f: FilmFrames, pix: FilmPixels): FilmBin[];
/** What (b) reads of a bin: its slot, mean OPD at A, readable pixels, whether it counts, its tint and its halves. */
export type FilmMatchBin = Pick<FilmBin, "slot" | "opd" | "n" | "counted" | "tint" | "splits">;
/**
 * (b)'s curve for a counted bin: the parabola, per tint component, through the mean OPD and tint of three neighbouring
 * counted bins of its slot, itself included. Neighbours are bins one apart in round(OPD / `FILM_OPD_BIN`), (e)'s test,
 * so no curve spans a gap of uncounted bins. It takes the bin and both its neighbours when both count, else the bin and
 * the two next to it on the one side that has them. Null when neither holds: that bin is not read. A parabola, not a
 * one-sided straight slope: beside a gap the secant is off by the ramp's curvature (task-18e-design-review.md, B1).
 */
export declare function filmCurve(ramp: readonly FilmMatchBin[], bin: FilmMatchBin): ((o: number) => [number, number]) | null;
/**
 * (b)'s reading: the worst split of the worst bin read, with that bin's slot, mean OPD at A and pixels. `spread` is
 * the halves' tint difference less what the bin's curve gives for their OPD difference; `raw` is that difference
 * uncorrected.
 */
export type FilmMatch = {
    spread: number;
    raw: number;
    split: "column" | "row" | "nv";
    slot: number;
    opd: number;
    n: number;
};
/**
 * (b): equal thickness and equal angle give equal colour. For each split of each counted bin with a curve
 * (`filmCurve`): | (tint(h1) - tint(h2)) - (f(OPD(h1)) - f(OPD(h2))) |, the part of the halves' colour difference
 * that their thickness difference does not explain. The worst decides. Null when no bin with a curve has two readable
 * halves.
 */
export declare function filmMatch(bins: readonly FilmMatchBin[]): FilmMatch | null;
/**
 * (d): the mean tint distance at A from each counted bin to the bin of its slot nearest D nm further along in OPD,
 * with D = min(`FILM_APART`, half the slot's OPD span). A mean, as interference colours repeat and one pair may match
 * by chance. A bin whose target lies past the ramp's end has no pair. Null when no slot spans `FILM_MIN_SPAN` or no
 * pair exists.
 */
export declare function filmApart(bins: FilmBin[]): {
    dist: number;
    pairs: number;
    span: number;
    d: number;
} | null;
/** One bin of (e)'s ratio: its OPD at A and B, its tint at A, and its tint at B (null: a ramp node only). */
export type FilmRampBin = {
    opd: number;
    opdB: number;
    tintA: readonly number[];
    tintB: readonly number[] | null;
};
/**
 * (e)'s ratio on one slot's ramp. Turning the key acts as a move along the thickness ramp: for each bin read at B, o'
 * is its OPD at B and tint_A(o') position A's tint there, interpolated along the ramp. Only bins whose o' lies inside
 * the ramp, between two neighbouring counted bins, are read: colour across a gap of uncounted bins was never
 * measured, so a bin whose o' falls in a gap is left out. ratio = sum |tint_B(bin) - tint_A(o')| / sum |tint_A(bin) -
 * tint_A(o')|: near 0 for an honest film, 1 for a film that ignores the angle. `denom` is the denominator as a mean
 * per bin read. Null when no bin is read.
 */
export declare function filmSpreadRatio(bins: FilmRampBin[]): {
    ratio: number;
    denom: number;
    bins: number;
} | null;
/**
 * (e) over the film's slots. `noise` is the page's own (b) reading: two halves of one bin differ by that much with nothing
 * moved, so a ratio's numerator can reach it by noise alone. `read` when `noise` over the slot's denominator is under the
 * limit, so noise alone cannot reach the limit. `step` is one 8-bit tint step, kept for the gap rule: it decides nothing.
 */
export type FilmSpread = {
    ratio: number;
    denom: number;
    step: number;
    noise: number | null;
    bins: number;
    slot: number;
    read: boolean;
};
/**
 * (e): the largest ratio over the slots that are read; with none read, the slot nearest to being read, marked unread.
 * `noise` is null when the page has no (b) reading, and then no slot is read. `limit` is `relight.filmSpread`.
 */
export declare function filmSpread(bins: FilmBin[], step: number, noise: number | null, limit: number): FilmSpread | null;
/** One 8-bit tint step of the frames: `a` over the bins counted at A, `ab` over those counted at A or at B. */
export declare function filmSteps(bins: FilmBin[]): {
    a: number;
    ab: number;
};
/**
 * The film branch's reading: `film` film pixels on the frame and `turn` the key's turn in degrees; (a) `key`, the mean
 * over the film pixels of each pixel's chroma change between positions A and B, and `tilt`, the same between tilt [0, 0]
 * and [max / 2, 0] (null on a page that does not tilt); (b) `match`; (c) `time` (null: no film pixel held still) and
 * `still`, the share that held; (d) `apart`; (e) `spread` (null: no bin qualifies); `bins`, the bins counted at A and at
 * B; `step`, one 8-bit tint step at A.
 */
export type FilmReading = {
    film: number;
    turn: number;
    key: number;
    tilt: number | null;
    time: number | null;
    still: number;
    match: FilmMatch | null;
    apart: {
        dist: number;
        pairs: number;
        span: number;
        d: number;
    } | null;
    spread: FilmSpread | null;
    bins: {
        a: number;
        b: number;
    };
    step: number;
};
/** The limits of the film's verdict, one per condition. */
export type FilmLimits = {
    shift: number;
    match: number;
    band: number;
    apart: number;
    spread: number;
};
/** The film's limits from src/checks/thresholds.json, through the caller's threshold reader. */
export declare function filmLimits(th: (name: string) => number): FilmLimits;
/**
 * The film's verdict on (a) to (e). A fail line lists only the conditions that fail, each with its reading. (e) unread
 * decides nothing, and every line says it. `lim` is the caller's: this function holds no limit.
 */
export declare function filmVerdict(r: FilmReading, lim: FilmLimits, mover?: string): LawResult;
/**
 * The law's result on a page's foil and film. A page with one of them keeps that result exactly. With both, the worse
 * status (fail, partial, pass), each part's text after `foil:` or `film:`, and both parts' readings.
 */
export declare function iridescenceJoin(foil: LawResult | null, film: LawResult | null): LawResult;
/**
 * The film branch's reading on one page in one scheme. `limit` is the (e) limit its read floor uses: by default
 * `relight.filmSpread`, and Infinity to print (e) on every page with no limit in use (scripts/film-readings.mjs).
 */
export declare function filmSchemeReading(target: Target, opts: CheckOpts, scheme: Scheme, turn?: number, limit?: number): Promise<FilmReading>;
/** Pixels each burn reading needs (scorch pixels, near and beyond the front): GROOVE_MIN_PX's floor, about a 20 x 20 px patch. */
export declare const BURN_MIN_PX = 400;
/** The tint law's inner and outer fractions of a light's reach: near is within 0.6 x, beyond is past 1.2 x. */
export declare const EMBER_NEAR = 0.6;
export declare const EMBER_BEYOND = 1.2;
/**
 * The fade's two bands, as fractions of reach: the inner quarter [0, 0.25) and the outer quarter [0.75, 1). A light that
 * falls to 0 at reach differs most there (the ember's (1 - k^2)^2 is 0.97 at k 0.125 and 0.055 at k 0.875); a glow
 * flat to reach reads about 1 whatever the knee does. Chosen before any reading (Task 21 fix round 1, I2).
 */
export declare const EMBER_FADE_INNER = 0.25;
export declare const EMBER_FADE_OUTER = 0.75;
/** The burn law's five frozen times: across the bar's `alive` window, else t 1 to 5. */
export declare function burnTimes(alive?: {
    t0: number;
    t1: number;
} | {
    rests: string;
}): number[];
/** Share of the sheet grid where the paper is gone: coverage under a half, the blend's own cut. */
export declare const burnedShare: (coverage: ArrayLike<number>) => number;
/** The sheet at full resolution as one code per texel: -1 where coverage is under `full`, else the param (to 1e-4). */
export type BurnTexels = {
    w: number;
    h: number;
    code: number[];
};
/** Runs in the page (stringified): the sheet region's codes. Self-contained. */
export declare function burnTexels(g: {
    w: number;
    h: number;
    coverage: ArrayLike<number>;
    param: ArrayLike<number>;
}, full: number): BurnTexels;
/** One frozen time: the sheet's codes and the frame with the ember as declared (`on`, null with no ember) and at level 0. */
export type BurnFrame = {
    t: number;
    tex: BurnTexels;
    on: Rgba | null;
    off: Rgba;
};
export type ScorchReading = {
    drop: number;
    n: number;
};
/**
 * (c)'s reading: mean warmth within EMBER_NEAR x reach (`near` px); mean change beyond EMBER_BEYOND x reach (`beyond`
 * px); the mean added relative luminance in the inner and outer quarters of reach, and `fade`, outer over inner (null
 * when either quarter is empty or the inner one gains no light).
 */
export type EmberReading = {
    warmth: number;
    near: number;
    diff: number;
    beyond: number;
    inner: number;
    innerN: number;
    outer: number;
    outerN: number;
    fade: number | null;
};
export type BurnReading = {
    times: number[];
    shares: number[];
    scorch: ScorchReading;
    ember: EmberReading | {
        why: string;
    };
};
export type BurnLimits = {
    jitter: number;
    scorch: number;
    band: number;
    fade: number;
};
/** The largest drop of the burned share between neighbouring times (0 when it never drops). */
export declare function shareDrop(shares: readonly number[]): number;
/**
 * Per texel, the Euclidean distance in short-side units to the nearest texel the burn has reached (code above 0: param
 * above 0 at full coverage); 0 on those texels, Infinity everywhere when the burn has reached none. The exact
 * squared distance transform of Felzenszwalb and Huttenlocher (2012), by columns then rows.
 */
export declare function frontDistance(code: ArrayLike<number>, w: number, h: number): Float64Array;
/** (b): the mean drop of relative luminance of the same pixels, from param 0 at one time to param in (0, 0.5) at the next. */
export declare function scorchReading(frames: readonly BurnFrame[]): ScorchReading;
/** (c): warmth near the front, change beyond it and the fade of the added light out to reach, ahead of the front only. */
export declare function emberReading(frames: readonly BurnFrame[], ab: [number, number], reach: number): EmberReading;
/** The burn law's verdict: (a), (b) and (c), each named in the line; a fail outranks a partial. */
export declare function burnVerdict(r: BurnReading, lim: BurnLimits): LawResult;
/** The burn law's reading on one page in one scheme, with no limit in use (the gap rule's readings). */
export declare function burnSchemeReading(target: Target, opts: CheckOpts, scheme: Scheme): Promise<BurnReading>;
/**
 * relight in one colour scheme: every declared law on the page opened in `scheme`. `noHook` when it has no hook.
 * `only` reads just those laws instead (a page test of one law); the gate never passes it.
 */
export declare function checkScheme(target: Target, opts: CheckOpts, scheme: Scheme, only?: readonly Law[]): Promise<SchemePart & {
    noHook?: true;
}>;
export declare const check: Check;
export {};
