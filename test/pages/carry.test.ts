// The guard for "texture follows the surface" (rest positions): on test/pages/carry.html a shape field moves the
// whole surface by a known offset d through the rest position alone, and the frame's fine texture (fibres, pulp,
// threads, brushing, printed ink) must move by d too: the cross-correlation peak sits at d within 1 px. The
// planted fault test/faults/carry-rest-ignored (engine fault 'rest-ignored') pins every reader to the screen
// position, so the texture stays put while the surface moves: it must fail the same measure.
// Offsets: (7, 0) is a strip's sway, (0, 23) a short drop, and (-5, -180) a lift, large enough that the half-float
// rest image's precision shows (spacing 1/8 px at 180 px).
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeBrowsers, openPage, type PageHandle, type Rgba } from "../../src/checks/harness.ts";
import { lagsAround, textureShift, type Box } from "../../src/checks/image.ts";
import { serveRoot } from "../../src/checks/serve.ts";

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

// Counts the GL calls themselves (as the halftone and water tests do): moving the surface must compile nothing and
// upload nothing.
const COUNT_GL = `(() => {
  globalThis.__gl = { compiles: 0, uploads: 0 };
  const P = WebGL2RenderingContext.prototype;
  const wrap = (name, key) => { const f = P[name]; P[name] = function (...a) { globalThis.__gl[key]++; return f.apply(this, a); }; };
  wrap("compileShader", "compiles");
  wrap("texImage2D", "uploads");
  wrap("texSubImage2D", "uploads");
})()`;

// Below the heading, clear of the edges at every candidate lag, and clear of the heading's ink after a 23 px drop
// (it reaches y 213, plus the widest high-pass box's 16 px): otherwise moving ink inside the box pulls a pinned
// material's read toward the move.
const BOX: Box = { x: 20, y: 240, w: 900, h: 330 };
const MOVES: [number, number][] = [
  [7, 0],
  [0, 23],
  [-5, -180],
];
// The heading's ink, read from the sheet in CSS px (dpr 1, so sheet px), and the box inside it the lags search.
// The region runs 200 px down so a drop of 23 px (bar 04's lift is vertical) stays inside it at every lag.
const INK = { x: 100, y: 100, w: 760, h: 200 };
const INK_BOX: Box = { x: 20, y: 20, w: 700, h: 100 };
/** The ink is read for moves that keep the heading inside INK at every lag (not the 180 px lift, which takes it off the top). */
const inkRead = (move: [number, number]) => Math.abs(move[0]) <= 30 && Math.abs(move[1]) <= 30;
// The blur radius of each material's own texture read (`textureShift`'s high-pass box is 2r + 1 px), set from the
// size of that texture's features before measuring, so the box keeps them. Paper's strands and pulp, denim's
// thread-fine streaks and sheen's brushing are a few px across: the default 9 x 9 box (r 4). Matte's tone noise
// runs at 24 cycles per short side (snoise(s.rest * 24)), about 25 px at 600 px, which a 9 x 9 box mostly removes:
// r 16, a 33 px box, the first power of two whose box is wider than 25 px.
const MATERIAL_RADIUS: Record<string, number> = { paper: 4, matte: 16, denim: 4, sheen: 4 };

/** The sheet's ink channel over INK as a grey frame, so `textureShift` reads it. */
async function inkFrame(h: PageHandle): Promise<Rgba> {
  const ink = (await h.hook<{ ink: number[] }>(`__paint.sheetRegion(${INK.x}, ${INK.y}, ${INK.w}, ${INK.h})`)).ink;
  const data = new Uint8ClampedArray(ink.length * 4);
  ink.forEach((v, i) => data.set([v * 255, v * 255, v * 255, 255], i * 4));
  return { w: INK.w, h: INK.h, data };
}

type Measured = { move: [number, number]; frame: { dx: number; dy: number; score: number; atZero: number }; ink?: { dx: number; dy: number } };
/** Opens `page`, moves its surface by each of `moves` in turn and measures where the fine texture went (high-pass box radius `radius`). */
async function measure(page: string, mat: string, moves: [number, number][], query = "", radius = 4) {
  const h = await openPage(`${server.url}/${page}?mat=${mat}${query}`, { dpr: 1, width: W, height: H, seed: 1, t: 1, initScript: COUNT_GL });
  try {
    const redraw = async (dx: number, dy: number) => {
      await h.hook(`(window.setMove(${dx}, ${dy}), new Promise((r) => requestAnimationFrame(() => r(0))))`);
    };
    await redraw(0, 0);
    const rest = await h.shot();
    const inkRest = await inkFrame(h);
    const gl0 = await h.hook<{ compiles: number; uploads: number }>("({ ...globalThis.__gl })");
    const compiles0 = await h.hook<number>("__paint.stats().compiles");
    const out: Measured[] = [];
    for (const move of moves) {
      await redraw(...move);
      const f = textureShift(rest, await h.shot(), BOX, lagsAround([[0, 0], move], 3), radius);
      const ink = inkRead(move) ? textureShift(inkRest, await inkFrame(h), INK_BOX, lagsAround([[0, 0], move], 2)) : undefined;
      out.push({ move, frame: { dx: f.dx, dy: f.dy, score: f.score, atZero: f.at.get("0,0")! }, ...(ink ? { ink: { dx: ink.dx, dy: ink.dy } } : {}) });
    }
    const gl1 = await h.hook<{ compiles: number; uploads: number }>("({ ...globalThis.__gl })");
    const compiles1 = await h.hook<number>("__paint.stats().compiles");
    expect(h.errors).toEqual([]);
    return { out, compiles: gl1.compiles - gl0.compiles, uploads: gl1.uploads - gl0.uploads, shadeCompiles: compiles1 - compiles0 };
  } finally {
    await h.close();
  }
}
const near = (m: Measured) => Math.abs(m.frame.dx - m.move[0]) <= 1 && Math.abs(m.frame.dy - m.move[1]) <= 1;
const inkNear = (m: Measured) => !!m.ink && Math.abs(m.ink.dx - m.move[0]) <= 1 && Math.abs(m.ink.dy - m.move[1]) <= 1;
const line = (mat: string, m: Measured) =>
  `${mat} moved (${m.move}): texture peak (${m.frame.dx}, ${m.frame.dy}) score ${m.frame.score.toFixed(4)}, at (0, 0) ${m.frame.atZero.toFixed(4)}; ink peak ${m.ink ? `(${m.ink.dx}, ${m.ink.dy})` : "not read"}`;

// Task 2e: a row that read several moves in one test is one test per move (each opens its own page, as `measure` does
// for any list of moves), so a slow read of one move cannot push the row over the page suite's 120 s.
const MATERIALS = ["paper", "matte", "denim", "sheen"];
/** One [material, move] pair per row; paper is also read at the 180 px lift, the others at the first two moves only. */
const rows = (moves: (mat: string) => [number, number][]) => MATERIALS.flatMap((mat) => moves(mat).map((move) => [mat, move] as const));

describe("texture follows the surface (rest positions)", () => {
  it.each(rows((mat) => (mat === "paper" ? MOVES : MOVES.slice(0, 2))))("%s: the fine texture moves with the surface, one move: %j", async (mat, move) => {
    const r = await measure("test/pages/carry.html", mat, [move]);
    for (const m of r.out) console.log(line(mat, m));
    console.log(`${mat}: ${r.compiles} compiles, ${r.uploads} uploads, shade compiles +${r.shadeCompiles} across the moves`);
    for (const m of r.out) {
      expect(near(m), line(mat, m)).toBe(true);
      // Printed text rides the surface too (bar 04's proposal 2), across and down.
      if (inkRead(m.move)) expect(inkNear(m), line(mat, m)).toBe(true);
    }
    expect(r.compiles).toBe(0);
    expect(r.uploads).toBe(0);
    expect(r.shadeCompiles).toBe(0);
  });

  // The material alone (?relief=0): no field writes height, so a carried field's relief cannot hold the peak at the
  // move for a material whose own texture stays pinned (review of this round, Important 1: denim and matte were
  // missed). Each material is read at the scale of its own texture (MATERIAL_RADIUS).
  it.each(rows(() => MOVES.slice(0, 2)))("%s alone (?relief=0): its own texture moves with the surface, one move: %j", async (mat, move) => {
    const r = await measure("test/pages/carry.html", mat, [move], "&relief=0", MATERIAL_RADIUS[mat]);
    for (const m of r.out) console.log(`alone, r ${MATERIAL_RADIUS[mat]}: ${line(mat, m)}`);
    for (const m of r.out) expect(near(m), line(mat, m)).toBe(true);
  });

  // Planted faults: one material reads the screen position for its texture (engine faults rest-ignored-<material>),
  // while the carried fields and the text still move. Its material-only read must not move. The read with relief
  // is logged only: a carried field's relief may hold that peak at the move (it did for denim and matte).
  it.each(rows(() => MOVES.slice(0, 2)))("a material that ignores the rest position fails: %s, one move: %j", async (mat, move) => {
    const page = "test/faults/carry-material-rest-ignored/index.html";
    const withRelief = await measure(page, mat, [move]);
    for (const m of withRelief.out) console.log(`fault ${mat}, with relief (logged only): ${line(mat, m)}`);
    const alone = await measure(page, mat, [move], "&relief=0", MATERIAL_RADIUS[mat]);
    for (const m of alone.out) console.log(`fault ${mat}, alone, r ${MATERIAL_RADIUS[mat]}: ${line(mat, m)}`);
    for (const m of alone.out) expect(near(m), line(mat, m)).toBe(false);
  });

  // Only a rest writer's rest pass is drawn ahead of the list (review Important 2): slot and direction still go to
  // the last writer in list order, whether that writer writes "rest" (DR) or not (RD).
  it.each([
    ["RD", [0, 1], 1],
    ["DR", [1, 0], 0],
  ] as const)("draw order ?order=%s: the last writer in list order keeps direction %j and slot %i", async (order, dir, slot) => {
    const h = await openPage(`${server.url}/test/pages/rest-order.html?order=${order}`, { dpr: 1, width: W, height: H, seed: 1, t: 1 });
    try {
      const s = await h.hook<{ dir?: [number, number][]; slot?: number[] }>(`__paint.sheetRegion(${W / 2}, ${H / 2}, 1, 1)`);
      console.log(`order ${order}: direction ${JSON.stringify(s.dir?.[0])}, slot ${JSON.stringify(s.slot?.[0])}`);
      expect(h.errors).toEqual([]);
      expect(s.dir?.[0]?.[0]).toBeCloseTo(dir[0], 2);
      expect(s.dir?.[0]?.[1]).toBeCloseTo(dir[1], 2);
      expect(s.slot?.[0]).toBe(slot);
    } finally {
      await h.close();
    }
  }, 60_000);

  // A rest writer that also writes coverage writes rest only where its coverage is above 0.5 (the strip case).
  it("coverage-gated rest writer (?gated=1): paper carries its texture", async () => {
    const r = await measure("test/pages/carry.html", "paper", MOVES.slice(0, 1), "&gated=1");
    for (const m of r.out) console.log(`gated: ${line("paper", m)}`);
    expect(near(r.out[0]!), line("paper", r.out[0]!)).toBe(true);
  });

  // Without float targets the rest image is RGBA8, each axis packed into two bytes (1/8 px over +-4096 px).
  it.each(MOVES.map((m) => [m] as const))("8-bit sheet (?nofloat=1): paper still carries its texture, one move: %j", async (move) => {
    const r = await measure("test/pages/carry.html", "paper", [move], "&nofloat=1");
    for (const m of r.out) console.log(`8-bit: ${line("paper", m)}`);
    for (const m of r.out) expect(near(m), line("paper", m)).toBe(true);
    for (const m of r.out) if (inkRead(m.move)) expect(inkNear(m), line("paper", m)).toBe(true);
  });

  it("screen-pinned texture fails (planted fault carry-rest-ignored)", async () => {
    const r = await measure("test/faults/carry-rest-ignored/index.html", "paper", MOVES.slice(0, 1));
    for (const m of r.out) console.log(`fault: ${line("paper", m)}`);
    const m = r.out[0]!;
    expect(near(m), line("paper", m)).toBe(false);
    expect(inkNear(m), line("paper", m)).toBe(false);
  });
});
