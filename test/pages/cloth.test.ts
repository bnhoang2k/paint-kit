// Behaviour tests for the twill field and the denim and sheen materials on test/pages/cloth.html, driven through
// `window.__paint` and frozen at a fixed t and seed. The tolerances here are test constants, each with its reason.
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CHECKS, gate, resolveTarget, runEntry } from "../../src/checks/gate.ts";
import { specularCentroid } from "../../src/checks/relight.ts";
import { closeBrowsers, openPage, type OpenOpts, type PageHandle, type Rgba } from "../../src/checks/harness.ts";
import { serveRoot } from "../../src/checks/serve.ts";
import { threshold } from "../../src/checks/threshold.ts";

type SheetSample = { height: number[]; coverage: number[]; ink: number[]; slot: number[]; dir?: [number, number][] };

const W = 960;
const H = 600;
// dpr 1, sheetScale 1: one sheet pixel is one CSS pixel.
const FROZEN: OpenOpts = { dpr: 1, width: W, height: H, t: 2, seed: 1 };

// The page's twill angle (cloth.html TWILL_ANGLE), degrees from the x axis: the wale (rib) line.
const TWILL_ANGLE = 63;
// The direction image stores the angle exactly on the float sheet and to about 0.5 degree in 8 bits.
const ANGLE_TOL = 2;
// The warp axis is measured, not computed with the engine's formula: each pick where the weft shows is one weave
// cell, a weft pitch long along the warp and a warp pitch across it (denim's picks sit wider than its ends), so the
// weft cells' long axis is the warp. The cells are about 4 x 6 px, so their pixel outlines bias that axis (1.7 to
// 1.9 degrees over seeds 1 to 3, measured in check-fix (d)); a wrong warp is 30 degrees or more off (the wale itself
// at 63, or the warp mirrored about the wale at 29).
const CELL_AXIS_TOL = 4;
// Weft shows on 1 cell in 4 of a 3/1 twill; the share read on the grid may stray from 25% by sampling.
const WEFT_SHARE = [0.12, 0.38] as const;
// A denim region clear of the zipper band (the band is centred on the page, rows about 255..345 at 600 px).
const DENIM = { x: 40, y: 30, w: 400, h: 220 };
// "High pass" is the height minus its 4 px box blur (as the detail check measures images); "low pass" is a
// 12 px box blur, wide enough to average out about three wales.
const HP_R = 4;
const LP_R = 12;
// Thread relief must add at least a fifth to the fine (high-pass) height energy from detail 0 to detail 1.
const MIN_HP_RISE = 1.2;
// The low pass may move by at most this share of the weave's own fine relief (high-pass RMS at detail 0):
// detail adds thread texture, not a change of the cloth's shape.
const LP_TOL = 0.15;

let server: { url: string; close(): Promise<void> };
const url = () => `${server.url}/test/pages/cloth.html`;
const ROOT = path.resolve(import.meta.dirname, "../..");
const gateRun = (rel: string) => gate(path.join(ROOT, rel), { baseUrl: server.url });
type GateRun = Awaited<ReturnType<typeof gateRun>>;
const statusOf = (r: GateRun) => Object.fromEntries(r.results.map((c) => [c.name, c.status]));
const measuredOf = (r: GateRun, name: string) => r.results.find((c) => c.name === name)!.measured;
const lineOf = (r: GateRun, name: string) => r.lines.find((l) => l.startsWith(`${name}:`)) ?? r.lines.find((l) => l.includes(`${name}:`))!;
// How bad a status is. "Nothing else newly fails" compares severity against the cloth page, as paper.test.ts does
// against the paper page.
const RANK: Record<string, number> = { pass: 0, skip: 0, partial: 1, fail: 2 };
// Task 2e: a fault's whole gate plus the cloth.html baseline gate is two gates (over the page suite's 120 s), so each
// page-level fault row is three tests, one per group of checks: relight, detail, and every other check. Each runs its
// group's checks (`runEntry`, as the gate does) on the fault and on cloth.html and compares them.
type Group = "relight" | "detail" | "rest";
const GROUPS: Group[] = ["relight", "detail", "rest"];
const inGroup = (g: Group) => (name: string) => (g === "rest" ? name !== "relight" && name !== "detail" : name === g);
type Res = Awaited<ReturnType<typeof runEntry>>;
async function runGroup(rel: string, g: Group): Promise<Res[]> {
  const t = resolveTarget(path.join(ROOT, rel), {}, server.url);
  const out: Res[] = [];
  for (const c of CHECKS) if (inGroup(g)(c.name)) out.push(await runEntry(c, t, {}));
  return out;
}
const pick = (rs: Res[], name: string) => rs.find((c) => c.name === name)!;
/** The checks (outside `named`) that end worse on the fault than on cloth.html. */
function worseThan(rs: Res[], base: Res[], named: string[]): string[] {
  return rs
    .filter((c) => !named.includes(c.name) && RANK[c.status]! > RANK[pick(base, c.name).status]!)
    .map((c) => `${c.name}: ${pick(base, c.name).status} -> ${c.status}`);
}
type Fault = { named: string[]; relight?: (rs: Res[]) => void; detail?: (rs: Res[]) => void; rest?: (rs: Res[]) => void };
/** One fault page, three tests: the group's own assertions, and "nothing else ends worse than on cloth.html". */
function clothFault(title: string, rel: string, f: Fault) {
  for (const g of GROUPS) {
    it(`${title} (${g === "rest" ? "other checks" : g})`, async () => {
      const rs = await runGroup(rel, g);
      for (const r of rs) console.log(`${rel}\n${r.line}\n${JSON.stringify(r.measured)}`);
      f[g]?.(rs);
      // relight and detail on cloth.html are asserted to pass by the "cloth passes relight (relief, highlight), detail
      // and palette" test below, so against them "not worse than cloth.html" is "does not end worse than pass", and
      // those two checks need no second run (detail alone is about 40 s each page). The other checks are run on
      // cloth.html here, as they are cheap.
      const base = g === "rest" ? await runGroup("test/pages/cloth.html", g) : rs.map((c) => ({ ...c, status: "pass" as const }));
      expect(worseThan(rs, base, f.named)).toEqual([]);
    });
  }
}

const logGate = (name: string, r: GateRun) => console.log(`${name}\n${r.lines.join("\n")}\n${JSON.stringify({ relight: measuredOf(r, "relight"), detail: measuredOf(r, "detail") })}`);

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

const region = (h: PageHandle, b: { x: number; y: number; w: number; h: number }) =>
  h.hook<SheetSample>(`__paint.sheetRegion(${b.x}, ${b.y}, ${b.w}, ${b.h})`);

/** Axis angle in degrees, 0..180 (a direction and its opposite are the same thread). */
const axisDeg = ([x, y]: [number, number]) => ((((Math.atan2(y, x) * 180) / Math.PI) % 180) + 180) % 180;
const axisDiff = (a: number, b: number) => Math.min(Math.abs(a - b), 180 - Math.abs(a - b));

/**
 * The long axis (degrees, 0..180, y up) of the weft cells in a sheet region: the 4-connected weft components
 * (direction length under 0.8, the twill's weft mark) near the median size, each by its second moments, averaged
 * on doubled angles. Region rows run top down.
 */
function weftCellAxis(s: SheetSample, w: number, h: number): { axis: number; cells: number } {
  const weft = s.dir!.map((d, i) => s.slot[i] === 0 && Math.hypot(d[0], d[1]) < 0.8);
  const seen = new Uint8Array(w * h);
  const comps: number[][] = [];
  for (let i = 0; i < w * h; i++) {
    if (!weft[i] || seen[i]) continue;
    const stack = [i];
    const px: number[] = [];
    seen[i] = 1;
    while (stack.length) {
      const j = stack.pop()!;
      px.push(j);
      const x = j % w;
      const y = Math.floor(j / w);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const X = x + dx;
        const Y = y + dy;
        const k = Y * w + X;
        if (X >= 0 && Y >= 0 && X < w && Y < h && weft[k] && !seen[k]) {
          seen[k] = 1;
          stack.push(k);
        }
      }
    }
    comps.push(px);
  }
  // Diagonal neighbours touch at a corner and pixels sometimes join them; keep components near one cell's size.
  const med = comps.map((c) => c.length).sort((a, b) => a - b)[comps.length >> 1]!;
  let c2 = 0;
  let s2 = 0;
  let cells = 0;
  for (const c of comps) {
    if (c.length < 0.5 * med || c.length > 1.5 * med) continue;
    const xs = c.map((j) => j % w);
    const ys = c.map((j) => -Math.floor(j / w));
    const mx = xs.reduce((a, b) => a + b, 0) / c.length;
    const my = ys.reduce((a, b) => a + b, 0) / c.length;
    let sxx = 0;
    let sxy = 0;
    let syy = 0;
    for (let k = 0; k < c.length; k++) {
      const dx = xs[k]! - mx;
      const dy = ys[k]! - my;
      sxx += dx * dx;
      sxy += dx * dy;
      syy += dy * dy;
    }
    const a = Math.atan2(2 * sxy, sxx - syy);
    c2 += Math.cos(a);
    s2 += Math.sin(a);
    cells++;
  }
  const half = 0.5 * Math.atan2(s2, c2);
  return { axis: axisDeg([Math.cos(half), Math.sin(half)]), cells };
}

/** Box blur of radius r (clamped edges) on a w x h image. */
function blur(v: number[], w: number, h: number, r: number): Float64Array {
  const tmp = new Float64Array(w * h);
  const out = new Float64Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += v[y * w + Math.min(w - 1, Math.max(0, x + k))]!;
      tmp[y * w + x] = s / (2 * r + 1);
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x]!;
      out[y * w + x] = s / (2 * r + 1);
    }
  return out;
}

/** The rows (top-down, CSS px) the zipper band covers, read from the sheet's slot channel down one column. */
async function bandRows(h: PageHandle): Promise<[number, number]> {
  const col = await region(h, { x: W / 2, y: 0, w: 1, h: H });
  const rows = col.slot.map((s, i) => (s === 1 ? i : -1)).filter((i) => i >= 0);
  return [rows[0]!, rows.at(-1)!];
}

/** The band's rows cut out of a frame, as a frame of their own. */
function crop(f: Rgba, y0: number, y1: number): Rgba {
  const h = y1 - y0 + 1;
  return { w: f.w, h, data: f.data.slice(y0 * f.w * 4, (y1 + 1) * f.w * 4) };
}

describe("cloth page", () => {
  it("twill writes direction", async () => {
    await withPage(FROZEN, async (h) => {
      const s = await h.hook<SheetSample & { w: number; h: number }>("__paint.sheet()");
      expect(s.dir, "sheet() carries the direction image").toBeDefined();
      const denim = s.dir!.filter((_, i) => s.slot[i] === 0);
      const band = s.dir!.filter((_, i) => s.slot[i] === 1);
      expect(denim.length).toBeGreaterThan(s.w * s.h * 0.6);
      // The warp as the weave draws it, at full resolution in a denim region clear of the band.
      const r = await region(h, DENIM);
      const { axis: WARP_ANGLE, cells } = weftCellAxis(r, DENIM.w, DENIM.h);
      expect(cells, "enough weft cells to read the warp from").toBeGreaterThan(500);
      expect(axisDiff(WARP_ANGLE, TWILL_ANGLE), "the warp is not the wale").toBeGreaterThan(20);
      const worst = Math.max(...denim.map((d) => axisDiff(axisDeg(d), WARP_ANGLE)));
      const lens = denim.map(([x, y]) => Math.hypot(x, y));
      const weft = lens.filter((l) => l < 0.8).length / lens.length;
      const bandWorst = Math.max(...band.map((d) => axisDiff(axisDeg(d), 0)));
      const spread = Math.max(...denim.map((d) => axisDiff(axisDeg(d), axisDeg(denim[0]!))));
      console.log(`twill dir: ${denim.length} denim points, worst ${worst.toFixed(2)} deg off the warp ${WARP_ANGLE.toFixed(2)} (from ${cells} weft cells), spread ${spread.toFixed(2)}; weft share ${weft.toFixed(3)}; band ${band.length} points, worst ${bandWorst.toFixed(2)} deg off 0`);
      expect(spread).toBeLessThanOrEqual(ANGLE_TOL);
      expect(worst).toBeLessThanOrEqual(CELL_AXIS_TOL);
      expect(weft).toBeGreaterThanOrEqual(WEFT_SHARE[0]);
      expect(weft).toBeLessThanOrEqual(WEFT_SHARE[1]);
      // Warp floats are marked by a full-length direction, weft by a shorter one; nothing else.
      expect(lens.every((l) => Math.abs(l - 1) < 0.05 || Math.abs(l - 0.6) < 0.05)).toBe(true);
      expect(band.length).toBeGreaterThan(0);
      expect(bandWorst).toBeLessThanOrEqual(ANGLE_TOL);
    });
  });

  it("detail changes thread relief only", async () => {
    await withPage(FROZEN, async (h) => {
      const at: Record<string, { hp: number; lp: Float64Array }> = {};
      for (const d of [0, 0.5, 1]) {
        await h.hook(`__paint.setDetail(${d})`);
        await h.hook("__paint.setTime(2)");
        const r = await region(h, DENIM);
        const fine = blur(r.height, DENIM.w, DENIM.h, HP_R);
        const hp = r.height.reduce((acc, v, i) => acc + (v - fine[i]!) ** 2, 0) / r.height.length;
        at[d] = { hp, lp: blur(r.height, DENIM.w, DENIM.h, LP_R) };
      }
      const lpMove = (d: number) => at[d]!.lp.reduce((acc, v, i) => acc + Math.abs(v - at[0]!.lp[i]!), 0) / at[0]!.lp.length;
      const weaveRms = Math.sqrt(at[0]!.hp);
      console.log(
        `cloth detail: high-pass energy ${[0, 0.5, 1].map((d) => at[d]!.hp.toExponential(3)).join(" / ")} (rise x${(at[1]!.hp / at[0]!.hp).toFixed(2)}); ` +
          `low-pass mean move ${lpMove(0.5).toExponential(2)} (0.5), ${lpMove(1).toExponential(2)} (1) against weave RMS ${weaveRms.toExponential(2)}`,
      );
      expect(at[0.5]!.hp).toBeGreaterThan(at[0]!.hp);
      expect(at[1]!.hp).toBeGreaterThan(at[0.5]!.hp);
      expect(at[1]!.hp / at[0]!.hp).toBeGreaterThanOrEqual(MIN_HP_RISE);
      expect(lpMove(1)).toBeLessThanOrEqual(LP_TOL * weaveRms);
      expect(lpMove(0.5)).toBeLessThanOrEqual(LP_TOL * weaveRms);
    });
  });

  it("key honours specular: 0, and specular: 1 puts the frame back", async () => {
    await withPage(FROZEN, async (h) => {
      const [y0, y1] = await bandRows(h);
      const base = await h.shot();
      await h.hook("__paint.setLight(0, { specular: 0 })");
      const off = await h.shot();
      await h.hook("__paint.setLight(0, { specular: 1 })");
      const back = await h.shot();
      const band = (f: Rgba) => crop(f, y0, y1);
      const diff = (p: Rgba, q: Rgba) => p.data.reduce((acc, v, i) => acc + Math.abs(v - q.data[i]!), 0) / p.data.length / 255;
      console.log(`cloth specular: band change with the key's specular off ${diff(band(base), band(off)).toFixed(4)}, back on ${diff(base, back).toFixed(6)}`);
      // The sheen band's highlight (spec 0.9) is gone: the band changes visibly (over 1% mean, a test constant).
      expect(diff(band(base), band(off))).toBeGreaterThan(0.01);
      expect(diff(base, back)).toBe(0);
    });
  });

  it("sheen highlight follows the key", async () => {
    await withPage(FROZEN, async (h) => {
      const lights = await h.hook<{ id: string; props: Record<string, unknown> }[]>("__paint.lights()");
      const k = lights.findIndex((l) => l.id === "key");
      expect(k).toBeGreaterThanOrEqual(0);
      for (const j of lights.keys()) if (j !== k) await h.hook(`__paint.setLight(${j}, { level: 0 })`);
      const [y0, y1] = await bandRows(h);
      const dirAt = async () => (await h.hook<{ props: { dir: number[] } }[]>("__paint.lights()"))[k]!.props.dir;
      // The highlight alone: the key's specular term, frame with it on minus frame with it off, on the band.
      const centroidAt = async (step: 0 | 1) => {
        await h.hook(`__paint.moveLight(${k}, ${step})`);
        const on = crop(await h.shot(`cloth-key${step}-only`), y0, y1);
        await h.hook(`__paint.setLight(${k}, { specular: 0 })`);
        const off = crop(await h.shot(), y0, y1);
        await h.hook(`__paint.setLight(${k}, { specular: 1 })`);
        return { c: specularCentroid(on, off), d: await dirAt() };
      };
      const { c: c0, d: d0 } = await centroidAt(0);
      const { c: c1, d: d1 } = await centroidAt(1);
      expect(c0 && c1, "the key puts a specular highlight on the band at both positions").toBeTruthy();
      // The light's motion on screen: its direction's x right, y up; the screen's y runs down.
      const mx = d1[0]! - d0[0]!;
      const my = -(d1[1]! - d0[1]!);
      const ml = Math.hypot(mx, my);
      const shift = ((c1![0] - c0![0]) * mx + (c1![1] - c0![1]) * my) / ml;
      console.log(
        `cloth sheen: band rows ${y0}..${y1}; specular centroid (${c0![0].toFixed(1)}, ${c0![1].toFixed(1)}) -> (${c1![0].toFixed(1)}, ${c1![1].toFixed(1)}); ` +
          `light motion on screen (${(mx / ml).toFixed(3)}, ${(my / ml).toFixed(3)}); shift ${shift.toFixed(1)} px`,
      );
      expect(shift).toBeGreaterThanOrEqual(threshold("relight.highlightShift", null));
    });
  });

  it("cloth passes relight (relief, highlight), detail and palette", async () => {
    const r = await gateRun("test/pages/cloth.html");
    logGate("cloth", r);
    // KNOWN GAP closed (check-fix (b) round 3): the probe check's per-token rule failed this honest page (its weft
    // and zipper pixels mix two tokens). The smoke test has no per-token rule; S1 and S2 find no read in its code.
    const p = measuredOf(r, "palette");
    expect(statusOf(r).palette).toBe("pass");
    expect(p.accents).toBe(1);
    expect(p.movedShare!).toBeGreaterThanOrEqual(threshold("palette.moveShare", null));
    expect(p.tokenReads).toBe(0);
    expect(p.customLights).toBe(0);
    expect(statusOf(r).relight).toBe("pass");
    expect(statusOf(r).detail).toBe("pass");
    const rl = lineOf(r, "relight");
    expect(rl).toMatch(/relief pass/);
    expect(rl).toMatch(/highlight pass/);
    expect(measuredOf(r, "relight")["highlight.shift.light"]).toBeGreaterThanOrEqual(threshold("relight.highlightShift", null));
    expect(measuredOf(r, "relight")["highlight.brightShift.light"]).toBeGreaterThanOrEqual(threshold("relight.brightShift", null));
    const d = measuredOf(r, "detail");
    expect(d["share.0.light"]!).toBeLessThan(d["share.0.5.light"]!);
    expect(d["share.0.5.light"]!).toBeLessThan(d["share.1.light"]!);
    expect(d["rise.light"]!).toBeGreaterThanOrEqual(threshold("detail.minRise", null));
    // At detail 0 the macro relief (drape, weave, band) still takes the light.
    expect(lineOf(r, "detail")).toMatch(/at detail 0 relight: relief pass .*; highlight pass/);
  });

  clothFault("static sheen fails highlight", "test/faults/cloth-sheen-static/index.html", {
    // A page-level fault: relight fails, by its highlight law, and nothing else ends worse than on cloth.html.
    named: ["relight"],
    relight: (rs) => {
      const r = pick(rs, "relight");
      expect(r.status).toBe("fail");
      expect(r.line).toMatch(/relief pass/);
      // The denim's real gloss still moves on the frame; the sheen, which declares the law, has none of its own.
      expect(r.line).toMatch(/highlight FAIL \(the key puts no specular highlight on sheen \(slot 1\)/);
    },
  });

  // A page-level fault: every material's gloss is off and nothing is painted in its place. The domed band still
  // shades by diffuse light, which a brightest-pixel centroid followed; the specular term is exactly 0.
  // detail fails as well, in light only, pinned as measured (Phase 2 sweep after Task 2c, the gate's detail entry from
  // dist at 22a0868, seed 1): with the finish grain off the light shares read 0.6858 / 0.6894 / 0.6987, relative rise
  // 0.01884, under detail.minRise 0.020 (dark shares 0.5384 / 0.5458 / 0.5666, rise 0.05237, passes; cloth.html
  // rises 0.06673 light, 0.1263 dark). Its fine share is already high at detail 0, so the threads the dial adds move
  // it little. Not an exemption: the row asserts that detail fails, and where.
  clothFault("gloss off fails highlight", "test/faults/cloth-gloss-off/index.html", {
    named: ["relight", "detail"],
    relight: (rs) => {
      const r = pick(rs, "relight");
      expect(r.status).toBe("fail");
      expect(r.line).toMatch(/relief pass/);
      expect(r.line).toMatch(/highlight FAIL \(the key puts no specular highlight on the frame at either test position/);
    },
    detail: (rs) => {
      const d = pick(rs, "detail");
      expect(d.status).toBe("fail");
      expect(d.line).toMatch(/light: the high-frequency share does not rise enough/);
      expect(d.line).not.toMatch(/dark: the high-frequency share does not rise/);
    },
  });

  // A page-level fault: the sheen keeps its real gloss, so the specular difference moves and every declaring
  // material shows its own term; the painted streak cancels there. Only the brightest 1% can see it stay put.
  // Heavy: since Phase 2 Task 2 relight and detail read light and dark, so this fault runs about twice the work. It is split into three tests (relight, detail, other checks) so each runs alone in under 120 s.
  clothFault("painted streak over real gloss fails highlight by the brightest 1%", "test/faults/cloth-painted-streak/index.html", {
    named: ["relight"],
    relight: (rs) => {
      const r = pick(rs, "relight");
      expect(r.status).toBe("fail");
      expect(r.line).toMatch(/relief pass/);
      // Per material slot (Phase 2 Task 3): judged in the sheen, whose own gloss moves farthest; the streak leads there.
      expect(r.line).toMatch(/highlight FAIL \(the brightest 1% of sheen \(slot 1\) moves -?[\d.]+ px along the light's motion, under \d+, while its own specular highlight moves [\d.]+ px: its brightest part stays put/);
      expect(r.line).not.toMatch(/specular highlight's centroid moves .* under|no specular highlight/);
      expect(r.measured["highlight.shift.light"]).toBeGreaterThanOrEqual(threshold("relight.highlightShift", null));
    },
  });

  // test/faults/cloth-painted-streak-seeds: the painted-streak page with its streak painted at seed 3 only (the
  // page's ?seed=), and a bar.json listing seeds [2, 1, 3]. Its highlight law passes at seeds 1 and 2 and fails at
  // seed 3, so a gate that read only seed [0] passed relight here. Only relight runs, through the gate's own
  // per-check path, one seed per test (Task 2e: the three seeds together were about three cloth gates).
  // The multi-seed gate itself (the combined "fails at seed 3 of 2, 1, 3" line) is no longer run end to end on a real
  // page here; unit coverage with fake checks remains in test/unit/gate.test.ts.
  for (const seed of [2, 1, 3]) {
    it(`a bar whose first seed hides the painted streak fails relight at the seed that shows it: seed ${seed}`, async () => {
      expect(resolveTarget(path.join(ROOT, "test/faults/cloth-painted-streak-seeds"), {}, server.url).bar?.seeds).toEqual([2, 1, 3]);
      const t = resolveTarget(path.join(ROOT, "test/faults/cloth-painted-streak-seeds"), { seeds: [seed] }, server.url);
      const r = await runEntry(CHECKS.find((c) => c.name === "relight")!, t, {});
      console.log(`cloth-painted-streak-seeds @${seed}: ${r.line}`);
      const th = threshold("relight.brightShift", null);
      if (seed === 3) {
        expect(r.status).toBe("fail");
        expect(r.line).toMatch(/^relight: .*highlight FAIL \(the brightest 1% of sheen \(slot 1\) moves -?[\d.]+ px along the light's motion, under \d+/);
        for (const scheme of ["light", "dark"]) expect(r.measured[`highlight.brightShift.${scheme}`]!).toBeLessThan(th);
      } else {
        expect(r.status).toBe("pass");
        for (const scheme of ["light", "dark"]) expect(r.measured[`highlight.brightShift.${scheme}`]!).toBeGreaterThanOrEqual(th);
      }
    });
  }

  clothFault("specular lobe fixed to the declared key fails highlight by the specular shift", "test/faults/cloth-spec-frozen/index.html", {
    // An engine fault ('spec-fixed-light'): the key's highlight is real but does not follow the key. It sets
    // __PAINT_TEST_FAULT, so hygiene fails it too, as for every engine-level fault.
    named: ["relight", "hygiene"],
    relight: (rs) => {
      const r = pick(rs, "relight");
      expect(r.status).toBe("fail");
      expect(r.line).toMatch(/relief pass/);
      expect(r.line).toMatch(/highlight FAIL \(the specular highlight's centroid moves -?[\d.]+ px along the light's motion, under \d+/);
      expect(r.line).not.toMatch(/no specular highlight/);
      expect(r.measured["highlight.shift.light"]).toBeLessThan(threshold("relight.highlightShift", null));
    },
    rest: (rs) => expect(pick(rs, "hygiene").status).toBe("fail"),
  });

  clothFault("baked accent fails palette", "test/faults/cloth-accent-baked/index.html", {
    // A page-level fault: the accent is read once and kept, by a palette source written in page code. palette fails
    // by its static token-read rule (S1): the page calls .read() and passes paint() its own source. Its frame still
    // moves under a full swap (ground and ink are live), so the smoke test alone would pass it.
    named: ["palette"],
    rest: (rs) => {
      const pal = pick(rs, "palette");
      expect(pal.status).toBe("fail");
      const p = pal.measured;
      expect(p.accents).toBe(1);
      expect(p.tokenReads!).toBeGreaterThan(0);
      expect(p.staticHits).toBe(0);
      expect(p.customLights).toBe(0);
      expect(pal.line).toMatch(/page code reads the palette itself.*not a direct fromPage/);
    },
  });

  clothFault("grain doubled fails grain", "test/faults/cloth-grain2x/index.html", {
    // A page-level fault: loud grain on a loud material. banding-grain fails by its grain ceiling (the weave
    // cancels in the finish's difference; the doubled grain does not), and nothing else ends worse than on cloth.html.
    named: ["banding-grain"],
    rest: (rs) => {
      const b = pick(rs, "banding-grain");
      expect(b.status).toBe("fail");
      const bg = b.measured;
      expect(Math.max(bg["grain.light"]!, bg["grain.dark"]!)).toBeGreaterThan(threshold("grain.ceiling", null));
      for (const scheme of ["light", "dark"]) expect(bg[`run.${scheme}`]!).toBeLessThanOrEqual(threshold("banding.maxRun", null));
      expect(b.line).toMatch(/so the grain is too loud/);
    },
  });

  clothFault("dead dial fails detail", "test/faults/cloth-detail-dead/index.html", {
    // An engine-level fault (__PAINT_TEST_FAULT), so hygiene fails it too, as for every engine-level fault;
    // nothing else ends worse than on cloth.html.
    named: ["detail", "hygiene"],
    detail: (rs) => {
      const d = pick(rs, "detail");
      expect(d.status).toBe("fail");
      expect(d.measured["rise.light"]!).toBeLessThan(threshold("detail.minRise", null));
      expect(d.line).toMatch(/does not rise/);
    },
    rest: (rs) => expect(pick(rs, "hygiene").status).toBe("fail"),
    // Relight is untouched: the dial is the only thing broken.
    relight: (rs) => expect(pick(rs, "relight").status).toBe("pass"),
  });

  it("cloth shots: detail 0, 0.5, 1 and both key positions, light and dark", async () => {
    for (const dark of [false, true]) {
      await withPage({ ...FROZEN, dark }, async (h) => {
        const tag = dark ? "dark" : "light";
        const frames: Rgba[] = [];
        for (const d of [0, 0.5, 1]) {
          await h.hook(`__paint.setDetail(${d})`);
          await h.hook("__paint.setTime(2)");
          frames.push(await h.shot(`cloth-${tag}-detail${d}`));
        }
        await h.hook("__paint.setDetail(0.6)");
        await h.hook("__paint.setTime(2)");
        for (const step of [0, 1] as const) {
          await h.hook(`__paint.moveLight(0, ${step})`);
          await h.shot(`cloth-${tag}-key${step}`);
        }
        // Detail must change the frame (the shots are for reading; this only guards against a dead dial).
        const diff = (p: Rgba, q: Rgba) => p.data.reduce((acc, v, i) => acc + Math.abs(v - q.data[i]!), 0) / p.data.length / 255;
        console.log(`cloth shots ${tag}: frame change detail 0->0.5 ${diff(frames[0]!, frames[1]!).toFixed(4)}, 0.5->1 ${diff(frames[1]!, frames[2]!).toFixed(4)}`);
        expect(diff(frames[0]!, frames[2]!)).toBeGreaterThan(0);
      });
    }
  });
});
