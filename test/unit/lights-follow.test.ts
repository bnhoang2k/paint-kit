// The engine's moving lights: a glow whose centre is a function of time (`at: PerFrame`), a glow and a key that
// follow the eased pointer (`follow`). The motion lives in the light's own options, so `with` (the hook's setLight
// and moveLight) keeps it, and one per-draw hook (`frame`, src/engine/pointer.ts `uniforms`) computes it.
import { describe, expect, it } from "vitest";
import { propsNow } from "../../src/engine/hook.ts";
import { key } from "../../src/engine/lights/basic.ts";
import { GLOW_TEST_TIME, glow, type GlowOptions } from "../../src/engine/lights/glow.ts";
import { createPointer } from "../../src/engine/pointer.ts";
import type { Light } from "../../src/engine/types.ts";

const drift = (t: number): [number, number] => [0.5 + 0.1 * t, 0.4 - 0.05 * t];
const base: GlowOptions = { at: drift, radius: 0.2, level: 3, hues: "accents", follow: 0.5 };
/** What the hook's setLight does: the light's props, with these laid over, through `with`. */
const setLight = (l: Light, p: Record<string, unknown>) => l.with!({ ...l.props, ...p });
/** The light's uniforms as drawn at time t with the eased pointer at p. */
const drawn = (l: Light, t: number, p: [number, number]): { at: number[]; dir: number[]; specDir: number[]; level: number[] } => {
  const ptr = createPointer({ rest: p });
  return ptr.uniforms([l], [l.uniforms], t)[0] as never;
};

describe("moving lights", () => {
  it("a glow with a moving at and a follow keeps both: at(t) + follow x (pointer - 0.5)", () => {
    const g = glow(base);
    expect(g.pointer).toBeUndefined();
    const u = drawn(g, 2, [0.9, 0.1]);
    expect(u.at[0]).toBeCloseTo(0.7 + 0.5 * 0.4, 12);
    expect(u.at[1]).toBeCloseTo(0.3 + 0.5 * -0.4, 12);
    // At the pointer's rest the follow adds nothing: the drift alone.
    expect(drawn(g, 1, [0.5, 0.5]).at).toEqual(drift(1));
  });

  it("with() keeps a glow's moving at and its follow", () => {
    const g = setLight(glow(base), { level: 0 });
    expect(g.props.level).toBe(0);
    expect(g.props.follow).toBe(0.5);
    expect(g.props.at).toBe(drift);
    const u = drawn(g, 2, [0.9, 0.1]);
    expect(u.at[0]).toBeCloseTo(0.9, 12);
    expect(u.at[1]).toBeCloseTo(0.1, 12);
    expect(u.level as unknown).toBe(0);
  });

  it("testPositions for a moving at read it at GLOW_TEST_TIME (2 s), and keep the follow", () => {
    expect(GLOW_TEST_TIME).toBe(2);
    const g = glow(base);
    const [x, y] = drift(GLOW_TEST_TIME);
    expect(g.testPositions!(0)).toEqual({ at: [x, y] });
    // y 0.3 is above the middle, so step 1 moves the glow down by its radius.
    expect(g.testPositions!(1).at).toEqual([x, y + 0.2]);
    const moved = setLight(g, g.testPositions!(1));
    expect(moved.props.follow).toBe(0.5);
    // Moved, the glow holds still at its test position (plus its follow), at any time.
    expect(drawn(moved, 0, [0.5, 0.5]).at).toEqual([x, y + 0.2]);
    expect(drawn(moved, 7, [0.7, 0.5]).at[0]).toBeCloseTo(x + 0.1, 12);
  });

  it("a glow that neither moves nor follows has no per-draw hook (its uniforms stand)", () => {
    const g = glow({ at: [0.3, 0.6], radius: 0.2, level: 1, hues: [0.5] });
    expect(g.frame).toBeUndefined();
    expect(g.uniforms.at).toEqual([0.3, 0.6]);
    // y 0.6 is below the middle, so step 1 moves the glow up by its radius.
    const [x1, y1] = g.testPositions!(1).at as number[];
    expect(x1).toBe(0.3);
    expect(y1).toBeCloseTo(0.4, 12);
  });

  it("the hook shows a moving at as its value at the paint's time, and every prop it keeps", () => {
    const shown = propsNow(glow(base).props, 2);
    expect(shown).toEqual({ ...base, at: drift(2) });
    expect(() => structuredClone(shown)).not.toThrow();
  });

  it("key({ follow }) sets dir and specDir from the eased pointer, with no rest special case, and with() keeps it", () => {
    const k = key({ dir: [-0.25, 0.3, 1], level: 0.5, follow: 1.1 });
    expect(k.pointer).toBeUndefined();
    const u = drawn(k, 2, [0.8, 0.2]);
    const d = [-0.25 + 1.1 * 0.3, 0.3 + 1.1 * 0.3, 1];
    for (const n of ["dir", "specDir"] as const) u[n].forEach((v, i) => expect(v).toBeCloseTo(d[i]!, 12));
    // At rest it is the declared direction, from the same formula.
    expect(drawn(k, 2, [0.5, 0.5]).dir).toEqual([-0.25, 0.3, 1]);
    // moveLight's test position 1 through with(): the swung direction, still following the pointer.
    const moved = setLight(k, k.testPositions!(1));
    expect(moved.props.follow).toBe(1.1);
    const m = drawn(moved, 2, [0.5, 0.5]);
    expect(m.dir).toEqual(k.testPositions!(1).dir);
    expect(drawn(moved, 2, [0.6, 0.5]).dir[0]).toBeCloseTo((k.testPositions!(1).dir as number[])[0]! + 0.11, 12);
  });

  it("a key without follow has no per-draw hook", () => {
    expect(key({ dir: [0, 0, 1], level: 1 }).frame).toBeUndefined();
  });
});
