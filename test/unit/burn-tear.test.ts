// The torn burn: `fields.burn`'s tear and linger, and `lights.ember`'s rim and specks. Each is off by default, so a page
// that does not ask for them keeps its shader and its settle time.
import { describe, expect, it } from "vitest";
import { burn, RAG_AMP, TEAR_FINE_AMP, TEAR_WIDE } from "../../src/engine/fields/burn.ts";
import { ember, emberRegion } from "../../src/engine/lights/ember.ts";
import { shadeSource } from "../../src/engine/shade.ts";
import { paper } from "../../src/engine/materials/paper.ts";

const base = { from: "bottom", speed: 0.2, rag: 0.5, scorch: 0.5, startAt: 0 } as const;
const rim = { width: 0.01, gain: 5, kelvin: [1400, 2300] as [number, number] };
const specks = { gain: 7, density: 0.4, box: [0.25, 0.4] as [number, number], kelvin: [1300, 2100] as [number, number] };
const glow = { kelvin: [1300, 1900] as [number, number], level: 1, reach: 0.05 };

describe("burn tear and linger", () => {
  it("adds the tear's layers to the front's largest shift, and nothing at tear 0", () => {
    expect(burn(base).maxShift).toBeCloseTo(0.5 * RAG_AMP, 9);
    expect(burn({ ...base, tear: 0.5 }).maxShift).toBeCloseTo(0.5 * RAG_AMP + 0.5 * (TEAR_WIDE + TEAR_FINE_AMP), 9);
  });

  it("defaults to no linger and keeps the one it is given", () => {
    expect(burn(base).linger).toBe(0);
    expect(burn({ ...base, linger: 0.2 }).linger).toBe(0.2);
  });

  it.each([[-0.1], [1.1], [Number.NaN]])("refuses tear %d", (tear) => {
    expect(() => burn({ ...base, tear })).toThrow(/tear is 0\.\.1/);
  });

  it.each([[-0.1], [Number.POSITIVE_INFINITY]])("refuses linger %d", (linger) => {
    expect(() => burn({ ...base, linger })).toThrow(/linger is 0 or above/);
  });
});

describe("ember rim and specks", () => {
  const torn = burn({ ...base, tear: 1, linger: 0.2 });

  it("leaves a plain ember's props and shader without a rim or specks", () => {
    const l = ember({ field: torn, ...glow });
    expect(l.props).not.toHaveProperty("rim");
    expect(l.props).not.toHaveProperty("specks");
    expect(l.emits).toBeUndefined();
    expect(l.glsl).not.toMatch(/rimWidth|specks_/);
  });

  it("emits only with specks, and the shader adds the emitted light only then", () => {
    const plain = ember({ field: torn, ...glow, rim });
    const lit = ember({ field: torn, ...glow, specks });
    expect(plain.emits).toBeUndefined();
    expect(lit.emits).toBe(true);
    expect(shadeSource([paper()], [plain], true)).not.toMatch(/#define PK_EMIT/);
    expect(shadeSource([paper()], [lit], true)).toMatch(/#define PK_EMIT/);
  });

  it("keeps the rim and specks through with(), so level 0 turns them off with the glow", () => {
    const l = ember({ field: torn, ...glow, rim, specks }).with!({ level: 0 });
    expect(l.props.rim).toEqual(rim);
    expect(l.props.specks).toEqual(specks);
    expect(l.props.level).toBe(0);
    expect(l.uniforms.level).toBe(0);
  });

  it("refuses specks on a burn with no linger", () => {
    expect(() => ember({ field: burn(base), ...glow, specks })).toThrow(/linger/);
  });

  it.each([
    ["rim width", { rim: { ...rim, width: 0 } }],
    ["rim gain", { rim: { ...rim, gain: -1 } }],
    ["rim kelvin", { rim: { ...rim, kelvin: [100, 2000] as [number, number] } }],
    ["specks gain", { specks: { ...specks, gain: 0 } }],
    ["specks density", { specks: { ...specks, density: 1.5 } }],
    ["specks box", { specks: { ...specks, box: [0, 0.4] as [number, number] } }],
    ["specks kelvin", { specks: { ...specks, kelvin: [2000, 100] as [number, number] } }],
  ])("refuses a bad %s", (name, bad) => {
    expect(() => ember({ field: torn, ...glow, ...bad }), name).toThrow(/paint-kit: ember/);
  });

  it("widens the tint law's circle to hold the rim and the specks behind the front", () => {
    const stub = { opts: base, band: 0.1, maxShift: 0, linger: 0.2, front: () => 0.5, size: () => ({ w: 960, h: 600 }) } as unknown as typeof torn;
    const near = emberRegion(stub, 0.05, 1);
    const far = emberRegion(stub, 0.05, 1, undefined, 0.3);
    expect(far.radius).toBeGreaterThan(near.radius);
    // The lit rows run from 0.3 behind the front to the reach ahead of it, so the circle's centre moves back.
    expect(far.at[1]).toBeGreaterThan(near.at[1]);
    // The light itself passes that distance on: read through ember(), not by hand.
    const plain = ember({ field: stub, ...glow }).region!(1);
    expect(ember({ field: stub, ...glow, rim }).region!(1).radius).toBeGreaterThan(plain.radius);
    expect(ember({ field: stub, ...glow, specks }).region!(1).radius).toBeGreaterThan(ember({ field: stub, ...glow, rim }).region!(1).radius);
  });
});
