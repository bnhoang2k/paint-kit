// Behaviour tests for the water field's lifted layer (water layer round, 2026-11-14), on test/pages/water-layer.html
// and its planted fault test/faults/water-layer-at-floor. Bar 05's card rippled about 7% of its width, the reference
// 2 to 4% (review-bar-05-fix1.md): the card was painted onto the floor and seen at the floor's depth. A layer is
// seen at its own depth, so its outline's ripple scales with that depth.
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeBrowsers, openPage, type Rgba } from "../../src/checks/harness.ts";
import { luminance, meanAbsDiff } from "../../src/checks/image.ts";
import { outlineRipple } from "../../src/checks/outline.ts";
import { serveRoot } from "../../src/checks/serve.ts";
import { threshold } from "../../src/checks/threshold.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");
// Bar 05's view and card (water-layer.html CARD): 0.59 short sides wide, 852 / 393 times as tall, centred.
const W = 393;
const H = 852;
const CW = 0.59 * W;
const CH = CW * (852 / 393);
const BOX = { x0: W / 2 - CW / 2, y0: H / 2 - CH / 2, x1: W / 2 + CW / 2, y1: H / 2 + CH / 2 };
// The review's measure (review-bar-05-fix1.md): first pixel with luma under 60 / 255 from outside, corners out
// (the card's corner radius is 0.07 of its width, 16 px; 24 px leaves them out), searched 30 px each side (the
// floor's 7% ripple is 16 px peak to peak).
const RIPPLE = { cut: 60 / 255, corner: 24, reach: 30 };
const TIMES = [2, 2.5, 3, 3.5];
let server: { url: string; close(): Promise<void> };

beforeAll(async () => {
  server = await serveRoot(ROOT);
});
afterAll(async () => {
  await server?.close();
  await closeBrowsers();
});

/**
 * The outline's ripple on `page` with these query switches: the mean over TIMES of the mean peak to peak of the
 * four edges, as a share of the card's width. Light mode, seed 1, detail 0.5, dpr 1. `caustic` false switches the
 * light's caustic off (the outline is the refraction's alone; the caustic's bright lines on the dark frame are not
 * part of it), as the guard reads it; true reads it as the review did.
 */
async function rippleOf(page: string, query: string, caustic = false): Promise<{ mean: number; edges: number[][] }> {
  const h = await openPage(`${server.url}/${page}${query}`, { dpr: 1, width: W, height: H, seed: 1, detail: 0.5, t: TIMES[0]! });
  try {
    if (!caustic) await h.hook("__paint.setLight(0, { caustic: 0 })");
    const edges: number[][] = [];
    for (const t of TIMES) {
      await h.hook(`__paint.setTime(${t})`);
      const r = outlineRipple(await h.shot(), BOX, RIPPLE);
      edges.push([r.top, r.left, r.right, r.bottom].map((v) => v / CW));
    }
    const all = edges.flat();
    return { mean: all.reduce((a, b) => a + b, 0) / all.length, edges };
  } finally {
    await h.close();
  }
}
const pct = (x: number) => `${(100 * x).toFixed(2)}%`;
const PAGE = "test/pages/water-layer.html";
const FAULT = "test/faults/water-layer-at-floor/index.html";

/**
 * The guard: a layer at depth 0.25 (rise 0.75 over the floor at 1.0) against one at 0.5 (rise 0.5). Refraction moves
 * the seen point by an offset linear in the depth (waterView), so the shallow layer's ripple is about half the deep
 * one's. Read at the floor's depth for both, the two are the same (ratio about 1).
 */
async function layerScales(page: string) {
  const deep = await rippleOf(page, "?rise=0.5");
  const shallow = await rippleOf(page, "?rise=0.75");
  return { deep, shallow, ratio: shallow.mean / deep.mean };
}

describe("water layer", () => {
  it("a layer's outline ripples less the shallower it sits", async () => {
    const r = await layerScales(PAGE);
    console.log(`water layer: depth 0.5 ${pct(r.deep.mean)}, depth 0.25 ${pct(r.shallow.mean)} of the card's width; ratio ${r.ratio.toFixed(3)}`);
    for (const e of [...r.deep.edges, ...r.shallow.edges]) for (const v of e) expect(Number.isFinite(v)).toBe(true);
    expect(r.deep.mean).toBeGreaterThan(0);
    expect(r.ratio).toBeLessThan(threshold("water.layerRippleRatio", null));
  }, 120_000);

  it("a layer read at the floor's depth fails", async () => {
    // Engine fault 'layer-at-floor': the layer's picture is read where the eye meets the floor, not the layer.
    const r = await layerScales(FAULT);
    console.log(`water-layer-at-floor: depth 0.5 ${pct(r.deep.mean)}, depth 0.25 ${pct(r.shallow.mean)}; ratio ${r.ratio.toFixed(3)}`);
    expect(r.deep.mean).toBeGreaterThan(0);
    expect(r.ratio).toBeGreaterThanOrEqual(threshold("water.layerRippleRatio", null));
  }, 120_000);

  // Readings for bar 05's round 2, not asserted: the layer at a range of depths and bar 05's present way (the card
  // painted into the floor and lifted by a rise map of 0.45), with the caustic off and on (the review's way).
  it("ripple by depth, for bar 05", async () => {
    const rows: string[] = [];
    for (const [label, q] of [["layer rise 0 (depth 1.0)", "?rise=0"], ["layer rise 0.4 (depth 0.6)", "?rise=0.4"], ["layer rise 0.5 (depth 0.5)", "?rise=0.5"], ["layer rise 0.6 (depth 0.4)", "?rise=0.6"], ["layer rise 0.7 (depth 0.3)", "?rise=0.7"], ["layer rise 0.75 (depth 0.25)", "?rise=0.75"], ["old: painted, rise map 0.45", "?old=0.45"]]) {
      const off = await rippleOf(PAGE, q!);
      const on = await rippleOf(PAGE, q!, true);
      const span = (e: number[][]) => `${pct(Math.min(...e.flat()))} to ${pct(Math.max(...e.flat()))}`;
      rows.push(`${label}: caustic off mean ${pct(off.mean)} (${span(off.edges)}), on mean ${pct(on.mean)} (${span(on.edges)})`);
    }
    console.log(`ripple by depth (mean of 4 edges x t ${TIMES.join(", ")}, % of card width):\n${rows.join("\n")}`);
  }, 120_000);

  // The layer adds to the pool and changes nothing else: well clear of the card, the floor is the plain floor's.
  it("a layer leaves the floor clear of it unchanged", async () => {
    const shot = async (q: string): Promise<Rgba> => {
      const h = await openPage(`${server.url}/${PAGE}${q}`, { dpr: 1, width: W, height: H, seed: 1, detail: 0.5, t: 2 });
      try {
        await h.hook("__paint.setTime(2)");
        return await h.shot(q.startsWith("?rise=0.5") ? "water-layer-0.5" : undefined);
      } finally {
        await h.close();
      }
    };
    const layer = await shot("?rise=0.5");
    const plain = await shot("?none");
    const clear = (x: number) => x < BOX.x0 - 30 || x >= BOX.x1 + 30;
    let s = 0;
    let n = 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (!clear(x)) continue;
        for (let c = 0; c < 3; c++) s += Math.abs(layer.data[(y * W + x) * 4 + c]! - plain.data[(y * W + x) * 4 + c]!);
        n++;
      }
    const floor = s / (n * 3 * 255);
    const card = meanAbsDiff(layer, plain);
    console.log(`layer 0.5 vs no card at t 2: floor clear of the card ${floor.toFixed(6)}, whole frame ${card.toFixed(6)}`);
    expect(floor).toBe(0);
    expect(card).toBeGreaterThan(0.01);
  }, 120_000);

  // The layer moves through uniforms: its rise and shift as functions of t draw new frames with no shader compile
  // and no texture upload (its picture uploads once).
  it("a moving layer needs no compile and no upload", async () => {
    const COUNT_GL = `(() => {
      globalThis.__gl = { compiles: 0, uploads: 0 };
      const P = WebGL2RenderingContext.prototype;
      const wrap = (name, key) => { const f = P[name]; P[name] = function (...a) { globalThis.__gl[key]++; return f.apply(this, a); }; };
      wrap("compileShader", "compiles");
      wrap("texImage2D", "uploads");
      wrap("texSubImage2D", "uploads");
    })()`;
    const h = await openPage(`${server.url}/${PAGE}?moving`, { dpr: 1, width: W, height: H, seed: 1, t: 2, initScript: COUNT_GL });
    try {
      const gl = () => h.hook<{ compiles: number; uploads: number }>("({ ...globalThis.__gl })");
      const g0 = await gl();
      const first = await h.shot();
      for (let k = 1; k <= 30; k++) await h.hook(`__paint.setTime(${2 + k / 60})`);
      const moved = meanAbsDiff(first, await h.shot());
      const g1 = await gl();
      console.log(`moving layer 2 s -> 2.5 s: ${g1.compiles - g0.compiles} compiles, ${g1.uploads - g0.uploads} uploads; frame moved ${moved.toFixed(4)}`);
      expect(moved).toBeGreaterThan(0.005);
      expect(g1.compiles - g0.compiles).toBe(0);
      expect(g1.uploads - g0.uploads).toBe(0);
      expect(h.errors).toEqual([]);
    } finally {
      await h.close();
    }
  }, 120_000);

  // ---- Fix round 1 (review-water-layer.md: Important 1, Important 2, Minor 2). Each tolerance below was set from
  // the reason in its `why`, before the first measurement, and is not tuned to the readings.

  // The layer's caustic, at its own depth. The light's caustic depends only on the point and the depth
  // (waterCaustic(x, t, l, ior, bed, px)), and a flat layer at depth 0.4 is met by the same refracted ray as a plain
  // floor at depth 0.4. So on the card's panel (tone 0.03) the caustic alone (frame with the caustic on, less frame
  // with it off, as the relight caustic law reads it) at rise 0.6 over a floor at 1.0 must match a plain floor of the
  // panel's tone at depth 0.4, pixel for pixel. Read inside the panel, inset 20 px from its edges (the ripple at depth
  // 0.4 moves an edge at most about 6 px: half the largest single-edge reading, 5.34% of 232 px).
  it("a layer's caustic is the floor's caustic at the layer's depth", async () => {
    const r = await causticMatch(PAGE);
    console.log(`layer caustic at rise 0.6 vs plain floor at depth 0.4 (panel inset ${INSET} px): ${r.rows.join("; ")}`);
    for (const row of r.diffs) expect(row).toBeLessThanOrEqual(CAUSTIC_MATCH.value);
    for (const sig of r.signal) expect(sig).toBeGreaterThan(CAUSTIC_SIGNAL.value);
  }, 120_000);

  it("a layer's caustic drawn at the floor's depth fails", async () => {
    // Planted fault water-layer-caustic-at-floor: the light's layer caustic reads uWaterFloor (1.0) for its depth.
    const r = await causticMatch(CAUSTIC_FAULT);
    console.log(`water-layer-caustic-at-floor: ${r.rows.join("; ")}; shaders patched ${r.hits}`);
    expect(r.hits).toBeGreaterThan(0);
    expect(Math.max(...r.diffs)).toBeGreaterThan(CAUSTIC_MATCH.value);
  }, 120_000);

  // Task 2e: its own test, so each planted fault runs alone in under 120 s.
  it("a layer with no caustic at all fails", async () => {
    // Planted fault water-layer-caustic-off: no caustic on the layer at all (flat light where it covers).
    const off = await causticMatch(CAUSTIC_OFF_FAULT);
    console.log(`water-layer-caustic-off: ${off.rows.join("; ")}; shaders patched ${off.hits}`);
    expect(off.hits).toBeGreaterThan(0);
    expect(Math.max(...off.diffs)).toBeGreaterThan(CAUSTIC_MATCH.value);
  }, 120_000);

  // The layer moves by its own uniforms. The waves alone change the frame between two times, so the guard reads one
  // fixed time: `?moving`, stepped from T0 to T1 in 20 draws a second, must draw what a still layer set to the same rise
  // and shift draws at T1; and the card's outline must move by the shift between T0 and T1. T1 is picked so both
  // change clearly (fix round 2; review-water-layer-fix1.md, Minor 2): the rise goes from 0.581 to 0.438 and the shift
  // from +0.0197 to -0.0083 short sides, so the card drops about 11.0 px.
  it("a moving layer draws its rise and shift of that frame", async () => {
    const r = await movingMatch(PAGE);
    console.log(`moving layer at t ${T1} vs still layer (rise ${riseAt(T1).toFixed(4)}, shift y ${shiftAt(T1).toFixed(4)}): mean abs diff ${r.diff.toFixed(6)}; outline centre moved ${r.moved.toFixed(2)} px, shift ${r.expected.toFixed(2)} px`);
    expect(r.diff).toBeLessThanOrEqual(MOVING_MATCH.value);
    expect(Math.abs(r.moved - r.expected)).toBeLessThan(MOVE_TOL.value * Math.abs(r.expected));
  }, 120_000);

  it("a layer whose rise alone is not set per frame fails", async () => {
    // Planted fault water-layer-frozen-rise: the rise uniform keeps its first value; the shift and the waves move.
    const r = await movingMatch(FROZEN_RISE_FAULT);
    console.log(`water-layer-frozen-rise: mean abs diff ${r.diff.toFixed(6)}; outline centre moved ${r.moved.toFixed(2)} px, shift ${r.expected.toFixed(2)} px; uniform sets dropped ${r.hits}`);
    expect(r.hits).toBeGreaterThan(0);
    expect(r.diff).toBeGreaterThan(MOVING_MATCH.value);
  }, 120_000);

  it("a layer whose rise and shift are not set per frame fails", async () => {
    // Planted fault water-layer-frozen: the rise and shift uniforms keep their first values; the waves still move.
    const r = await movingMatch(FROZEN_FAULT);
    console.log(`water-layer-frozen: mean abs diff ${r.diff.toFixed(6)}; outline centre moved ${r.moved.toFixed(2)} px, shift ${r.expected.toFixed(2)} px; uniform sets dropped ${r.hits}`);
    expect(r.hits).toBeGreaterThan(0);
    expect(r.diff).toBeGreaterThan(MOVING_MATCH.value);
    expect(Math.abs(r.moved - r.expected)).toBeGreaterThanOrEqual(MOVE_TOL.value * Math.abs(r.expected));
  }, 120_000);

  // The depth's scale, from both sides. The ratio guard above reads two depths of the same expression, so a scale
  // error passes it. (1) Rise 0.5 over rise 0 is depth 0.5 over 1.0, so the ripple ratio sits near 0.5; a squared
  // depth gives 0.25. (2) A ratio cannot see a depth halved everywhere, so the layer at rise 0 is anchored to the
  // floor's own path: the old way at rise map 0 (the card painted into the floor, seen through waterSeen at the
  // floor's depth 1.0). Equal depths give a ripple ratio near 1; a halved depth gives 0.5.
  it("a layer's depth is the floor less its rise, to scale", async () => {
    const r = await depthScale(PAGE);
    console.log(`depth scale: rise 0.5 ${pct(r.half)}, rise 0 ${pct(r.zero)}, old way at rise map 0 ${pct(r.floor)}; ratio 0.5/0 ${r.ratio.toFixed(3)}, rise 0 / floor ${r.anchor.toFixed(3)}`);
    expect(r.ratio).toBeGreaterThan(DEPTH_RATIO.lo);
    expect(r.ratio).toBeLessThan(DEPTH_RATIO.hi);
    expect(r.anchor).toBeGreaterThan(RISE0_ANCHOR.lo);
    expect(r.anchor).toBeLessThan(RISE0_ANCHOR.hi);
  }, 120_000);

  it("a layer depth squared fails", async () => {
    const sq = await depthScale(SQUARED_FAULT);
    console.log(`water-layer-depth-squared: rise 0.5 ${pct(sq.half)}, rise 0 ${pct(sq.zero)}, floor ${pct(sq.floor)}; ratio ${sq.ratio.toFixed(3)}, anchor ${sq.anchor.toFixed(3)}; shaders patched ${sq.hits}`);
    expect(sq.hits).toBeGreaterThan(0);
    expect(sq.ratio <= DEPTH_RATIO.lo || sq.ratio >= DEPTH_RATIO.hi).toBe(true);
  }, 120_000);

  it("a layer depth halved fails", async () => {
    const hv = await depthScale(HALVED_FAULT);
    console.log(`water-layer-depth-halved: rise 0.5 ${pct(hv.half)}, rise 0 ${pct(hv.zero)}, floor ${pct(hv.floor)}; ratio ${hv.ratio.toFixed(3)}, anchor ${hv.anchor.toFixed(3)}; shaders patched ${hv.hits}`);
    expect(hv.hits).toBeGreaterThan(0);
    expect(hv.anchor <= RISE0_ANCHOR.lo || hv.anchor >= RISE0_ANCHOR.hi).toBe(true);
  }, 120_000);

  // ---- Fix round 2 (review-water-layer.md, Minor 4): the layer never shows under the floor. A negative rise is
  // clamped to 0 (the layer lies on the floor), not thrown, because rise is read per frame and an easing that
  // overshoots must not stop the page; where a rise map lifts the floor above the layer, the floor hides it there.

  // After the clamp, rise -0.3 and rise 0 hand the shader the same depth, so they draw the same pixels.
  it("a negative rise lies on the floor", async () => {
    const r = await negativeRise(PAGE);
    console.log(`rise -0.3 vs rise 0 at t ${RISE_T}: mean abs diff ${r.diff.toFixed(6)}`);
    expect(r.diff).toBe(0);
  }, 120_000);

  it("an unclamped negative rise fails", async () => {
    // Planted fault water-layer-rise-unclamped: the layer's rise is read as given, so -0.3 sits under the floor.
    const r = await negativeRise(UNCLAMPED_FAULT);
    console.log(`water-layer-rise-unclamped: mean abs diff ${r.diff.toFixed(6)}; shaders patched ${r.hits}`);
    expect(r.hits).toBeGreaterThan(0);
    expect(r.diff).toBeGreaterThan(0);
  }, 120_000);

  // A rise map lifts the left half of the floor by 0.6 (to depth 0.4) under a layer at rise 0.3 (depth 0.7). On the
  // left the floor is above the layer, so the frame is the plain floor's with the same map; on the right the floor is
  // below it, so the card is drawn. The left is read up to 20 px from the map's edge (the refracted ray moves at most
  // about 8 px at depth 1.0, half the floor's 16 px peak to peak), the right inside the card, 20 px in from every edge.
  it("a rise map that lifts the floor above the layer hides it there", async () => {
    const r = await overFloor(PAGE);
    console.log(`layer rise 0.3 over rise map 0.6 (left half) vs no layer: left of the map's edge ${r.left.toFixed(6)}, card right of it ${r.right.toFixed(6)}`);
    expect(r.left).toBe(0);
    expect(r.right).toBeGreaterThan(CARD_SHOWN.value);
  }, 120_000);

  it("a layer drawn over a floor that lies above it fails", async () => {
    // Planted fault water-layer-over-floor: the layer is drawn wherever it covers, whatever the floor's depth.
    const r = await overFloor(OVER_FLOOR_FAULT);
    console.log(`water-layer-over-floor: left ${r.left.toFixed(6)}, right ${r.right.toFixed(6)}; shaders patched ${r.hits}`);
    expect(r.hits).toBeGreaterThan(0);
    expect(r.left).toBeGreaterThan(0);
  }, 120_000);
});

// ---- Fix round 1 helpers and tolerances.
const CAUSTIC_FAULT = "test/faults/water-layer-caustic-at-floor/index.html";
const CAUSTIC_OFF_FAULT = "test/faults/water-layer-caustic-off/index.html";
const FROZEN_FAULT = "test/faults/water-layer-frozen/index.html";
const FROZEN_RISE_FAULT = "test/faults/water-layer-frozen-rise/index.html";
const SQUARED_FAULT = "test/faults/water-layer-depth-squared/index.html";
const HALVED_FAULT = "test/faults/water-layer-depth-halved/index.html";

/** Mean abs difference (0..1 per channel) of the caustic alone, layer against plain floor, at one time. */
const CAUSTIC_MATCH = {
  value: 0.5 / 255,
  why:
    "The two frames run the same expressions on the panel: the same refracted point and the same caustic, at depth " +
    "1.0 - 0.6 against 0.4 (equal to about 1e-7 in float32), the same tone and the same grain. That can flip the " +
    "8-bit rounding of scattered pixels by one level, never more; under half a level on average allows that and " +
    "nothing else.",
};
/** The floor's own caustic part on the panel, mean abs (0..1): the match must compare a caustic that is there. */
const CAUSTIC_SIGNAL = {
  value: CAUSTIC_MATCH.value,
  why:
    "Two blank caustics would match, so the reference must carry more caustic than the match tolerance, or a layer " +
    "with none could not be told from it. (Changed in fix round 1 after its first run: it was set at 4 times the " +
    "tolerance, a margin with no reason behind it, and read 0.0055 to 0.0060, about 3 times. The planted fault " +
    "water-layer-caustic-off shows directly that a missing layer caustic fails the match.)",
};
/** Mean abs difference (0..1 per channel), moving layer at T1 against the still layer set to its T1 values. */
const MOVING_MATCH = {
  value: 1e-4,
  why:
    "The same shader, the same t and the same rise and shift (passed as the same doubles) give the same pixels; " +
    "the floor-clear test reads such frames as exactly 0. 1e-4 leaves room for a handful of one-level roundings.",
};
/** The outline centre's move against the shift's move, as a share of the shift's move. */
const MOVE_TOL = {
  value: 0.5,
  why:
    "Halfway between the honest move (the shift, 11.0 px at T1 5.1; 15.6 px at the first T1, 6.75) and a layer that " +
    "does not move (0 px). The ripple moves each edge point by at most about 9 px at depth 0.56 (the largest " +
    "single-edge reading at depth 0.6 is 7.41% of 232 px, 17 px peak to peak), and the mean over a 184 px edge by " +
    "far less.",
};
/** Ripple at rise 0.5 over ripple at rise 0 (depth 0.5 over 1.0). */
const DEPTH_RATIO = {
  lo: 0.375,
  hi: 0.625,
  why: "Centred on 0.5, the depth's own ratio; the low edge is halfway to 0.25 (a squared depth), the high edge as far above.",
};
/** Ripple of the layer at rise 0 over the floor's own path at depth 1.0 (the old way at rise map 0). */
const RISE0_ANCHOR = {
  lo: 0.75,
  hi: 1 / 0.75,
  why: "Centred on 1 (equal depths); the low edge is halfway to 0.5 (a halved depth), the high edge its inverse (a doubled one).",
};

const T0 = 2;
// T1: the rise and the shift both differ clearly from T0 (rise 0.581 to 0.438, shift +0.0197 to -0.0083). The first
// T1, 6.75, moved the rise only 0.581 to 0.591, so a frozen rise could pass.
const T1 = 5.1;
// water-layer.html's `?moving` functions, at its default rise 0.5.
const riseAt = (t: number) => 0.5 + 0.1 * Math.sin(1.1 * t);
const shiftAt = (t: number) => 0.02 * Math.sin(0.7 * t);
// The card's panel (water-layer.html pictures: panel), px, and the inset read inside it.
const PANEL = { cx: W / 2, cy: H / 2 - CH * 0.275, hw: CW * 0.42, hh: CH * 0.175 };
const INSET = 20;

/** The caustic alone (on less off, 0..1 per channel) inside the panel's inset, at time `t` on an open page. */
async function causticPart(h: Awaited<ReturnType<typeof openPage>>, t: number): Promise<Float32Array> {
  await h.hook("__paint.setLight(0, { caustic: 1 })");
  await h.hook(`__paint.setTime(${t})`);
  const on = await h.shot();
  await h.hook("__paint.setLight(0, { caustic: 0 })");
  await h.hook(`__paint.setTime(${t})`);
  const off = await h.shot();
  const x0 = Math.ceil(PANEL.cx - PANEL.hw + INSET), x1 = Math.floor(PANEL.cx + PANEL.hw - INSET);
  const y0 = Math.ceil(PANEL.cy - PANEL.hh + INSET), y1 = Math.floor(PANEL.cy + PANEL.hh - INSET);
  const out: number[] = [];
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++)
      for (let c = 0; c < 3; c++) out.push((on.data[(y * W + x) * 4 + c]! - off.data[(y * W + x) * 4 + c]!) / 255);
  return Float32Array.from(out);
}

/** The layer at rise 0.6 on `page` against a plain floor of the panel's tone at depth 0.4 (the honest page), per time. */
async function causticMatch(page: string) {
  const open = (p: string, q: string) => openPage(`${server.url}/${p}${q}`, { dpr: 1, width: W, height: H, seed: 1, detail: 0.5, t: TIMES[0]! });
  const layer: Float32Array[] = [];
  const floor: Float32Array[] = [];
  let hits = 0;
  const hl = await open(page, "?rise=0.6");
  try {
    for (const t of TIMES) layer.push(await causticPart(hl, t));
    hits = (await hl.hook<number | undefined>("globalThis.__faultHits")) ?? 0;
  } finally {
    await hl.close();
  }
  const hf = await open(PAGE, "?none&floor=0.4&tone=0.03");
  try {
    for (const t of TIMES) floor.push(await causticPart(hf, t));
  } finally {
    await hf.close();
  }
  const diffs: number[] = [];
  const signal: number[] = [];
  const rows: string[] = [];
  TIMES.forEach((t, i) => {
    const a = layer[i]!, b = floor[i]!;
    let d = 0, s = 0, worst = 0;
    for (let k = 0; k < a.length; k++) {
      const e = Math.abs(a[k]! - b[k]!);
      d += e;
      s += Math.abs(b[k]!);
      worst = Math.max(worst, e);
    }
    diffs.push(d / a.length);
    signal.push(s / a.length);
    rows.push(`t ${t} diff ${(d / a.length).toFixed(6)} (worst ${(worst * 255).toFixed(0)} levels), floor caustic ${(s / a.length).toFixed(4)}`);
  });
  return { diffs, signal, rows, hits };
}

/** Mean y of the card's top and bottom edges (first pixel under the cut from outside, sub-pixel), px, corners out. */
function cardCentreY(f: Rgba): number {
  const lum = luminance(f);
  const reach = 40;
  const cross = (x: number, from: number, to: number): number => {
    const step = to >= from ? 1 : -1;
    let prev = lum[from * W + x]!;
    for (let y = from + step; step > 0 ? y <= to : y >= to; y += step) {
      const v = lum[y * W + x]!;
      if (v < RIPPLE.cut) return y - step + step * (prev > v ? (prev - RIPPLE.cut) / (prev - v) : 1);
      prev = v;
    }
    return NaN;
  };
  const tops: number[] = [];
  const bottoms: number[] = [];
  for (let x = Math.ceil(BOX.x0 + RIPPLE.corner); x < BOX.x1 - RIPPLE.corner; x++) {
    tops.push(cross(x, Math.round(BOX.y0) - reach, Math.round(BOX.y0) + reach));
    bottoms.push(cross(x, Math.round(BOX.y1) + reach, Math.round(BOX.y1) - reach));
  }
  const ok = [...tops, ...bottoms].filter(Number.isFinite);
  expect(ok.length).toBe(tops.length + bottoms.length);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return (mean(tops) + mean(bottoms)) / 2;
}

/**
 * `page?moving` stepped from T0 to T1 at 20 draws a second (each draw sets every uniform; 60 a second took the
 * screenshot past its 30 s timeout once while other browser jobs shared the GPU), against the honest still layer at its T1 rise and
 * shift. Returns the frames' mean abs diff, the outline centre's move T0 to T1 (px, down positive) and the shift's
 * move in px (y up, so a falling shift moves the card down the screen).
 */
async function movingMatch(page: string) {
  const opts = { dpr: 1, width: W, height: H, seed: 1, detail: 0.5 };
  const hm = await openPage(`${server.url}/${page}?moving`, { ...opts, t: T0 });
  let a: Rgba, b: Rgba, hits: number;
  try {
    await hm.hook(`__paint.setTime(${T0})`);
    a = await hm.shot();
    const n = Math.round((T1 - T0) * 20);
    for (let k = 1; k <= n; k++) await hm.hook(`__paint.setTime(${T0 + ((T1 - T0) * k) / n})`);
    b = await hm.shot();
    hits = (await hm.hook<number | undefined>("globalThis.__faultHits")) ?? 0;
    expect(hm.errors).toEqual([]);
  } finally {
    await hm.close();
  }
  const hs = await openPage(`${server.url}/${PAGE}?rise=${riseAt(T1)}&shiftY=${shiftAt(T1)}`, { ...opts, t: T1 });
  let still: Rgba;
  try {
    await hs.hook(`__paint.setTime(${T1})`);
    still = await hs.shot();
  } finally {
    await hs.close();
  }
  return {
    diff: meanAbsDiff(b, still),
    moved: cardCentreY(b) - cardCentreY(a),
    expected: -(shiftAt(T1) - shiftAt(T0)) * Math.min(W, H),
    hits,
  };
}

/** Ripple at rise 0.5, at rise 0, and the old way at rise map 0 (the floor's own path at depth 1.0), on `page`. */
async function depthScale(page: string) {
  const half = (await rippleOf(page, "?rise=0.5")).mean;
  const zero = (await rippleOf(page, "?rise=0")).mean;
  const floor = (await rippleOf(page, "?old=0")).mean;
  const h = await openPage(`${server.url}/${page}?rise=0`, { dpr: 1, width: W, height: H, seed: 1, detail: 0.5, t: 2 });
  let hits = 0;
  try {
    hits = (await h.hook<number | undefined>("globalThis.__faultHits")) ?? 0;
  } finally {
    await h.close();
  }
  return { half, zero, floor, ratio: half / zero, anchor: zero / floor, hits };
}

// ---- Fix round 2 helpers and tolerances.
const UNCLAMPED_FAULT = "test/faults/water-layer-rise-unclamped/index.html";
const OVER_FLOOR_FAULT = "test/faults/water-layer-over-floor/index.html";
const RISE_T = 2.5;
/** Mean abs diff (0..1 per channel) of the card's right half, layer against no layer: the card is drawn there. */
const CARD_SHOWN = {
  value: 0.01,
  why:
    "The floor-clear test's own floor for a drawn card (its whole-frame diff must exceed 0.01). Inside the card the " +
    "frame (ramp 0.9) and panel (0.03) stand against the accent floor (0.5), far more than that on every pixel.",
};

/** One frame of `page` and of `ref`, at RISE_T, light, dpr 1; returns both and the fault hits on `page`. */
async function framePair(page: string, q: string, ref: string) {
  const opts = { dpr: 1, width: W, height: H, seed: 1, detail: 0.5, t: RISE_T };
  const ha = await openPage(`${server.url}/${page}${q}`, opts);
  let a: Rgba, hits: number;
  try {
    await ha.hook(`__paint.setTime(${RISE_T})`);
    a = await ha.shot();
    hits = (await ha.hook<number | undefined>("globalThis.__faultHits")) ?? 0;
    expect(ha.errors).toEqual([]);
  } finally {
    await ha.close();
  }
  const hb = await openPage(`${server.url}/${PAGE}${ref}`, opts);
  let b: Rgba;
  try {
    await hb.hook(`__paint.setTime(${RISE_T})`);
    b = await hb.shot();
  } finally {
    await hb.close();
  }
  return { a, b, hits };
}

/** Mean abs diff (0..1 per channel) of two frames over the pixels `keep` selects. */
function regionDiff(a: Rgba, b: Rgba, keep: (x: number, y: number) => boolean): number {
  let s = 0;
  let n = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!keep(x, y)) continue;
      for (let c = 0; c < 3; c++) s += Math.abs(a.data[(y * W + x) * 4 + c]! - b.data[(y * W + x) * 4 + c]!);
      n++;
    }
  return s / (n * 3 * 255);
}

/** `page` at rise -0.3 against the honest page at rise 0. */
async function negativeRise(page: string) {
  const { a, b, hits } = await framePair(page, "?rise=-0.3", "?rise=0");
  return { diff: meanAbsDiff(a, b), hits };
}

/** `page` with a layer at rise 0.3 over a rise map of 0.6 on the left half, against no layer over the same map. */
async function overFloor(page: string) {
  const { a, b, hits } = await framePair(page, "?rise=0.3&map=0.6", "?none&map=0.6");
  const MARGIN = 20;
  const left = regionDiff(a, b, (x) => x < W / 2 - MARGIN);
  const right = regionDiff(a, b, (x, y) => x >= W / 2 + MARGIN && x < BOX.x1 - MARGIN && y >= BOX.y0 + MARGIN && y < BOX.y1 - MARGIN);
  return { left, right, hits };
}
