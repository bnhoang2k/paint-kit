// Thin film (Phase 2 Task 18): two-beam interference. Its colour comes from the film's thickness (the sheet's param) and
// the angle between the eye and the half vector, so it steps along the thickness ramp, shifts a little when the key turns
// off the eye, holds when the key swings around the eye, and never moves with the clock. The iridescence law that judges
// film is a later step; this file reads the colour directly.
//
// Every colour here is the highlight alone: the frame with the key's specular on minus the frame with it off, in linear
// light, at detail 0 and grain 0, skipping pixels with a linear channel over 0.8 (the knee of finish.ts `_shoulder`, where
// the frame stops being linear).
//
// Limits, set before any film existed to read, except where a driver ruling reshaped a row (the steel band-order row
// below, by the owner's ruling of 2026-11-17):
// - HUE_ARCS: the four colour names as arcs of OKLab hue. The six sRGB primaries and secondaries mark the hue circle, and
//   each name's arc runs to the midpoints with its neighbours: straw is the yellow arc, brown the red arc, purple the
//   magenta arc, blue the blue arc. No arc is fitted to a reading.
// - STEEL: straw 26, purple 38 and blue 54 nm are Fujimura 1972's values (task-18-steel-sources.md). No source gives a
//   brown thickness, so the row walks the ramp in 2 nm steps and asks that each named arc appears as one run, in order.
//   26 nm must read straw and 54 nm blue. The owner ruled on 2026-11-17 that the 38 nm hue is logged and not asserted,
//   because the computed 38 nm hue sits just past the purple arc's edge: the row keeps the computed colours and checks
//   the order.
// - SHIFT_MIN 3 degrees, SHIFT_MAX 45 degrees: "a little" means more than 8-bit rounding can make and under an eighth of
//   the hue circle (builder).
// - LIT_MIN 0.02, CHROMA_MIN 0.02: a pixel counts for a hue reading only where the highlight is bright and coloured enough
//   for 8-bit rounding not to decide its hue (builder).
// - HIGHLIGHT_MOVE 20 px: about a tenth of a panel's 216 px width (builder). The dome's slope puts the two lobe peaks
//   about 50 px apart.
// - PULL_GAP_MAX: the mean hue gap the pull row allows is SHIFT_MIN, the same 3 degrees, set before the row was read.
// - BIN_OPD 5 nm, BIN_MIN_PX 400, BIN_LUM_MIN 1/255: the design note's FILM_OPD_BIN, GROOVE_MIN_PX and FILM_SPEC_MIN.
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeBrowsers, openPage, type OpenOpts, type PageHandle, type Rgba } from "../../src/checks/harness.ts";
import { meanAbsDiff } from "../../src/checks/image.ts";
import { serveRoot } from "../../src/checks/serve.ts";
import { threshold } from "../../src/checks/threshold.ts";
import { paletteLight } from "../../src/engine/lights/basic.ts";
import { linearToOklab, type Ramp, type Vec3 } from "../../src/engine/palette.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");
const VIEW: OpenOpts = { dpr: 1, width: 960, height: 600, t: 0, readyTimeout: 20000 };
const STEEL_PAGE = "film-metal.html?range=26,54&ior=2.343";
const STEEL = { range: [26, 54], step: 2, order: ["straw", "brown", "purple", "blue"], cited: { 26: "straw", 54: "blue" } as Record<number, string>, logged: 38 } as const;
const KEY: Vec3 = [0.55, 0.05, 0.83];
const KNEE = 0.8;
const LIT_MIN = 0.02;
const CHROMA_MIN = 0.02;
const SHIFT_MIN = 3;
const SHIFT_MAX = 45;
const HIGHLIGHT_MOVE = 20;
const BIN_OPD = 5;
const BIN_MIN_PX = 400;
const BIN_LUM_MIN = 1 / 255;
const W709: Vec3 = [0.2126, 0.7152, 0.0722];

type Box = { x: number; y: number; w: number; h: number };
type FilmPage = { ramps: [Box, Box] };
type Lit = { rgb: Float64Array; ok: Uint8Array; w: number; h: number };

let server: { url: string; close(): Promise<void> };

beforeAll(async () => {
  server = await serveRoot(ROOT);
});
afterAll(async () => {
  await server?.close();
  await closeBrowsers();
});

async function withPage(page: string, opts: OpenOpts, fn: (h: PageHandle, film: FilmPage) => Promise<void>) {
  const h = await openPage(`${server.url}/test/pages/${page}`, { ...VIEW, ...opts });
  try {
    await fn(h, await h.hook<FilmPage>("window.__film"));
    expect(h.errors).toEqual([]);
  } finally {
    await h.close();
  }
}

const toLinear = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (c: ArrayLike<number>) => W709[0] * c[0]! + W709[1] * c[1]! + W709[2] * c[2]!;
const hueOf = (c: Vec3) => {
  const [, a, b] = linearToOklab(c);
  return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
};
const chromaOf = (c: Vec3) => {
  const [, a, b] = linearToOklab(c);
  return Math.hypot(a, b);
};
const hueGap = (p: number, q: number) => Math.abs(((p - q + 540) % 360) - 180);

/** The highlight alone, per pixel, in linear light, with the key where it is now. */
async function highlight(h: PageHandle): Promise<Lit> {
  await h.hook("__paint.setDetail(0)");
  await h.hook("__paint.setGrain(0)");
  await h.hook("__paint.setLight(0, { specular: 1 })");
  const on: Rgba = await h.shot();
  await h.hook("__paint.setLight(0, { specular: 0 })");
  const off: Rgba = await h.shot();
  await h.hook("__paint.setLight(0, { specular: 1 })");
  const n = on.w * on.h;
  const rgb = new Float64Array(n * 3);
  const ok = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let below = true;
    for (let k = 0; k < 3; k++) {
      const v = toLinear(on.data[i * 4 + k]!);
      if (v > KNEE) below = false;
      rgb[i * 3 + k] = v - toLinear(off.data[i * 4 + k]!);
    }
    ok[i] = below ? 1 : 0;
  }
  return { rgb, ok, w: on.w, h: on.h };
}

/** The key turned `deg` degrees in the x-z plane, away from the eye on its own side. */
function keyTurn(dir: Vec3, deg: number): Vec3 {
  const r = Math.hypot(dir[0], dir[2]);
  const a = Math.atan2(dir[0], dir[2]) + (deg * Math.PI) / 180;
  return [r * Math.sin(a), dir[1], r * Math.cos(a)];
}
const setKey = (h: PageHandle, dir: Vec3) => h.hook(`__paint.setLight(0, { dir: ${JSON.stringify(dir)} })`);

/** v.h for a key at `dir`, with the eye at +z. */
function vDotH(dir: Vec3) {
  const len = Math.hypot(...dir);
  return Math.sqrt((1 + dir[2] / len) / 2);
}

/** The pixel rows of a ramp box that hold thickness param `p`, 3 px either side, kept off the panel's ends. */
function rowsAt(box: Box, p: number, reversed: boolean) {
  const f = reversed ? p : 1 - p;
  const y = Math.max(box.y + 3, Math.min(box.y + box.h - 4, box.y + f * box.h));
  return [Math.round(y - 3), Math.round(y + 3)] as const;
}

/** The mean highlight of one thickness over both panels. */
function bandMean(lit: Lit, film: FilmPage, p: number): { c: Vec3; n: number } {
  const sum: Vec3 = [0, 0, 0];
  let n = 0;
  film.ramps.forEach((box, side) => {
    const [y0, y1] = rowsAt(box, p, side === 1);
    for (let y = y0; y <= y1; y++)
      for (let x = Math.ceil(box.x + 8); x < box.x + box.w - 8; x++) {
        const i = y * lit.w + x;
        if (!lit.ok[i]) continue;
        for (let k = 0; k < 3; k++) sum[k]! += lit.rgb[i * 3 + k]!;
        n++;
      }
  });
  return { c: sum.map((v) => v / Math.max(n, 1)) as Vec3, n };
}

/** Each colour name's arc of OKLab hue: from the midpoint with the hue before it to the midpoint with the hue after. */
function hueArcs() {
  const marks: [string, Vec3][] = [["brown", [1, 0, 0]], ["straw", [1, 1, 0]], ["green", [0, 1, 0]], ["cyan", [0, 1, 1]], ["blue", [0, 0, 1]], ["purple", [1, 0, 1]]];
  const hues = marks.map(([name, c]) => ({ name, hue: hueOf(c) }));
  const mid = (p: number, q: number) => (p + (((q - p + 360) % 360) / 2)) % 360;
  return Object.fromEntries(
    hues.map(({ name, hue }, i) => [name, { from: mid(hues[(i + 5) % 6]!.hue, hue), to: mid(hue, hues[(i + 1) % 6]!.hue) }]),
  ) as Record<string, { from: number; to: number }>;
}
const inArc = (hue: number, arc: { from: number; to: number }) => ((hue - arc.from + 360) % 360) < ((arc.to - arc.from + 360) % 360);

/** The film's thickness bins for a key at this v.h: per sheet texel, the bin's OPD index, or -1 off the film. */
const binIds = (h: PageHandle, vh: number) =>
  h.hook<{ id: number[]; w: number; h: number }>(`(() => {
    const st = __paint.stats();
    const s = __paint.sheetRegion(0, 0, innerWidth, innerHeight);
    const slot = __paint.materials().findIndex((m) => m.film);
    const f = __paint.materials()[slot].film;
    const sinT = Math.sqrt(1 - ${vh} * ${vh}) / f.ior;
    const cosT = Math.sqrt(1 - sinT * sinT);
    const id = s.param.map((p, i) => Math.round(s.slot[i]) === slot && s.coverage[i] >= ${threshold("relight.fullCoverage", null)} && s.ink[i] <= 0
      ? Math.round((2 * f.ior * (f.range[0] + p * (f.range[1] - f.range[0])) * cosT) / ${BIN_OPD}) : -1);
    return { id, w: st.sheetW, h: st.sheetH };
  })()`);

/** OKLab to linear sRGB, unclipped: the shade pass's `_fromOklab` (palette.ts). */
function fromOklab([L, a, b]: Vec3): Vec3 {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}

/** `pk_bandPull` worked at unit luminance on the CPU: toward the nearest ramp stop in OKLab, keeping luminance 1. */
function pullAtUnit(c: Vec3, amount: number, stops: Vec3[]): Vec3 {
  const y = luminance(c);
  const p = linearToOklab(c.map((v) => v / y) as Vec3);
  const gap = (q: Vec3) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  const goal = stops.map((s) => linearToOklab(s)).reduce((best, q) => (gap(q) < gap(best) ? q : best));
  const out = fromOklab(p.map((v, k) => v + (goal[k]! - v) * amount) as Vec3);
  return out.map((v) => v / luminance(out)) as Vec3;
}

type Bin = { n: number; sum: Vec3 };
/** Each OPD bin's pixels below the knee and their summed highlight. A bin with no such pixel is still listed. */
function binMeans(lit: Lit, grid: { id: number[]; w: number; h: number }) {
  const bins = new Map<number, Bin>();
  for (let y = 0; y < lit.h; y++)
    for (let x = 0; x < lit.w; x++) {
      const b = grid.id[Math.floor((y * grid.h) / lit.h) * grid.w + Math.floor((x * grid.w) / lit.w)]!;
      if (b < 0) continue;
      const bin = bins.get(b) ?? { n: 0, sum: [0, 0, 0] };
      bins.set(b, bin);
      const i = y * lit.w + x;
      if (!lit.ok[i]) continue;
      bin.n++;
      for (let k = 0; k < 3; k++) bin.sum[k]! += lit.rgb[i * 3 + k]!;
    }
  return bins;
}
const binColour = (b: Bin) => b.sum.map((v) => v / Math.max(b.n, 1)) as Vec3;
const binReads = (b: Bin) => b.n >= BIN_MIN_PX && luminance(binColour(b)) >= BIN_LUM_MIN;

describe("film", () => {
  /** The steel ramp in one scheme: every 2 nm is read and printed before any assertion. */
  async function bandOrder(scheme: "light" | "dark") {
    const arcs = hueArcs();
    await withPage(STEEL_PAGE, { dark: scheme === "dark" }, async (h, film) => {
      const lit = await highlight(h);
      const read: { nm: number; hue: number; name: string; n: number }[] = [];
      for (let nm = STEEL.range[0]; nm <= STEEL.range[1]; nm += STEEL.step) {
        const { c, n } = bandMean(lit, film, (nm - STEEL.range[0]) / (STEEL.range[1] - STEEL.range[0]));
        const hue = hueOf(c);
        const name = Object.keys(arcs).find((k) => inArc(hue, arcs[k]!))!;
        console.log(`FILM steel ${scheme} ${nm} nm: hue ${hue.toFixed(1)}, arc ${name}, chroma ${chromaOf(c).toFixed(4)}, luminance ${luminance(c).toFixed(4)}, ${n} px`);
        read.push({ nm, hue, name, n });
      }
      // Logged only, by the owner's ruling of 2026-11-17: the computed 38 nm hue sits just past the purple arc's edge.
      const logged = read.find((r) => r.nm === STEEL.logged)!;
      console.log(`FILM steel ${scheme} ${logged.nm} nm, logged and not asserted: hue ${logged.hue.toFixed(1)}, arc ${logged.name}`);
      const runs: string[] = [];
      for (const { nm, hue, name, n } of read) {
        expect(n).toBeGreaterThan(0);
        if (runs.at(-1) !== name) runs.push(name);
        const cited = STEEL.cited[nm];
        if (cited) expect(name, `the cited ${cited} stop at ${nm} nm reads hue ${hue.toFixed(1)}`).toBe(cited);
      }
      expect(runs).toEqual([...STEEL.order]);
    });
  }

  it("the hue steps in one order along the param ramp", () => bandOrder("light"));
  it("the hue steps in one order along the param ramp in the dark scheme", () => bandOrder("dark"));

  it("the pull reads the film's colour at unit luminance", async () => {
    // The oracle: the same film at pull 0 gives the raw colour of each bin. Its level is lost, so the pull is worked at
    // unit luminance, and the page at pull 0.3 must show that hue. A pull that reads the colour's level parts from it.
    let raw = new Map<number, Bin>();
    let ramp: Ramp | undefined;
    await withPage("film.html?pull=0", {}, async (h) => {
      raw = binMeans(await highlight(h), await binIds(h, vDotH(KEY)));
      ramp = await h.hook<Ramp>("window.__film.ramp()");
    });
    let pulled = new Map<number, Bin>();
    await withPage("film.html", {}, async (h) => {
      pulled = binMeans(await highlight(h), await binIds(h, vDotH(KEY)));
    });
    // The key's own colour multiplies the highlight: lights.key's default kelvin and tint (lights/basic.ts).
    const key = paletteLight(6504, 0.15, ramp!);
    const gaps: number[] = [];
    for (const [bin, p] of raw) {
      const q = pulled.get(bin);
      if (!q || !binReads(p) || !binReads(q)) continue;
      const u = binColour(p);
      const oracle = pullAtUnit(u.map((v, k) => v / key[k]!) as Vec3, 0.3, ramp!.stops).map((v, k) => Math.max(v * key[k]!, 0)) as Vec3;
      const v = binColour(q);
      if (chromaOf(oracle) < CHROMA_MIN || chromaOf(v) < CHROMA_MIN) continue;
      gaps.push(hueGap(hueOf(oracle), hueOf(v)));
    }
    const mean = gaps.reduce((a, b) => a + b, 0) / Math.max(gaps.length, 1);
    console.log(`FILM pull at unit luminance: mean hue gap ${mean.toFixed(2)} degrees, worst ${Math.max(...gaps).toFixed(2)}, over ${gaps.length} bins (limit ${SHIFT_MIN})`);
    expect(gaps.length).toBeGreaterThanOrEqual(20);
    expect(mean).toBeLessThan(SHIFT_MIN);
  });

  it("turning the key off the eye shifts the hue a little", async () => {
    await withPage("film.html", {}, async (h, film) => {
      const a = await highlight(h);
      const turned = keyTurn(KEY, 30);
      await setKey(h, turned);
      const b = await highlight(h);
      console.log(`FILM key turn: v.h ${vDotH(KEY).toFixed(4)} -> ${vDotH(turned).toFixed(4)}`);
      expect(vDotH(turned)).toBeLessThan(vDotH(KEY));
      // Each pixel against itself: a film that reads the surface normal holds its hue at every point.
      let sum = 0;
      let n = 0;
      for (const box of film.ramps)
        for (let y = Math.ceil(box.y + 8); y < box.y + box.h - 8; y++)
          for (let x = Math.ceil(box.x + 8); x < box.x + box.w - 8; x++) {
            const i = y * a.w + x;
            if (!a.ok[i] || !b.ok[i]) continue;
            const p: Vec3 = [a.rgb[i * 3]!, a.rgb[i * 3 + 1]!, a.rgb[i * 3 + 2]!];
            const q: Vec3 = [b.rgb[i * 3]!, b.rgb[i * 3 + 1]!, b.rgb[i * 3 + 2]!];
            if (luminance(p) < LIT_MIN || luminance(q) < LIT_MIN || chromaOf(p) < CHROMA_MIN || chromaOf(q) < CHROMA_MIN) continue;
            sum += hueGap(hueOf(p), hueOf(q));
            n++;
          }
      const shift = sum / Math.max(n, 1);
      console.log(`FILM key turn: mean hue shift per pixel ${shift.toFixed(2)} degrees over ${n} px (limits ${SHIFT_MIN} to ${SHIFT_MAX})`);
      expect(n).toBeGreaterThan(500);
      expect(shift).toBeGreaterThan(SHIFT_MIN);
      expect(shift).toBeLessThan(SHIFT_MAX);
    });
  });

  it("swinging the key about the view axis leaves the hue", async () => {
    await withPage("film.html", {}, async (h, film) => {
      await h.hook("__paint.moveLight(0, 0)");
      const a = await highlight(h);
      const grid = await binIds(h, vDotH(KEY));
      await h.hook("__paint.moveLight(0, 1)");
      const b = await highlight(h);
      // The swing keeps the key's angle off the eye, so each OPD bin is the same bin at both positions.
      const before = binMeans(a, grid);
      const after = binMeans(b, grid);
      let read = 0;
      for (const [bin, p] of before) {
        const q = after.get(bin);
        if (!q || !binReads(p) || !binReads(q)) continue;
        const gap = hueGap(hueOf(binColour(p)), hueOf(binColour(q)));
        console.log(`FILM key swing, OPD bin ${bin * BIN_OPD} nm: hue ${hueOf(binColour(p)).toFixed(1)} -> ${hueOf(binColour(q)).toFixed(1)}, gap ${gap.toFixed(2)}, luminance ${luminance(binColour(p)).toFixed(4)} -> ${luminance(binColour(q)).toFixed(4)}`);
        read++;
        expect(gap, `OPD bin ${bin * BIN_OPD} nm`).toBeLessThan(SHIFT_MIN);
      }
      console.log(`FILM key swing: ${read} of ${before.size} bins clear the floor at both positions`);
      expect(read).toBeGreaterThanOrEqual(3);
    });
  });

  it("moving the key moves the highlight", async () => {
    await withPage("film.html", {}, async (h, film) => {
      const centroid = (lit: Lit) => {
        const box = film.ramps[0];
        let sx = 0;
        let sw = 0;
        for (let y = Math.ceil(box.y + 8); y < box.y + box.h - 8; y++)
          for (let x = Math.ceil(box.x + 2); x < box.x + box.w - 2; x++) {
            const i = y * lit.w + x;
            const l = Math.max(0, luminance([lit.rgb[i * 3]!, lit.rgb[i * 3 + 1]!, lit.rgb[i * 3 + 2]!]));
            sx += x * l;
            sw += l;
          }
        return sx / sw;
      };
      const a = centroid(await highlight(h));
      await setKey(h, keyTurn(KEY, 30));
      const b = centroid(await highlight(h));
      console.log(`FILM highlight centroid x: ${a.toFixed(1)} -> ${b.toFixed(1)} px, moved ${(b - a).toFixed(1)} (limit ${HIGHLIGHT_MOVE})`);
      // The key turned toward +x, so the highlight climbs the dome's +x side.
      expect(b - a).toBeGreaterThan(HIGHLIGHT_MOVE);
    });
  });

  it("two frames one second apart are identical", async () => {
    await withPage("film.html", {}, async (h) => {
      const a = await h.shot();
      const frames = (await h.hook<{ frames: number }>("__paint.stats()")).frames;
      await h.hook("__paint.setTime(1)");
      const drawn = (await h.hook<{ frames: number }>("__paint.stats()")).frames - frames;
      const b = await h.shot();
      console.log(`FILM time: t 0 -> t 1, frames drawn ${drawn}, mean abs diff ${meanAbsDiff(a, b)}`);
      expect(drawn).toBeGreaterThan(0);
      expect(meanAbsDiff(a, b)).toBe(0);
    });
  });

  /** How many of the film's bins read, and how many it has, under the key where it is now. */
  async function readBins(h: PageHandle, vh: number) {
    const bins = binMeans(await highlight(h), await binIds(h, vh));
    return { read: [...bins.values()].filter(binReads).length, all: bins.size };
  }

  it.each(["light", "dark"] as const)("film.html reads most of its bins at both key positions: %s", async (scheme) => {
    await withPage("film.html", { dark: scheme === "dark" }, async (h) => {
      const a = await readBins(h, vDotH(KEY));
      const turned = keyTurn(KEY, 30);
      await setKey(h, turned);
      const b = await readBins(h, vDotH(turned));
      console.log(`FILM bins ${scheme}: ${a.read} of ${a.all} read at the key's place, ${b.read} of ${b.all} after the turn`);
      expect(a.read / a.all).toBeGreaterThan(0.5);
      expect(b.read / b.all).toBeGreaterThan(0.5);
    });
  });
});
