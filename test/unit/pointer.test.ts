// The engine-owned pointer (src/engine/pointer.ts): a lagged copy of the pointer stepped on the fixed 1/60 s ticks, so
// a replay to t gives the same pointer every time, and live frames of any length reach the replay's value.
import { describe, expect, it } from "vitest";
import { STEP } from "../../src/engine/loop.ts";
import { TILT_SENSE, checkTilt, createPointer, createTilt, easeOfTau, pathAt, tiltOfPointer, tiltTurn, type PointerStop } from "../../src/engine/pointer.ts";

const PATH: PointerStop[] = [
  { t: 0, x: 0.3, y: 0.3 },
  { t: 0.15, x: 0.65, y: 0.25 },
  { t: 0.3, x: 0.4, y: 0.55 },
  { t: 0.45, x: 0.7, y: 0.65 },
];

describe("pointer", () => {
  it("eases a jump by 0.25 per tick: 1 - 0.75^n of the way after n ticks (bar 06's reference lag)", () => {
    const p = createPointer({ ease: 0.25, rest: [0, 0] });
    p.setPath([{ t: 0, x: 1, y: 0 }, { t: 1, x: 1, y: 0 }]);
    p.replay(10 * STEP);
    expect(p.at()[0]).toBeCloseTo(1 - 0.75 ** 10, 6);
  });

  it("replays the same pointer at the same t, whatever came before", () => {
    const p = createPointer({ ease: 0.25 });
    p.setPath(PATH);
    p.replay(0.4);
    const a = p.at();
    p.replay(1.7);
    p.replay(0.05);
    p.replay(0.4);
    expect(p.at()).toEqual(a);
  });

  it("live frames of 1/30 s and of 1/120 s reach the replay's pointer at the same t", () => {
    const live = (dt: number) => {
      const p = createPointer({ ease: 0.25 });
      p.input(0.9, 0.1);
      let t = 0;
      while (t < 0.5 - 1e-9) {
        t += dt;
        p.advance(t, dt);
      }
      return p.at();
    };
    const replay = createPointer({ ease: 0.25 });
    replay.setPath([{ t: 0, x: 0.9, y: 0.1 }, { t: 1, x: 0.9, y: 0.1 }]);
    replay.replay(0.5);
    for (const dt of [1 / 30, 1 / 120]) {
      const [x, y] = live(dt);
      expect(x).toBeCloseTo(replay.at()[0], 6);
      expect(y).toBeCloseTo(replay.at()[1], 6);
    }
  });

  it("without a path, rests at its rest point; dt 0 steps nothing", () => {
    const p = createPointer({ ease: 0.25, rest: [0.2, 0.7] });
    p.replay(3);
    expect(p.at()).toEqual([0.2, 0.7]);
    p.input(1, 1);
    p.advance(3, 0);
    expect(p.at()).toEqual([0.2, 0.7]);
  });

  it("walks a path in straight lines between stops, holding the ends", () => {
    expect(pathAt(PATH, -1)).toEqual([0.3, 0.3]);
    const [x, y] = pathAt(PATH, 0.075);
    expect(x).toBeCloseTo(0.475, 9);
    expect(y).toBeCloseTo(0.275, 9);
    expect(pathAt(PATH, 9)).toEqual([0.7, 0.65]);
  });

  it("lays a light's pointer uniforms over its own, then its frame uniforms (time and pointer), and leaves other lights alone", () => {
    const p = createPointer();
    const lights = [
      { pointer: ([x, y]: [number, number]) => ({ at: [x, y] }) },
      {},
      { pointer: () => ({ at: [9, 9], level: 2 }), frame: (t: number, [x]: [number, number]) => ({ at: [t, x] }) },
    ] as never[];
    expect(p.uniforms(lights, [{ at: [0, 0], level: 1 }, { at: [0, 0] }, { at: [0, 0] }], 3)).toEqual([
      { at: [0.5, 0.5], level: 1 },
      { at: [0, 0] },
      { at: [3, 0.5], level: 2 },
    ]);
  });

  it("turns a time constant into a per-tick ease (bar 01's lamp: tau 0.1 s)", () => {
    expect(easeOfTau(0.1)).toBeCloseTo(1 - Math.exp(-1 / 6), 9);
    expect(easeOfTau(0)).toBe(1);
  });
});

// Tilt (Phase 2 Task 11; Task 16): the eased pointer tips the surface, and the shade pass turns its normal and grooves
// by the tilt's rotation (`tiltTurn`), the eye and the lights held. It reuses the
// pointer's ease (a second createPointer, resting at the canvas centre), so it eases and replays the same way.
describe("tilt", () => {
  const ON = { max: 20, drive: "pointer" } as const;
  const EASE = 0.25;
  const tick = (tl: ReturnType<typeof createTilt>, k: number) => tl.advance(k * STEP, STEP);

  it("eases toward the pointer's tilt by the pointer's ease: 1 - (1 - ease)^n of the way after n ticks", () => {
    const tl = createTilt(EASE);
    expect(tl.at(ON)).toEqual([0, 0]);
    tl.input(1, 0.5); // the canvas's right edge: the full tilt about the vertical axis
    for (let k = 1; k <= 10; k++) tick(tl, k);
    const [a, b] = tl.at(ON);
    expect(a).toBeCloseTo(TILT_SENSE * 20 * (1 - 0.75 ** 10), 9);
    expect(b).toBe(0);
  });

  it("on leave, eases back to [0, 0] and never jumps: each tick moves the ease share of what is left, no more", () => {
    const tl = createTilt(EASE);
    tl.input(0.95, 0.1);
    let k = 0;
    while (k < 120) tick(tl, ++k);
    const start = tl.at(ON);
    expect(Math.abs(start[0])).toBeGreaterThan(17);
    expect(Math.abs(start[1])).toBeGreaterThan(15);
    tl.leave();
    let prev = start;
    for (let n = 0; n < 60; n++) {
      tick(tl, ++k);
      const now = tl.at(ON);
      for (const i of [0, 1]) {
        // Exactly the ease share of the remaining tilt per tick: no single tick moves more than that.
        expect(Math.abs(prev[i]! - now[i]!)).toBeLessThanOrEqual(EASE * Math.abs(prev[i]!) + 1e-12);
        expect(Math.abs(now[i]!)).toBeCloseTo(Math.abs(prev[i]!) * (1 - EASE), 9);
        expect(Math.sign(now[i]!)).toBe(Math.sign(start[i]!));
      }
      prev = now;
    }
    expect(Math.abs(prev[0])).toBeLessThan(0.01);
    expect(Math.abs(prev[1])).toBeLessThan(0.01);
  });

  it("a long gap (a hidden tab) lands at rest, and live frames reach the replay's tilt", () => {
    const tl = createTilt(EASE);
    tl.input(1, 0);
    tl.advance(0.5, 0.5);
    const replay = createTilt(EASE);
    replay.setPath([{ t: 0, x: 1, y: 0 }, { t: 1, x: 1, y: 0 }]);
    replay.replay(0.5);
    expect(tl.at(ON)[0]).toBeCloseTo(replay.at(ON)[0], 6);
    expect(tl.at(ON)[1]).toBeCloseTo(replay.at(ON)[1], 6);
    tl.leave();
    tl.advance(30, 29.5);
    expect(tl.at(ON).map((v) => Math.abs(v) < 1e-4)).toEqual([true, true]);
  });

  it("maps the pointer to a tilt of up to max: the centre is flat, the canvas edge is max, past it holds max", () => {
    expect(tiltOfPointer([0.5, 0.5], 20)).toEqual([0, 0]);
    expect(tiltOfPointer([1, 0.5], 20)).toEqual([TILT_SENSE * 20, 0]);
    expect(tiltOfPointer([1.4, -0.3], 20)).toEqual([TILT_SENSE * 20, TILT_SENSE * 20]);
    expect(tiltOfPointer([0.25, 0.75], 20)).toEqual([TILT_SENSE * -10, TILT_SENSE * -10]);
  });

  /** R (column-major, as GLSL's mat3) times v. */
  const turn = (r: number[], v: number[]) => [0, 1, 2].map((i) => r[i]! * v[0]! + r[3 + i]! * v[1]! + r[6 + i]! * v[2]!);
  /** R^T times v: the direction v in the turned surface's own frame. */
  const unturn = (r: number[], v: number[]) => [0, 1, 2].map((j) => r[3 * j]! * v[0]! + r[3 * j + 1]! * v[1]! + r[3 * j + 2]! * v[2]!);
  const rad = (d: number) => (d * Math.PI) / 180;

  it("the sense: pointer right tips the right side away, pointer up tips the top away, so the card faces right and up", () => {
    // TILT_SENSE is the one named sign: +1 pushes the side under the pointer away, like tilting a held card.
    expect(TILT_SENSE).toBe(1);
    const [ax] = tiltOfPointer([0.9, 0.5], 20);
    const [, by] = tiltOfPointer([0.5, 0.1], 20);
    expect(ax).toBeGreaterThan(0);
    expect(by).toBeGreaterThan(0);
    // The surface turns (Task 16, the owner's pick): the flat card's normal +z, turned by R, in the room's frame (x right,
    // y up, z to the viewer). A card whose right side went away faces right; one whose top went away faces up.
    const right = turn(tiltTurn([20, 0]), [0, 0, 1]);
    expect(right[0]).toBeCloseTo(Math.sin(rad(20)), 12);
    expect(right[1]).toBeCloseTo(0, 12);
    expect(right[2]).toBeCloseTo(Math.cos(rad(20)), 12);
    const up = turn(tiltTurn([0, 20]), [0, 0, 1]);
    expect(up[0]).toBeCloseTo(0, 12);
    expect(up[1]).toBeCloseTo(Math.sin(rad(20)), 12);
    expect(up[2]).toBeCloseTo(Math.cos(rad(20)), 12);
    // A groove along +x stays in the turned card's plane: a right-side-away tip carries it into the screen.
    const groove = turn(tiltTurn([20, 0]), [1, 0, 0]);
    expect(groove[0]).toBeCloseTo(Math.cos(rad(20)), 12);
    expect(groove[2]).toBeCloseTo(-Math.sin(rad(20)), 12);
  });

  it("the turn is b about the horizontal axis, then a about the vertical one: the eye, held, sits at R^T z as the card sees it", () => {
    // The same rotation the view-only tilt (Task 11) used for its view vector, (-sin a, -sin b cos a, cos a cos b):
    // only what is turned changed, never the rotation.
    for (const [a, b] of [[20, 0], [0, -35], [15, 25], [-40, 10]] as [number, number][]) {
      const eye = unturn(tiltTurn([a, b]), [0, 0, 1]);
      expect(eye[0]).toBeCloseTo(-Math.sin(rad(a)), 12);
      expect(eye[1]).toBeCloseTo(-Math.sin(rad(b)) * Math.cos(rad(a)), 12);
      expect(eye[2]).toBeCloseTo(Math.cos(rad(a)) * Math.cos(rad(b)), 12);
    }
  });

  it("the turn is a rotation (orthonormal, determinant 1), and exactly the identity with no tilt", () => {
    expect(tiltTurn([0, 0]).map((v) => v + 0)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    for (const d of [[20, 0], [0, -35], [15, 25], [-40, 10]] as [number, number][]) {
      const r = tiltTurn(d);
      const col = (k: number) => r.slice(3 * k, 3 * k + 3);
      const dot = (u: number[], v: number[]) => u[0]! * v[0]! + u[1]! * v[1]! + u[2]! * v[2]!;
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) expect(dot(col(i), col(j))).toBeCloseTo(i === j ? 1 : 0, 12);
      const [c0, c1, c2] = [col(0), col(1), col(2)];
      const cross = [c0[1]! * c1[2]! - c0[2]! * c1[1]!, c0[2]! * c1[0]! - c0[0]! * c1[2]!, c0[0]! * c1[1]! - c0[1]! * c1[0]!];
      expect(dot(cross, c2)).toBeCloseTo(1, 12);
    }
  });

  it("setTilt holds a tilt over the pointer at once; null hands it back to the pointer", () => {
    const tl = createTilt(EASE);
    tl.input(1, 0.5);
    for (let k = 1; k <= 3; k++) tick(tl, k);
    const eased = tl.at(ON);
    tl.hold([5, -7]);
    expect(tl.at(ON)).toEqual([5, -7]);
    tick(tl, 4);
    expect(tl.at(ON)).toEqual([5, -7]);
    tl.hold(null);
    // The pointer kept easing underneath the hold.
    expect(tl.at(ON)[0]).toBeGreaterThan(eased[0]);
  });

  it('drive "none": the pointer tips nothing; only setTilt does', () => {
    const tl = createTilt(EASE);
    tl.input(1, 0);
    for (let k = 1; k <= 30; k++) tick(tl, k);
    expect(tl.at({ max: 20, drive: "none" })).toEqual([0, 0]);
    tl.hold([3, 4]);
    expect(tl.at({ max: 20, drive: "none" })).toEqual([3, 4]);
  });

  it("the tilt fault (tilt-leave-snaps) jumps to rest on leave: the snap the leave test must catch", () => {
    const tl = createTilt(EASE, true);
    tl.input(1, 0.5);
    for (let k = 1; k <= 30; k++) tick(tl, k);
    tl.leave();
    tick(tl, 31);
    expect(tl.at(ON)).toEqual([0, 0]);
  });

  it("checks its options: max is 0 up to 89 degrees, drive is pointer or none", () => {
    expect(checkTilt(undefined)).toBeNull();
    expect(checkTilt({ max: 12, drive: "none" })).toEqual({ max: 12, drive: "none" });
    expect(() => checkTilt({ max: 90, drive: "pointer" })).toThrow(/tilt.max/);
    expect(() => checkTilt({ max: Number.NaN, drive: "pointer" })).toThrow(/tilt.max/);
    expect(() => checkTilt({ max: 10, drive: "mouse" as never })).toThrow(/tilt.drive/);
  });

  it('drive "pointer" needs a pointer lag: with the ease unset or 1 a leave would snap, so it throws (Review Focus 3)', () => {
    expect(() => checkTilt({ max: 20, drive: "pointer" })).toThrow(/a page that tilts sets `pointer.ease`/);
    expect(() => checkTilt({ max: 20, drive: "pointer" }, 1)).toThrow(/a page that tilts sets `pointer.ease`/);
    expect(checkTilt({ max: 20, drive: "pointer" }, easeOfTau(0.1))).toEqual({ max: 20, drive: "pointer" });
    // An ease of 0 freezes the tilt, a negative one overshoots, NaN is no number: none lets the tilt ease back to rest.
    for (const bad of [0, -0.1, NaN]) expect(() => checkTilt({ max: 20, drive: "pointer" }, bad)).toThrow(/a page that tilts sets `pointer.ease`/);
    expect(() => checkTilt({ max: 20, drive: "pointer" }, 0)).toThrow(/above 0/);
    for (const any of [undefined, 0, -0.1, NaN, 1]) expect(checkTilt({ max: 20, drive: "none" }, any)).toEqual({ max: 20, drive: "none" });
    // drive "none": the pointer tips nothing, so no ease is needed.
    expect(checkTilt({ max: 20, drive: "none" })).toEqual({ max: 20, drive: "none" });
  });
});
