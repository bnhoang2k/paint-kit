// Behaviour tests for the lamp and glow lights on test/pages/lights.html, driven through `window.__paint` and
// frozen at a fixed t and seed. The relight check (src/checks/relight.ts) holds the thresholds; the tolerances
// here are test constants, each with its reason.
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeBrowsers, openPage, type OpenOpts, type PageHandle, type Rgba } from "../../src/checks/harness.ts";
import { serveRoot } from "../../src/checks/serve.ts";
import { lampSheetPoint, type LampOptions } from "../../src/engine/lights/lamp.ts";
import { linearToOklch, parseCssColor, type Vec3 } from "../../src/engine/palette.ts";

// Mirrors lights.html. Light 0 is the lamp, light 1 the glow, light 2 ambient.
const LAMP: Pick<LampOptions, "at" | "aim" | "cone"> = { at: [0.4, 0.1, 0.9], aim: [0.42, 0.45, 0], cone: 20 };
const GLOW = { at: [0.15, 0.8] as [number, number], radius: 0.2 };

const W = 960;
const H = 600;
const FROZEN: OpenOpts = { dpr: 1, width: W, height: H, t: 2, seed: 1 };

// Outside the cone the lamp adds exactly nothing, so the two frames differ only by rounding: a patch mean
// within 1.5 code values (of 255) is a match.
const LAMP_OFF_TOL = 1.5 / 255;
// Beyond the glow's radius it adds exactly nothing: per pixel, at most 1 code value of rounding.
const GLOW_OFF_TOL = 1 / 255;
// A glow on black albedo multiplies to black: at most 1 code value of rounding above the glow-off frame.
const BLACK_EPS = 1 / 255;
// The lamp test positions must change the frame visibly (the same bar the core page's relight test uses).
const MOVE_DIFF = 0.02;

let server: { url: string; close(): Promise<void> };
const url = () => `${server.url}/test/pages/lights.html`;

beforeAll(async () => {
  server = await serveRoot(path.resolve(import.meta.dirname, "../.."));
});

afterAll(async () => {
  await server?.close();
  await closeBrowsers();
});

async function withPage(opts: OpenOpts, fn: (h: PageHandle) => Promise<void>) {
  const h = await openPage(url(), opts);
  try {
    await fn(h);
  } finally {
    await h.close();
  }
}

const lumAt = (f: Rgba, o: number) => (0.2126 * f.data[o]! + 0.7152 * f.data[o + 1]! + 0.0722 * f.data[o + 2]!) / 255;

/** Mean luminance of a (2r+1)-px square patch centred on a point given in page fractions. */
function patchLum(f: Rgba, [fx, fy]: [number, number], r = 7): number {
  const cx = Math.round(fx * f.w);
  const cy = Math.round(fy * f.h);
  let s = 0;
  let n = 0;
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      s += lumAt(f, (y * f.w + x) * 4);
      n++;
    }
  }
  return s / n;
}

function meanAbsDiff(a: Rgba, b: Rgba): number {
  expect([a.w, a.h]).toEqual([b.w, b.h]);
  let s = 0;
  for (let i = 0; i < a.data.length; i += 4) for (let c = 0; c < 3; c++) s += Math.abs(a.data[i + c]! - b.data[i + c]!);
  return s / ((a.data.length / 4) * 3 * 255);
}

/** Pixel offsets whose distance from the glow centre, in short-side units, lies in [lo, hi). */
function glowRing(f: Rgba, lo: number, hi: number): number[] {
  const cx = GLOW.at[0] * f.w;
  const cy = GLOW.at[1] * f.h;
  const side = Math.min(f.w, f.h);
  const idx: number[] = [];
  for (let y = 0; y < f.h; y++) {
    for (let x = 0; x < f.w; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / side;
      if (d >= lo && d < hi) idx.push((y * f.w + x) * 4);
    }
  }
  return idx;
}

const toLinear = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** Mean OKLab (a, b) over the pixels, as chroma and hue (degrees). */
function meanChromaHue(f: Rgba, idx: number[]): { C: number; h: number } {
  let a = 0;
  let b = 0;
  for (const o of idx) {
    const [, C, h] = linearToOklch([toLinear(f.data[o]!), toLinear(f.data[o + 1]!), toLinear(f.data[o + 2]!)] as Vec3);
    a += C * Math.cos((h * Math.PI) / 180);
    b += C * Math.sin((h * Math.PI) / 180);
  }
  a /= idx.length;
  b /= idx.length;
  const deg = (Math.atan2(b, a) * 180) / Math.PI;
  return { C: Math.hypot(a, b), h: deg < 0 ? deg + 360 : deg };
}

const hueDistance = (p: number, q: number) => {
  const d = Math.abs(p - q) % 360;
  return d > 180 ? 360 - d : d;
};

const lampOff = "__paint.setLight(0, { level: 0 })";
const glowOff = "__paint.setLight(1, { level: 0 })";

describe("lights page", () => {
  it("lamp lights a pool and stops at its cone", async () => {
    await withPage(FROZEN, async (h) => {
      const aspect = W / H;
      // Three points on the aim line: the near half-cone, the aim, the far half-cone. Each is farther from the lamp.
      const pts = [-0.5, 0, 0.5].map((k) => lampSheetPoint(LAMP, aspect, k * LAMP.cone)!);
      const outside = lampSheetPoint(LAMP, aspect, 1.5 * LAMP.cone, true)!;
      for (const p of [...pts, outside]) {
        expect(p).not.toBeNull();
        expect(p[0]).toBeGreaterThan(0.05);
        expect(p[0]).toBeLessThan(0.95);
        expect(p[1]).toBeGreaterThan(0.12);
        expect(p[1]).toBeLessThan(0.95);
      }
      const on = await h.shot("lights-lamp-0");
      await h.hook(lampOff);
      const off = await h.shot("lights-lamp-off");
      const lums = pts.map((p) => patchLum(on, p));
      const offAt = patchLum(off, outside);
      const onAt = patchLum(on, outside);
      console.log(
        `lights falloff: aim samples ${lums.map((l) => l.toFixed(4)).join(" > ")}, at 1.5x cone ${onAt.toFixed(4)} vs off ${offAt.toFixed(4)}, at aim off ${patchLum(off, pts[1]!).toFixed(4)}`,
      );
      expect(lums[0]!).toBeGreaterThan(lums[1]!);
      expect(lums[1]!).toBeGreaterThan(lums[2]!);
      expect(Math.abs(onAt - offAt)).toBeLessThanOrEqual(LAMP_OFF_TOL);
      // The lamp lights its aim point well above the lamp-off frame.
      expect(lums[1]! - patchLum(off, pts[1]!)).toBeGreaterThan(0.1);
      expect(h.errors).toEqual([]);
    });
  });

  it("lamp moves with setLight and moveLight", async () => {
    await withPage(FROZEN, async (h) => {
      await h.hook("__paint.moveLight(0, 0)");
      const a = await h.shot("lights-lamp-pos0");
      await h.hook("__paint.moveLight(0, 1)");
      const b = await h.shot("lights-lamp-pos1");
      const moved = meanAbsDiff(a, b);
      await h.hook("__paint.setLight(0, { at: [0.75, 0.1, 0.9], aim: [0.77, 0.45, 0] })");
      const c = await h.shot("lights-lamp-set");
      const set = meanAbsDiff(a, c);
      console.log(`lights lamp move: moveLight diff ${moved.toFixed(4)}, setLight diff ${set.toFixed(4)}`);
      expect(moved).toBeGreaterThan(MOVE_DIFF);
      expect(set).toBeGreaterThan(MOVE_DIFF);
      expect(h.errors).toEqual([]);
    });
  });

  for (const dark of [false, true]) {
    const scheme = dark ? "dark" : "light";
    it(`glow tints inside its radius and stops at it (${scheme})`, async () => {
      await withPage({ ...FROZEN, dark }, async (h) => {
        const on = await h.shot(`lights-glow-on-${scheme}`);
        await h.hook(glowOff);
        const off = await h.shot(`lights-glow-off-${scheme}`);
        const accent = await h.hook<string>(
          "(() => { const p = document.createElement('span'); p.style.color = 'var(--accent)'; document.body.append(p); const c = getComputedStyle(p).color; p.remove(); return c; })()",
        );
        const glowHue = linearToOklch(parseCssColor(accent))[2];
        const inside = glowRing(on, 0, 0.6 * GLOW.radius);
        const hOn = meanChromaHue(on, inside);
        const hOff = meanChromaHue(off, inside);
        const beyond = glowRing(on, 1.2 * GLOW.radius, 10);
        let worst = 0;
        for (const o of beyond) for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(on.data[o + c]! - off.data[o + c]!) / 255);
        console.log(
          `lights glow ${scheme}: glow hue ${glowHue.toFixed(1)}, inside hue ${hOff.h.toFixed(1)} -> ${hOn.h.toFixed(1)}, chroma ${hOff.C.toFixed(4)} -> ${hOn.C.toFixed(4)}, beyond 1.2r worst diff ${(worst * 255).toFixed(1)}/255`,
        );
        expect(hueDistance(hOn.h, glowHue)).toBeLessThan(hueDistance(hOff.h, glowHue));
        expect(hOn.C).toBeGreaterThan(hOff.C);
        expect(worst).toBeLessThanOrEqual(GLOW_OFF_TOL);
        expect(h.errors).toEqual([]);
      });
    });
  }

  it("glow multiplies with albedo: black stays black", async () => {
    await withPage(FROZEN, async (h) => {
      // Detail 0 drops the matte's fine colour variation, so a black ground token is black albedo everywhere.
      await h.hook("__paint.setDetail(0)");
      await h.hook("__paint.setPalette({ '--ground': 'oklch(0 0 0)' })");
      const on = await h.shot("lights-glow-black-on");
      await h.hook(glowOff);
      const off = await h.shot("lights-glow-black-off");
      let worst = 0;
      for (const o of glowRing(on, 0, GLOW.radius)) worst = Math.max(worst, lumAt(on, o) - lumAt(off, o));
      console.log(`lights glow on black: worst brightening ${(worst * 255).toFixed(2)}/255`);
      expect(worst).toBeLessThanOrEqual(BLACK_EPS);
      expect(h.errors).toEqual([]);
    });
  });
});
