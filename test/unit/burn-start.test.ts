// `fields.burn`'s start: a lead places the front at once, a second start is ignored, and frontNow reads the front at the
// latest frame drawn (no frame has been drawn here, so paint time 0).
import { describe, expect, it } from "vitest";
import { burn } from "../../src/engine/fields/burn.ts";

const make = () => burn({ from: "bottom", speed: 0.2, rag: 0, scorch: 0.5, startAt: null });

describe("burn start", () => {
  it("waits far behind every point until it starts", () => {
    expect(make().frontNow()).toBeLessThan(0);
  });

  it("starts at the latest frame with the front at 0 by default", () => {
    const f = make();
    f.start();
    expect(f.startAt).toBe(0);
    expect(f.frontNow()).toBeCloseTo(0, 6);
  });

  it("places the front at the lead at once, and it climbs from there", () => {
    const f = make();
    f.start(0.1);
    expect(f.frontNow()).toBeCloseTo(0.1, 6);
    expect(f.front(1)).toBeCloseTo(0.3, 6);
  });

  it("ignores a second start, whatever its lead", () => {
    const f = make();
    f.start(0.1);
    const at = f.startAt;
    f.start(0.5);
    expect(f.startAt).toBe(at);
  });

  it("places the front behind its start at a negative lead, and it climbs from there", () => {
    const f = make();
    f.start(-0.1);
    expect(f.startAt).toBe(0);
    expect(f.frontNow()).toBeCloseTo(-0.1, 6);
    expect(f.front(1)).toBeCloseTo(0.1, 6);
  });

  it("rejects a non-finite lead", () => {
    for (const lead of [NaN, Infinity]) expect(() => make().start(lead), String(lead)).toThrow(/lead/);
  });
});
