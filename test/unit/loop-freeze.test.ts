// The frozen clock: stepping a frozen page forward frame by frame (the flash check's 60 fps walk) steps on from
// where it is, so it costs each tick once. Replaying from the seed per frame cost every tick per frame: 7,260 ticks
// for 2 s at 60 fps, 233 s on test/pages/grown.html (debug-merge-grown-report.md). test/pages/grown.test.ts pins that
// the forward frame is the replayed one.
import { describe, expect, it } from "vitest";
import { createLoop, STEP } from "../../src/engine/loop.ts";

function loopWithLog() {
  const calls: string[] = [];
  const loop = createLoop(
    {
      frame: () => calls.push("frame"),
      replay: (t) => calls.push(`replay ${Math.round(t / STEP)}`),
      forward: (from, to) => calls.push(`forward ${Math.round(from / STEP)} ${Math.round(to / STEP)}`),
      redraw: () => calls.push("redraw"),
      onError: (e) => {
        throw e;
      },
    },
    { pauseHidden: false },
  );
  return { loop, calls };
}

describe("freeze", () => {
  it("replays from the seed the first time, then steps forward on from the frozen time", () => {
    const { loop, calls } = loopWithLog();
    for (let i = 0; i <= 3; i++) loop.freeze(i * STEP);
    expect(calls).toEqual(["replay 0", "forward 0 1", "forward 1 2", "forward 2 3"]);
  });

  it("replays from the seed when it goes back in time, and after a refresh it steps on from the refreshed frame", () => {
    const { loop, calls } = loopWithLog();
    loop.freeze(10 * STEP);
    loop.freeze(4 * STEP);
    loop.refresh();
    loop.freeze(4 * STEP);
    loop.freeze(6 * STEP);
    expect(calls).toEqual(["replay 10", "replay 4", "replay 4", "forward 4 4", "forward 4 6"]);
  });

  it("replays from the seed when the clock was not frozen (resting after a settle)", () => {
    const { loop, calls } = loopWithLog();
    loop.settle(5 * STEP);
    loop.freeze(6 * STEP);
    expect(calls).toEqual(["replay 5", "replay 6"]);
  });
});
