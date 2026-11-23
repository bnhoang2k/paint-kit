import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeBrowsers, openPage, type OpenOpts, type PageHandle } from "../../src/checks/harness.ts";
import { serveRoot } from "../../src/checks/serve.ts";

type Sample = { height: number[]; coverage: number[]; ink: number[]; slot: number[] };
type Channels = { height: number; coverage: number; ink: number; slot: number };

// 400 x 400 CSS px at dpr 1: the sheet is 400 x 400 and each quadrant is 200 x 200.
const LIVE: OpenOpts = { dpr: 1, width: 400, height: 400 };
const OPTS: OpenOpts = { ...LIVE, t: 1 };

let server: { url: string; close(): Promise<void> };
const url = (q = "") => `${server.url}/test/pages/blend.html${q}`;

beforeAll(async () => {
  server = await serveRoot(path.resolve(import.meta.dirname, "../.."));
});

afterAll(async () => {
  await server?.close();
  await closeBrowsers();
});

async function withPage(u: string, opts: OpenOpts, fn: (h: PageHandle) => Promise<void>) {
  const h = await openPage(u, opts);
  try {
    await fn(h);
  } finally {
    await h.close();
  }
}

/** The mean of each channel over a 20 x 20 CSS px patch centred on (x, y). */
async function at(h: PageHandle, x: number, y: number): Promise<Channels> {
  const s = await h.hook<Sample>(`__paint.sheetRegion(${x - 10}, ${y - 10}, 20, 20)`);
  const mean = (a: number[]) => a.reduce((p, q) => p + q, 0) / a.length;
  return { height: mean(s.height), coverage: mean(s.coverage), ink: mean(s.ink), slot: mean(s.slot) };
}

// The page's three fields, per quadrant (see the comment in blend.html): height adds, coverage multiplies, ink
// takes the max, slot overwrites where the writing field's coverage is above 0.5. C discards its right half,
// so on the right only A and B count.
const EXPECTED: Record<string, [number, number, Channels]> = {
  "top left": [100, 100, { height: 0.017, coverage: 1, ink: 0.7, slot: 3 }],
  "top right": [300, 100, { height: 0.015, coverage: 0.3, ink: 0.7, slot: 2 }],
  "bottom left": [100, 300, { height: 0.017, coverage: 0, ink: 0.4, slot: 3 }],
  "bottom right": [300, 300, { height: 0.015, coverage: 0, ink: 0.2, slot: 0 }],
};

describe("core sheet blend and shader cache", () => {
  for (const [label, q] of [["float", ""], ["RGBA8", "?nofloat=1"]] as const) {
    it(`blends fields by the rule (${label})`, async () => {
      // RGBA8 stores height in 1/255 steps of 0.125 short-side units (about 0.0005), plus a half-level dither.
      const tol = label === "float" ? { height: 1e-4, other: 2e-3 } : { height: 1e-3, other: 4e-3 };
      await withPage(url(q), OPTS, async (h) => {
        for (const [where, [x, y, want]] of Object.entries(EXPECTED)) {
          const got = await at(h, x, y);
          console.log(`blend ${label} ${where}: ${JSON.stringify(got)}`);
          expect(Math.abs(got.height - want.height), `${where} height`).toBeLessThan(tol.height);
          expect(Math.abs(got.coverage - want.coverage), `${where} coverage`).toBeLessThan(tol.other);
          expect(Math.abs(got.ink - want.ink), `${where} ink`).toBeLessThan(tol.other);
          expect(got.slot, `${where} slot`).toBe(want.slot);
        }
        expect(h.errors).toEqual([]);
      });
    });
  }

  // blend-param.html: "under" writes 0.3 on the top half; "over" writes 0.7 in four columns (coverage 1, 0.5, 0.4,
  // discarded). Param overwrites only where the writing field's coverage is above 0.5, and reads 0 where nothing wrote.
  const PARAM_COLUMNS = { full: 50, half: 150, under: 250, discarded: 350 };
  const paramAt = async (h: PageHandle, x: number, y: number) => {
    const s = await h.hook<{ param: number[] }>(`__paint.sheetRegion(${x - 10}, ${y - 10}, 20, 20)`);
    return s.param.reduce((p, q) => p + q, 0) / s.param.length;
  };

  for (const [label, q] of [["float", ""], ["RGBA8", "?nofloat=1"]] as const) {
    it(`param overwrites above coverage 0.5 and reads 0 where unwritten (${label})`, async () => {
      await withPage(`${server.url}/test/pages/blend-param.html${q}`, OPTS, async (h) => {
        const want: [string, number, number, number][] = [
          ["top, coverage 1", PARAM_COLUMNS.full, 100, 0.7],
          ["bottom, coverage 1", PARAM_COLUMNS.full, 300, 0.7],
          ["top, coverage 0.4", PARAM_COLUMNS.under, 100, 0.3],
          ["bottom, coverage 0.4", PARAM_COLUMNS.under, 300, 0],
          ["top, discarded", PARAM_COLUMNS.discarded, 100, 0.3],
          ["bottom, discarded", PARAM_COLUMNS.discarded, 300, 0],
        ];
        // Coverage of exactly 0.5 is stored as 128/255 on the 8-bit sheet, which is above 0.5, so only float can tell.
        if (label === "float") want.push(["top, coverage 0.5", PARAM_COLUMNS.half, 100, 0.3], ["bottom, coverage 0.5", PARAM_COLUMNS.half, 300, 0]);
        for (const [where, x, y, value] of want) {
          const got = await paramAt(h, x, y);
          console.log(`blend param ${label} ${where}: ${got}`);
          expect(Math.abs(got - value), where).toBeLessThan(4e-3);
        }
        // The 64 x 64 grid reads the same channel: column 8, row 16 lies in the top of the coverage 1 column.
        const grid = await h.hook<{ param: number[] }>("__paint.sheet()");
        expect(Math.abs(grid.param[16 * 64 + 8]! - 0.7), "grid").toBeLessThan(4e-3);
        expect(h.errors).toEqual([]);
      });
    });

    it(`param and direction share a field without touching each other (${label})`, async () => {
      const sep = q ? "&" : "?";
      await withPage(`${server.url}/test/pages/blend-param.html${q}${sep}dir=1`, OPTS, async (h) => {
        expect(Math.abs((await paramAt(h, PARAM_COLUMNS.full, 100)) - 0.7)).toBeLessThan(4e-3);
        expect(Math.abs((await paramAt(h, PARAM_COLUMNS.under, 100)) - 0.3)).toBeLessThan(4e-3);
        const s = await h.hook<{ dir: [number, number][] }>(`__paint.sheetRegion(${PARAM_COLUMNS.full - 10}, 90, 20, 20)`);
        const y = s.dir.reduce((p, d) => p + d[1], 0) / s.dir.length;
        console.log(`blend param ${label} direction y under param: ${y}`);
        expect(Math.abs(y - 1)).toBeLessThan(0.01);
        expect(h.errors).toEqual([]);
      });
    });
  }

  it("param reads 0 on a page with no param writer", async () => {
    await withPage(url(), OPTS, async (h) => {
      const s = await h.hook<{ param: number[]; height: number[] }>("__paint.sheetRegion(90, 90, 20, 20)");
      expect(s.param.length).toBe(s.height.length);
      expect(s.param.every((v) => v === 0)).toBe(true);
      expect(h.errors).toEqual([]);
    });
  });

  it("a page that writes param alone reports no direction, and a material reads s.param", async () => {
    await withPage(`${server.url}/test/pages/blend-param.html`, OPTS, async (h) => {
      const s = await h.hook<{ dir?: unknown }>("__paint.sheetRegion(40, 90, 20, 20)");
      expect(s.dir).toBeUndefined();
      const shot = await h.shot();
      const luma = (x: number, y: number) => {
        let sum = 0;
        for (let j = y - 10; j < y + 10; j++) for (let i = x - 10; i < x + 10; i++) sum += shot.data[(j * shot.w + i) * 4 + 1]!;
        return sum / 400;
      };
      const [p7, p3, p0] = [luma(PARAM_COLUMNS.full, 100), luma(PARAM_COLUMNS.discarded, 100), luma(PARAM_COLUMNS.discarded, 300)];
      console.log(`blend param tone from s.param: 0.7 -> ${p7}, 0.3 -> ${p3}, 0 -> ${p0}`);
      // The ink token is darker than the ground, so more param is darker.
      expect(p7).toBeLessThan(p3 - 10);
      expect(p3).toBeLessThan(p0 - 10);
      expect(h.errors).toEqual([]);
    });
  });

  it("recompiles the shade pass only when the list changes", async () => {
    await withPage(url(), OPTS, async (h) => {
      const compiles = async () => (await h.hook<{ compiles: number }>("__paint.stats()")).compiles;
      const c0 = await compiles();
      await h.hook("__paint.setLight(0, { dir: [1, 0.3, 0.5] })");
      await h.hook("__paint.setLight(1, { level: 0.3 })");
      const c1 = await compiles();
      await h.hook("import('paint-kit').then(({ materials }) => window.painter.set({ materials: [materials.matte(), materials.matte()] }))");
      const c2 = await compiles();
      console.log(`blend compiles: ${c0} -> ${c1} after two setLight -> ${c2} after set({ materials })`);
      expect(c1).toBe(c0);
      expect(c2).toBe(c0 + 1);
      expect(h.errors).toEqual([]);
    });
  });

  it("rejects bad options before the loop starts, with one error", async () => {
    // Live (no ?t=), so the failing paints take the live start path, where a started loop would log again.
    await withPage(url(), LIVE, async (h) => {
      const res = await h.hook<{ count: string; shader: string; leftover: boolean }>(`(async () => {
        const { paint, fields, materials, lights, fromPage } = await import("paint-kit");
        const keep = window.__paint;
        const base = {
          seed: 1,
          palette: fromPage({ ground: "--ground", ink: "--ink" }),
          fields: [fields.sheet({ warp: 0.5 })],
          lights: [lights.ambient(1)],
        };
        const tryPaint = (opts) => {
          const c = document.body.appendChild(document.createElement("canvas"));
          try { paint(c, opts); return "no error"; } catch (e) { return String(e.message); }
        };
        const count = tryPaint({ ...base, materials: [1, 2, 3, 4, 5].map(() => materials.matte()) });
        const bad = { id: "bad", glsl: "this is not glsl", uniforms: {}, laws: [] };
        const shader = tryPaint({ ...base, materials: [bad] });
        const leftover = window.__paint !== keep && window.__paint !== undefined;
        window.__paint = keep;
        return { count, shader, leftover };
      })()`);
      // Live loops would log a second error on their next frame; wait for one.
      await h.page.waitForTimeout(300);
      console.log(`blend bad options: ${JSON.stringify(res)}, errors ${JSON.stringify(h.errors)}`);
      expect(res.count).toMatch(/1 to 4 materials/);
      expect(res.shader).toMatch(/compile|shader/i);
      // The failed paint took its own hook away again.
      expect(res.leftover).toBe(false);
      expect(h.errors).toEqual([]);
    });
  });
});
