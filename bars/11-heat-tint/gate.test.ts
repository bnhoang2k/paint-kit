// Bar 11's gate: every check that applies passes at the bar's seeds, and the bar's own rows. The bands keep their order
// from the hot end; the iridescence law reads its (e) at every seed in both schemes; the brushed-grain field, drawn after
// the bar's param writer, leaves the thickness intact; the pointer drives the key, and nothing else moves it. One row
// logs which OPD arcs the law's bins cover at its two key positions, and each band's hue shift between them (notes.md).
// Run alone: npx vitest run -c vitest.pages.config.ts bars/11-heat-tint/gate.test.ts
//
// Limits, each set before any reading of this bar:
// - The colour names are test/pages/film.test.ts's HUE_ARCS (the six sRGB primaries and secondaries mark the OKLab hue
//   circle; each name's arc runs to the midpoints with its neighbours). Straw at 26 nm and blue at 54 nm are Fujimura's
//   cited stops. The owner ruled on 2026-11-17 that the film keeps its computed colours and 38 nm may read reddish, not
//   purple: so the row asks for blue at the hot end, straw at the cold end, brown between, each name in one run and the
//   runs in the order blue, purple, brown, straw. Purple is logged, not required.
// - PARAM_TOL 1.5 / 255: the 8-bit sheet stores param in 256 levels, so the formula and the stored value differ by half
//   a level, plus one for the read-back's rounding.
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CHECKS, gate, resolveTarget } from "../../src/checks/gate.ts";
import { open } from "../../src/checks/frames.ts";
import { closeBrowsers, openPage, type PageHandle, type Rgba } from "../../src/checks/harness.ts";
import { checkScheme, FILM_E_NOT_READ, FILM_OPD_BIN, filmBins, filmKeyTurn, filmOpd, filmTexels, type FilmTexels } from "../../src/checks/relight.ts";
import { serveRoot } from "../../src/checks/serve.ts";
import { threshold } from "../../src/checks/threshold.ts";
import { linearToOklab, type Vec3 } from "../../src/engine/palette.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");
const PAGE = "bars/11-heat-tint/";
const BAR = path.resolve(import.meta.dirname);
// The page's own values (index.html): the key's declared place, the film.
const KEY: Vec3 = [0.55, 0.05, 0.83];
const RANGE = [26, 54] as const;
const IOR = 2.343;
const ORDER = ["blue", "purple", "brown", "straw"] as const;
const CITED: Record<number, string> = { 26: "straw", 54: "blue" };
const LOGGED = 38;
const KNEE = 0.8;
const PARAM_TOL = 1.5 / 255;
const SCHEMES = ["light", "dark"] as const;
const CASES = SCHEMES.flatMap((scheme) => [1, 2, 3].map((seed) => ({ scheme, seed, name: `${scheme} seed ${seed}` })));

type Box = { x: number; y: number; w: number; h: number };
type Heat = { body: Box; hot: "top"; range: [number, number] };

let server: { url: string; close(): Promise<void> };
beforeAll(async () => {
  server = await serveRoot(ROOT);
});
afterAll(async () => {
  await server?.close();
  await closeBrowsers();
});

async function withPage(query: string, dark: boolean, fn: (h: PageHandle, heat: Heat) => Promise<void>) {
  const h = await openPage(`${server.url}/${PAGE}${query}`, { width: 960, height: 600, dpr: 1, t: 0, readyTimeout: 20000, dark });
  try {
    await fn(h, await h.hook<Heat>("window.__heat"));
    expect(h.errors).toEqual([]);
  } finally {
    await h.close();
  }
}

const toLinear = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const hueOf = (c: Vec3) => {
  const [, a, b] = linearToOklab(c);
  return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
};
/** test/pages/film.test.ts's arcs: each colour name's arc of OKLab hue, to the midpoints with its neighbours. */
function hueArcs() {
  const marks: [string, Vec3][] = [["brown", [1, 0, 0]], ["straw", [1, 1, 0]], ["green", [0, 1, 0]], ["cyan", [0, 1, 1]], ["blue", [0, 0, 1]], ["purple", [1, 0, 1]]];
  const hues = marks.map(([name, c]) => ({ name, hue: hueOf(c) }));
  const mid = (p: number, q: number) => (p + ((q - p + 360) % 360) / 2) % 360;
  return Object.fromEntries(hues.map(({ name, hue }, i) => [name, { from: mid(hues[(i + 5) % 6]!.hue, hue), to: mid(hue, hues[(i + 1) % 6]!.hue) }])) as Record<string, { from: number; to: number }>;
}
const inArc = (hue: number, arc: { from: number; to: number }) => (hue - arc.from + 360) % 360 < (arc.to - arc.from + 360) % 360;
const nameOf = (hue: number) => {
  const arcs = hueArcs();
  return Object.keys(arcs).find((k) => inArc(hue, arcs[k]!))!;
};

/** The key's highlight alone (specular on minus off, linear) at detail 0 and grain 0, pixels under the knee. */
async function highlight(h: PageHandle) {
  await h.hook("__paint.setDetail(0)");
  await h.hook("__paint.setGrain(0)");
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
  return { rgb, ok, w: on.w };
}

/**
 * The bands from the hot end: each 2 nm of oxide, the mean highlight over the body's rows of that thickness (3 px either
 * side, 8 px in from each side), named by its hue. The hot end (param 1) is the body's top edge.
 */
async function bands(scheme: "light" | "dark") {
  const out: { nm: number; hue: number; name: string; n: number }[] = [];
  await withPage("?seed=1", scheme === "dark", async (h, heat) => {
    const lit = await highlight(h);
    const b = heat.body;
    for (let nm = RANGE[1]; nm >= RANGE[0]; nm -= 2) {
      const p = (nm - RANGE[0]) / (RANGE[1] - RANGE[0]);
      const y = Math.max(b.y + 4, Math.min(b.y + b.h - 4, b.y + (1 - p) * b.h));
      const sum: Vec3 = [0, 0, 0];
      let n = 0;
      for (let yy = Math.round(y - 3); yy <= Math.round(y + 3); yy++)
        for (let x = Math.ceil(b.x + 8); x < b.x + b.w - 8; x++) {
          const i = yy * lit.w + x;
          if (!lit.ok[i]) continue;
          for (let k = 0; k < 3; k++) sum[k] += lit.rgb[i * 3 + k]!;
          n++;
        }
      const hue = hueOf(sum.map((v) => v / Math.max(n, 1)) as Vec3);
      out.push({ nm, hue, name: nameOf(hue), n });
    }
  });
  for (const r of out) console.log(`BAR 11 bands ${scheme} ${r.nm} nm: hue ${r.hue.toFixed(1)}, ${r.name}, ${r.n} px`);
  return out;
}

/** The runs of names from the hot end, and the checks the row asserts. */
function expectOrder(read: { nm: number; hue: number; name: string; n: number }[]) {
  const runs: string[] = [];
  for (const r of read) if (runs.at(-1) !== r.name) runs.push(r.name);
  console.log(`BAR 11 runs from the hot end: ${runs.join(", ")}; ${LOGGED} nm (logged, not asserted): ${read.find((r) => r.nm === LOGGED)?.name}`);
  for (const r of read) expect(r.n, `${r.nm} nm has no readable pixel`).toBeGreaterThan(0);
  for (const [nm, name] of Object.entries(CITED)) expect(read.find((r) => r.nm === Number(nm))!.name, `the cited ${name} stop at ${nm} nm`).toBe(name);
  expect(runs[0], "the hot end").toBe("blue");
  expect(runs.at(-1), "the cold end").toBe("straw");
  expect(runs, "brown lies between").toContain("brown");
  expect(new Set(runs).size, `a name comes back after another: ${runs.join(", ")}`).toBe(runs.length);
  const at = runs.map((r) => (ORDER as readonly string[]).indexOf(r));
  expect(at, `a name outside the temper order: ${runs.join(", ")}`).not.toContain(-1);
  expect([...at].sort((p, q) => p - q), `the runs leave the order blue, purple, brown, straw: ${runs.join(", ")}`).toEqual(at);
}

/** The iridescence law alone, as the gate reads it, in one scheme at one seed. */
async function filmLaw(scheme: "light" | "dark", seed: number) {
  const t = resolveTarget(BAR, {}, server.url);
  const part = await checkScheme(t, { seed }, scheme, ["iridescence"]);
  const m = Object.fromEntries(Object.entries(part.measured).filter(([k]) => k.startsWith("iridescence.")));
  console.log(`BAR 11 law ${scheme} seed ${seed}: ${part.line}\n  ${JSON.stringify(m)}`);
  return { line: part.line, status: part.status, m };
}

/**
 * The law's bins, as its (b), (d) and (e) read them (relight.ts filmReading): the film texels, the key at its declared
 * place (A) and turned 30 degrees (B), the key alone at detail 0 and grain 0, each pixel binned by its OPD at A.
 */
async function lawBins(scheme: "light" | "dark", seed: number) {
  const t = resolveTarget(BAR, {}, server.url);
  const h = await open(t, { seed }, { t: 2, dark: scheme === "dark" });
  try {
    const tex = await h.hook<FilmTexels>(
      `(() => { const s = __paint.stats(); const g = { ...__paint.sheetRegion(0, 0, innerWidth, innerHeight), w: s.sheetW, h: s.sheetH }; return (${filmTexels.toString()})(g, [1], ${threshold("relight.fullCoverage", null)}); })()`,
    );
    const dir = (await h.hook<{ props: { dir: number[] } }[]>("__paint.lights()"))[0]!.props.dir;
    const { a, b } = filmKeyTurn(dir);
    await h.hook("__paint.setLight(1, { level: 0 })");
    await h.hook("__paint.setDetail(0)");
    await h.hook("__paint.setGrain(0)");
    const frame = async (d: Vec3, specular: number) => {
      await h.hook(`__paint.setLight(0, { dir: ${JSON.stringify(d)}, specular: ${specular} })`);
      return h.shot();
    };
    const frames = { onA: await frame(a, 1), onB: await frame(b, 1), offA: await frame(a, 0), offB: await frame(b, 0) };
    const [fw, fh] = [frames.onA.w, frames.onA.h];
    const at = new Int32Array(tex.w * tex.h).fill(-1);
    tex.k.forEach((k, i) => (at[k] = i));
    const pix = { px: [] as number[], slot: [] as number[], opdA: [] as number[], opdB: [] as number[], nv: [] as number[] };
    for (let p = 0; p < fw * fh; p++) {
      const i = at[Math.floor((Math.floor(p / fw) * tex.h) / fh) * tex.w + Math.floor(((p % fw) * tex.w) / fw)]!;
      if (i < 0) continue;
      const d = RANGE[0] + tex.param[i]! * (RANGE[1] - RANGE[0]);
      pix.px.push(p);
      pix.slot.push(tex.slot[i]!);
      pix.opdA.push(filmOpd(d, IOR, a));
      pix.opdB.push(filmOpd(d, IOR, b));
      pix.nv.push(tex.nv[i]!);
    }
    return { bins: filmBins(frames, pix), a, b };
  } finally {
    await h.close();
  }
}

describe("11-heat-tint", () => {
  // Nine checks at three seeds in a software-WebGL browser: one test per seed and check group (bar 07's split), so each
  // stays under the 120 s every page test must keep. Together they assert what one gate at that seed asserts.
  const GROUPS: [string, (n: string) => boolean][] = [
    ["relight", (n) => n === "relight"],
    ["detail", (n) => n === "detail"],
    ["the other seven checks", (n) => n !== "relight" && n !== "detail"],
  ];
  for (const seed of [1, 2, 3])
    for (const [label, pick] of GROUPS)
      it(`11-heat-tint ${label} pass at seed ${seed}`, async () => {
        const r = await gate(BAR, { seeds: [seed] }, CHECKS.filter((c) => pick(c.name)));
        console.log(r.lines.join("\n"));
        expect(r.verdict, r.lines.join("\n")).toBe("passed");
      });

  it.each(SCHEMES)("the bands keep their order from the hot end: %s", async (scheme) => {
    expectOrder(await bands(scheme));
  });

  // Task 17's carry-forward: the grain field is drawn after the bar's param writer and writes direction, not param.
  it("the brushed-grain direction field drawn after the param writer leaves the bands' thickness intact", async () => {
    await withPage("?seed=1", false, async (h, heat) => {
      const b = heat.body;
      const s = await h.hook<{ param: number[]; slot: number[]; dir?: [number, number][] }>(`__paint.sheetRegion(${b.x}, ${b.y}, ${b.w}, ${b.h})`);
      const sx = await h.hook<number>("__paint.stats().sheetW / innerWidth");
      const cols = Math.round(b.w * sx);
      const rows = s.param.length / cols;
      expect(Number.isInteger(rows), `the region is not ${cols} columns wide`).toBe(true);
      let worst = 0;
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const k = r * cols + c;
          if (Math.round(s.slot[k]!) !== 1) continue;
          const want = 1 - (r + 0.5) / rows;
          worst = Math.max(worst, Math.abs(s.param[k]! - want));
        }
      console.log(`BAR 11 param over the body: ${rows} x ${cols} texels, worst gap from the linear ramp ${worst.toFixed(4)} (one level ${(1 / 255).toFixed(4)})`);
      expect(worst, "the grain field moved the bar's thickness").toBeLessThan(PARAM_TOL + 1 / rows);
      expect(s.dir, "the grain field writes direction").toBeDefined();
      const mid = Math.floor(rows / 2) * cols + Math.floor(cols / 2);
      expect(s.dir![mid]![1], "the grain runs along the bar").toBeGreaterThan(0.9);
    });
  });

  // the owner's locked decision: a pointer-driven key follows the mouse, and the page never moves it on its own.
  it("the key holds still until the pointer moves; then it follows the pointer and turns off the eye", async () => {
    await withPage("?seed=1", false, async (h) => {
      await h.page.waitForTimeout(600);
      expect(await h.hook<number[]>("__paint.lights()[0].props.dir"), "the key moved with no pointer").toEqual(KEY);
      await h.page.mouse.move(480, 300, { steps: 4 });
      await h.page.waitForTimeout(800);
      const over = await h.hook<number[]>("__paint.lights()[0].props.dir");
      await h.page.mouse.move(940, 300, { steps: 4 });
      await h.page.waitForTimeout(800);
      const right = await h.hook<number[]>("__paint.lights()[0].props.dir");
      await h.page.mouse.move(20, 300, { steps: 4 });
      await h.page.waitForTimeout(800);
      const left = await h.hook<number[]>("__paint.lights()[0].props.dir");
      const off = (d: number[]) => (Math.acos(d[2]! / Math.hypot(d[0]!, d[1]!, d[2]!)) * 180) / Math.PI;
      console.log(`BAR 11 key: over the bar ${off(over).toFixed(1)} degrees off the eye, right ${off(right).toFixed(1)}, left ${off(left).toFixed(1)}`);
      expect(off(over), "over the bar the key is near the eye").toBeLessThan(5);
      expect(right[0]!, "pointer right, the key does not come from the right").toBeGreaterThan(0);
      expect(left[0]!, "pointer left, the key does not come from the left").toBeLessThan(0);
      expect(off(right) - off(over), "the pointer does not turn the key off the eye").toBeGreaterThan(30);
    });
  });

  // The film branch's carry-forward (Task 18): (e) must be read on this bar at every seed in both schemes.
  it.each(CASES)("the iridescence law reads (e): $name", async ({ scheme, seed }) => {
    const r = await filmLaw(scheme, seed);
    expect(r.line, r.line).not.toContain(FILM_E_NOT_READ);
    expect(r.m["iridescence.film.spread"], r.line).toBeDefined();
  });

  // Logged for notes.md: the OPD arcs the law's counted bins cover at A and B, any gap of uncounted bins, and each
  // counted bin's hue at A and B (the key's 30-degree turn). Asserts only that the bins span the hot and the cold end.
  it.each(SCHEMES)("the law's bins and their arcs at its two key positions: %s", async (scheme) => {
    const { bins, a, b } = await lawBins(scheme, 1);
    const cos = (l: Vec3) => filmOpd(1, IOR, l) / (2 * IOR);
    const nm = (opd: number, l: Vec3) => opd / (2 * IOR * cos(l));
    const arcs = (pick: (x: (typeof bins)[number]) => boolean) => {
      const out: [number, number][] = [];
      for (const x of bins) {
        const i = Math.round(x.opd / FILM_OPD_BIN);
        const last = out.at(-1);
        if (!pick(x)) continue;
        if (last && i - Math.round(last[1] / FILM_OPD_BIN) === 1) last[1] = x.opd;
        else out.push([x.opd, x.opd]);
      }
      return out.map(([p, q]) => `OPD ${p.toFixed(0)}-${q.toFixed(0)} nm (oxide ${nm(p, a).toFixed(1)}-${nm(q, a).toFixed(1)} nm)`);
    };
    console.log(`BAR 11 ${scheme} key A ${a.map((v) => v.toFixed(3))} B ${b.map((v) => v.toFixed(3))}; ${bins.length} bins, OPD ${bins[0]!.opd.toFixed(0)} to ${bins.at(-1)!.opd.toFixed(0)}`);
    console.log(`BAR 11 ${scheme} counted at A: ${arcs((x) => x.counted).join("; ")}`);
    console.log(`BAR 11 ${scheme} counted at B: ${arcs((x) => x.countedB).join("; ")}`);
    for (const x of bins) {
      const ha = hueOf(x.a.h);
      const hb = hueOf(x.b.h);
      const shift = (((hb - ha + 540) % 360) - 180).toFixed(1);
      console.log(`BAR 11 ${scheme} bin OPD ${x.opd.toFixed(1)} (oxide ${nm(x.opd, a).toFixed(1)} nm) n ${x.n} lumA ${x.a.lum.toFixed(4)} lumB ${x.b.lum.toFixed(4)} counted ${x.counted}/${x.countedB} hue A ${ha.toFixed(1)} ${nameOf(ha)} B ${hb.toFixed(1)} ${nameOf(hb)} shift ${shift}`);
    }
    const counted = bins.filter((x) => x.counted);
    expect(counted.length).toBeGreaterThan(0);
    expect(nm(counted[0]!.opd, a), "no counted bin near the cold end").toBeLessThan(RANGE[0] + 3);
    expect(nm(counted.at(-1)!.opd, a), "no counted bin near the hot end").toBeGreaterThan(RANGE[1] - 3);
  });
});
