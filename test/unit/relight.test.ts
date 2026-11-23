// The relight check's pure helpers. The highlight law's centroid helper is proven here; test/pages/cloth.test.ts
// covers the law end to end.
import { describe, expect, it } from "vitest";
import { joinSchemes } from "../../src/checks/types.ts";
import { brightCentroid, brightMask, chromaDistance, E_NOT_READ, foilTexels, pointChromaShift, GRATING_U_BIN, sheetHeld, U_SPAN, uSpread, turnOfTilt, GROOVE_APART, GROOVE_BIN, GROOVE_MIN_PX, GROOVE_SHARE_BIN, grooveApart, grooveApartPair, grooveMatch, groupColours, iridescenceVerdict, NORMAL_BIN, type IridescenceReading, shadowMask, shadowOracle, shadowVerdict, causticAlone, causticVerdict, falloffPlan, kneeBiases, OUTSIDE_AZIMUTHS, poolSlot, highlightVerdict, hueDistance, lineWidth, MIN_TILES, rampAt, reliefChange, reliefVerdict, slope, specularCentroid, tileFaces, tileSpread, TILE_WHITE, transmitGrounds, transmitVerdict, type HighlightReading, type TileFace, type TileMoment, type TransmitMove } from "../../src/checks/relight.ts";

/** relight.tileSpread's value. */
const SPREAD = 0.07;
/** Grey tile faces (white face = luma face) at luma `v`. */
const grey = (v: number[]): TileFace[] => v.map((x) => ({ luma: x, white: x }));
/** (d) read at t = 2 only. */
const at2 = (faces: TileFace[]): TileMoment[] => [{ t: 2, faces }];
/** Tile faces that meet (d): one blown to white, the lower quartile 0.8 (five tiles, MIN_TILES). */
const VARIED = at2(grey([1, 0.8, 0.8, 0.85, 0.9]));
import { threshold } from "../../src/checks/threshold.ts";
import { meanOklab, srgbToOklab } from "../../src/checks/image.ts";
import { lampRingPoint, lampSheetPoint, pageToSheet, sheetToPage } from "../../src/engine/lights/lamp.ts";
import { assertOneShadow, SHADOW_MARCH } from "../../src/engine/shade.ts";
import type { Vec3 } from "../../src/engine/palette.ts";
import {
  FILM_E_NOT_READ,
  FILM_KEY_TURN,
  FILM_OPD_BIN,
  FILM_SPEC_MIN,
  filmApart,
  filmBins,
  filmKeyTurn,
  filmLimits,
  filmMatch,
  filmOpd,
  filmSpread,
  filmSpreadRatio,
  filmSteps,
  filmTexels,
  filmTint,
  filmTintStep,
  filmVerdict,
  iridescenceJoin,
  type FilmBin,
  type FilmLimits,
  type FilmPixels,
  type FilmReading,
} from "../../src/checks/relight.ts";

describe("relight helpers", () => {
  it("specularCentroid weighs the on-minus-off difference and ignores what both frames share", () => {
    const w = 100;
    const h = 50;
    const frame = (fill: number, spots: [number, number, number][]) => {
      const data = new Uint8ClampedArray(w * h * 4).fill(fill);
      for (const [x, y, v] of spots) data.fill(v, (y * w + x) * 4, (y * w + x) * 4 + 3);
      return { w, h, data };
    };
    // Diffuse shading (a bright pixel at 90, 10) is in both frames and cancels; the highlight is two pixels, one
    // weighted about three times the other in linear light.
    const off = frame(60, [[90, 10, 250]]);
    const on = frame(60, [[90, 10, 250], [10, 20, 200], [30, 20, 120]]);
    const c = specularCentroid(on, off)!;
    expect(c[1]).toBe(20.5);
    expect(c[0]).toBeGreaterThan(10.5);
    expect(c[0]).toBeLessThan(20.5);
    // A painted highlight is the same in both frames: no highlight at all.
    expect(specularCentroid(off, off)).toBeNull();
  });

  it("brightCentroid takes the brightest share, ties included", () => {
    const lum = new Float32Array(100).fill(0.2);
    lum[3 * 10 + 7] = 0.9;
    expect(brightCentroid(lum, 10, 10)).toEqual([7.5, 3.5]);
  });

  it("brightCentroid reads only the kept pixels, and its share is of them (a brighter bare ground is not read)", () => {
    // A 10 x 10 frame: the left half is bare ground at 0.95 (not kept), the right half a surface at 0.2 with one
    // highlight pixel at (8, 6). The whole frame's brightest 1% is a ground tie at the left half's centre.
    const lum = new Float32Array(100).fill(0.2);
    for (let y = 0; y < 10; y++) for (let x = 0; x < 5; x++) lum[y * 10 + x] = 0.95;
    lum[6 * 10 + 8] = 0.6;
    expect(brightCentroid(lum, 10, 10)).toEqual([2.5, 5]);
    const surface = (p: number) => p % 10 >= 5;
    // 1% of the 50 kept pixels is one pixel: the highlight.
    expect(brightCentroid(lum, 10, 10, 0.01, surface)).toEqual([8.5, 6.5]);
    expect(brightCentroid(lum, 10, 10, 0.01, () => false)).toBeNull();
  });

  // The highlight law's verdict on readings made up here: the key moves right on screen (x +1), so a centroid that
  // moves right by d px shifts d along it. Thresholds 3 (specular) and 6 (brightest 1%) here; thresholds.json holds 9
  // for the brightest 1% since Phase 2 Task 3 fix round 1 (the per-slot cases below read it).
  describe("highlightVerdict", () => {
    const moved = (d: number): [[number, number], [number, number]] => [[100, 50], [100 + d, 50]];
    // One declaring material whose own specular and brightest 1% move with the whole frame's.
    const slot = (spec: number, bright: number, k = 1, name = `sheen (slot ${k})`) => ({ name, slot: k, specular: moved(spec), bright: moved(bright) });
    const reading = (o: Partial<HighlightReading> = {}): HighlightReading => ({
      specular: moved(10),
      bright: moved(10),
      dir: [[0, 0.5, 0.8], [1, 0.5, 0.8]],
      read: 5760,
      dull: [],
      offFrame: [],
      slots: [slot(10, (o.bright?.[1]?.[0] ?? 110) - (o.bright?.[0]?.[0] ?? 100))],
      ...o,
    });
    const passOf = { "highlight.shift": 10, "highlight.read": 5760, "highlight.shift.slot1": 10, "highlight.brightShift.slot1": 10, "highlight.brightShift.frame": 10, "highlight.brightShift": 10, "highlight.brightSlot": 1 };
    it("passes when both conditions move with the light", () => {
      const r = highlightVerdict(reading(), 3, 6);
      expect(r.status).toBe("pass");
      expect(r.measured).toEqual(passOf);
    });
    it("fails a real gloss that moves beside a painted highlight that stays (brightest 1% only)", () => {
      const r = highlightVerdict(reading({ bright: moved(1) }), 3, 6);
      expect(r.status).toBe("fail");
      expect(r.line).toBe("highlight FAIL (the brightest 1% of sheen (slot 1) moves 1.0 px along the light's motion, under 6, while its own specular highlight moves 10.0 px: its brightest part stays put, as a highlight painted into the colour does)");
    });
    // Per material slot (Phase 2 Task 3): (b) is judged in the declaring slot whose own specular highlight moves
    // farthest, not on the whole frame. Readings from scripts/measure.mjs (dist of this task), at thresholds.json's value.
    const bright = threshold("relight.brightShift", null);
    it("passes bar 02 dark seed 3, whose whole frame's brightest 1% moves 11.1 px, by its sheen slot", () => {
      const r = highlightVerdict(
        reading({ specular: moved(6.49), bright: moved(11.13), read: 334836, slots: [slot(20.22, 32.79, 0, "denim (slot 0)"), slot(135.5, 354.8, 1), slot(47.63, 64.36, 2, "denim (slot 2)")] }),
        3,
        bright,
      );
      expect(r.status, r.line).toBe("pass");
      expect(r.measured["highlight.brightSlot"]).toBe(1);
      expect(r.measured["highlight.brightShift"]).toBeCloseTo(354.8, 6);
      expect(r.measured["highlight.brightShift.frame"]).toBeCloseTo(11.13, 6);
    });
    it("passes cloth.html seed 3 (whole frame 12.87 px) by its sheen, not its directionless denim", () => {
      const r = highlightVerdict(reading({ specular: moved(7.55), bright: moved(12.87), slots: [slot(-3.236, -13.14, 0, "denim (slot 0)"), slot(19.83, 24.32, 1)] }), 3, bright);
      expect(r.status, r.line).toBe("pass");
      expect(r.measured["highlight.brightSlot"]).toBe(1);
    });
    it("fails the painted streak at a seed whose whole frame passed the old 6 (seed 2: 6.46 px; its sheen -2.6 px)", () => {
      const r = highlightVerdict(reading({ specular: moved(10.72), bright: moved(6.463), slots: [slot(10.11, 5.885, 0, "denim (slot 0)"), slot(18.5, -2.627, 1)] }), 3, bright);
      expect(r.status).toBe("fail");
      expect(r.line).toMatch(/^highlight FAIL \(the brightest 1% of sheen \(slot 1\) moves -2\.6 px along the light's motion, under 9, while its own specular highlight moves 18\.5 px/);
    });
    it("fails a streak the whole frame would pass: the frame's brightest 1% moves 10 px, the judged slot's 5 px", () => {
      // Made-up readings, between the two rules: a whole-frame (b) at 9 passes this page, the slot rule fails it.
      const r = highlightVerdict(reading({ specular: moved(10), bright: moved(10), slots: [slot(4, 30, 0, "denim (slot 0)"), slot(20, 5, 1)] }), 3, bright);
      expect(r.measured["highlight.brightShift.frame"]).toBeGreaterThanOrEqual(bright);
      expect(r.status).toBe("fail");
      expect(r.measured["highlight.brightSlot"]).toBe(1);
      expect(r.line).toMatch(/the brightest 1% of sheen \(slot 1\) moves 5\.0 px along the light's motion, under 9/);
    });
    it("is partial when no declaring slot reads both a specular and a brightest-1% shift", () => {
      const r = highlightVerdict(reading({ slots: [{ name: "sheen (slot 1)", slot: 1, specular: moved(10), bright: [null, null] }] }), 3, bright);
      expect(r.status).toBe("partial");
      expect(r.line).toMatch(/^highlight PARTIAL \(no material that declares the highlight law has fully covered pixels and its own specular highlight/);
      expect(r.measured["highlight.brightShift"]).toBeUndefined();
    });
    it("fails a real specular term that does not move (specular shift only)", () => {
      const r = highlightVerdict(reading({ specular: moved(0.5) }), 3, 6);
      expect(r.line).toBe("highlight FAIL (the specular highlight's centroid moves 0.5 px along the light's motion, under 3)");
    });
    it("fails a frame with no specular term, and does not also list each material as dull", () => {
      const r = highlightVerdict(reading({ specular: [null, null], dull: ["sheen (slot 1)"] }), 3, 6);
      expect(r.line).toBe("highlight FAIL (the key puts no specular highlight on the frame at either test position: the frames with its specular term on and off are the same)");
    });
    it("fails a highlight that moves away from the light, in either condition (a Math.abs shift would pass it)", () => {
      const away = highlightVerdict(reading({ specular: moved(-10) }), 3, 6);
      expect(away.status).toBe("fail");
      expect(away.measured["highlight.shift"]).toBe(-10);
      expect(away.line).toMatch(/the specular highlight's centroid moves -10\.0 px along the light's motion, under 3/);
      const brightAway = highlightVerdict(reading({ bright: moved(-10) }), 3, 6);
      expect(brightAway.status).toBe("fail");
      expect(brightAway.measured["highlight.brightShift"]).toBe(-10);
      expect(brightAway.measured["highlight.brightShift.frame"]).toBe(-10);
    });
    it("reads a light moving up (direction y up) as a move up the screen (screen y runs down)", () => {
      const up: [number[], number[]] = [[0, 0, 0.8], [0, 1, 0.8]];
      const toward: [[number, number], [number, number]] = [[100, 50], [100, 40]];
      const away: [[number, number], [number, number]] = [[100, 50], [100, 60]];
      const sl = (c: [[number, number], [number, number]]) => [{ name: "sheen (slot 1)", slot: 1, specular: c, bright: c }];
      const ok = highlightVerdict(reading({ dir: up, specular: toward, bright: toward, slots: sl(toward) }), 3, 6);
      expect(ok.status).toBe("pass");
      expect(ok.measured).toEqual(passOf);
      expect(highlightVerdict(reading({ dir: up, specular: away, bright: away, slots: sl(away) }), 3, 6).status).toBe("fail");
    });
    it("is partial, not failed, for a declaring material with no pixels on the frame", () => {
      const r = highlightVerdict(reading({ offFrame: ["sheen (slot 1)"] }), 3, 6);
      expect(r.status).toBe("partial");
      expect(r.line).toMatch(/^highlight PARTIAL \(sheen \(slot 1\) declares the highlight law but has no pixels on the frame/);
      // A failing condition still fails: partial is only for what cannot be read.
      expect(highlightVerdict(reading({ offFrame: ["sheen (slot 1)"], bright: moved(0) }), 3, 6).status).toBe("fail");
    });
    it("is partial, not failed, when no pixel on the frame is fully covered (the brightest 1% cannot be read)", () => {
      const none = [{ name: "sheen (slot 1)", slot: 1, specular: moved(10), bright: [null, null] as HighlightReading["bright"] }];
      const r = highlightVerdict(reading({ bright: [null, null], read: 0, slots: none }), 3, 6);
      expect(r.status).toBe("partial");
      expect(r.line).toMatch(/^highlight PARTIAL \(no material that declares the highlight law has fully covered pixels/);
      expect(r.measured["highlight.brightShift"]).toBeUndefined();
      expect(highlightVerdict(reading({ bright: [null, null], read: 0, specular: moved(0), slots: none }), 3, 6).status).toBe("fail");
    });
  });

  // The falloff span rule per page (Phase 2 Task 3): span >= relight.falloffSpan (4) x the page's own fit rms, the rms
  // of its widest fit. Readings from scripts/measure.mjs (dist of this task), light, seed as named.
  describe("falloffPlan", () => {
    const ratio = threshold("relight.falloffSpan", null);
    it("reads lights.html on its declared cone (span 0.165), which one global span from the noisiest page would open", () => {
      const p = falloffPlan({ span: 0.165, rms: 0.0154 }, { rms: 0.02106 }, ratio);
      expect(p).toEqual({ open: false, noise: 0.02106 });
      expect(0.165).toBeGreaterThanOrEqual(ratio * p.noise);
      // The Phase 1 rule's global span, 4 x the largest honest rms (bar 01's 0.0602), would have opened it.
      expect(0.165).toBeLessThan(4 * 0.0602);
    });
    it("opens an overhead lamp's cone (declared span 0.0217) and resolves it there (span 0.347)", () => {
      const p = falloffPlan({ span: 0.02173, rms: 0.01568 }, { rms: 0.01591 }, ratio);
      expect(p.open).toBe(true);
      expect(0.3466).toBeGreaterThanOrEqual(ratio * p.noise);
    });
    it("judges the noise on the widest fit, not the overhead fault's narrow fit (seed 2: 0.0052 vs 0.0245)", () => {
      // On its own rms the declared cone would resolve (0.0217 >= 4 x 0.0052) and its exponent 1.06 would pass.
      expect(0.02173).toBeGreaterThanOrEqual(ratio * 0.005208);
      expect(falloffPlan({ span: 0.02173, rms: 0.005208 }, { rms: 0.02446 }, ratio).open).toBe(true);
    });
    it("falls back to the declared fit's rms when the widest fit has none, and never opens on no noise reading", () => {
      expect(falloffPlan({ span: 0.165, rms: 0.0154 }, { rms: NaN }, ratio)).toEqual({ open: false, noise: 0.0154 });
      expect(falloffPlan({ span: 0, rms: NaN }, { rms: NaN }, ratio).open).toBe(false);
    });
  });

  it("slope fits a power law on log-log points", () => {
    const d = [0.9, 1.0, 1.1];
    expect(-slope(d.map(Math.log), d.map((v) => Math.log(3 / v ** 2)))).toBeCloseTo(2, 10);
    expect(slope([1, 1], [0, 1])).toBeNaN();
  });

  it("rampAt walks the stops and hueDistance wraps", () => {
    const stops: Vec3[] = [[0, 0, 0], [0.25, 0.25, 0.25], [0.5, 0.5, 0.5], [0.75, 0.75, 0.75], [1, 1, 1]];
    // OKLab mixing round-trips through cube roots, so compare to 1e-6.
    const near = (v: Vec3) => v.map((c) => expect.closeTo(c, 6));
    expect(rampAt(stops, 0.5)).toEqual(near(stops[2]!));
    expect(rampAt(stops, 1)).toEqual(near(stops[4]!));
    expect(hueDistance(350, 10)).toBe(20);
  });

  it("lampSheetPoint lands on the aim and moves outward", () => {
    const lamp = { at: [0.4, 0.1, 0.9] as Vec3, aim: [0.42, 0.45, 0] as Vec3 };
    const aspect = 1.6;
    const [ax, ay] = lampSheetPoint(lamp, aspect)!;
    expect(ax).toBeCloseTo(0.42, 10);
    expect(ay).toBeCloseTo(0.45, 10);
    const L = pageToSheet(lamp.at, aspect);
    const dist = (p: [number, number]) => {
      const P = pageToSheet([p[0], p[1], 0], aspect);
      return Math.hypot(L[0] - P[0], L[1] - P[1], L[2]);
    };
    const ds = [-8, 0, 8].map((k) => dist(lampSheetPoint(lamp, aspect, k)!));
    expect(ds[0]!).toBeLessThan(ds[1]!);
    expect(ds[1]!).toBeLessThan(ds[2]!);
    // Across turns toward screen right when the lamp aims down the page.
    expect(lampSheetPoint(lamp, aspect, 20, true)![0]).toBeGreaterThan(ax);
    expect(sheetToPage(pageToSheet([0.3, 0.7, 0.2], aspect), aspect)).toEqual([0.3, 0.7, 0.2].map((v) => expect.closeTo(v, 10)));
    // A ray turned past the horizon misses the sheet.
    expect(lampSheetPoint(lamp, aspect, 95)).toBeNull();
  });

  // Phase 2 Task 2d: the falloff law's outside probe sweeps the 1.5 x cone ring. Expected, set before measuring: the
  // four quarter turns give exactly the old along / across points, so a page the old probe read keeps its point.
  it("lampRingPoint at azimuth 0 / 90 / 180 / 270 gives exactly the old along and across points", () => {
    const lamps = [
      { at: [0.4, 0.1, 0.9] as Vec3, aim: [0.42, 0.45, 0] as Vec3 }, // lights.html
      { at: [0.5, 0.3, 1.2] as Vec3, aim: [0.5, 0.3, 0] as Vec3 }, // straight above its aim (flat axis)
      { at: [0.62, -0.1, 0.9] as Vec3, aim: [0.6, 0.55, 0] as Vec3 }, // core.html's dark lamp
    ];
    for (const lamp of lamps)
      for (const aspect of [1.6, 393 / 852])
        for (const off of [10, 30, 42, 93]) {
          expect(lampRingPoint(lamp, aspect, off, 0)).toEqual(lampSheetPoint(lamp, aspect, off));
          expect(lampRingPoint(lamp, aspect, off, 180)).toEqual(lampSheetPoint(lamp, aspect, -off));
          expect(lampRingPoint(lamp, aspect, off, 90)).toEqual(lampSheetPoint(lamp, aspect, off, true));
          expect(lampRingPoint(lamp, aspect, off, 270)).toEqual(lampSheetPoint(lamp, aspect, -off, true));
          expect(lampRingPoint(lamp, aspect, off, -90)).toEqual(lampRingPoint(lamp, aspect, off, 270));
        }
    // Between the quarter turns the ring keeps its angle off the aim.
    const lamp = lamps[0]!;
    const L = pageToSheet(lamp.at, 1.6);
    const A = pageToSheet(lamp.aim, 1.6);
    const ax = [A[0] - L[0], A[1] - L[1], A[2] - L[2]];
    for (const az of [15, 135, 250]) {
      const [x, y] = lampRingPoint(lamp, 1.6, 20, az)!;
      const P = pageToSheet([x, y, 0], 1.6);
      const d = [P[0] - L[0], P[1] - L[1], P[2] - L[2]];
      const cos = (d[0]! * ax[0]! + d[1]! * ax[1]! + d[2]! * ax[2]!) / (Math.hypot(...d) * Math.hypot(...ax));
      expect((Math.acos(cos) * 180) / Math.PI).toBeCloseTo(20, 8);
    }
  });

  it("the outside probe tries the old four turns first, in their old order, then the ring every 15 degrees", () => {
    expect(OUTSIDE_AZIMUTHS.slice(0, 4)).toEqual([0, 180, 90, 270]);
    expect(OUTSIDE_AZIMUTHS).toHaveLength(24);
    expect([...OUTSIDE_AZIMUTHS].sort((a, b) => a - b)).toEqual(Array.from({ length: 24 }, (_, k) => k * 15));
  });

  it("core.html's dark lamp at 960 x 600: the old four turns miss the page, the ring crosses it", () => {
    // The check's onPage: more than PATCH + 2 = 9 px inside every edge.
    const [w, h] = [960, 600];
    const on = (p: [number, number] | null) => p !== null && p[0] * w > 9 && p[0] * w < w - 9 && p[1] * h > 9 && p[1] * h < h - 9;
    const lamp = { at: [0.62, -0.1, 0.9] as Vec3, aim: [0.6, 0.55, 0] as Vec3, cone: 28 };
    const off = 1.5 * lamp.cone;
    const old = [false, true].flatMap((across) => [1, -1].map((s) => lampSheetPoint(lamp, w / h, s * off, across)));
    expect(old.filter(on)).toEqual([]);
    const first = OUTSIDE_AZIMUTHS.find((az) => on(lampRingPoint(lamp, w / h, off, az)));
    expect(first).toBe(240);
    const [x, y] = lampRingPoint(lamp, w / h, off, 240)!;
    expect(x).toBeLessThan(0.5); // upper left
    expect(y).toBeLessThan(0.5);
  });

  // The slot rule (Phase 2 Task 2d). Expected, set before measuring: the pool's slot is the slot with the most fully
  // covered texels inside (cone - soft) of the aim; uncovered texels and texels outside the pool do not count.
  it("poolSlot is the slot most of the full-light pool falls on", () => {
    const [w, h] = [160, 100];
    const lamp = { at: [0.5, 0.5, 1] as Vec3, aim: [0.5, 0.5, 0] as Vec3, cone: 30, soft: 10 };
    const grid = (slotOf: (x: number, y: number) => number, coverOf: (x: number, y: number) => number = () => 1) => {
      const slot: number[] = [];
      const coverage: number[] = [];
      for (let ty = 0; ty < h; ty++)
        for (let tx = 0; tx < w; tx++) {
          const [x, y] = [(tx + 0.5) / w, (ty + 0.5) / h];
          slot.push(slotOf(x, y));
          coverage.push(coverOf(x, y));
        }
      return { slot, coverage, w, h };
    };
    // Full-light pool: 20 degrees, a circle of radius tan 20 = 0.364 short-side units about the centre.
    expect(poolSlot(grid(() => 0), lamp, 1.6)).toBe(0);
    // A thin band (15% of the height) across the pool: most of the pool is still slot 0.
    expect(poolSlot(grid((_, y) => (Math.abs(y - 0.5) < 0.075 ? 1 : 0)), lamp, 1.6)).toBe(0);
    // A wide band (80%) holds most of the pool.
    expect(poolSlot(grid((_, y) => (Math.abs(y - 0.5) < 0.4 ? 1 : 0)), lamp, 1.6)).toBe(1);
    // Slot 2 fills the whole page outside the pool: it does not count.
    expect(poolSlot(grid((x, y) => (Math.hypot((x - 0.5) * 1.6, y - 0.5) < 0.37 ? 0 : 2)), lamp, 1.6)).toBe(0);
    // Uncovered texels do not count, whatever their slot.
    expect(poolSlot(grid((_, y) => (y < 0.5 ? 0 : 1), (_, y) => (y < 0.5 ? 0.5 : 1)), lamp, 1.6)).toBe(1);
    // A tie goes to the lower slot; no covered texel in the pool gives -1.
    expect(poolSlot(grid((x) => (x < 0.5 ? 3 : 1)), lamp, 1.6)).toBe(1);
    expect(poolSlot(grid(() => 0, () => 0), lamp, 1.6)).toBe(-1);
  });
});

// The caustic law's width half (Task 15 fix round 1). Expected values, set before measuring: width is area over
// skeleton length, so a straight line N px long and k px across reads k (within 10%: the skeleton is a little
// shorter than the line at its ends); a one-pixel diagonal step line reads its true perpendicular width, 1 / sqrt 2,
// which proves the diagonal links count sqrt 2; a filled disc thins to a point or a stub and reads far wider than
// any line.
describe("caustic line width", () => {
  const W = 120;
  const H = 120;
  const mask = (on: (x: number, y: number) => boolean) => {
    const m = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (on(x, y)) m[y * W + x] = 1;
    return m;
  };
  const line1 = mask((x, y) => y === 60 && x >= 10 && x < 110);
  const band3 = mask((x, y) => y >= 59 && y <= 61 && x >= 10 && x < 110);
  const diag1 = mask((x, y) => x === y && x >= 10 && x < 110);
  const diag4 = mask((x, y) => (x === y || x === y + 1) && y >= 10 && y < 110);
  const disc10 = mask((x, y) => Math.hypot(x - 60, y - 60) <= 10);

  it("a straight line reads its width", () => {
    expect(lineWidth(line1, W, H)).toBeCloseTo(1, 1);
    expect(Math.abs(lineWidth(band3, W, H) - 3)).toBeLessThan(0.3);
  });

  it("a diagonal line counts its links at sqrt 2", () => {
    expect(lineWidth(diag1, W, H)).toBeCloseTo(Math.SQRT1_2, 1);
    expect(lineWidth(diag4, W, H)).toBeCloseTo(Math.SQRT2, 1);
  });

  // The width no longer judges the law (caustic fix: see "caustic verdict" below); water.test.ts's exposure guard
  // uses it as the old measure.
  it("a filled disc reads far wider than any line", () => {
    expect(lineWidth(disc10, W, H)).toBeGreaterThan(10);
  });
});

// The caustic law's thin half since the caustic fix (2026-11-14): the concentration, the cut of c - 1 at the brightest
// 5%, at least relight.causticConcentration. Expected, set before measuring: a net whose lines (6% of the floor) get
// 7 x still water's light reads 6 and passes; a soft pool whose light rises smoothly to 1.8 x reads under 1 and fails
// as "pools of light"; a net that stands still fails the overlap half only.
describe("caustic verdict", () => {
  const N = 100 * 100;
  const field = (f: (p: number) => number) => Float32Array.from({ length: N }, (_, p) => f(p));
  const all = new Uint8Array(N).fill(1);
  const net = field((p) => (p % 100 < 6 ? 6 : -0.05));
  const pool = field((p) => 0.8 * Math.exp(-(((p % 100) - 50) ** 2 + (Math.floor(p / 100) - 50) ** 2) / 800) - 0.1);
  const minC = threshold("relight.causticConcentration", null);
  const maxOverlap = threshold("relight.causticOverlap", null);
  const cutOf = (v: Float32Array) => brightMask(v, all).cut;

  it("a net of bright lines passes and a soft pool fails the thin half", () => {
    console.log(`concentration: net ${cutOf(net).toFixed(3)}, pool ${cutOf(pool).toFixed(3)}`);
    expect(cutOf(net)).toBeCloseTo(6, 5);
    expect(causticVerdict({ overlap: 0.02, concentration: [cutOf(net), cutOf(net)] }, minC, maxOverlap).status).toBe("pass");
    const soft = causticVerdict({ overlap: 0.02, concentration: [cutOf(pool), cutOf(pool)] }, minC, maxOverlap);
    expect(soft.status).toBe("fail");
    expect(soft.line).toMatch(/pools of light, not lines/);
    expect(soft.line).not.toMatch(/stand still/);
  });

  it("lines that stand still fail the overlap half only, and no caustic fails both", () => {
    const still = causticVerdict({ overlap: 0.99, concentration: [6, 6] }, minC, maxOverlap);
    expect(still.status).toBe("fail");
    expect(still.line).toMatch(/stand still/);
    expect(still.line).not.toMatch(/pools of light/);
    expect(causticVerdict({ overlap: 0, concentration: [0, 0] }, minC, maxOverlap).line).toMatch(/draws no caustic/);
  });

  // The clip guard's scope (Phase 2 Task 4): the knee halves the light only when it can change what the law reads.
  // Expected, set before running: a floor of 100 x 100 at 8-bit 60 off, with a net of lines (6 columns) at 200 on;
  // a clipped region (255) in pixels the law leaves out (not water) keeps full light; the same region on read pixels
  // whose c - 1 sits under the cut halves; clipped line cores above the cut keep full light (the cut is exact);
  // a read pixel clipped in its caustic-off frame halves.
  describe("knee guard", () => {
    const W = 100;
    const frame = (f: (x: number, y: number) => number) => {
      const data = new Uint8ClampedArray(W * W * 4);
      for (let p = 0; p < W * W; p++) {
        const v = f(p % W, Math.floor(p / W));
        data.fill(v, p * 4, p * 4 + 3);
        data[p * 4 + 3] = 255;
      }
      return { w: W, h: W, data };
    };
    const isLine = (x: number) => x % 100 < 6;
    const off = frame(() => 60);
    const net = frame((x) => (isLine(x) ? 200 : 55));
    // A bright layer at the bottom (rows 95 to 99, columns 40 to 59): clipped on, ordinary off, c - 1 under the cut.
    const inCard = (x: number, y: number) => y >= 95 && x >= 40 && x < 60;
    const card = frame((x, y) => (inCard(x, y) ? 255 : isLine(x) ? 200 : 55));
    const offCard = frame((x, y) => (inCard(x, y) ? 220 : 60));
    const read = (on: ReturnType<typeof frame>, of: ReturnType<typeof frame>, keep: Uint8Array) =>
      kneeBiases([on, on], [of, of], [causticAlone(on, of), causticAlone(on, of)], keep);
    const water = new Uint8Array(W * W).fill(1);
    const notCard = Uint8Array.from({ length: W * W }, (_, p) => (inCard(p % W, Math.floor(p / W)) ? 0 : 1));

    it("a net under the knee keeps full light", () => {
      expect(read(net, off, water)).toBe(false);
    });
    it("a clipped region outside the read pixels keeps full light", () => {
      expect(read(card, offCard, notCard)).toBe(false);
    });
    it("a clipped region inside the read pixels, under the cut, halves", () => {
      expect(brightMask(causticAlone(card, offCard), water).cut).toBeGreaterThan(causticAlone(card, offCard)[99 * W + 50]!);
      expect(read(card, offCard, water)).toBe(true);
    });
    it("clipped line cores above the cut keep full light; clipped cores at the cut halve", () => {
      const cores = frame((x) => (x % 100 < 3 ? 255 : isLine(x) ? 200 : 55));
      expect(read(cores, off, water)).toBe(false);
      // Every line pixel clipped: the cut sits on a clipped pixel, so the knee sets it.
      expect(read(frame((x) => (isLine(x) ? 255 : 55)), off, water)).toBe(true);
    });
    it("a read pixel clipped in its caustic-off frame halves", () => {
      expect(read(net, frame((x, y) => (x === 50 && y === 50 ? 240 : 60)), water)).toBe(true);
    });
  });

  it("transmitVerdict holds (b) for every light behind and reports the worst", () => {
    const move = (light: number, overlap: number | null, gain: [number, number] = [1, 1]): TransmitMove => ({ light, overlap, gain, level: 0.5, clear: true });
    const base = { share: 0.9, grounds: [{ light: 0, outside: 0 }, { light: 1, outside: 0 }], peak: 1, tiles: VARIED };
    const ok = transmitVerdict({ ...base, moves: [move(0, 0.2), move(1, 0.01)] }, 0.5, 0.5, 0.01, SPREAD);
    expect(ok.status).toBe("pass");
    expect(ok.measured["transmit.overlap"]).toBe(0.2);
    expect(ok.measured["transmit.overlap.1"]).toBe(0.01);
    // A second light behind that stands still fails, named.
    const stuck = transmitVerdict({ ...base, moves: [move(0, 0.2), move(1, 1)] }, 0.5, 0.5, 0.01, SPREAD);
    expect(stuck.status).toBe("fail");
    expect(stuck.line).toMatch(/the same glass pixels glow with the light behind 1 at both test positions/);
    // A second light behind that adds nothing to the glass fails too.
    const dead = transmitVerdict({ ...base, moves: [move(0, 0.2), move(1, null, [0, 0])] }, 0.5, 0.5, 0.01, SPREAD);
    expect(dead.line).toMatch(/the light behind 1 changes nothing on the glass/);
    // One light behind: the line reads as before (no light number).
    const one = transmitVerdict({ ...base, share: 0.2, grounds: [{ light: 0, outside: 0 }], moves: [move(0, 0.2)] }, 0.5, 0.5, 0.01, SPREAD);
    expect(one.line).toMatch(/transmit FAIL \(the light behind gives 0.200 of the brightest glass pixels' light, under 0.5/);
    expect(one.line).toMatch(/; its glowing pixels at the two test positions overlap 0.200/);
  });

  it("transmitVerdict judges the ground on the worst light's own radius, not on an average over the lights", () => {
    const move = (light: number): TransmitMove => ({ light, overlap: 0.1, gain: [1, 1], level: 0.5, clear: true });
    // A small light 0 that spills (0.3 in its own radius) and a wide, honest light 1: the largest decides.
    const r = transmitVerdict({ share: 0.9, grounds: [{ light: 0, outside: 0.3 }, { light: 1, outside: 0.004 }], peak: 1, tiles: VARIED, moves: [move(0), move(1)] }, 0.5, 0.5, 0.01, SPREAD);
    expect(r.status).toBe("fail");
    expect(r.line).toMatch(/the lights behind change pixels outside the glass by 0.30000 within light 0's radius, over 0.01: they light the ground/);
    expect(r.measured["transmit.outside"]).toBe(0.3);
    expect(r.measured["transmit.outside.1"]).toBe(0.004);
    // One light behind: the reading and the words are the law's as before.
    const one = transmitVerdict({ share: 0.9, grounds: [{ light: 0, outside: 0.3 }], peak: 1, tiles: VARIED, moves: [move(0)] }, 0.5, 0.5, 0.01, SPREAD);
    expect(one.line).toMatch(/the light behind changes pixels outside the glass by 0.30000 within its radius, over 0.01: it lights the ground/);
    expect(one.measured["transmit.outside"]).toBe(0.3);
  });

  // Checks fix round 2 (2026-11-15), the owner's ruling "Add a tile-variation rule now": transmit (d).
  /** An opaque frame of `w` x `h` with every pixel `rgb` (0..255), and an empty full-coverage mask. */
  const canvas = (w: number, h: number, rgb: [number, number, number] = [0, 0, 0]) => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let p = 0; p < w * h; p++) data.set([...rgb, 255], p * 4);
    return { fr: { w, h, data }, full: new Uint8Array(w * h) };
  };
  it("tileFaces reads each whole tile's centre patch; a cut tile, a sliver and the rim do not count", () => {
    const { fr, full } = canvas(120, 60);
    const w = fr.w;
    const box = (x0: number, y0: number, bw: number, bh: number, face: [number, number, number], rim: [number, number, number]) => {
      for (let y = y0; y < y0 + bh; y++)
        for (let x = x0; x < x0 + bw; x++) {
          full[y * w + x] = 1;
          fr.data.set(x - x0 < 3 || y - y0 < 3 || x0 + bw - 1 - x < 3 || y0 + bh - 1 - y < 3 ? rim : face, (y * w + x) * 4);
        }
    };
    box(5, 5, 20, 20, [102, 102, 102], [255, 255, 255]); // a tile with a bright rim: its faces are 0.4
    box(35, 5, 20, 20, [255, 0, 0], [10, 10, 10]); // a red tile: its red channel is clipped, but it is not white
    box(65, 5, 20, 20, [204, 204, 204], [204, 204, 204]);
    box(100, 30, 20, 20, [255, 255, 255], [255, 255, 255]); // touches the right border: cut, not read
    box(5, 40, 40, 6, [255, 255, 255], [255, 255, 255]); // a sliver: no 9 x 9 patch fits
    const faces = tileFaces(fr, full).sort((a, b) => a.luma - b.luma);
    expect(faces).toHaveLength(3);
    expect(faces[0]!.luma).toBeCloseTo(0.2126, 4);
    expect(faces[0]!.white).toBe(0); // white is every channel: the dimmest is read (checks fix round 3, correction 1)
    expect(faces[1]!.luma).toBeCloseTo(0.4, 6);
    expect(faces[1]!.white).toBeCloseTo(0.4, 6);
    expect(faces[2]!.luma).toBeCloseTo(0.8, 6);
  });

  const move: TransmitMove = { light: 0, overlap: 0.1, gain: [1, 1], level: 0.5, clear: true };
  const read = (tiles: TileMoment[]) => transmitVerdict({ share: 0.9, grounds: [{ light: 0, outside: 0 }], peak: 1, moves: [move], tiles }, 0.5, 0.5, 0.01, SPREAD);
  const FLAT = /the glass tiles are flat at t [0-9, ]+: the brightest tile face [0-9.]+ is within [0-9.]+ of the lower quartile/;
  const DIM = /no glass tile is blown to white at t [0-9, ]+: the whitest tile face reads/;

  it("transmit (d): flat tiles fail (d2), tiles with none blown to white fail (d1)", () => {
    expect(TILE_WHITE).toBeCloseTo(252 / 255, 9);
    // Varied, one blown: pass. Eleven faces (bar 06's count): the lower quartile is the third dimmest.
    const ok = read(at2(grey([0.78, 0.8, 0.82, 0.88, 0.9, 0.9, 0.91, 0.92, 0.93, 0.96, 0.995])));
    expect(ok.status).toBe("pass");
    expect(ok.measured["transmit.tileLow"]).toBe(0.82);
    expect(ok.measured["transmit.tileT"]).toBe(2);
    expect(ok.line).toMatch(/; tiles at t 2: 11, whitest face 0.995, brightest 0.995, lower quartile 0.820, spread 0.175\)$/);
    // Flat and white: every tile blown, within 0.03 of each other.
    const flat = read(at2(grey([0.96, 0.97, 0.97, 0.98, 0.99, 0.99, 0.99])));
    expect(flat.status).toBe("fail");
    expect(flat.line).toMatch(/transmit FAIL \(the glass tiles are flat at t 2: the brightest tile face 0.990 is within 0.020 of the lower quartile 0.970 at t 2, under 0.07;/);
    expect(flat.line).not.toMatch(DIM);
    // One odd dim tile does not save a flat page: the lower quartile, not the dimmest.
    expect(read(at2(grey([0.3, 0.97, 0.97, 0.98, 0.99, 0.99, 0.99]))).status).toBe("fail");
    // Varied, the brightest over the finish's knee (231, round 2's (d1)) but not white: fails (d1) now (review I1).
    const knee = read(at2(grey([0.7, 0.75, 0.8, 0.85, 0.95])));
    expect(knee.status).toBe("fail");
    expect(knee.line).toMatch(/no glass tile is blown to white at t 2: the whitest tile face reads 0.950 at t 2 \(its dimmest channel\), under 0.988/);
    expect(knee.line).not.toMatch(FLAT);
    // A pale tinted tile clipped in its main channel only is not white (glimmer-no-swell-drift's wash): its dimmest
    // channel decides. The same holds for coloured glass (review Minor 3), by the ruling's word "white".
    const tinted = (luma: number, white: number): TileFace => ({ luma, white });
    const clipped = read(at2([tinted(0.7, 0.6), tinted(0.72, 0.62), tinted(0.75, 0.66), tinted(0.85, 0.78), tinted(0.94, 0.9)]));
    expect(clipped.status).toBe("fail");
    expect(clipped.line).toMatch(DIM);
  });

  // Checks fix round 3 (review-checks-fix2 Minor 4): (d) at several moments, (d1) and (d2) together per moment.
  it("transmit (d) passes when one moment meets both halves, and never pairs one moment's white with another's spread", () => {
    const whiteFlat = grey([0.97, 0.97, 0.98, 0.98, 0.99]); // blown, flat
    const variedDim = grey([0.6, 0.7, 0.75, 0.8, 0.9]); // varied, not blown
    const both = grey([0.8, 0.8, 0.85, 0.9, 0.995]);
    const split = read([{ t: 1, faces: whiteFlat }, { t: 2, faces: variedDim }, { t: 3, faces: whiteFlat }]);
    expect(split.status).toBe("fail");
    expect(split.line).toMatch(/no moment has a tile blown to white and a quarter of the tiles clearly dimmer together: a tile is blown to white at t 1, 3, the tiles vary at t 2/);
    expect(split.line).not.toMatch(FLAT);
    expect(split.line).not.toMatch(DIM);
    // One moment that meets both is enough; it decides the headline numbers.
    const one = read([{ t: 1, faces: variedDim }, { t: 2, faces: whiteFlat }, { t: 3, faces: both }]);
    expect(one.status).toBe("pass");
    expect(one.measured["transmit.tileT"]).toBe(3);
    expect(one.measured["transmit.tileWhite"]).toBe(0.995);
    expect(one.measured["transmit.tileSpread.t1"]).toBeCloseTo(0.2, 9);
    // Flat at every moment: fails (d2), naming the best moment.
    expect(read([{ t: 1, faces: whiteFlat }, { t: 2, faces: whiteFlat }]).line).toMatch(FLAT);
  });

  // Checks fix round 3 (review-checks-fix2 I2): under MIN_TILES the lower quartile is the dimmest tile, and a mosaic
  // whose joints are fully covered reads as one tile. Partial, named, never a pass.
  it("transmit (d) with too few tiles is partial, never a pass: 0 to 4 tiles, and a merged mosaic", () => {
    expect(MIN_TILES).toBe(5);
    for (const n of [0, 1, 2]) {
      const r = read(at2(grey([0.5, 0.5].slice(0, n))));
      expect(r.status).toBe("partial");
      expect(r.line).toMatch(new RegExp(`transmit PARTIAL \\(too few tiles to judge variation: at most ${n} read at a moment, under 5;`));
      expect(r.measured["transmit.tileSpread"]).toBeUndefined();
    }
    // 3 and 4 tiles: a flat page with one odd dim tile would pass a quartile read there (round 2's MIN_TILES 3).
    expect(read(at2(grey([0.8, 0.99, 0.99]))).status).toBe("partial");
    expect(read(at2(grey([0.8, 0.99, 0.99, 0.995]))).status).toBe("partial");
    expect(tileSpread(grey([0.8, 0.99, 0.99, 0.995]))).toBeNull();
    // The merged mosaic (the review's probe): 4 x 3 flat tiles of 75 x 66 whose grout is fully covered paint, not
    // bare: one component, one face.
    const { fr, full } = canvas(400, 300, [242, 242, 242]);
    for (let y = 50; y < 250; y++) for (let x = 50; x < 350; x++) full[y * 400 + x] = 1;
    const merged = tileFaces(fr, full);
    expect(merged).toHaveLength(1);
    const r = read(at2(merged));
    expect(r.status).toBe("partial");
    expect(r.line).toMatch(/too few tiles to judge variation: at most 1 read at a moment, under 5/);
    // The same tiles with a one-pixel bare gap are read, and fail (d2): flat.
    for (let y = 50; y < 250; y++) for (const x of [125, 200, 275]) full[y * 400 + x] = 0;
    for (const y of [116, 183]) for (let x = 50; x < 350; x++) full[y * 400 + x] = 0;
    const gapped = read(at2(tileFaces(fr, full)));
    expect(gapped.measured["transmit.tiles"]).toBe(12);
    expect(gapped.status).toBe("fail");
    expect(gapped.line).toMatch(FLAT);
    // A moment with too few tiles does not judge; another moment with enough does.
    expect(read([{ t: 1, faces: grey([0.5]) }, { t: 2, faces: grey([0.8, 0.8, 0.85, 0.9, 0.995]) }]).status).toBe("pass");
    // A failing (a) to (c) still fails with too few tiles.
    expect(transmitVerdict({ share: 0.1, grounds: [{ light: 0, outside: 0 }], peak: 1, moves: [move], tiles: at2([]) }, 0.5, 0.5, 0.01, SPREAD).status).toBe("fail");
  });

  // Review-checks-fix1 Minor 3: a light behind with no `at` or `radius` reads (c) over the whole frame. No glow can
  // reach that branch (both are required), so it is read here. The planted spill lies outside light 0's small circle;
  // only light 1, which has no circle, can see it.
  it("transmitGrounds reads a light with no circle over the whole frame, and the verdict names it", () => {
    const w = 100;
    const h = 50;
    const blank = () => ({ w, h, data: new Uint8ClampedArray(w * h * 4).fill(255) });
    const off = blank();
    const on = blank();
    for (let y = 30; y < 50; y++) for (let x = 70; x < 100; x++) for (let k = 0; k < 3; k++) on.data[(y * w + x) * 4 + k] = 155; // spill far from light 0
    const glassPx = new Uint8Array(w * h);
    const g = transmitGrounds(on, off, glassPx, [{ light: 0, at: [0.1, 0.1], radius: 0.05 }, { light: 1 }]);
    expect(g[0]!.outside).toBe(0);
    expect(g[1]!.outside).toBeCloseTo((600 * 100) / (w * h * 255), 6); // 600 px moved by 100 of 255
    const move = (light: number): TransmitMove => ({ light, overlap: 0.1, gain: [1, 1], level: 0.5, clear: true });
    const r = transmitVerdict({ share: 0.9, grounds: g, peak: 1, moves: [move(0), move(1)], tiles: VARIED }, 0.5, 0.5, 0.01, SPREAD);
    expect(r.status).toBe("fail");
    expect(r.line).toMatch(/outside the glass by 0.04706 within light 1's radius/);
  });
});

describe("joinSchemes: relight and detail in light and dark", () => {
  it("names the failing scheme first, takes the worse status and suffixes every key with its scheme", () => {
    const r = joinSchemes("relight", [
      { scheme: "light", status: "pass", line: "relief pass (a)", measured: { "relief.diff": 0.05 } },
      { scheme: "dark", status: "fail", line: "relief FAIL (b)", measured: { "relief.diff": 0.004 } },
    ]);
    expect(r).toEqual({ name: "relight", status: "fail", line: "relight: dark: relief FAIL (b); light: relief pass (a)", measured: { "relief.diff.light": 0.05, "relief.diff.dark": 0.004 } });
    const tie = joinSchemes("detail", [
      { scheme: "light", status: "pass", line: "a", measured: {} },
      { scheme: "dark", status: "pass", line: "b", measured: {} },
    ]);
    expect(tie.status).toBe("pass");
    expect(tie.line).toBe("detail: light: a; dark: b");
    const partial = joinSchemes("relight", [
      { scheme: "light", status: "pass", line: "a", measured: {} },
      { scheme: "dark", status: "partial", line: "b", measured: {} },
    ]);
    expect(partial.status).toBe("partial");
    expect(partial.line).toBe("relight: dark: b; light: a");
  });
});

describe("reliefChange: the relief law's frame difference, relative to the page's brightness (Phase 2 Task 2b)", () => {
  /** A 64 x 32 frame whose RGB is `scale` x a fixed shading pattern lit from `side` (0 or 1): the same relief, lit from two places. */
  const lit = (side: 0 | 1, scale: number) => {
    const w = 64;
    const h = 32;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        // A ridge every 8 px: its slope faces the light on one side and turns away on the other.
        const facing = Math.sin(((x + y) / 8) * 2 * Math.PI) * (side ? -1 : 1);
        const v = 200 + 40 * facing;
        const p = (y * w + x) * 4;
        data[p] = Math.round(v * scale);
        data[p + 1] = Math.round(v * 0.9 * scale);
        data[p + 2] = Math.round(v * 0.8 * scale);
        data[p + 3] = 255;
      }
    return { w, h, data };
  };

  it("reads the same relief on a palette four times darker as about the same relative change", () => {
    const bright = reliefChange(lit(0, 1), lit(1, 1));
    const dark = reliefChange(lit(0, 0.25), lit(1, 0.25));
    expect(bright).toBeGreaterThan(0.1);
    // The raw mean difference falls four times with the palette; the relative change stays within 3% (8-bit rounding).
    expect(Math.abs(dark - bright) / bright).toBeLessThan(0.03);
  });

  it("reads two identical frames as no change, and an all-black pair as no change", () => {
    expect(reliefChange(lit(0, 1), lit(0, 1))).toBe(0);
    expect(reliefChange(lit(0, 0), lit(1, 0))).toBe(0);
  });
});

describe("reliefVerdict: the raw floor under the relative change (Phase 2 Task 2b fix round 3)", () => {
  /** A 64 x 32 grey frame pair: every pixel at `base`, and one pixel in four `step` brighter in B than in A. */
  const pair = (base: number, step: number) => {
    const w = 64;
    const h = 32;
    const a = new Uint8ClampedArray(w * h * 4).fill(base);
    const b = new Uint8ClampedArray(w * h * 4).fill(base);
    for (let p = 0; p < w * h; p += 4) b.fill(base + step, p * 4, p * 4 + 3);
    return [{ w, h, data: a }, { w, h, data: b }] as const;
  };
  const limits = { diff: threshold("relight.reliefDiff", null), raw: threshold("relight.reliefRawFloor", null), range: threshold("relight.minRelief", null) };
  const read = (base: number, step: number) => {
    const [a, b] = pair(base, step);
    const sumA = a.data.reduce((s, v, i) => (i % 4 === 3 ? s : s + v), 0);
    const sumB = b.data.reduce((s, v, i) => (i % 4 === 3 ? s : s + v), 0);
    const n = a.w * a.h * 3;
    return { diff: reliefChange(a, b), raw: Math.abs(sumB - sumA) / (n * 255), brightness: (sumA + sumB) / 2 / (n * 255), range: 0.03 };
  };

  it("fails a near-black pair whose raw change is under the floor, though its relative change equals a passing pair's", () => {
    const normal = read(200, 20);
    const dark = read(10, 1);
    // Same relative change (0.0247, above relight.reliefDiff); the dark pair's raw change is 0.00098 at brightness 0.040.
    expect(dark.diff).toBeCloseTo(normal.diff, 9);
    expect(dark.diff).toBeGreaterThan(limits.diff);
    expect(dark.brightness).toBeLessThan(0.05);
    expect(dark.raw).toBeLessThanOrEqual(limits.raw);
    expect(normal.raw).toBeGreaterThan(limits.raw);
    expect(reliefVerdict(normal, limits).status).toBe("pass");
    const v = reliefVerdict(dark, limits);
    expect(v.status).toBe("fail");
    expect(v.line).toMatch(/raw change [0-9.]+, at or under the floor /);
    expect(v.line).not.toMatch(/moving the light changes the frame by [0-9.]+, at or under/);
  });
});

describe("shadow law helpers (Phase 2 Task 7)", () => {
  const W = 40;
  const H = 30;
  const frame = (fill: number, dark: [number, number, number][] = []) => {
    const data = new Uint8ClampedArray(W * H * 4).fill(fill);
    for (const [x, y, v] of dark) data.fill(v, (y * W + x) * 4, (y * W + x) * 4 + 3);
    return { w: W, h: H, data };
  };
  /** A 320 x 200 sheet (aspect 1.6, as 960 x 600), flat at 0 with a box raised `lift` over texels [x0, x1) x [y0, y1) (rows top down). */
  const grid = (lift: number, box = [100, 180, 60, 120]) => {
    const w = 320;
    const h = 200;
    const height = new Float32Array(w * h);
    const [x0, x1, y0, y1] = box as [number, number, number, number];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) height[y * w + x] = lift;
    return { height, w, h };
  };

  it("shadowMask keeps the pixels darker with the shadow on by more than the cut, and ignores lighter ones", () => {
    const off = frame(200);
    // Two pixels darkened (one deeply, one slightly), one lightened.
    const on = frame(200, [[10, 5, 80], [30, 5, 196], [20, 20, 230]]);
    const m = shadowMask(on, off, 0.1);
    expect(m.share).toBeCloseTo(1 / (W * H), 12);
    expect(m.centroid).toEqual([10.5, 5.5]);
    expect(m.depth).toBeGreaterThan(0.8);
    expect(shadowMask(off, off, 0.1)).toEqual({ share: 0, centroid: null, depth: 0 });
  });

  it("shadowOracle casts a raised box's shadow on its far side from a key, and none from a flat sheet or an overhead light", () => {
    const march = SHADOW_MARCH;
    // Light from the upper left: x left, y up, rising at 45 degrees.
    const g = shadowOracle(grid(0.05), { dir: [-1, 1, Math.SQRT2] }, march);
    expect(g.share).toBeGreaterThan(0);
    expect(g.raised![0]).toBeCloseTo(140 / 320, 6);
    expect(g.raised![1]).toBeCloseTo(90 / 200, 6);
    // Page y runs down: the shadow lies to the right of and below the box.
    expect(g.centroid![0]).toBeGreaterThan(g.raised![0]);
    expect(g.centroid![1]).toBeGreaterThan(g.raised![1]);
    expect(shadowOracle(grid(0), { dir: [-1, 1, Math.SQRT2] }, march).share).toBe(0);
    expect(shadowOracle(grid(0.05), { dir: [0, 0, 1] }, march).share).toBe(0);
    // A lamp to the box's left, low: the shadow falls to its right.
    const lamp = shadowOracle(grid(0.05), { at: [0.05, 0.45, 0.1] }, march);
    expect(lamp.share).toBeGreaterThan(0);
    expect(lamp.centroid![0]).toBeGreaterThan(lamp.raised![0]);
  });

  it("shadowOracle lets no bare-ground texel (coverage 0) receive the shadow unless the ground shadow is on", () => {
    const march = SHADOW_MARCH;
    const g = grid(0.05);
    // Coverage 1 on the box only: the shadow it casts falls on bare ground.
    const coverage = new Float32Array(g.w * g.h);
    for (let k = 0; k < coverage.length; k++) coverage[k] = g.height[k]! > 0 ? 1 : 0;
    const key = { dir: [-1, 1, Math.SQRT2] };
    const all = shadowOracle(g, key, march);
    expect(all.share).toBeGreaterThan(0);
    expect(shadowOracle({ ...g, coverage }, key, march).share).toBe(0);
    expect(shadowOracle({ ...g, coverage }, { ...key, ground: true }, march)).toEqual(all);
    // A covered floor receives as before.
    expect(shadowOracle({ ...g, coverage: new Float32Array(g.w * g.h).fill(1) }, key, march)).toEqual(all);
  });

  const LIM = { dark: 0.3, shift: 4, none: 0.001, minRelief: 0.003 };
  const shadowFrame = (c: [number, number] | null, raised: [number, number], away: [number, number], share = 0.02, predicted = 0.02, depth = 0.7) => ({
    mask: { share: c ? share : 0, centroid: c, depth },
    predicted,
    raised,
    away,
  });
  // A key from the upper left at position 0 and from the left at position 1: its screen move runs down and left.
  const honest = {
    range: 0.03,
    frames: [shadowFrame([520, 400], [400, 260], [0.74, 0.67]), shadowFrame([560, 300], [400, 260], [0.95, 0.3])] as const,
    move: [-0.18, 0.79] as [number, number],
  };

  it("shadowVerdict passes a shadow on the far side that moves against the light", () => {
    const v = shadowVerdict({ ...honest, frames: [...honest.frames] }, LIM);
    expect(v.status, v.line).toBe("pass");
    expect(v.measured["shadow.side.0"]).toBeGreaterThan(0);
    expect(v.measured["shadow.shift"]).toBeGreaterThanOrEqual(LIM.shift);
  });

  it("shadowVerdict fails a shadow on the light's side, one that stands still, and one too faint to read", () => {
    const sameSide = shadowVerdict({ ...honest, frames: [shadowFrame([280, 120], [400, 260], [0.74, 0.67]), shadowFrame([240, 220], [400, 260], [0.95, 0.3])] }, LIM);
    expect(sameSide.status).toBe("fail");
    expect(sameSide.line).toMatch(/toward the light/);
    const still = shadowVerdict({ ...honest, frames: [honest.frames[0], shadowFrame([520, 400], [400, 260], [0.95, 0.3])] }, LIM);
    expect(still.status).toBe("fail");
    expect(still.line).toMatch(/against the light's move/);
    const faint = shadowVerdict({ ...honest, frames: [shadowFrame(null, [400, 260], [0.74, 0.67], 0, 0.02, 0.05), shadowFrame(null, [400, 260], [0.95, 0.3], 0, 0.02, 0.05)] }, LIM);
    expect(faint.status).toBe("fail");
    expect(faint.line).toMatch(/casts no shadow/);
  });

  it("shadowVerdict on a flat sheet: partial under the floor, fail at or over it; nothing that blocks the light is partial", () => {
    const flat = (share: number) => ({ range: 0.0004, frames: [shadowFrame(null, [400, 260], [0.74, 0.67], share, 0), shadowFrame(null, [400, 260], [0.95, 0.3], share, 0)], move: honest.move });
    const quiet = shadowVerdict(flat(0), LIM);
    expect(quiet.status).toBe("partial");
    expect(quiet.line).toMatch(/flat/);
    const noisy = { ...flat(0), frames: flat(0).frames.map((f) => ({ ...f, mask: { share: 0.01, centroid: [300, 300] as [number, number], depth: 0.6 } })) };
    expect(shadowVerdict(noisy, LIM).status).toBe("fail");
    const unblocked = { range: 0.03, frames: flat(0).frames, move: honest.move };
    const u = shadowVerdict(unblocked, LIM);
    expect(u.status).toBe("partial");
    expect(u.line).toMatch(/nothing on the sheet blocks/);
  });

  it("at most one light casts a shadow: a second throws, naming both", () => {
    const caster = (id: string) => ({ id, shadow: { ground: false } });
    expect(() => assertOneShadow([caster("key"), { id: "ambient" }])).not.toThrow();
    expect(() => assertOneShadow([caster("key"), { id: "ambient" }, caster("lamp")])).toThrow(/light 0 \(key\) and light 2 \(lamp\)/);
  });
});

describe("iridescence law helpers (Phase 2 Task 14)", () => {
  const BIN = { groove: GROOVE_BIN, share: GROOVE_SHARE_BIN, normal: NORMAL_BIN, u: GRATING_U_BIN };
  const unit = (deg: number): [number, number] => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
  /** A 20 x 10 sheet on slot 1, flat at height 0, grooves at `left` degrees on the left half and `right` on the right. */
  const sheet = (left: number, right: number) => {
    const w = 20;
    const h = 10;
    const n = w * h;
    return {
      w,
      h,
      height: new Array(n).fill(0),
      coverage: new Array(n).fill(1),
      ink: new Array(n).fill(0),
      slot: new Array(n).fill(1),
      dir: Array.from({ length: n }, (_, k) => unit(k % w < w / 2 ? left : right)),
    };
  };

  it("grooveApart treats a groove as a line: 0 and 180 are one direction, 170 and 10 are 20 apart", () => {
    expect(grooveApart(0, 180)).toBe(0);
    expect(grooveApart(170, 10)).toBe(20);
    expect(grooveApart(90, 60)).toBe(30);
  });

  it("foilTexels groups by groove: two regions 30 degrees apart are two groups; a groove and its opposite are one", () => {
    const t = foilTexels(sheet(90, 60), [1], 0.998, BIN);
    expect(t.groups.map((g) => g.groove).sort()).toEqual([60, 90]);
    expect(t.id.filter((g) => g === t.id[0]).length).toBe(100);
    const same = foilTexels(sheet(30, 210), [1], 0.998, BIN);
    expect(same.groups).toHaveLength(1);
    // 62 degrees falls in the 60 bin (within 5 degrees, the spec's "same groove").
    expect(foilTexels(sheet(62, 60), [1], 0.998, BIN).groups).toHaveLength(1);
  });

  it("foilTexels leaves out other slots, part coverage and ink; a sheet with no direction image runs every groove along +x", () => {
    const base = sheet(90, 60);
    const t = foilTexels({ ...base, slot: base.slot.map((v, k) => (k === 0 ? 0 : v)), coverage: base.coverage.map((v, k) => (k === 1 ? 0.5 : v)), ink: base.ink.map((v, k) => (k === 2 ? 0.3 : v)) }, [1], 0.998, BIN);
    expect(t.id.slice(0, 4)).toEqual([-1, -1, -1, t.id[3]]);
    expect(t.id[3]).toBeGreaterThanOrEqual(0);
    const { dir: _dir, ...noDir } = base;
    const none = foilTexels(noDir, [1], 0.998, BIN);
    expect(none.groups).toEqual([{ groove: 0, share: 1, normal: [0, 0] }]);
  });

  it("foilTexels groups by normal: a slope of 10 degrees is its own group; share 0 has no groove", () => {
    const base = sheet(90, 90);
    // Height rising along x on the right half: tan 10 degrees per short-side unit, one texel 1/10 of it.
    const tilt = Math.tan((10 * Math.PI) / 180) / 10;
    const t = foilTexels({ ...base, height: base.height.map((_, k) => Math.max(0, (k % 20) - 10) * tilt) }, [1], 0.998, BIN);
    expect(t.groups.some((g) => g.normal[0] === 10 && g.normal[1] === 0)).toBe(true);
    const flat = foilTexels({ ...base, dir: base.dir.map(() => [0, 0] as [number, number]) }, [1], 0.998, BIN);
    expect(flat.groups).toEqual([{ groove: 0, share: 0, normal: [0, 0] }]);
  });

  it("foilTexels with a light bins u = |X.(l + v)|: flat grooves up the sheet under a key from +x give u = l.x; a tilted surface another u", () => {
    const base = sheet(90, 90);
    const light = { l: [0.6, 0, 0.8] };
    const flat = foilTexels(base, [1], 0.998, BIN, light);
    // Grooves along +y on a flat sheet: X = n x G = (0, 0, 1) x (0, 1, 0) = (-1, 0, 0), so u = |-(0.6 + 0)| = 0.6.
    expect(flat.ugroups).toEqual([{ groove: 90, share: 1, u: 0.6 }]);
    expect(flat.uid!.every((g) => g === 0)).toBe(true);
    // The right half sloped 10 degrees about y: X tips with the normal, and u changes by far more than one bin.
    const tilt = Math.tan((10 * Math.PI) / 180) / 10;
    const tipped = foilTexels({ ...base, height: base.height.map((_, k) => (k % 20) * tilt) }, [1], 0.998, BIN, light);
    const us = tipped.ugroups!.map((g) => g.u);
    expect(Math.max(...us) - Math.min(...us)).toBeGreaterThan(0.05);
    // Without a light there is no u.
    expect(foilTexels(base, [1], 0.998, BIN).uid).toBeUndefined();
    expect(GRATING_U_BIN).toBe(0.0025);
  });

  it("turnOfTilt is the documented turn: [0, 0] is the identity; a turns the normal toward +x, b toward +y", () => {
    expect(turnOfTilt([0, 0]).flat().map((v) => v + 0)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const rad = (d: number) => (d * Math.PI) / 180;
    const nz = (r: number[][]) => r.map((row) => row[2]!);
    const right = nz(turnOfTilt([20, 0]));
    expect(right[0]).toBeCloseTo(Math.sin(rad(20)), 12);
    expect(right[2]).toBeCloseTo(Math.cos(rad(20)), 12);
    const both = nz(turnOfTilt([15, 25]));
    expect(both[0]).toBeCloseTo(Math.sin(rad(15)) * Math.cos(rad(25)), 12);
    expect(both[1]).toBeCloseTo(Math.sin(rad(25)), 12);
    expect(both[2]).toBeCloseTo(Math.cos(rad(15)) * Math.cos(rad(25)), 12);
  });

  it("foilTexels with a turn turns the normal and the grooves, the eye held at +z: flat grooves up the sheet tipped 10 degrees about y", () => {
    const base = sheet(90, 90);
    const a = (10 * Math.PI) / 180;
    const t = foilTexels(base, [1], 0.998, BIN, { l: [0.6, 0, 0.8], turn: turnOfTilt([10, 0]) });
    // n = (sin a, 0, cos a), G = (0, 1, 0), X = n x G = (-cos a, 0, sin a), l + v = (0.6, 0, 1.8):
    // u = |-0.6 cos a + 1.8 sin a| = 0.2783, bin 111 of 0.0025. (A turned eye instead, Task 11's view-only tilt, gives
    // |0.6 - sin a| = 0.4264.)
    const u = Math.round(Math.abs(-0.6 * Math.cos(a) + 1.8 * Math.sin(a)) / GRATING_U_BIN) * GRATING_U_BIN;
    expect(u).toBeCloseTo(0.2775, 12);
    expect(t.ugroups).toEqual([{ groove: 90, share: 1, u }]);
  });

  /** A frame w x h whose pixel p has the colour `rgb(p)`, and every pixel in group `group(p)`. */
  const frame = (w: number, h: number, rgb: (x: number, y: number) => [number, number, number]) => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const [r, g, b] = rgb(x, y);
        data.set([r, g, b, 255], (y * w + x) * 4);
      }
    return { w, h, data };
  };

  it("groupColours: one colour reads no spread; a colour that changes across the group reads the change", () => {
    const ids = new Int32Array(40 * 20).fill(0);
    const flat = groupColours(frame(40, 20, () => [120, 80, 200]), ids, 1);
    expect(flat[0]!.n).toBe(800);
    expect(flat[0]!.spread).toBeCloseTo(0, 9);
    const swept = groupColours(frame(40, 20, (x) => (x < 20 ? [200, 60, 60] : [60, 60, 200])), ids, 1);
    expect(swept[0]!.spread).toBeGreaterThan(0.2);
    // Too few pixels for halves of GROOVE_MIN_PX / 4: no spread is read.
    expect(groupColours(frame(10, 10, () => [1, 2, 3]), new Int32Array(100), 1)[0]!.spread).toBeNull();
  });

  it("grooveMatch reads the worst group of at least GROOVE_MIN_PX; grooveApartPair the largest groups 30 degrees apart, same normal and share", () => {
    const groups = [
      { groove: 90, share: 1, normal: [0, 0] as [number, number] },
      { groove: 60, share: 1, normal: [0, 0] as [number, number] },
      { groove: 75, share: 1, normal: [0, 0] as [number, number] },
      { groove: 0, share: 1, normal: [4, 0] as [number, number] },
    ];
    const colours = [
      { n: 5000, mean: [0.6, 0.1, 0] as Vec3, spread: 0.003 },
      { n: 4000, mean: [0.6, -0.1, 0] as Vec3, spread: 0.005 },
      { n: 4500, mean: [0.6, 0, 0.1] as Vec3, spread: 0.002 },
      { n: GROOVE_MIN_PX - 1, mean: [0.6, 0, 0] as Vec3, spread: 0.5 },
    ];
    expect(grooveMatch(colours)).toEqual({ spread: 0.005, group: 1 });
    // 75 is only 15 from 90; 0 is 90 from it but has another normal and too few pixels.
    const pair = grooveApartPair(groups, colours)!;
    expect([pair.first, pair.second, pair.angle]).toEqual([0, 1, 30]);
    expect(pair.dist).toBeCloseTo(0.2, 9);
    expect(grooveApartPair(groups.slice(0, 1), colours)).toBeNull();
    expect(GROOVE_APART).toBe(30);
  });

  // Fixture limits, one per condition, apart from each other so a test can tell (b)'s limit from (d)'s (not the
  // committed values: thresholds.json holds those).
  const LIM = { shift: 0.006, match: 0.03, apart: 0.05, band: 0.01, spread: 0.02 };
  const honest: IridescenceReading = { foil: 151072, light: 0.0426, tilt: 0.0872, time: 0, still: 1, match: { spread: 0.0004, groove: 60, u: 0.5, n: 552 }, apart: { dist: 0.199, grooves: [90, 60], angle: 30 }, spread: null };

  it("iridescenceVerdict passes foil.html-like readings", () => {
    const v = iridescenceVerdict(honest, LIM);
    expect(v.status, v.line).toBe("pass");
    expect(v.measured["iridescence.apart"]).toBe(0.199);
  });

  it("iridescenceVerdict fails each fault by its own condition", () => {
    const clock = iridescenceVerdict({ ...honest, time: 0.2884 }, LIM);
    expect([clock.status, /\(c\)/.test(clock.line), /\(a\)|\(b\)|\(d\)/.test(clock.line)]).toEqual(["fail", true, false]);
    const pointer = iridescenceVerdict({ ...honest, light: 0.00006, tilt: 0 }, LIM);
    expect(pointer.status).toBe("fail");
    expect(pointer.line).toMatch(/\(a\) moving the key light between its test positions/);
    expect(pointer.line).toMatch(/\(a\) tilting the surface/);
    // Only the failing conditions are in a fail line: no (b), (d) or (e) text.
    expect(pointer.line).not.toMatch(/\(b\)|\(d\)|\(e\)/);
    // A tilt-only fault (the view held): the key move over, the tilt under, only the tilt's (a) text.
    const view = iridescenceVerdict({ ...honest, tilt: 0.001 }, LIM);
    expect(view.status).toBe("fail");
    expect(view.line).toMatch(/\(a\) tilting the surface/);
    expect(view.line).not.toMatch(/\(a\) moving|\(b\)|\(c\)|\(d\)|\(e\)/);
    const noGroove = iridescenceVerdict({ ...honest, apart: { ...honest.apart!, dist: 0.0001 } }, LIM);
    expect(noGroove.status).toBe("fail");
    expect(noGroove.line).toMatch(/\(d\).*ignores the groove direction/);
    const soup = iridescenceVerdict({ ...honest, match: { ...honest.match!, spread: 0.11 } }, LIM);
    expect(soup.line).toMatch(/\(b\)/);
  });

  it("iridescenceVerdict: (b) and (d) have their own limits; a reading between them flips only the condition whose limit it crosses", () => {
    // 0.04 sits between match (0.03) and apart (0.05): as (b) it is over match, a fail; as (d) it is under apart, a fail.
    const mid = 0.04;
    const b = iridescenceVerdict({ ...honest, match: { ...honest.match!, spread: mid } }, LIM);
    expect(b.status).toBe("fail");
    expect(b.line).toMatch(/\(b\).*at or over 0\.03/);
    expect(b.line).not.toMatch(/\(d\)/);
    const d = iridescenceVerdict({ ...honest, apart: { ...honest.apart!, dist: mid } }, LIM);
    expect(d.status).toBe("fail");
    expect(d.line).toMatch(/\(d\).*at or under 0\.05/);
    expect(d.line).not.toMatch(/\(b\)/);
    // Under one shared limit (match for both) the same (d) reading would have passed: the split is what fails it.
    expect(iridescenceVerdict({ ...honest, apart: { ...honest.apart!, dist: mid } }, { ...LIM, apart: LIM.match }).status).toBe("pass");
  });

  it("pointChromaShift reads each pixel's own change: two frames whose pixels swap colours read high while their means read 0", () => {
    const a = frame(40, 20, (x) => (x < 20 ? [200, 60, 60] : [60, 60, 200]));
    const b = frame(40, 20, (x) => (x < 20 ? [60, 60, 200] : [200, 60, 60]));
    const all = () => true;
    expect(chromaDistance(meanOklab(a, all), meanOklab(b, all))).toBeCloseTo(0, 9);
    const one = chromaDistance(srgbToOklab(200, 60, 60), srgbToOklab(60, 60, 200));
    expect(pointChromaShift(a, b, all)).toBeCloseTo(one, 9);
    expect(one).toBeGreaterThan(0.2);
    // The same frame reads 0; no pixel kept reads 0.
    expect(pointChromaShift(a, a, all)).toBe(0);
    expect(pointChromaShift(a, b, () => false)).toBe(0);
  });

  it("iridescenceVerdict: no foil, no group for (b), or no groove pair for (d) is partial, never a pass; no tilt is read as none", () => {
    expect(iridescenceVerdict({ ...honest, foil: 0 }, LIM).status).toBe("partial");
    expect(iridescenceVerdict({ ...honest, match: null }, LIM).status).toBe("partial");
    const one = iridescenceVerdict({ ...honest, apart: null }, LIM);
    expect(one.status).toBe("partial");
    expect(one.line).toMatch(/\(d\) cannot be read/);
    const still = iridescenceVerdict({ ...honest, tilt: null }, LIM);
    expect(still.status).toBe("pass");
    expect(still.line).toMatch(/the page does not tilt/);
    expect(still.measured["iridescence.tilt"]).toBeUndefined();
  });

  it("iridescenceVerdict: (c) with no still foil is partial (the surface moves with the clock), never a fail", () => {
    const drift = iridescenceVerdict({ ...honest, time: null, still: 0 }, LIM);
    expect(drift.status).toBe("partial");
    expect(drift.line).toMatch(/the surface moves with the clock/);
    expect(drift.measured["iridescence.time"]).toBeUndefined();
    // A fail elsewhere still fails.
    expect(iridescenceVerdict({ ...honest, time: null, still: 0, light: 0 }, LIM).status).toBe("fail");
  });

  it("sheetHeld marks the texels whose height, coverage, slot, ink and direction did not change", () => {
    const a = { height: [0, 0.1, 0.2, 0.3], coverage: [1, 1, 1, 1], slot: [1, 1, 1, 1], ink: [0, 0, 0, 0], dir: [[0, 1], [0, 1], [0, 1], [0, 1]] };
    const b = { ...a, height: [0, 0.11, 0.2, 0.3], dir: [[0, 1], [0, 1], [1, 0], [0, 1]] };
    // A 4 x 1 sheet, reach 0: each texel alone.
    expect(sheetHeld(a, b, 4, 1, 0)).toEqual([1, 0, 0, 1]);
    const { dir: _d, ...noDir } = a;
    expect(sheetHeld(noDir, noDir, 4, 1, 0)).toEqual([1, 1, 1, 1]);
    expect(sheetHeld(noDir, a, 4, 1, 0)).toEqual([0, 0, 0, 0]);
    // Reach 1: a texel next to one that moved does not hold, though its own values did.
    expect(sheetHeld(a, b, 4, 1, 1)).toEqual([0, 0, 0, 0]);
    const c = { ...a, height: [0, 0.1, 0.2, 0.31] };
    expect(sheetHeld(a, c, 4, 1, 1)).toEqual([1, 1, 0, 0]);
    // Down a column too (a 1 x 4 sheet).
    expect(sheetHeld(a, c, 1, 4, 1)).toEqual([1, 1, 0, 0]);
  });

  it("chromaDistance leaves lightness out: two greys of any lightness are 0 apart", () => {
    expect(chromaDistance([0.2, 0, 0], [0.9, 0, 0])).toBe(0);
    expect(chromaDistance([0.5, 0.03, 0], [0.5, 0, 0.04])).toBeCloseTo(0.05, 12);
  });

  it("uSpread compares the most-populated u bin with the most-populated one U_SPAN away, per groove; the weakest groove decides", () => {
    const ug = (groove: number, u: number) => ({ groove, share: 1, u });
    const col = (n: number, a: number) => ({ n, mean: [0.6, a, 0] as Vec3, spread: 0 });
    const ugroups = [ug(90, 0.5), ug(90, 0.51), ug(90, 0.53), ug(60, 0.4), ug(60, 0.45), ug(0, 0.3)];
    // Groove 90: the top bin (0.5) pairs with 0.53 (0.51 is under U_SPAN away); groove 60: 0.4 with 0.45.
    const colours = [col(5000, 0), col(4000, 0.01), col(1000, 0.05), col(3000, 0), col(2000, 0.02), col(GROOVE_MIN_PX - 1, 0.5)];
    const e = uSpread(ugroups, colours)!;
    expect(e.groove).toBe(60);
    expect(e.dist).toBeCloseTo(0.02, 12);
    expect(e.du).toBeCloseTo(0.05, 12);
    expect(U_SPAN).toBe(0.02);
    // A flat foil: one u per groove, nothing to compare.
    expect(uSpread([ug(90, 0.5), ug(60, 0.4)], [col(5000, 0), col(5000, 0.1)])).toBeNull();
  });

  it("iridescenceVerdict: (e) fails a colour that does not follow u, passes one that does; unread (e) is said and the verdict comes from (a) to (d)", () => {
    const flat = iridescenceVerdict({ ...honest, spread: { dist: 0.001, du: 0.05, groove: 90 } }, LIM);
    expect(flat.status).toBe("fail");
    expect(flat.line).toMatch(/\(e\) two grating bins of one groove/);
    const follows = iridescenceVerdict({ ...honest, spread: { dist: 0.05, du: 0.05, groove: 90 } }, LIM);
    expect(follows.status).toBe("pass");
    expect(follows.measured["iridescence.spread"]).toBe(0.05);
    expect(follows.line).not.toContain(E_NOT_READ);
    // Unread: the text names U_SPAN, the status follows (a) to (d) alone.
    expect(E_NOT_READ).toBe("(e) not read: no groove spans 0.02 in u");
    const unread = iridescenceVerdict(honest, LIM);
    expect(unread.status).toBe("pass");
    expect(unread.line).toContain(E_NOT_READ);
    expect(unread.measured["iridescence.spread"]).toBeUndefined();
    expect(iridescenceVerdict({ ...honest, light: 0.001 }, LIM).status).toBe("fail");
    const unreadPartial = iridescenceVerdict({ ...honest, time: null, still: 0 }, LIM);
    expect(unreadPartial.status).toBe("partial");
    expect(unreadPartial.line).toContain(E_NOT_READ);
  });

  it("thresholds.json holds the four iridescence keys with a value over 0", () => {
    for (const k of ["relight.iridescenceShift", "relight.iridescenceMatch", "relight.iridescenceApart", "relight.iridescenceSpread"]) expect(threshold(k, null)).toBeGreaterThan(0);
  });
});

describe("iridescence law, the film branch (Phase 2 Task 18)", () => {
  /** foil.html's and film.html's key. */
  const KEY = [0.55, 0.05, 0.83];
  const swingZ = (d: number[], deg: number) => {
    const a = (deg * Math.PI) / 180;
    return [d[0]! * Math.cos(a) - d[1]! * Math.sin(a), d[0]! * Math.sin(a) + d[1]! * Math.cos(a), d[2]!];
  };
  const offEye = (d: number[]) => (Math.acos(d[2]! / Math.hypot(d[0]!, d[1]!, d[2]!)) * 180) / Math.PI;

  describe("filmOpd", () => {
    it("reads 633.7 nm for index 1.3 and 250 nm under foil.html's key", () => {
      expect(filmOpd(250, 1.3, KEY)).toBeCloseTo(633.7, 1);
    });
    it("holds when the key swings about the view axis", () => {
      expect(filmOpd(250, 1.3, swingZ(KEY, 60))).toBeCloseTo(filmOpd(250, 1.3, KEY), 9);
    });
    it("reads 2 x index x thickness for a key on the view axis, and less for a key off it", () => {
      expect(filmOpd(250, 1.3, [0, 0, 1])).toBeCloseTo(650, 9);
      expect(filmOpd(250, 1.3, KEY)).toBeLessThan(650);
    });
    it("does not depend on the length of the key's direction", () => {
      expect(filmOpd(250, 1.3, KEY.map((v) => v * 3))).toBeCloseTo(filmOpd(250, 1.3, KEY), 9);
    });
  });

  describe("filmTint", () => {
    it("holds when the colour is scaled (1, 0.25, 0.01)", () => {
      const c = [0.3, 0.12, 0.05];
      const t = filmTint(c);
      for (const s of [0.25, 0.01]) {
        const q = filmTint(c.map((v) => v * s));
        expect(q[0]).toBeCloseTo(t[0], 9);
        expect(q[1]).toBeCloseTo(t[1], 9);
      }
    });
    it("separates two hues, and reads a grey as no tint", () => {
      const [a, b] = [filmTint([0.3, 0.05, 0.05]), filmTint([0.05, 0.05, 0.3])];
      expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThan(0.1);
      const g = filmTint([0.2, 0.2, 0.2]);
      expect(Math.abs(g[0])).toBeLessThan(1e-3);
      expect(Math.abs(g[1])).toBeLessThan(1e-3);
    });
    it("reads no light as no tint", () => {
      expect(filmTint([0, 0, 0])).toEqual([0, 0]);
    });
  });

  describe("filmTintStep", () => {
    it("is the largest tint change one encoded level on one channel makes, and grows as the highlight dims", () => {
      const on: Vec3 = [0.4, 0.3, 0.2];
      const bright = filmTintStep([0.3, 0.2, 0.1], on);
      const dim = filmTintStep([0.03, 0.02, 0.01], on);
      expect(bright).toBeGreaterThan(0);
      expect(dim).toBeGreaterThan(bright);
    });
  });

  describe("filmKeyTurn", () => {
    it("position A is the declared direction, position B turns 30 degrees in the x-z plane away from the eye", () => {
      const { a, b } = filmKeyTurn(KEY);
      const len = Math.hypot(...KEY);
      expect(a[0]).toBeCloseTo(KEY[0]! / len, 9);
      expect(FILM_KEY_TURN).toBe(30);
      expect(offEye(b) - offEye(a)).toBeCloseTo(30, 0);
      expect(b[1]).toBeCloseTo(a[1], 9);
      expect(b[0]).toBeGreaterThan(a[0]);
      expect(Math.hypot(...b)).toBeCloseTo(1, 9);
    });
    it("turns toward the side of a negative x", () => {
      const { a, b } = filmKeyTurn([-0.55, 0.05, 0.83]);
      expect(b[0]).toBeLessThan(a[0]);
      expect(offEye(b)).toBeGreaterThan(offEye(a));
    });
    it("turns a key on the view axis toward +x", () => {
      const { b } = filmKeyTurn([0, 0, 1]);
      expect(b[0]).toBeCloseTo(0.5, 9);
      expect(b[1]).toBeCloseTo(0, 9);
      expect(b[2]).toBeCloseTo(Math.sqrt(3) / 2, 9);
    });
    it("turns back toward the eye when the key is over 45 degrees off it", () => {
      const d = [Math.sin(1), 0, Math.cos(1)]; // 57.3 degrees off the eye
      const { a, b } = filmKeyTurn(d);
      expect(offEye(b)).toBeCloseTo(offEye(a) - 30, 6);
    });
    it("takes the turn as an argument", () => {
      const { a, b } = filmKeyTurn(KEY, 15);
      expect(offEye(b) - offEye(a)).toBeCloseTo(15, 0);
    });
  });

  describe("the (e) ratio", () => {
    /** A ramp of tints that runs along one line with OPD. */
    const tintAt = (o: number): [number, number] => [o / 1000, -o / 2000];
    const opds = Array.from({ length: 21 }, (_, k) => 400 + k * FILM_OPD_BIN);

    it("reads 0 for a film that moves along its own ramp", () => {
      const bins = opds.map((opd) => ({ opd, opdB: opd - 25, tintA: tintAt(opd), tintB: tintAt(opd - 25) }));
      const r = filmSpreadRatio(bins)!;
      expect(r.ratio).toBeCloseTo(0, 9);
      expect(r.bins).toBe(16); // the five lowest bins' o' lies under the ramp
    });
    it("reads 1 for a film that ignores the angle", () => {
      const bins = opds.map((opd) => ({ opd, opdB: opd - 25, tintA: tintAt(opd), tintB: tintAt(opd) }));
      expect(filmSpreadRatio(bins)!.ratio).toBeCloseTo(1, 9);
    });
    it("gives the denominator as a mean per bin read", () => {
      const bins = opds.map((opd) => ({ opd, opdB: opd - 25, tintA: tintAt(opd), tintB: tintAt(opd) }));
      expect(filmSpreadRatio(bins)!.denom).toBeCloseTo(Math.hypot(25 / 1000, 25 / 2000), 9);
    });
    it("is null when no bin's o' lies inside the ramp", () => {
      const bins = opds.map((opd) => ({ opd, opdB: opd - 1000, tintA: tintAt(opd), tintB: tintAt(opd) }));
      expect(filmSpreadRatio(bins)).toBeNull();
    });
    it("uses a bin with no reading at B as a ramp node only", () => {
      const bins = opds.map((opd, k) => ({ opd, opdB: opd - 25, tintA: tintAt(opd), tintB: k === 10 ? null : tintAt(opd - 25) }));
      expect(filmSpreadRatio(bins)!.bins).toBe(15);
    });
    describe("a gap of uncounted bins in the ramp", () => {
      // Counted bins at 400 to 440 nm and 480 to 520 nm: nothing was measured between 440 and 480.
      const holed = [...Array.from({ length: 9 }, (_, k) => 400 + k * FILM_OPD_BIN), ...Array.from({ length: 9 }, (_, k) => 480 + k * FILM_OPD_BIN)];
      const inGap = (o: number) => o > 440 && o < 480;

      it("gives no lookup across the gap, so a bin whose o' falls in it is not read", () => {
        const bins = holed.map((opd) => ({ opd, opdB: opd - 25, tintA: tintAt(opd), tintB: tintAt(opd - 25) }));
        // Read: 425 to 440 (o' 400 to 415) and 505 to 520 (o' 480 to 495). 480 to 500 land in the gap.
        expect(filmSpreadRatio(bins)!.bins).toBe(8);
      });
      it("keeps such a bin out of the ratio, whatever colour it shows", () => {
        const bins = holed.map((opd) => ({ opd, opdB: opd - 25, tintA: tintAt(opd), tintB: inGap(opd - 25) ? [9, 9] : tintAt(opd - 25) }));
        expect(filmSpreadRatio(bins)!.ratio).toBeCloseTo(0, 9);
      });
      it("is null when every bin's o' falls in the gap", () => {
        const bins = [440, 480].map((opd) => ({ opd, opdB: 460, tintA: tintAt(opd), tintB: tintAt(460) }));
        expect(filmSpreadRatio(bins)).toBeNull();
      });
      it("treats one missing bin as a gap", () => {
        const ramp = [400, 405, 415, 420].map((opd) => ({ opd, opdB: opd, tintA: tintAt(opd), tintB: tintAt(opd) }));
        const bins = [...ramp, { opd: 420, opdB: 410, tintA: tintAt(420), tintB: tintAt(410) }];
        expect(filmSpreadRatio(bins)!.bins).toBe(4);
      });
      it("still reads a bin whose o' lands exactly on a counted bin at the gap's edge", () => {
        const bins = [435, 440, 480, 485].map((opd) => ({ opd, opdB: opd === 485 ? 480 : opd, tintA: tintAt(opd), tintB: tintAt(opd === 485 ? 480 : opd) }));
        expect(filmSpreadRatio(bins)!.bins).toBe(4);
      });
    });
  });

  /** One frame of `count` tiles, 20 x 20 px each, in a row. Each tile's on-frame is `colour(tile)` in 8-bit sRGB; the off-frame is black. */
  const tiles = (count: number, colour: (tile: number) => number[]) => {
    const [w, h] = [20 * count, 20];
    const on = { w, h, data: new Uint8ClampedArray(w * h * 4) };
    const off = { w, h, data: new Uint8ClampedArray(w * h * 4) };
    for (let p = 0; p < w * h; p++) {
      const c = colour(Math.floor((p % w) / 20));
      on.data.set([c[0]!, c[1]!, c[2]!, 255], p * 4);
      off.data.set([0, 0, 0, 255], p * 4);
    }
    return { on, off, w, h };
  };
  /** Film pixels over a whole frame: bin `opd(tile)` at A, 25 nm less at B; thickness `param(p)`, by default one level. */
  const pixels = (w: number, h: number, opd: (tile: number) => number, nv: (p: number) => number = () => 0.9, param: (p: number) => number = () => 0.5): FilmPixels => {
    const n = w * h;
    const px = Array.from({ length: n }, (_, p) => p);
    return {
      px,
      slot: px.map(() => 1),
      param: px.map(param),
      opdA: px.map((p) => opd(Math.floor((p % w) / 20))),
      opdB: px.map((p) => opd(Math.floor((p % w) / 20)) - 25),
      nv: px.map(nv),
    };
  };

  describe("the film's bins", () => {
    const WARM = [180, 120, 90];
    const COOL = [90, 120, 180];
    /** An 8-bit sRGB level in linear light. */
    const lin = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);

    it("bins by slot and OPD in steps of FILM_OPD_BIN, and counts a bin of 400 lit pixels", () => {
      const f = tiles(3, () => WARM);
      const bins = filmBins({ onA: f.on, offA: f.off, onB: f.on, offB: f.off }, pixels(f.w, f.h, (k) => 500 + k * 10 * FILM_OPD_BIN));
      expect(bins.map((b) => [b.slot, b.n, b.counted])).toEqual([[1, 400, true], [1, 400, true], [1, 400, true]]);
      expect(bins[1]!.opd).toBeCloseTo(550, 9);
      expect(bins[1]!.opdB).toBeCloseTo(525, 9);
    });
    it("does not count a bin under the highlight floor", () => {
      const f = tiles(1, () => [4, 4, 4]);
      expect(4 / 255 / 12.92).toBeLessThan(FILM_SPEC_MIN);
      expect(filmBins({ onA: f.on, offA: f.off, onB: f.on, offB: f.off }, pixels(f.w, f.h, () => 500))[0]!.counted).toBe(false);
    });
    it("leaves out pixels over the finish's knee (linear 0.8)", () => {
      const f = tiles(2, (k) => (k === 0 ? [240, 240, 240] : WARM));
      const bins = filmBins({ onA: f.on, offA: f.off, onB: f.on, offB: f.off }, pixels(f.w, f.h, () => 500));
      expect(bins).toHaveLength(1);
      expect(bins[0]!.n).toBe(400);
    });
    /**
     * `h` rows x 40 px of film at OPD 500 coloured by `colour(p)`, then 10 rows each at OPD 505 and 510 in WARM, so the
     * bin at 500 has a thickness curve on one side (Task 18e). `nv(p)` is each pixel's n.v.
     */
    const onRamp = (h: number, colour: (p: number) => number[], nv: (p: number) => number = () => 0.9) => {
      const [w, H] = [40, h + 20];
      const on = { w, h: H, data: new Uint8ClampedArray(w * H * 4) };
      const off = { w, h: H, data: new Uint8ClampedArray(w * H * 4) };
      for (let p = 0; p < w * H; p++) {
        on.data.set([...(p < w * h ? colour(p) : WARM), 255], p * 4);
        off.data.set([0, 0, 0, 255], p * 4);
      }
      const base = pixels(w, H, () => 500, (p) => (p < w * h ? nv(p) : 0.9));
      const px: FilmPixels = { ...base, opdA: Array.from(base.px, (p) => (p < w * h ? 500 : p < w * (h + 10) ? 505 : 510)) };
      return { frames: { onA: on, offA: off, onB: on, offB: off }, px };
    };
    it("(b) finds a colour that follows the column", () => {
      const { frames, px } = onRamp(20, (p) => (p % 40 < 20 ? WARM : COOL));
      const m = filmMatch(filmBins(frames, px))!;
      expect(m.split).toBe("column");
      expect(m.opd).toBeCloseTo(500, 9);
      expect(m.spread).toBeGreaterThan(0.1);
    });
    it("(b) finds a colour that follows n.v where the column and the row show nothing", () => {
      // Every second pixel, along columns and rows alike, has the high n.v and the warm colour.
      const high = (p: number) => ((p % 40) + Math.floor(p / 40)) % 2 === 0;
      const { frames, px } = onRamp(20, (p) => (high(p) ? WARM : COOL), (p) => (high(p) ? 0.95 : 0.85));
      const bins = filmBins(frames, px);
      const m = filmMatch(bins)!;
      expect(m.split).toBe("nv");
      expect(m.spread).toBeGreaterThan(0.1);
      const [p, q] = bins[0]!.splits.column!;
      expect(Math.hypot(p.tint[0]! - q.tint[0]!, p.tint[1]! - q.tint[1]!)).toBeLessThan(0.02);
    });
    it("(b) is null when no bin has two readable halves", () => {
      const f = tiles(1, () => WARM);
      const few: FilmPixels = { ...pixels(f.w, f.h, () => 500), px: [0], slot: [1], param: [0.5], opdA: [500], opdB: [475], nv: [0.9] };
      expect(filmMatch(filmBins({ onA: f.on, offA: f.off, onB: f.on, offB: f.off }, few))).toBeNull();
    });
    it("(b) gives each half its own mean OPD at A, from the pixels it holds", () => {
      // One bin (OPD 498 to 502): the top 20 rows at 498, the bottom 20 at 502, one colour.
      const [w, h] = [20, 40];
      const f = tiles(1, () => WARM);
      const on = { w, h, data: new Uint8ClampedArray([...f.on.data, ...f.on.data]) };
      const off = { w, h, data: new Uint8ClampedArray([...f.off.data, ...f.off.data]) };
      const base = pixels(w, h, () => 500);
      const px: FilmPixels = { ...base, opdA: Array.from(base.px, (p) => (p < w * 20 ? 498 : 502)) };
      const bins = filmBins({ onA: on, offA: off, onB: on, offB: off }, px);
      expect(bins).toHaveLength(1);
      const [top, bottom] = bins[0]!.splits.row!;
      expect([top.opd, bottom.opd]).toEqual([498, 502]);
      expect(bins[0]!.splits.column!.map((s) => s.opd)).toEqual([500, 500]);
      const t = filmTint(WARM.map(lin));
      expect(top.tint[0]).toBeCloseTo(t[0], 9);
      expect(bins[0]!.tint[1]).toBeCloseTo(t[1], 9);
    });
    it("(d) reads the mean tint distance to the bin further along the ramp, and 0 for one colour", () => {
      const f = tiles(11, (k) => (k % 2 ? WARM : COOL));
      const px = pixels(f.w, f.h, (k) => 400 + k * 10 * FILM_OPD_BIN);
      const d = filmApart(filmBins({ onA: f.on, offA: f.off, onB: f.on, offB: f.off }, px))!;
      // Span 500 nm, so D = min(275, 250) = 250 nm: five bins along, an odd count, so every pair differs.
      expect(d.d).toBeCloseTo(250, 6);
      expect(d.pairs).toBe(6);
      expect(d.dist).toBeGreaterThan(0.1);
      const g = tiles(11, () => WARM);
      expect(filmApart(filmBins({ onA: g.on, offA: g.off, onB: g.on, offB: g.off }, px))!.dist).toBeCloseTo(0, 6);
    });
    it("(d) caps the distance at 275 nm", () => {
      const f = tiles(16, () => WARM);
      const px = pixels(f.w, f.h, (k) => 400 + k * 10 * FILM_OPD_BIN);
      expect(filmApart(filmBins({ onA: f.on, offA: f.off, onB: f.on, offB: f.off }, px))!.d).toBe(275);
    });
    it("(d) is null when the span is under 20 nm", () => {
      const f = tiles(3, () => WARM);
      const px = pixels(f.w, f.h, (k) => 500 + k * FILM_OPD_BIN);
      expect(filmApart(filmBins({ onA: f.on, offA: f.off, onB: f.on, offB: f.off }, px))).toBeNull();
    });
    describe("(e)'s read floor: the page's (b) reading over (e)'s denominator, under relight.filmSpread", () => {
      const ramp = (k: number) => [120 + k * 8, 120, 200 - k * 8];
      const f = tiles(11, ramp);
      const px = pixels(f.w, f.h, (k) => 400 + k * FILM_OPD_BIN);
      // A film that ignores the angle: frame B is frame A.
      const noAngle = filmBins({ onA: f.on, offA: f.off, onB: f.on, offB: f.off }, px);
      // An honest film: at B each bin shows the colour 25 nm back along its ramp, where its OPD has moved.
      const back = tiles(11, (k) => ramp(k - 5));
      const honest = filmBins({ onA: f.on, offA: f.off, onB: back.on, offB: back.off }, px);
      const LIMIT = 0.5;
      const denomOf = (bins: FilmBin[]) => filmSpread(bins, 0, 0, LIMIT)!.denom;
      const CASES = [
        ["an honest film", honest],
        ["a film that ignores the angle", noAngle],
      ] as const;

      it.each(CASES)("a clear denominator reads: %s", (_, bins) => {
        expect(filmSpread(bins, 0, denomOf(bins) * 0.1, LIMIT)!.read).toBe(true);
      });
      it.each(CASES)("a denominator near the noise stays unread: %s", (_, bins) => {
        expect(filmSpread(bins, 0, denomOf(bins) * 0.6, LIMIT)!.read).toBe(false);
      });
      it.each(CASES)("noise at exactly the limit stays unread: %s", (_, bins) => {
        expect(filmSpread(bins, 0, denomOf(bins) * LIMIT, LIMIT)!.read).toBe(false);
      });
      it("gives each film's own ratio, read or not", () => {
        expect(filmSpread(honest, 0, denomOf(honest) * 0.1, LIMIT)!.ratio).toBeLessThan(0.1);
        expect(filmSpread(noAngle, 0, denomOf(noAngle) * 0.6, LIMIT)!.ratio).toBeCloseTo(1, 6);
      });
      it("stays unread when the page has no (b) reading to measure its noise", () => {
        expect(filmSpread(noAngle, 0, null, LIMIT)!.read).toBe(false);
      });
      it("takes no part of its decision from the tint step", () => {
        expect(filmSpread(noAngle, 10, denomOf(noAngle) * 0.1, LIMIT)!.read).toBe(true);
      });
      it("takes the worst slot that is read, in either order", () => {
        const inSlot = (bins: FilmBin[], slot: number) => bins.map((b) => ({ ...b, slot }));
        const noise = denomOf(noAngle) * 0.1;
        const first = filmSpread([...inSlot(honest, 1), ...inSlot(noAngle, 2)], 0, noise, LIMIT)!;
        expect(first.slot).toBe(2);
        expect(first.ratio).toBeCloseTo(1, 6);
        expect(filmSpread([...inSlot(noAngle, 1), ...inSlot(honest, 2)], 0, noise, LIMIT)!.slot).toBe(1);
      });
    });
    it("subtracts the off-frame: a bin's highlight is on minus off, in linear light", () => {
      const f = tiles(1, () => WARM);
      const dim = [60, 90, 120];
      const off = tiles(1, () => dim);
      const bins = filmBins({ onA: f.on, offA: off.on, onB: f.on, offB: off.on }, pixels(f.w, f.h, () => 500));
      WARM.forEach((v, k) => expect(bins[0]!.a.h[k]).toBeCloseTo(lin(v) - lin(dim[k]!), 9));
    });
    it("keys its bins on the OPD at A, whatever the OPD at B", () => {
      const f = tiles(2, () => WARM);
      const base = pixels(f.w, f.h, () => 500);
      const px: FilmPixels = { ...base, opdB: Array.from(base.px, (p) => (p % f.w < 20 ? 475 : 400)) };
      const bins = filmBins({ onA: f.on, offA: f.off, onB: f.on, offB: f.off }, px);
      expect(bins).toHaveLength(1);
      expect(bins[0]!.n).toBe(800);
    });
    it("(d) reads the colours at A, never at B", () => {
      const stripes = tiles(11, (k) => (k % 2 ? WARM : COOL));
      const flat = tiles(11, () => WARM);
      const px = pixels(stripes.w, stripes.h, (k) => 400 + k * 10 * FILM_OPD_BIN);
      expect(filmApart(filmBins({ onA: stripes.on, offA: stripes.off, onB: flat.on, offB: flat.off }, px))!.dist).toBeGreaterThan(0.1);
      expect(filmApart(filmBins({ onA: flat.on, offA: flat.off, onB: stripes.on, offB: stripes.off }, px))!.dist).toBeCloseTo(0, 6);
    });
    it("(d) is the mean over its pairs, not their sum", () => {
      const f = tiles(11, (k) => (k % 2 ? WARM : COOL));
      const px = pixels(f.w, f.h, (k) => 400 + k * 10 * FILM_OPD_BIN);
      const d = filmApart(filmBins({ onA: f.on, offA: f.off, onB: f.on, offB: f.off }, px))!;
      const [p, q] = [filmTint(WARM.map(lin)), filmTint(COOL.map(lin))];
      // Every pair is five bins along, an odd count, so every pair is one warm and one cool bin.
      expect(d.pairs).toBeGreaterThan(1);
      expect(d.dist).toBeCloseTo(Math.hypot(p[0] - q[0], p[1] - q[1]), 6);
    });
    it("(b) finds a colour that follows the row where the column and n.v show nothing", () => {
      const { frames, px } = onRamp(40, (p) => (Math.floor(p / 40) < 20 ? WARM : COOL));
      const m = filmMatch(filmBins(frames, px))!;
      expect(m.split).toBe("row");
      expect(m.spread).toBeGreaterThan(0.1);
    });
    describe("(b) removes the halves' thickness difference along the ramp's own curve (Task 18e)", () => {
      type Tint = readonly number[];
      /**
       * A tint path quadratic in OPD, as steel's beside its gap: it moves 0.018 per nm at 175 nm (26 degrees of hue per
       * bin at a tint radius of 0.2) and curves 0.00162 per nm squared across that (0.2 x 0.09 squared).
       */
      const quad = (o: number): [number, number] => [0.05 + 0.018 * (o - 175), 0.03 + 0.5 * 0.00162 * (o - 175) ** 2];
      const halvesOn = (opd: number, tint: (o: number) => Tint, d: number): [{ opd: number; tint: Tint }, { opd: number; tint: Tint }] => [
        { opd: opd - d / 2, tint: tint(opd - d / 2) },
        { opd: opd + d / 2, tint: tint(opd + d / 2) },
      ];
      /** A counted bin of `slot` at mean OPD `opd` on `tint`; its row halves, when given, `d` nm apart on the same path. */
      const bin = (opd: number, tint: (o: number) => Tint = quad, d: number | null = null, slot = 1) => ({
        slot,
        opd,
        n: 800,
        counted: true,
        tint: tint(opd) as [number, number],
        splits: { column: null, row: d === null ? null : halvesOn(opd, tint, d), nv: null },
      });

      it("a bin beside a gap on a curved ramp reads about 0, where a straight one-sided slope reads about 0.01", () => {
        // Counted bins at 165, 170 and 175 nm; 180 is in the gap, so the bin at 175 has neighbours on one side only.
        const bins = [bin(165), bin(170), bin(175, quad, 2.5)];
        const m = filmMatch(bins)!;
        expect(m.opd).toBe(175);
        expect(m.split).toBe("row");
        expect(m.spread).toBeLessThan(1e-9);
        // The same halves, uncorrected and corrected by the secant from 170 to 175: the curve is what this row tests.
        const [p, q] = bins[2]!.splits.row!;
        const dt = [p.tint[0]! - q.tint[0]!, p.tint[1]! - q.tint[1]!];
        expect(Math.hypot(dt[0]!, dt[1]!)).toBeGreaterThan(0.04);
        const s = [0, 1].map((c) => (quad(175)[c]! - quad(170)[c]!) / 5);
        const secant = Math.hypot(dt[0]! - s[0]! * (p.opd - q.opd), dt[1]! - s[1]! * (p.opd - q.opd));
        expect(secant).toBeGreaterThan(0.009);
        expect(secant).toBeLessThan(0.011);
      });
      it("a bin between two counted neighbours reads about 0 on the curve, its halves unequal about its mean", () => {
        const b = bin(175);
        const bins = [bin(170), { ...b, splits: { ...b.splits, row: [{ opd: 174, tint: quad(174) }, { opd: 177, tint: quad(177) }] as const } }, bin(180)];
        expect(filmMatch(bins)!.spread).toBeLessThan(1e-9);
      });
      it("a bin whose halves differ in colour at equal OPD reads that difference", () => {
        const b = bin(500);
        const split = [{ opd: 500, tint: quad(500) }, { opd: 500, tint: [quad(500)[0] + 0.03, quad(500)[1] + 0.04] }] as const;
        const m = filmMatch([bin(495), { ...b, splits: { ...b.splits, column: split } }, bin(505)])!;
        expect(m.split).toBe("column");
        expect(m.spread).toBeCloseTo(0.05, 9);
      });
      it("takes no curve across a gap of uncounted bins", () => {
        // Two ramps of different colour: 160 to 175 nm and 185 to 195 nm, nothing at 180.
        const other = (o: number): [number, number] => [-0.3 - 0.01 * (o - 190), 0.2 + 0.002 * (o - 190) ** 2];
        const bins = [bin(160), bin(165), bin(170), bin(175, quad, 2.5), bin(185, other, 2.5), bin(190, other), bin(195, other)];
        expect(filmMatch(bins)!.spread).toBeLessThan(1e-9);
      });
      it("does not read a bin without three neighbouring counted bins of its slot, itself included", () => {
        const b = bin(500);
        const odd = { ...b, splits: { ...b.splits, column: [{ opd: 500, tint: [0, 0] }, { opd: 500, tint: [0.2, 0] }] as const } };
        // One neighbour on one side only, and none on the other.
        expect(filmMatch([bin(490), odd, bin(505)])).toBeNull();
        // Neighbours of another slot, or not counted, make no curve.
        expect(filmMatch([bin(495, quad, null, 2), odd, bin(505, quad, null, 2)])).toBeNull();
        expect(filmMatch([odd, bin(505), { ...bin(510), counted: false }])).toBeNull();
        // Two on one side make one.
        expect(filmMatch([bin(490), odd, bin(505), bin(510)])!.spread).toBeGreaterThan(0.1);
      });
    });
    it("gives the tint step over position A's bins, and over both positions' bins", () => {
      const f = tiles(2, () => WARM);
      const dim = tiles(2, () => [60, 40, 30]);
      const bins = filmBins({ onA: f.on, offA: f.off, onB: dim.on, offB: dim.off }, pixels(f.w, f.h, (k) => 500 + k * 10));
      const s = filmSteps(bins);
      expect(s.a).toBeGreaterThan(0);
      expect(s.ab).toBeGreaterThan(s.a);
    });
  });

  describe("filmTexels", () => {
    it("keeps full, uninked texels of the film's slots, with each one's param and n.v", () => {
      const [w, h] = [4, 3];
      const n = w * h;
      const grid = {
        w,
        h,
        // A ramp in x: slope 0.01 per texel, in short-side units 0.01 x 3 = 0.03.
        height: Array.from({ length: n }, (_, k) => (k % w) * 0.01),
        coverage: new Array(n).fill(1).map((v, k) => (k === 5 ? 0.5 : v)),
        ink: new Array(n).fill(0).map((v, k) => (k === 6 ? 1 : v)),
        slot: new Array(n).fill(1).map((v, k) => (k === 9 ? 0 : v)),
        param: Array.from({ length: n }, (_, k) => k / n),
      };
      const t = filmTexels(grid, [1], 0.99);
      expect(t.k).not.toContain(5);
      expect(t.k).not.toContain(6);
      expect(t.k).not.toContain(9);
      expect(t.k).toHaveLength(9);
      const i = t.k.indexOf(2 * 4 + 2); // row 2, column 2
      expect(t.param[i]).toBeCloseTo(t.k[i]! / n, 9);
      expect(t.nv[i]).toBeCloseTo(1 / Math.hypot(0.03, 0, 1), 9);
      expect(t.slot[i]).toBe(1);
    });
  });

  describe("sheetHeld compares the param channel", () => {
    it("a thickness that drifts is a surface that moved", () => {
      const base = { height: [0, 0], coverage: [1, 1], slot: [1, 1], ink: [0, 0] };
      expect(sheetHeld({ ...base, param: [0.1, 0.2] }, { ...base, param: [0.1, 0.2] }, 2, 1, 0)).toEqual([1, 1]);
      expect(sheetHeld({ ...base, param: [0.1, 0.2] }, { ...base, param: [0.1, 0.3] }, 2, 1, 0)).toEqual([1, 0]);
    });
    it("a sheet read with no param still compares its other channels", () => {
      const base = { height: [0, 0], coverage: [1, 1], slot: [1, 1], ink: [0, 0] };
      expect(sheetHeld(base, base, 2, 1, 0)).toEqual([1, 1]);
    });
  });

  /** Test limits: this row's own, no threshold key. */
  const LIM: FilmLimits = { shift: 0.01, match: 0.05, band: 0.01, apart: 0.1, spread: 0.5 };
  const GOOD: FilmReading = {
    film: 1000,
    turn: 30,
    key: 0.02,
    tilt: 0.02,
    time: 0,
    still: 1,
    match: { spread: 0.01, raw: 0.02, split: "column", slot: 1, opd: 500, n: 800 },
    apart: { dist: 0.3, pairs: 40, span: 600, d: 275 },
    spread: { ratio: 0.2, denom: 0.05, step: 0.01, noise: 0.01, bins: 40, slot: 1, read: true },
    bins: { a: 80, b: 70 },
    step: 0.01,
  };
  const LINES = {
    key: /\(a\) turning/,
    tilt: /\(a\) tilting/,
    match: /\(b\) film/,
    time: /\(c\) with nothing moved/,
    apart: /\(d\) film/,
    spread: /\(e\) turning/,
  };
  const FLIPS: [keyof typeof LINES, Partial<FilmReading>][] = [
    ["key", { key: 0.01 }],
    ["tilt", { tilt: 0.01 }],
    ["match", { match: { ...GOOD.match!, spread: 0.05 } }],
    ["time", { time: 0.01 }],
    ["apart", { apart: { ...GOOD.apart!, dist: 0.1 } }],
    ["spread", { spread: { ...GOOD.spread!, ratio: 0.5 } }],
  ];

  describe("filmVerdict", () => {
    it("passes a reading on the right side of every limit", () => {
      const v = filmVerdict(GOOD, LIM);
      expect(v.status).toBe("pass");
      expect(v.line).toMatch(/^iridescence pass \(/);
      for (const re of Object.values(LINES)) expect(v.line).not.toMatch(re);
    });
    it.each(FLIPS)("%s at its limit fails on its own line alone", (own, change) => {
      const v = filmVerdict({ ...GOOD, ...change }, LIM);
      expect(v.status).toBe("fail");
      expect(v.line).toMatch(/^iridescence FAIL \(/);
      for (const [name, re] of Object.entries(LINES)) {
        if (name === own) expect(v.line).toMatch(re);
        else expect(v.line).not.toMatch(re);
      }
    });
    it("is partial when the frame holds no film", () => {
      const v = filmVerdict({ ...GOOD, film: 0 }, LIM);
      expect(v.status).toBe("partial");
      expect(v.line).toMatch(/no film/);
    });
    it("is partial when no film pixel held still: (c) not read", () => {
      const v = filmVerdict({ ...GOOD, time: null, still: 0 }, LIM);
      expect(v.status).toBe("partial");
      expect(v.line).toMatch(/\(c\) cannot be read/);
    });
    it("is partial when no bin has two readable halves: (b) not read", () => {
      const v = filmVerdict({ ...GOOD, match: null }, LIM);
      expect(v.status).toBe("partial");
      expect(v.line).toMatch(/\(b\) cannot be read/);
    });
    it("is partial when the ramp gives no pair: (d) not read", () => {
      const v = filmVerdict({ ...GOOD, apart: null }, LIM);
      expect(v.status).toBe("partial");
      expect(v.line).toMatch(/\(d\) cannot be read/);
    });
    it("a fail outranks a partial", () => {
      expect(filmVerdict({ ...GOOD, key: 0, time: null }, LIM).status).toBe("fail");
    });
    it("reads no tilt on a page that does not tilt", () => {
      const v = filmVerdict({ ...GOOD, tilt: null }, LIM);
      expect(v.status).toBe("pass");
      expect(v.measured["iridescence.film.tilt"]).toBeUndefined();
    });
    it("(e) not read: no bin qualifies, and the verdict comes from (a) to (d)", () => {
      const v = filmVerdict({ ...GOOD, spread: null }, LIM);
      expect(v.status).toBe("pass");
      expect(v.line).toContain(FILM_E_NOT_READ);
    });
    it("(e) not read: a ratio whose denominator is near the page's noise decides nothing, however large", () => {
      const v = filmVerdict({ ...GOOD, spread: { ...GOOD.spread!, ratio: 9, read: false } }, LIM);
      expect(v.status).toBe("pass");
      expect(v.line).toContain(FILM_E_NOT_READ);
      expect(v.measured["iridescence.film.spread"]).toBeUndefined();
    });
    it("words (e) not read with the noise floor's reason", () => {
      expect(FILM_E_NOT_READ).toBe("(e) not read: the key's turn moves the film along its own ramp too little to tell from the page's own noise");
    });
    it("a fail line says when (e) was not read, and only then", () => {
      const unread = filmVerdict({ ...GOOD, key: 0, spread: { ...GOOD.spread!, read: false } }, LIM);
      expect(unread.status).toBe("fail");
      expect(unread.line).toContain(FILM_E_NOT_READ);
      expect(filmVerdict({ ...GOOD, key: 0 }, LIM).line).not.toContain(FILM_E_NOT_READ);
    });
    it("writes its readings under iridescence.film", () => {
      const v = filmVerdict(GOOD, LIM);
      expect(v.measured).toMatchObject({
        "iridescence.film.px": 1000,
        "iridescence.film.key": 0.02,
        "iridescence.film.tilt": 0.02,
        "iridescence.film.time": 0,
        "iridescence.film.match": 0.01,
        "iridescence.film.apart": 0.3,
        "iridescence.film.spread": 0.2,
      });
      for (const k of Object.keys(v.measured)) expect(k.startsWith("iridescence.film.")).toBe(true);
    });
  });

  describe("filmLimits", () => {
    it("reads each condition's limit from its own key, and (c) from relight.ambientBand", () => {
      const seen: string[] = [];
      const lim = filmLimits((name) => (seen.push(name), seen.length));
      expect(seen).toEqual(["relight.filmShift", "relight.filmMatch", "relight.ambientBand", "relight.filmApart", "relight.filmSpread"]);
      expect(lim).toEqual({ shift: 1, match: 2, band: 3, apart: 4, spread: 5 });
    });
    it("thresholds.json holds the four film keys with a value over 0", () => {
      for (const k of ["relight.filmShift", "relight.filmMatch", "relight.filmApart", "relight.filmSpread"]) expect(threshold(k, null)).toBeGreaterThan(0);
    });
  });

  describe("iridescenceJoin", () => {
    const part = (status: "pass" | "partial" | "fail", word: string, text: string, key: string) => ({
      status,
      line: `iridescence ${word} (${text})`,
      measured: { [key]: 1 },
    });
    const foilPass = part("pass", "pass", "foil holds", "iridescence.light");
    const filmPartial = part("partial", "PARTIAL", "film unread", "iridescence.film.key");
    const filmFail = part("fail", "FAIL", "film moved", "iridescence.film.key");

    it("keeps a foil-only page's result exactly", () => {
      expect(iridescenceJoin(foilPass, null)).toBe(foilPass);
    });
    it("keeps a film-only page's result exactly", () => {
      expect(iridescenceJoin(null, filmFail)).toBe(filmFail);
    });
    it("gives the worse status, partial over pass", () => {
      const v = iridescenceJoin(foilPass, filmPartial);
      expect(v.status).toBe("partial");
      expect(v.line).toBe("iridescence PARTIAL (foil: foil holds; film: film unread)");
    });
    it("gives the worse status, fail over partial, in either place", () => {
      const v = iridescenceJoin(part("partial", "PARTIAL", "foil unread", "iridescence.light"), filmFail);
      expect(v.status).toBe("fail");
      expect(v.line).toBe("iridescence FAIL (foil: foil unread; film: film moved)");
      expect(iridescenceJoin(part("fail", "FAIL", "foil moved", "iridescence.light"), filmPartial).status).toBe("fail");
    });
    it("passes only when both pass, and keeps both parts' readings", () => {
      const v = iridescenceJoin(foilPass, part("pass", "pass", "film holds", "iridescence.film.key"));
      expect(v.status).toBe("pass");
      expect(v.measured).toEqual({ "iridescence.light": 1, "iridescence.film.key": 1 });
    });
  });
});
