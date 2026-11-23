// Foil (Phase 2 Task 13): a diffraction grating. Its colour comes from the grating equation across the grooves, so it
// moves when the light or the tilt moves and holds when only time passes (behaviours 10 to 12, the colour side; the
// iridescence law that judges it is Task 14). On test/pages/foil.html (a foil panel with two groove regions under one
// key light, 960 x 600, dpr 1):
// - moving the key (moveLight to its second test position) changes the foil's mean colour;
// - setTilt changes it, with no light move;
// - two frames one second apart (t 0 and t 1), nothing moved, are identical;
// - the two groove regions differ in colour under the one key;
// - pull 0 to 1 moves the foil's colour toward the page's ramp.
// "Changes" and "differ" are an OKLab distance between mean colours above palette.visibleMove (0.02, the OKLab
// just-noticeable difference). Each test prints the reading it judged.
// It also writes the page's look in light and dark to out/foil-light.png and out/foil-dark.png for the report.
// The iridescence law (Phase 2 Task 14, src/checks/relight.ts, header "iridescence"), read as the relight check reads
// it (checkScheme: 960 x 600, dpr 1, t 2, text hidden, the page's default detail), that law alone, light and dark,
// seeds 1 to 3:
// - foil.html passes it, each condition on the right side of its threshold, (e) read (its bevelled rim spans u);
// - test/pages/foil-drift.html (foil on a drifting sheet) is partial from (c) alone: its surface moves, so (c) is not
//   read (still 0); (a), (b), (d) and (e) each read on the honest side;
// - each planted fault fails it, and its line names its own condition with the reading on the fail side:
//   iridescence-clock (a hue cycle on the clock) by (c); iridescence-pointer-x (a rainbow keyed to the pointer's x)
//   by (a), key and tilt; iridescence-fixed-light (engine fault spec-fixed-light) by (a), the key move;
//   iridescence-fixed-surface (engine fault tilt-surface-fixed) by (a), the tilt; iridescence-no-groove by (d);
//   iridescence-white (each band flattened to its luminance) by (a) and (d); iridescence-flat-normal (foil-drift's
//   copy) and iridescence-flat-normal-foil (foil.html's) by (e); iridescence-place-hue (foil.html's copy) and
//   iridescence-place-hue-drift (foil-drift's) by (b).
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveTarget } from "../../src/checks/gate.ts";
import { closeBrowsers, openPage, type OpenOpts, type PageHandle, type Rgba } from "../../src/checks/harness.ts";
import { checkScheme, E_NOT_READ } from "../../src/checks/relight.ts";
import { meanAbsDiff, meanOklab, oklabDistance, srgbToOklab } from "../../src/checks/image.ts";
import { serveRoot } from "../../src/checks/serve.ts";
import { threshold } from "../../src/checks/threshold.ts";
import { linearToOklab, type Ramp } from "../../src/engine/palette.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");
const VIEW: OpenOpts = { dpr: 1, width: 960, height: 600 };
type Box = { x: number; y: number; w: number; h: number };
type Boxes = { a: Box; b: Box; panel: Box };

let server: { url: string; close(): Promise<void> };
const url = (query = "") => `${server.url}/test/pages/foil.html${query}`;

beforeAll(async () => {
  server = await serveRoot(ROOT);
});
afterAll(async () => {
  await server?.close();
  await closeBrowsers();
});

async function withPage(u: string, opts: OpenOpts, fn: (h: PageHandle, boxes: Boxes) => Promise<void>) {
  const h = await openPage(u, { ...VIEW, ...opts });
  try {
    await fn(h, await h.hook<Boxes>("window.__foil"));
    expect(h.errors).toEqual([]);
  } finally {
    await h.close();
  }
}

const inBox = (f: Rgba, b: Box) => (i: number) => {
  const x = i % f.w;
  const y = Math.floor(i / f.w);
  return x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
};
const meanIn = (f: Rgba, b: Box) => meanOklab(f, inBox(f, b));
const fmt = (v: number[]) => v.map((x) => x.toFixed(3)).join(" ");

describe("foil", () => {
  it("moving the key light changes the foil's colour", async () => {
    const visible = threshold("palette.visibleMove", null);
    await withPage(url(), { t: 0 }, async (h, boxes) => {
      const before = await h.shot();
      await h.hook("__paint.moveLight(0, 1)");
      const after = await h.shot();
      for (const k of ["a", "b"] as const) {
        const p = meanIn(before, boxes[k]);
        const q = meanIn(after, boxes[k]);
        console.log(`FOIL key move, region ${k}: OKLab ${fmt(p)} -> ${fmt(q)}, moved ${oklabDistance(p, q).toFixed(4)}`);
        expect(oklabDistance(p, q)).toBeGreaterThan(visible);
      }
    });
  });

  it("setTilt changes the foil's colour, with no light move", async () => {
    const visible = threshold("palette.visibleMove", null);
    await withPage(url(), { t: 0 }, async (h, boxes) => {
      const lights = JSON.stringify(await h.hook<unknown>("__paint.lights()"));
      await h.hook("__paint.setTilt([0, 0])");
      const flat = await h.shot();
      await h.hook("__paint.setTilt([15, 0])");
      const tipped = await h.shot();
      expect(JSON.stringify(await h.hook<unknown>("__paint.lights()"))).toBe(lights);
      for (const k of ["a", "b"] as const) {
        const p = meanIn(flat, boxes[k]);
        const q = meanIn(tipped, boxes[k]);
        console.log(`FOIL tilt [15, 0], region ${k}: OKLab ${fmt(p)} -> ${fmt(q)}, moved ${oklabDistance(p, q).toFixed(4)}`);
        expect(oklabDistance(p, q)).toBeGreaterThan(visible);
      }
    });
  });

  it("two frames one second apart, with nothing moved, are identical", async () => {
    // Frozen, so each frame is drawn at a known time: t 0, then t 1 (setTime draws a frame there). A live page that
    // draws nothing new would prove nothing; this one must draw the second frame.
    await withPage(url(), { t: 0 }, async (h) => {
      const a = await h.shot();
      const frames = (await h.hook<{ frames: number }>("__paint.stats()")).frames;
      await h.hook("__paint.setTime(1)");
      const drawn = (await h.hook<{ frames: number }>("__paint.stats()")).frames - frames;
      const b = await h.shot();
      console.log(`FOIL time: t 0 -> t 1, frames drawn ${drawn}, mean abs diff ${meanAbsDiff(a, b)}`);
      expect(drawn).toBeGreaterThan(0);
      expect(meanAbsDiff(a, b)).toBe(0);
    });
  });

  it("the two groove regions differ in colour under the one key light", async () => {
    const visible = threshold("palette.visibleMove", null);
    for (const dark of [false, true]) {
      await withPage(url(), { t: 0, dark }, async (h, boxes) => {
        const f = await h.shot(dark ? "foil-dark" : "foil-light");
        const a = meanIn(f, boxes.a);
        const b = meanIn(f, boxes.b);
        console.log(`FOIL regions ${dark ? "dark" : "light"}: a ${fmt(a)}, b ${fmt(b)}, apart ${oklabDistance(a, b).toFixed(4)}`);
        expect(oklabDistance(a, b)).toBeGreaterThan(visible);
      });
    }
  });

  /**
   * How far the lit foil's colour sits from the page's palette: the mean, over the region's pixels, of the distance in
   * the OKLab a-b plane, each pixel's chromaticity (a, b over L, as the pull keeps the band's own lightness) to the
   * nearest ramp stop's.
   */
  const offRamp = (f: Rgba, b: Box, ramp: Ramp) => {
    const stops = ramp.stops.map((s) => linearToOklab(s)).map(([L, a, bb]) => [a / L, bb / L]);
    const keep = inBox(f, b);
    let sum = 0;
    let n = 0;
    for (let i = 0; i < f.w * f.h; i++) {
      if (!keep(i)) continue;
      const [L, a, bb] = srgbToOklab(f.data[i * 4]!, f.data[i * 4 + 1]!, f.data[i * 4 + 2]!);
      if (L < 0.05) continue;
      sum += Math.min(...stops.map(([sa, sb]) => Math.hypot(a / L - sa!, bb / L - sb!)));
      n++;
    }
    return sum / n;
  };

  it("pull 0 to 1 moves the foil's colour toward the page's ramp", async () => {
    for (const target of ["nearest", "ground"]) {
      const read = async (pull: number) => {
        let r = 0;
        await withPage(url(`?pull=${pull}&target=${target}`), { t: 0 }, async (h, boxes) => {
          const f = await h.shot(`foil-pull-${target}-${pull}`);
          const ramp = await h.hook<Ramp>("window.__foil.ramp()");
          r = (offRamp(f, boxes.a, ramp) + offRamp(f, boxes.b, ramp)) / 2;
        });
        return r;
      };
      const raw = await read(0);
      const pulled = await read(1);
      console.log(`FOIL pull ${target}: off the ramp ${raw.toFixed(4)} at pull 0, ${pulled.toFixed(4)} at pull 1`);
      expect(pulled).toBeLessThan(raw);
    }
  });
});

const SCHEMES = ["light", "dark"] as const;
const CASES = SCHEMES.flatMap((scheme) => [1, 2, 3].map((seed) => ({ scheme, seed, name: `${scheme} seed ${seed}` })));
const th = (n: string) => threshold(n, null);

/** The iridescence law alone on a page in one scheme at one seed: its line, status and measured keys. */
async function iridescenceLaw(rel: string, scheme: "light" | "dark", seed: number) {
  const t = resolveTarget(path.join(ROOT, rel), {}, server.url);
  const part = await checkScheme(t, { seed }, scheme, ["iridescence"]);
  const status = /^iridescence (pass|FAIL|PARTIAL)/.exec(part.line)?.[1] ?? "missing";
  const m = Object.fromEntries(Object.entries(part.measured).filter(([k]) => k.startsWith("iridescence.")));
  console.log(`IRIDESCENCE ${rel} ${scheme} seed ${seed}: ${part.line}\n  ${JSON.stringify(m)}`);
  return { status, line: part.line, m };
}

describe("iridescence: the law passes foil", () => {
  it.each(CASES)("foil.html passes the iridescence law: $name", async ({ scheme, seed }) => {
    const r = await iridescenceLaw("test/pages/foil.html", scheme, seed);
    expect(r.status, r.line).toBe("pass");
    expect(r.m["iridescence.light"]).toBeGreaterThan(th("relight.iridescenceShift"));
    expect(r.m["iridescence.tilt"]).toBeGreaterThan(th("relight.iridescenceShift"));
    expect(r.m["iridescence.match"]).toBeLessThan(th("relight.iridescenceMatch"));
    expect(r.m["iridescence.time"]).toBeLessThan(th("relight.ambientBand"));
    expect(r.m["iridescence.apart"]).toBeGreaterThan(th("relight.iridescenceApart"));
    // (e) is read on foil.html: the bevelled rim spans u inside each groove region.
    expect(r.line).not.toContain(E_NOT_READ);
    expect(r.m["iridescence.spread"]).toBeGreaterThan(th("relight.iridescenceSpread"));
  });
});

describe("iridescence: foil on a drifting sheet is partial from (c) alone", () => {
  // test/pages/foil-drift.html: foil.html on fields.sheet's drifting warp. Every foil texel's surface moves from t to
  // t + 1, so (c) has nothing still to judge: it is not read, never failed, and the law is partial for that alone.
  it.each(CASES)("foil-drift.html reads the iridescence law, (c) not read: $name", async ({ scheme, seed }) => {
    const r = await iridescenceLaw("test/pages/foil-drift.html", scheme, seed);
    expect(r.status, r.line).toBe("PARTIAL");
    expect(r.line).toMatch(/so \(c\) cannot be read/);
    expect(r.m["iridescence.still"]).toBe(0);
    expect(r.m["iridescence.time"]).toBeUndefined();
    expect(r.m["iridescence.light"]).toBeGreaterThan(th("relight.iridescenceShift"));
    expect(r.m["iridescence.tilt"]).toBeGreaterThan(th("relight.iridescenceShift"));
    expect(r.m["iridescence.match"]).toBeLessThan(th("relight.iridescenceMatch"));
    expect(r.m["iridescence.apart"]).toBeGreaterThan(th("relight.iridescenceApart"));
    expect(r.m["iridescence.spread"]).toBeGreaterThan(th("relight.iridescenceSpread"));
  });
});

const FAULT_PAGES = [
  "iridescence-clock",
  "iridescence-pointer-x",
  "iridescence-fixed-light",
  "iridescence-fixed-surface",
  "iridescence-no-groove",
  "iridescence-white",
  "iridescence-flat-normal",
  "iridescence-flat-normal-foil",
  "iridescence-place-hue",
  "iridescence-place-hue-drift",
];
const FAULTS = FAULT_PAGES.flatMap((fault) => CASES.map((c) => ({ ...c, fault })));

/** Each fault's own condition: its line text and its reading on the fail side. */
const KEY_MOVE = /\(a\) moving key 0 between its test positions/;
const TILTED = /\(a\) tilting the surface/;
const expectKeyMove = (r: { line: string; m: Record<string, number> }) => {
  expect(r.line).toMatch(KEY_MOVE);
  expect(r.m["iridescence.light"]).toBeLessThanOrEqual(th("relight.iridescenceShift"));
};
const expectTilt = (r: { line: string; m: Record<string, number> }) => {
  expect(r.line).toMatch(TILTED);
  expect(r.m["iridescence.tilt"]).toBeLessThanOrEqual(th("relight.iridescenceShift"));
};
const expectApart = (r: { line: string; m: Record<string, number> }) => {
  expect(r.line).toMatch(/\(d\) the two largest foil groups/);
  expect(r.m["iridescence.apart"]).toBeLessThanOrEqual(th("relight.iridescenceApart"));
};
const expectSpread = (r: { line: string; m: Record<string, number> }) => {
  expect(r.line).toMatch(/\(e\) two grating bins of one groove/);
  expect(r.m["iridescence.spread"]).toBeLessThanOrEqual(th("relight.iridescenceSpread"));
};
const expectMatch = (r: { line: string; m: Record<string, number> }) => {
  expect(r.line).toMatch(/\(b\) foil of one groove/);
  expect(r.m["iridescence.match"]).toBeGreaterThanOrEqual(th("relight.iridescenceMatch"));
};
const OWN: Record<string, (r: { line: string; m: Record<string, number> }) => void> = {
  "iridescence-clock": (r) => {
    expect(r.line).toMatch(/\(c\) with nothing moved/);
    expect(r.m["iridescence.time"]).toBeGreaterThanOrEqual(th("relight.ambientBand"));
  },
  "iridescence-pointer-x": (r) => {
    expectKeyMove(r);
    expectTilt(r);
  },
  "iridescence-fixed-light": expectKeyMove,
  "iridescence-fixed-surface": expectTilt,
  "iridescence-no-groove": expectApart,
  "iridescence-white": (r) => {
    expectKeyMove(r);
    expectTilt(r);
    expectApart(r);
  },
  "iridescence-flat-normal": expectSpread,
  "iridescence-flat-normal-foil": expectSpread,
  "iridescence-place-hue": expectMatch,
  "iridescence-place-hue-drift": expectMatch,
};

describe("iridescence: the planted faults fail the law for their own reason", () => {
  it.each(FAULTS)("$fault fails the iridescence law: $name", async ({ fault, scheme, seed }) => {
    const r = await iridescenceLaw(`test/faults/${fault}/index.html`, scheme, seed);
    expect(r.status, r.line).toBe("FAIL");
    OWN[fault]!(r);
  });
});
