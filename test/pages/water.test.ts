// Behaviour tests for the water field, the water material and light through water (Task 15), on
// test/pages/water.html and its planted fault test/faults/water-static-caustics, through the gate and the hook.
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CHECKS, gate } from "../../src/checks/gate.ts";
import { closeBrowsers, openPage } from "../../src/checks/harness.ts";
import { hideText } from "../../src/checks/frames.ts";
import { meanAbsDiff } from "../../src/checks/image.ts";
import { brightMask, causticAlone, lineWidth, readCaustic, type LightInfo } from "../../src/checks/relight.ts";
import { serveRoot } from "../../src/checks/serve.ts";
import { threshold } from "../../src/checks/threshold.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");
const W = 960;
const H = 600;
let server: { url: string; close(): Promise<void> };

beforeAll(async () => {
  server = await serveRoot(ROOT);
});

afterAll(async () => {
  await server?.close();
  await closeBrowsers();
});

const run = (rel: string) => gate(path.join(ROOT, rel), { baseUrl: server.url });
const STILL = CHECKS.filter((c) => c.name === "still");
// Task 2e: one gate of a page ran 119 to 128 s alone, so a gate test runs its checks in groups, each a test of its
// own. The checks do not read each other, so together the groups assert what the one gate asserted.
const only = (...names: string[]) => CHECKS.filter((c) => names.includes(c.name));
const runChecks = (rel: string, checks: typeof CHECKS) => gate(path.join(ROOT, rel), { baseUrl: server.url }, checks);
type Run = Awaited<ReturnType<typeof run>>;
const statusOf = (r: Run) => Object.fromEntries(r.results.map((c) => [c.name, c.status]));
const relightOf = (r: Run) => r.results.find((c) => c.name === "relight")!;
const th = (n: string) => threshold(n, null);
type Shot = Awaited<ReturnType<Awaited<ReturnType<typeof openPage>>["shot"]>>;
/** Mean absolute RGB difference, 0..1, over the pixels `keep(x, y)` selects. */
function regionDiff(a: Shot, b: Shot, keep: (x: number, y: number) => boolean): number {
  let s = 0;
  let n = 0;
  for (let y = 0; y < a.h; y++)
    for (let x = 0; x < a.w; x++) {
      if (!keep(x, y)) continue;
      const i = (y * a.w + x) * 4;
      for (let c = 0; c < 3; c++) s += Math.abs(a.data[i + c]! - b.data[i + c]!);
      n++;
    }
  return s / (n * 3 * 255);
}
// The card on water.html at 960x600: centred, half-size 0.42 x 0.27 of the short side (252 x 162 px).
const onCard = (x: number, y: number) => Math.abs(x - W / 2) < 180 && Math.abs(y - H / 2) < 120;
// The pool floor well clear of the card (the card's edge is 228 px from the side; refraction moves it under 40 px).
const offCard = (x: number, y: number) => x < 150 || x >= W - 150;
/** Frozen shot of water.html with these query switches at time t (seed 1, 960x600, dpr 1). */
async function shotAt(query: string, t: number, name?: string): Promise<Shot> {
  const h = await openPage(`${server.url}/test/pages/water.html${query}`, { dpr: 1, width: W, height: H, seed: 1, t });
  try {
    await h.hook(`__paint.setTime(${t})`);
    return await h.shot(name);
  } finally {
    await h.close();
  }
}

describe("water page", () => {
  it("water passes relight (caustic)", async () => {
    const r = await runChecks("test/pages/water.html", only("relight"));
    const rl = relightOf(r);
    console.log(`water\n${r.lines.join("\n")}\n${JSON.stringify(rl.measured)}`);
    expect(statusOf(r).relight).toBe("pass");
    expect(rl.line).toMatch(/caustic pass/);
    // The law's two conditions, read from its measures: thin lines, and lines that move in half a second.
    expect(rl.measured["caustic.concentration.light"]).toBeGreaterThanOrEqual(th("relight.causticConcentration"));
    expect(rl.measured["caustic.overlap.light"]).toBeLessThan(th("relight.causticOverlap"));
  }, 120_000);

  it("water passes detail", async () => {
    const r = await runChecks("test/pages/water.html", only("detail"));
    console.log(`water\n${r.lines.join("\n")}`);
    expect(statusOf(r).detail).toBe("pass");
  }, 120_000);

  it("water passes render, palette, still and hygiene", async () => {
    // The rest of the gate holds on the page too: it is alive, follows its tokens and does not band.
    const r = await runChecks("test/pages/water.html", only("render", "palette", "still", "hygiene"));
    console.log(`water\n${r.lines.join("\n")}`);
    const st = statusOf(r);
    expect({ render: st.render, palette: st.palette, still: st.still, hygiene: st.hygiene }).toEqual({ render: "pass", palette: "pass", still: "pass", hygiene: "pass" });
  }, 120_000);

  // Engine fault 'static-caustics': a caustic baked once (t = 0) and laid over the floor without the water's
  // refraction, while the surface and its refraction move on.
  it("static caustics fail relight", async () => {
    const r = await runChecks("test/faults/water-static-caustics/index.html", only("relight"));
    const rl = relightOf(r);
    console.log(`water-static-caustics\n${r.lines.join("\n")}\n${JSON.stringify(rl.measured)}`);
    expect(statusOf(r).relight).toBe("fail");
    expect(rl.line).toMatch(/caustic FAIL \(.*the caustic lines stand still/);
    expect(rl.measured["caustic.overlap.light"]).toBeGreaterThanOrEqual(th("relight.causticOverlap"));
  }, 120_000);

  it("static caustics: the page itself is alive, so render passes", async () => {
    // The surface still refracts the floor, so render does not catch it.
    const r = await runChecks("test/faults/water-static-caustics/index.html", only("render"));
    expect(statusOf(r).render).toBe("pass");
  }, 120_000);

  // Page fault: the floor at 0.6, well short of the waves' focus, so the light lands as soft pools that still move.
  it("soft caustics fail the thin half of relight", async () => {
    const r = await runChecks("test/faults/water-soft-caustics/index.html", only("relight"));
    const rl = relightOf(r);
    console.log(`water-soft-caustics\n${r.lines.join("\n")}\n${JSON.stringify(rl.measured)}`);
    expect(statusOf(r).relight).toBe("fail");
    expect(rl.line).toMatch(/pools of light, not lines/);
    expect(rl.line).not.toMatch(/stand still/);
    expect(rl.measured["caustic.concentration.light"]).toBeLessThan(th("relight.causticConcentration"));
    expect(rl.measured["caustic.overlap.light"]).toBeLessThan(th("relight.causticOverlap"));
  }, 120_000);

  it("soft caustics: render passes", async () => {
    const r = await runChecks("test/faults/water-soft-caustics/index.html", only("render"));
    expect(statusOf(r).render).toBe("pass");
  }, 120_000);

  // Bug class "a measure that changes with exposure" (caustic fix, 2026-11-14; review-bar-05.md, Critical 1): the
  // caustic law's thin half read 1.35 px at the page's own light and 4.98 px with both lights halved, because clipped
  // line cores broke into speckle. Tolerance, stated before measuring: a relative spread, (max - min) / mean, of at most
  // 0.10, well inside the third a reading may drop under the threshold's 1.5 margin. The new measure (concentration at
  // the law's exposure) must hold it at the law's level, its half and its quarter, and the law's own read must not
  // move when the page's lights are doubled into clipping. The old measure (line width at the page's lights, grain on)
  // must break it at the page's lights x 0.5, 1 and 2, so the guard is shown to catch the old bug.
  it("the caustic reading does not move with exposure", async () => {
    const TOL = 0.1;
    const spread = (xs: number[]) => (Math.max(...xs) - Math.min(...xs)) / (xs.reduce((a, b) => a + b, 0) / xs.length);
    const h = await openPage(`${server.url}/test/pages/water.html`, { dpr: 1, width: W, height: H, seed: 1, detail: 0.5, t: 2 });
    try {
      await h.hook("__paint.setTime(2)");
      await hideText(h);
      const lights = await h.hook<LightInfo[]>("__paint.lights()");
      const i = lights.findIndex((l) => l.id === "throughWater");
      const concentration = async (ls: LightInfo[], level?: number) => {
        const r = await readCaustic(h, ls, i, level);
        expect(r.clear).toBe(true);
        return { c: Math.min(brightMask(r.v[0], r.keep).cut, brightMask(r.v[1], r.keep).cut), level: r.level };
      };
      const own = await concentration(lights);
      const fixed = [own.c, (await concentration(lights, own.level / 2)).c, (await concentration(lights, own.level / 4)).c];
      // The page's lights scaled together, as declared and doubled (the doubled key clips the water).
      const scaled = async (k: number) => {
        for (const [j, l] of lights.entries()) await h.hook(`__paint.setLight(${j}, { level: ${(l.props.level as number) * k} })`);
        return h.hook<LightInfo[]>("__paint.lights()");
      };
      const doubled = (await concentration(await scaled(2))).c;
      const restore = async () => {
        for (const [j, l] of lights.entries()) await h.hook(`__paint.setLight(${j}, ${JSON.stringify(l.props)})`);
      };
      await restore();
      console.log(`exposure guard: concentration at ${own.level}, /2, /4 x the key: ${fixed.map((x) => x.toFixed(3)).join(" / ")} (spread ${spread(fixed).toFixed(3)}); doubled ${doubled.toFixed(3)}`);
      expect(spread(fixed)).toBeLessThanOrEqual(TOL);
      expect(spread([own.c, doubled])).toBeLessThanOrEqual(TOL);
    } finally {
      await h.close();
    }
  }, 120_000);


  it("the old caustic width moved with exposure", async () => {
    const TOL = 0.1;
    const spread = (xs: number[]) => (Math.max(...xs) - Math.min(...xs)) / (xs.reduce((a, b) => a + b, 0) / xs.length);
    const h = await openPage(`${server.url}/test/pages/water.html`, { dpr: 1, width: W, height: H, seed: 1, detail: 0.5, t: 2 });
    try {
      await h.hook("__paint.setTime(2)");
      await hideText(h);
      const lights = await h.hook<LightInfo[]>("__paint.lights()");
      const i = lights.findIndex((l) => l.id === "throughWater");
      const scaled = async (k: number) => {
        for (const [j, l] of lights.entries()) await h.hook(`__paint.setLight(${j}, { level: ${(l.props.level as number) * k} })`);
        return h.hook<LightInfo[]>("__paint.lights()");
      };
      const restore = async () => {
        for (const [j, l] of lights.entries()) await h.hook(`__paint.setLight(${j}, ${JSON.stringify(l.props)})`);
      };
      // The old measure: the page's lights x k, grain on, the brightest 5% of on over off, minus 1, as a mean line width.
      const oldWidth = async (k: number) => {
        await scaled(k);
        const on = await h.shot();
        await h.hook(`__paint.setLight(${i}, { caustic: 0 })`);
        const off = await h.shot();
        await restore();
        const v = causticAlone(on, off);
        const keep = Uint8Array.from(v, (x) => (Number.isFinite(x) ? 1 : 0));
        return lineWidth(brightMask(v, keep).mask, on.w, on.h);
      };
      const old = [await oldWidth(0.5), await oldWidth(1), await oldWidth(2)];
      console.log(`exposure guard, old width at x0.5 / x1 / x2: ${old.map((x) => x.toFixed(3)).join(" / ")} (spread ${spread(old).toFixed(3)})`);
      expect(spread(old)).toBeGreaterThan(TOL);
    } finally {
      await h.close();
    }
  }, 120_000);

  // Per-pixel depth (fix round 1): a card that rises through the water must not lift the whole pool floor. The
  // rise map is the card's footprint; at rise 0.3 the card's face changes and the floor around it does not.
  it("a card that rises lifts only the card", async () => {
    const plain = await shotAt("", 2);
    const risen = await shotAt("?rise=0.3", 2, "water-rise-0.3");
    const zero = await shotAt("?rise=0", 2);
    const card = regionDiff(plain, risen, onCard);
    const floor = regionDiff(plain, risen, offCard);
    const none = meanAbsDiff(plain, zero);
    console.log(`water rise 0.3 vs plain at t 2: card ${card.toFixed(6)}, floor clear of the card ${floor.toFixed(6)}; rise 0 vs plain ${none.toFixed(6)}`);
    expect(card).toBeGreaterThan(0.01);
    expect(floor).toBe(0);
    expect(none).toBe(0);
  }, 120_000);

  // Bug class "the first draw differs from a redraw at the same time" (Task 15 fix round 1, Critical 1): the first
  // shade draw after a material with a picture bound the picture over the sheet. The page's first frame must equal
  // a redraw of the same state (a re-shade, then setTime at the same t).
  it("the first frame equals a redraw at the same time", async () => {
    const h = await openPage(`${server.url}/test/pages/water.html`, { dpr: 1, width: W, height: H, seed: 1, t: 1 });
    try {
      const first = await h.shot();
      await h.hook("__paint.setGrain(__paint.grain())");
      const reshade = meanAbsDiff(first, await h.shot());
      await h.hook("__paint.setTime(1)");
      const replay = meanAbsDiff(first, await h.shot());
      console.log(`water first frame vs re-shade ${reshade.toFixed(6)}, vs setTime(1) ${replay.toFixed(6)}`);
      expect(reshade).toBe(0);
      expect(replay).toBe(0);
    } finally {
      await h.close();
    }
  }, 120_000);

  it("a wrong first draw fails still", async () => {
    // Engine fault 'picture-on-active-unit': the first draw reads the picture as the sheet; later draws are right.
    const r = await gate(path.join(ROOT, "test/faults/water-first-draw/index.html"), { baseUrl: server.url }, STILL);
    const st = r.results.find((c) => c.name === "still")!;
    console.log(`water-first-draw\n${r.lines.join("\n")}`);
    expect(st.status).toBe("fail");
    expect(st.line).toMatch(/the reduced-motion frame is not the held one/);
    expect(st.measured.heldDiff).toBeGreaterThan(th("still.heldDiff"));
  }, 120_000);

  // Bar 05 binding: the pool moves through uniforms. Stepping time draws new waves, a new refraction and new
  // caustics with no shader compile and no texture upload (the `under` picture is uploaded once). The test counts
  // the GL calls themselves, as the halftone arrival test does.
  const COUNT_GL = `(() => {
    globalThis.__gl = { compiles: 0, uploads: 0 };
    const P = WebGL2RenderingContext.prototype;
    const wrap = (name, key) => { const f = P[name]; P[name] = function (...a) { globalThis.__gl[key]++; return f.apply(this, a); }; };
    wrap("compileShader", "compiles");
    wrap("texImage2D", "uploads");
    wrap("texSubImage2D", "uploads");
  })()`;

  // Plain: only time moves. Moving: the floor, the shift and the card's rise are functions of t as well (bar 05's
  // path: Field.shade.frame), and the rise map is bound every draw without a new upload.
  it.each([
    ["plain", ""],
    ["moving floor, shift and rise", "?moving=floor,shift,rise"],
  ])("the pool moves with no shader compile and no texture upload (%s)", async (label, query) => {
    const tag = query ? "water-moving" : "water";
    const h = await openPage(`${server.url}/test/pages/water.html${query}`, { dpr: 1, width: W, height: H, seed: 1, t: 2, initScript: COUNT_GL });
    try {
      const gl = () => h.hook<{ compiles: number; uploads: number }>("({ ...globalThis.__gl })");
      const shade = async () => (await h.hook<{ compiles: number }>("__paint.stats()")).compiles;
      const g0 = await gl();
      const s0 = await shade();
      const first = await h.shot(`${tag}-t2`);
      for (let k = 1; k <= 30; k++) await h.hook(`__paint.setTime(${2 + k / 60})`);
      const last = await h.shot(`${tag}-t2.5`);
      const g1 = await gl();
      const moved = meanAbsDiff(first, last);
      console.log(`${label} 2 s -> 2.5 s: ${g1.compiles - g0.compiles} compiles, ${g1.uploads - g0.uploads} uploads, shade compiles +${(await shade()) - s0}; frame moved ${moved.toFixed(4)}`);
      expect(moved).toBeGreaterThan(0.005);
      expect(g1.compiles - g0.compiles).toBe(0);
      expect(g1.uploads - g0.uploads).toBe(0);
      expect((await shade()) - s0).toBe(0);
      expect(h.errors).toEqual([]);
    } finally {
      await h.close();
    }
  }, 120_000);

  // Each per-frame value reaches the shade pass under its uniform name (a misspelt name would set nothing and still
  // count 0 compiles): with one value moving, the frame at t 2 differs from the plain page's. The moving rise draws
  // exactly what a constant rise of the same value draws.
  it("each per-frame value reaches the shade pass", async () => {
    const plain = await shotAt("", 2);
    const moved: Record<string, number> = {};
    for (const k of ["floor", "shift", "rise"]) moved[k] = meanAbsDiff(plain, await shotAt(`?moving=${k}`, 2));
    const same = meanAbsDiff(await shotAt("?moving=rise", 2), await shotAt(`?rise=${0.25 + 0.15 * Math.sin(1.1 * 2)}`, 2));
    console.log(`moving vs plain at t 2: ${JSON.stringify(moved)}; moving rise vs constant rise of its value at t 2: ${same.toFixed(6)}`);
    for (const k of ["floor", "shift", "rise"]) expect(moved[k], k).toBeGreaterThan(0.005);
    expect(same).toBe(0);
  }, 120_000);
});
