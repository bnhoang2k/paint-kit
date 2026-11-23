// The fixed-tick counter stateful fields step by: frames of any length reach the same ticks at the same time.
import { describe, expect, it } from "vitest";
import { MAX_CATCHUP, STEP, tickClock } from "../../src/engine/loop.ts";

/** Drives a clock the way the live loop does (t is the running sum of dt) and lists every tick it runs, in order. */
function run(dt: number, frames: number): number[] {
  const clock = tickClock();
  const ran: number[] = [];
  let t = 0;
  for (let f = 0; f < frames; f++) {
    t += dt;
    const from = clock.ticks;
    const n = clock.advance(t, dt);
    for (let i = 0; i < n; i++) ran.push(from + i + 1);
    expect(clock.ticks).toBe(from + n);
  }
  return ran;
}

describe("tickClock", () => {
  it("dt 1/30 x 60 frames and dt 1/120 x 240 frames run the same ticks, in the same order", () => {
    const coarse = run(1 / 30, 60);
    const fine = run(1 / 120, 240);
    // 2 s of time is 120 fixed ticks, whichever the frame length.
    expect(coarse.length).toBe(Math.round(2 / STEP));
    expect(fine).toEqual(coarse);
    expect(coarse).toEqual(Array.from({ length: 120 }, (_, i) => i + 1));
  });

  it("dt 0 runs nothing", () => {
    const clock = tickClock();
    expect(clock.advance(1, 0)).toBe(0);
    expect(clock.ticks).toBe(0);
  });

  it("a draw far behind catches up at most MAX_CATCHUP ticks", () => {
    const clock = tickClock();
    expect(clock.advance(100, STEP)).toBe(MAX_CATCHUP);
    expect(clock.ticks).toBe(MAX_CATCHUP);
  });
});
