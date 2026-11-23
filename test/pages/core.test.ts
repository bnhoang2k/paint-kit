import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeBrowsers, openPage, type OpenOpts, type PageHandle, type Rgba } from "../../src/checks/harness.ts";
import { serveRoot } from "../../src/checks/serve.ts";
import { linearToOklch, type Vec3 } from "../../src/engine/palette.ts";

type PaintStats = { p5: number; p50: number; p95: number; p99: number; frames: number; dpr: number; webgl: boolean; sheetW: number; sheetH: number; compiles: number };

// Small viewport at dpr 1 keeps SwiftShader fast; the resize test sets its own size.
const SMALL: OpenOpts = { dpr: 1, width: 960, height: 600 };

let server: { url: string; close(): Promise<void> };
const url = (q = "") => `${server.url}/test/pages/core.html${q}`;

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

// Only the lower half of the frame: the heading sits at the top, so these measure the painted sheet alone.
function lowerHalf(f: Rgba): number[] {
  const idx: number[] = [];
  for (let y = Math.floor(f.h / 2); y < f.h; y++) for (let x = 0; x < f.w; x++) idx.push((y * f.w + x) * 4);
  return idx;
}

function lumStd(f: Rgba): number {
  const idx = lowerHalf(f);
  let s = 0;
  let s2 = 0;
  for (const o of idx) {
    const l = (0.2126 * f.data[o]! + 0.7152 * f.data[o + 1]! + 0.0722 * f.data[o + 2]!) / 255;
    s += l;
    s2 += l * l;
  }
  const m = s / idx.length;
  return Math.sqrt(Math.max(0, s2 / idx.length - m * m));
}

/** Mean absolute difference over RGB, 0..1. */
function meanAbsDiff(a: Rgba, b: Rgba): number {
  expect([a.w, a.h]).toEqual([b.w, b.h]);
  let s = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    for (let c = 0; c < 3; c++) s += Math.abs(a.data[i + c]! - b.data[i + c]!);
  }
  return s / ((a.data.length / 4) * 3 * 255);
}

const toLinear = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** Hue angle (degrees) of the mean OKLab a, b over the lower half of the frame. */
function meanHue(f: Rgba): number {
  let a = 0;
  let b = 0;
  const idx = lowerHalf(f);
  for (const o of idx) {
    const [, C, h] = linearToOklch([toLinear(f.data[o]!), toLinear(f.data[o + 1]!), toLinear(f.data[o + 2]!)] as Vec3);
    a += C * Math.cos((h * Math.PI) / 180);
    b += C * Math.sin((h * Math.PI) / 180);
  }
  const deg = (Math.atan2(b, a) * 180) / Math.PI;
  return deg < 0 ? deg + 360 : deg;
}

function meanLum(f: Rgba): number {
  let s = 0;
  const idx = lowerHalf(f);
  for (const o of idx) s += (0.2126 * f.data[o]! + 0.7152 * f.data[o + 1]! + 0.0722 * f.data[o + 2]!) / 255;
  return s / idx.length;
}

// The canvas parent's inline background against the ground token, both drawn by a 2D canvas to 8-bit sRGB.
type GroundCheck = { inline: string; diff: number };
const GROUND_CHECK = `(() => {
  const parent = document.querySelector("canvas").parentElement;
  const px = (colour) => {
    const c = document.createElement("canvas").getContext("2d");
    c.fillStyle = colour;
    c.fillRect(0, 0, 1, 1);
    return [...c.getImageData(0, 0, 1, 1).data.slice(0, 3)];
  };
  const probe = document.createElement("span");
  probe.style.color = "var(--ground)";
  document.body.append(probe);
  const token = getComputedStyle(probe).color;
  probe.remove();
  const inline = parent.style.backgroundColor;
  const a = px(inline || "transparent");
  const b = px(token);
  return { inline, diff: Math.max(...a.map((v, i) => Math.abs(v - b[i]))) };
})()`;

const hueDistance = (p: number, q: number) => {
  const d = Math.abs(p - q) % 360;
  return d > 180 ? 360 - d : d;
};

describe("core page", () => {
  it("renders and is alive", async () => {
    await withPage(url(), SMALL, async (h) => {
      const a = await h.shot("core-live");
      const std = lumStd(a);
      await h.page.waitForTimeout(1000);
      const b = await h.shot("core-live-1s");
      const diff = meanAbsDiff(a, b);
      console.log(`core live: luminance std ${std.toFixed(4)}, 1 s diff ${diff.toFixed(5)}`);
      expect(std).toBeGreaterThan(0.02);
      expect(diff).toBeGreaterThan(0);
      expect(await h.hook<string>("__paint.motion()")).toBe("live");
      expect(h.errors).toEqual([]);
      // The float path warns about nothing (the RGBA8 path's one warning is tested below).
      expect(h.warnings).toEqual([]);
    });
  });

  it("relights", async () => {
    await withPage(url(), { ...SMALL, t: 2 }, async (h) => {
      await h.hook("__paint.setLight(0, { dir: [1, 0.3, 0.5] })");
      const right = await h.shot("core-key-right");
      await h.hook("__paint.setLight(0, { dir: [-1, 0.3, 0.5] })");
      const left = await h.shot("core-key-left");
      const diff = meanAbsDiff(right, left);
      console.log(`core relight: mean abs diff ${diff.toFixed(4)}`);
      expect(diff).toBeGreaterThan(0.02);
      // moveLight swings the key 60 degrees about the view axis: a different frame again.
      await h.hook("__paint.moveLight(0, 1)");
      const moved = await h.shot("core-key-moved");
      expect(meanAbsDiff(left, moved)).toBeGreaterThan(0);
      expect(h.errors).toEqual([]);
    });
  });

  it("follows the palette", async () => {
    await withPage(url(), { ...SMALL, t: 2 }, async (h) => {
      const before = meanHue(await h.shot("core-palette-before"));
      await h.hook("__paint.setPalette({ '--ground': 'oklch(0.3 0.12 30)' })");
      const after = meanHue(await h.shot("core-palette-after"));
      console.log(`core palette: hue ${before.toFixed(1)} -> ${after.toFixed(1)}`);
      expect(hueDistance(before, after)).toBeGreaterThan(60);
      expect(h.errors).toEqual([]);
    });
  });

  it("resizes without stretch", async () => {
    await withPage(url(), { dpr: 1, width: 1200, height: 700, t: 1 }, async (h) => {
      await h.page.setViewportSize({ width: 800, height: 600 });
      await h.page.waitForFunction("document.querySelector('canvas').width === 800", undefined, { timeout: 5000 });
      const s = await h.hook<PaintStats>("__paint.stats()");
      const canvas = await h.hook<number[]>("[document.querySelector('canvas').width, document.querySelector('canvas').height]");
      await h.shot("core-resized");
      expect(s.sheetW).toBe(800);
      expect(s.sheetH).toBe(600);
      expect(s.dpr).toBe(1);
      // The drawing buffer matches the CSS box, so the image is not stretched by the compositor.
      expect(canvas).toEqual([800, 600]);
      expect(h.errors).toEqual([]);
    });
  });

  it("follows a pixel-ratio change", async () => {
    await withPage(url(), { dpr: 2, width: 800, height: 600 }, async (h) => {
      const cdp = await h.page.context().newCDPSession(h.page);
      const setDpr = (deviceScaleFactor: number) =>
        cdp.send("Emulation.setDeviceMetricsOverride", { width: 800, height: 600, deviceScaleFactor, mobile: false });
      const before = await h.hook<PaintStats>("__paint.stats()");
      await setDpr(1);
      await h.page.waitForFunction("document.querySelector('canvas').width === 800", undefined, { timeout: 5000 }).catch(() => {});
      const at1 = await h.hook<PaintStats>("__paint.stats()");
      await setDpr(3);
      await h.page.waitForFunction("document.querySelector('canvas').width === 1200", undefined, { timeout: 5000 }).catch(() => {});
      const at3 = await h.hook<PaintStats>("__paint.stats()");
      console.log(`core dpr: 2 -> [${before.dpr}, ${before.sheetW}], 1 -> [${at1.dpr}, ${at1.sheetW}], 3 -> [${at3.dpr}, ${at3.sheetW}]`);
      expect([before.dpr, before.sheetW]).toEqual([1.5, 1200]);
      expect([at1.dpr, at1.sheetW]).toEqual([1, 800]);
      expect([at3.dpr, at3.sheetW]).toEqual([1.5, 1200]);
      expect(h.errors).toEqual([]);
    });
  });

  it("setTime is deterministic", async () => {
    const frameAt3 = async (liveMs: number, name: string) => {
      let f: Rgba | undefined;
      await withPage(url(), SMALL, async (h) => {
        await h.page.waitForTimeout(liveMs);
        await h.hook("__paint.setTime(3)");
        expect(await h.hook<string>("__paint.motion()")).toBe("still");
        f = await h.shot(name);
        expect(h.errors).toEqual([]);
      });
      return f!;
    };
    const a = await frameAt3(200, "core-t3-a");
    const b = await frameAt3(1500, "core-t3-b");
    expect(meanAbsDiff(a, b)).toBe(0);
  });

  it("warns once without float targets", async () => {
    await withPage(url("?nofloat=1"), SMALL, async (h) => {
      await h.page.waitForTimeout(500);
      const f = await h.shot("core-nofloat");
      console.log(`core nofloat: warnings ${JSON.stringify(h.warnings)}, std ${lumStd(f).toFixed(4)}`);
      expect(h.warnings).toHaveLength(1);
      expect(h.warnings[0]).toMatch(/float/i);
      // core.html runs no grown field, so the warning does not name one.
      expect(h.warnings[0]).not.toMatch(/grown/);
      expect(lumStd(f)).toBeGreaterThan(0.02);
      expect(h.errors).toEqual([]);
    });
  });

  it("rebuilds on theme switch", async () => {
    await withPage(url(), { ...SMALL, t: 2 }, async (h) => {
      const light = await h.hook<PaintStats>("__paint.stats()");
      const lightShot = meanLum(await h.shot("core-light"));
      await h.page.emulateMedia({ colorScheme: "dark" });
      await h.hook("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))");
      // The page is frozen, so only the palette watch can draw a new frame onto the visible canvas.
      const darkShot = meanLum(await h.shot("core-dark"));
      const dark = await h.hook<PaintStats>("__paint.stats()");
      console.log(`core theme: p50 light ${light.p50.toFixed(3)} -> dark ${dark.p50.toFixed(3)}, shown ${lightShot.toFixed(3)} -> ${darkShot.toFixed(3)}, frames ${light.frames} -> ${dark.frames}`);
      expect(dark.frames).toBeGreaterThan(light.frames);
      expect(darkShot).toBeLessThan(lightShot - 0.3);
      expect(dark.p50).toBeLessThan(light.p50);
      expect(h.errors).toEqual([]);
    });
  });

  it("falls back on context loss", async () => {
    await withPage(url(), SMALL, async (h) => {
      // core.html runs no text field, so its ink text was never hidden and stays visible. The text field gives its
      // own elements back on context loss; paper.test.ts ("text field cases") tests that with a custom selector.
      await h.hook("document.querySelector('canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()");
      await h.page.waitForFunction("document.documentElement.dataset.paint === 'fallback'", undefined, { timeout: 5000 });
      const errorsAtLoss = h.errors.length;
      await h.page.waitForTimeout(1000);
      await h.shot("core-fallback-lost");
      const heading = await h.hook<string>("getComputedStyle(document.querySelector('h1')).color");
      const canvasShown = await h.hook<boolean>("document.querySelector('canvas').getClientRects().length > 0");
      const s = await h.hook<PaintStats>("__paint.stats()");
      const ink = await h.hook<string>("getComputedStyle(document.querySelector('[data-paint-ink]')).color");
      const ground = await h.hook<GroundCheck>(GROUND_CHECK);
      console.log(`core lost: heading ${heading}, ink ${ink}, ground ${JSON.stringify(ground)}, errors ${JSON.stringify(h.errors)}`);
      expect(heading).not.toBe("rgba(0, 0, 0, 0)");
      expect(ink).not.toBe("rgba(0, 0, 0, 0)");
      expect(ground.inline).not.toBe("");
      expect(ground.diff).toBeLessThanOrEqual(1);
      expect(canvasShown).toBe(false);
      expect(s.webgl).toBe(false);
      expect(h.errors.length).toBe(errorsAtLoss);
      expect(h.errors).toEqual([]);
    });
  });

  // A page sizes its pictures by the GPU's limit without a context of its own (bar 05's card): the painter reports
  // MAX_TEXTURE_SIZE of its own context, at least WebGL2's 2048; the fallback, which uploads no pictures, reports 0.
  it("reports the GPU's texture limit from its own context", async () => {
    await withPage(url(), SMALL, async (h) => {
      const r = await h.hook<{ own: unknown; gl: number }>(
        `({ own: window.painter.maxTextureSize, gl: (() => { const gl = document.querySelector("canvas").getContext("webgl2"); return gl.getParameter(gl.MAX_TEXTURE_SIZE); })() })`,
      );
      console.log(`painter.maxTextureSize ${String(r.own)}, the context's MAX_TEXTURE_SIZE ${r.gl}`);
      expect(r.own).toBe(r.gl);
      expect(r.gl).toBeGreaterThanOrEqual(2048);
      expect(h.errors).toEqual([]);
    });
    await withPage(url(), { ...SMALL, webgl: false }, async (h) => {
      expect(await h.hook<unknown>("window.painter.maxTextureSize")).toBe(0);
    });
  });

  it("falls back without WebGL", async () => {
    await withPage(url(), { ...SMALL, webgl: false }, async (h) => {
      const f = await h.shot("core-fallback-nogl");
      expect(await h.hook<string>("document.documentElement.dataset.paint")).toBe("fallback");
      expect(await h.hook<boolean>("document.querySelector('canvas').getClientRects().length > 0")).toBe(false);
      expect(await h.hook<string>("getComputedStyle(document.querySelector('h1')).color")).not.toBe("rgba(0, 0, 0, 0)");
      expect((await h.hook<PaintStats>("__paint.stats()")).webgl).toBe(false);
      const ground = await h.hook<GroundCheck>(GROUND_CHECK);
      expect(ground.inline).not.toBe("");
      expect(ground.diff).toBeLessThanOrEqual(1);
      // The lower half is bare ground: one flat colour.
      expect(lumStd(f)).toBeLessThan(0.005);
      expect(h.errors).toEqual([]);
    });
  });

  it("still under reduced motion", async () => {
    await withPage(url(), { ...SMALL, reduced: true }, async (h) => {
      const a = await h.shot("core-reduced-a");
      const framesA = (await h.hook<PaintStats>("__paint.stats()")).frames;
      await h.page.waitForTimeout(2000);
      const b = await h.shot("core-reduced-b");
      const framesB = (await h.hook<PaintStats>("__paint.stats()")).frames;
      expect(meanAbsDiff(a, b)).toBe(0);
      expect(framesB).toBe(framesA);
      expect(await h.hook<string>("__paint.motion()")).toBe("still");
      // Render on demand: a change draws one frame, and the loop stays still.
      await h.hook("__paint.setLight(0, { dir: [1, 0.3, 0.5] })");
      const c = await h.shot("core-reduced-relit");
      expect((await h.hook<PaintStats>("__paint.stats()")).frames).toBe(framesB + 1);
      expect(meanAbsDiff(b, c)).toBeGreaterThan(0.01);
      expect(await h.hook<string>("__paint.motion()")).toBe("still");
      expect(h.errors).toEqual([]);
    });
  });

  it("pauses while hidden", async () => {
    // Headless pages are never hidden, so the test owns document.hidden and document.visibilityState.
    const initScript = `
      Object.defineProperty(document, "hidden", { configurable: true, get: () => globalThis.__fakeHidden === true });
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (globalThis.__fakeHidden === true ? "hidden" : "visible") });`;
    const flip = (hidden: boolean) => `globalThis.__fakeHidden = ${hidden}; document.dispatchEvent(new Event("visibilitychange"))`;
    await withPage(url(), { ...SMALL, initScript }, async (h) => {
      await h.page.waitForTimeout(300);
      await h.hook(flip(true));
      const before = (await h.hook<PaintStats>("__paint.stats()")).frames;
      await h.page.waitForTimeout(1000);
      const after = (await h.hook<PaintStats>("__paint.stats()")).frames;
      expect(after).toBe(before);
      expect(await h.hook<string>("__paint.motion()")).toBe("paused");
      await h.hook(flip(false));
      await h.page.waitForTimeout(500);
      const resumed = (await h.hook<PaintStats>("__paint.stats()")).frames;
      console.log(`core hidden: frames ${before} -> ${after} hidden, ${resumed} after 0.5 s visible`);
      expect(resumed).toBeGreaterThan(after);
      expect(await h.hook<string>("__paint.motion()")).toBe("live");
      expect(h.errors).toEqual([]);
    });
  });

  it("reads the test-fault seam", async () => {
    const small = { dpr: 3, width: 400, height: 300, t: 1 };
    await withPage(url(), small, async (h) => {
      expect((await h.hook<PaintStats>("__paint.stats()")).dpr).toBe(1.5);
    });
    await withPage(url(), { ...small, initScript: "globalThis.__PAINT_TEST_FAULT = 'dpr3';" }, async (h) => {
      const s = await h.hook<PaintStats>("__paint.stats()");
      expect(s.dpr).toBeGreaterThan(1.5);
      expect(s.sheetW).toBe(1200);
      expect(h.errors).toEqual([]);
    });
  });
});
