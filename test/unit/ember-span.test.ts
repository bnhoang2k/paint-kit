// `lights.ember({ span })`: the width of the band the glow lights, which sets the radius of the circle the tint law
// reads (`region`). Without it the circle spans the sheet's width; with it, the circle holds the band and no more.
import { describe, expect, it } from "vitest";
import type { BurnField } from "../../src/engine/fields/burn.ts";
import { ember, emberRegion } from "../../src/engine/lights/ember.ts";

// A bottom burn on a 960 x 600 sheet (1.6 x 1 short-side units), no rag, the front 0.5 up, a 0.1 band.
const stub = {
  opts: { from: "bottom", speed: 0.2, rag: 0, scorch: 0.5, startAt: 0 },
  band: 0.1,
  maxShift: 0,
  linger: 0,
  front: () => 0.5,
  size: () => ({ w: 960, h: 600 }),
} as unknown as BurnField;

describe("ember span", () => {
  const reach = 0.03;
  it("sets the region's radius to the band's own half-diagonal, and leaves the centre alone", () => {
    const wide = emberRegion(stub, reach, 1);
    const narrow = emberRegion(stub, reach, 1, 0.5);
    // The lit rows run from the front less min(reach, band) to the front plus reach: 0.47 to 0.53, 0.06 tall.
    expect(wide.radius).toBeCloseTo(Math.hypot(0.8, 0.03), 6);
    expect(narrow.radius).toBeCloseTo(Math.hypot(0.25, 0.03), 6);
    expect(narrow.at).toEqual(wide.at);
  });

  it("never exceeds the sheet's width, and the light carries it through region() and with()", () => {
    expect(emberRegion(stub, reach, 1, 5).radius).toBeCloseTo(emberRegion(stub, reach, 1).radius, 6);
    const l = ember({ field: stub, kelvin: [1300, 2000], level: 1, reach, span: 0.5 });
    expect(l.region!(1).radius).toBeCloseTo(Math.hypot(0.25, 0.03), 6);
    expect(l.props.span).toBe(0.5);
    expect(l.with!({ level: 0 }).region!(1).radius, "with() dropped the span").toBeCloseTo(Math.hypot(0.25, 0.03), 6);
    expect(ember({ field: stub, kelvin: [1300, 2000], level: 1, reach }).props).not.toHaveProperty("span");
  });

  it("rejects a span of 0, a negative one or a non-number", () => {
    for (const span of [0, -0.1, NaN, Infinity]) expect(() => ember({ field: stub, kelvin: [1300, 2000], level: 1, reach, span }), String(span)).toThrow(/span/);
  });
});
