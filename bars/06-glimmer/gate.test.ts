// Bar 06's gate: every check that applies passes at the bar's seeds, and the pointer moves the light. Run alone:
// npx vitest run -c vitest.pages.config.ts bars/06-glimmer/gate.test.ts
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { CHECKS, gate } from "../../src/checks/gate.ts";
import { closeBrowsers, openPage, type Rgba } from "../../src/checks/harness.ts";
import { serveRoot } from "../../src/checks/serve.ts";

afterAll(async () => {
  await closeBrowsers();
});

/**
 * Mean absolute 8-bit difference over the RGB channels of two same-size frames, inside a box (default the whole
 * frame). Light lives only in the tile cluster, so the pointer test reads the cluster's box: at 960 x 600 the
 * cluster (about 0.476 ss across with the outer tiles' jitter, its centre 0.035 ss above the page centre) sits inside
 * x 300..660, y 100..460.
 */
const meanDiff = (a: Rgba, b: Rgba, box = { x0: 0, y0: 0, x1: a.w, y1: a.h }) => {
  let s = 0;
  let n = 0;
  for (let y = box.y0; y < box.y1; y++)
    for (let x = box.x0; x < box.x1; x++) {
      const i = (y * a.w + x) * 4;
      for (let k = 0; k < 3; k++) s += Math.abs(a.data[i + k]! - b.data[i + k]!);
      n += 3;
    }
  return s / n;
};
const CLUSTER = { x0: 300, y0: 100, x1: 660, y1: 460 };
const luma = (f: Rgba, i: number) => 0.2126 * f.data[i]! + 0.7152 * f.data[i + 1]! + 0.0722 * f.data[i + 2]!;

/**
 * Where the light behind sits: the centroid, in px, of the luma the lights behind add over `base` (the same frame
 * with every light behind at level 0), inside the box. For a glow whose falloff is log-concave (the engine's
 * (1 - r^2)^2 is, inside its radius), moving the glow moves this centroid the same way, whatever tiles mask it.
 */
const lightCentroid = (f: Rgba, base: Rgba, box = CLUSTER): [number, number] => {
  let sw = 0;
  let sx = 0;
  let sy = 0;
  for (let y = box.y0; y < box.y1; y++)
    for (let x = box.x0; x < box.x1; x++) {
      const i = (y * f.w + x) * 4;
      const w = Math.max(0, luma(f, i) - luma(base, i));
      sw += w;
      sx += w * x;
      sy += w * y;
    }
  return [sx / sw, sy / sw];
};

/**
 * How far, in px, the light leans toward the top left from `a` to `b`: the centroid's shift projected on the unit
 * vector toward the top left. A pointer held at the top left must make it positive; a follow of the wrong sign makes
 * it negative, and no follow makes it exactly 0.
 */
const leanUpLeft = (a: Rgba, b: Rgba, base: Rgba) => {
  const [ax, ay] = lightCentroid(a, base);
  const [bx, by] = lightCentroid(b, base);
  return (ax - bx + (ay - by)) / Math.SQRT2;
};

/**
 * Floors for the pointer test (notes.md, "Pointer test"). Rule: half of each reading measured on the page (2026-11-15,
 * seed 1, 960 x 600, dpr 1, t 2, pointer held at (0.3, 0.3); the test logs them), rounded down to two figures. A
 * light that does not follow reads exactly 0 on both; a light that follows the wrong way reads a negative lean.
 * Measured: swell diff 2.85, lean 18.87 px; wash diff 1.027, lean 3.287 px; both diff 0.828, lean 1.453 px.
 * Readings after the light ground moved to slate (the test opens the light scheme): swell 3.091, 19.151; wash 1.102,
 * 3.283; both 0.91, 1.439. The floors are kept from the earlier readings: each new reading is still at least about
 * twice its floor. Re-derived by the rule they would be swell 1.5 / 9.5, wash 0.55 / 1.6, both 0.45 / 0.71; the one
 * the rule would lower (both lean, 0.72 to 0.71) stays at the stricter value. After the deeper dims (steep, drifting
 * wash and a blue fill): swell 2.833, 23.655; wash 3.575, 15.976; both 2.759, 8.542. The floors are kept; the
 * lowest margin is the swell's diff, about twice its floor.
 */
const FLOOR: Record<string, { diff: number; lean: number }> = {
  swell: { diff: 1.4, lean: 9.4 },
  wash: { diff: 0.51, lean: 1.6 },
  both: { diff: 0.41, lean: 0.72 },
};

describe("06-glimmer", () => {
  // Nine checks at three seeds in a software-WebGL browser: minutes, not seconds.
  // One test per seed and check group (Task 2e split): a whole seed gate on this bar took 172 s with the machine busy,
  // over the 120 s each test must keep. relight and detail read 60 s each, the other seven checks 60 s together. The
  // checks do not read each other, so the three tests together assert what the one gate asserted: every check that
  // applies passes at every seed.
  const GROUPS: [string, (n: string) => boolean][] = [
    ["relight", (n) => n === "relight"],
    ["detail", (n) => n === "detail"],
    ["the other seven checks", (n) => n !== "relight" && n !== "detail"],
  ];
  for (const seed of [1, 2, 3])
    for (const [label, pick] of GROUPS)
      it(`06-glimmer ${label} pass at seed ${seed}`, async () => {
        const r = await gate(path.resolve(import.meta.dirname), { seeds: [seed] }, CHECKS.filter((c) => pick(c.name)));
        console.log(r.lines.join("\n"));
        expect(r.verdict, r.lines.join("\n")).toBe("passed");
      });

  // The pointer beat: with the pointer held at the top left, the light behind moves and its centroid leans toward
  // the pointer, for each light behind on its own (the other at level 0) and for both together; and the frame at
  // rest does not change when the path is cleared.
  it("the pointer moves the light toward it; at rest the frame is the same", async () => {
    const server = await serveRoot(path.resolve(import.meta.dirname, "../.."));
    try {
      const h = await openPage(`${server.url}/bars/06-glimmer/`, { width: 960, height: 600, dpr: 1, t: 2 });
      try {
        const levels = await h.hook<number[]>("__paint.lights().map((l) => l.props.level)");
        // The frame with both lights behind at level 0 (the ambient alone): the base the light's centroid is read over.
        await h.hook("__paint.setLight(0, { level: 0 })");
        await h.hook("__paint.setLight(1, { level: 0 })");
        await h.hook("__paint.setTime(2)");
        const base = await h.shot();
        await h.hook(`__paint.setLight(0, { level: ${levels[0]} })`);
        await h.hook(`__paint.setLight(1, { level: ${levels[1]} })`);
        const read = async () => {
          await h.hook("__paint.setPointerPath(null)");
          await h.hook("__paint.setTime(2)");
          const rest = await h.shot();
          await h.hook("__paint.setPointerPath([{ t: 0, x: 0.3, y: 0.3 }, { t: 2, x: 0.3, y: 0.3 }])");
          await h.hook("__paint.setTime(2)");
          const moved = await h.shot();
          return { rest, diff: meanDiff(rest, moved, CLUSTER), lean: leanUpLeft(rest, moved, base) };
        };
        const readings: Record<string, { diff: number; lean: number }> = {};
        // Each light behind alone (light 0 the swell, light 1 the wash): the other goes to level 0, then back.
        for (const [name, off] of [["swell", 1], ["wash", 0]] as const) {
          await h.hook(`__paint.setLight(${off}, { level: 0 })`);
          const { diff, lean } = await read();
          readings[name] = { diff, lean };
          await h.hook(`__paint.setLight(${off}, { level: ${levels[off]} })`);
        }
        const both = await read();
        readings.both = { diff: both.diff, lean: both.lean };
        console.log(`pointer readings (diff: 8-bit mean over the cluster box; lean: px toward the top left): ${JSON.stringify(readings, (_, v) => (typeof v === "number" ? +v.toFixed(3) : v))}`);
        for (const [name, r] of Object.entries(readings)) {
          expect(r.diff, `${name}: the pointer did not move the light`).toBeGreaterThan(FLOOR[name]!.diff);
          expect(r.lean, `${name}: the light did not lean toward the pointer (top left)`).toBeGreaterThan(FLOOR[name]!.lean);
        }
        await h.hook("__paint.setPointerPath(null)");
        await h.hook("__paint.setTime(2)");
        const back = await h.shot();
        expect(meanDiff(both.rest, back), "the frame at rest changed after the path was cleared").toBe(0);
        expect(h.errors).toEqual([]);
      } finally {
        await h.close();
      }
    } finally {
      await server.close();
    }
  });
});
