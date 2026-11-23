// materials.foil (Phase 2 Task 13): its options, and the grating code the shade pass compiles only on a page that has
// a grating. The colour itself is read on the screen in test/pages/foil.test.ts.
import { describe, expect, it } from "vitest";
import * as engine from "../../src/engine/index.ts";
import { gratingWhite } from "../../src/engine/glsl/grating.ts";
import { foil } from "../../src/engine/materials/foil.ts";
import { shadeSource } from "../../src/engine/shade.ts";
import { spectrumLut } from "../../src/engine/spectrum.ts";

const ok = { spacing: 1.5, pull: 0.3, pullTarget: "nearest" } as const;

describe("materials.foil", () => {
  it("is in the engine's materials, with the iridescence and highlight laws and the grating flag", () => {
    expect(engine.materials.foil).toBe(foil);
    const m = foil(ok);
    expect(m.laws).toEqual(["iridescence", "highlight"]);
    expect(m.grating).toBe(true);
    // Spacing in nm, the grating equation's unit; orders default 2; the target as 0 nearest, 1 ground.
    expect(m.uniforms).toMatchObject({ spacing: 1500, orders: 2, pull: 0.3, target: 0 });
    expect(foil({ ...ok, pullTarget: "ground", orders: 7 }).uniforms).toMatchObject({ orders: 7, target: 1 });
  });

  it("refuses a spacing outside 1.0 to 2.0 um, orders outside 1 to 7, a pull outside 0..1 and an unknown target", () => {
    for (const spacing of [0.99, 2.01, Number.NaN]) expect(() => foil({ ...ok, spacing })).toThrow(/spacing/);
    for (const orders of [0, 8, 1.5]) expect(() => foil({ ...ok, orders })).toThrow(/orders/);
    for (const pull of [-0.1, 1.1, Number.NaN]) expect(() => foil({ ...ok, pull })).toThrow(/pull/);
    expect(() => foil({ ...ok, pullTarget: "accent" as never })).toThrow(/pullTarget/);
    for (const roughness of [-0.1, 1.1]) expect(() => foil({ ...ok, roughness })).toThrow(/roughness/);
    expect(() => foil({ ...ok, spacing: 1.0 })).not.toThrow();
    expect(() => foil({ ...ok, spacing: 2.0 })).not.toThrow();
  });

  it("the white balance keeps luminance and makes the mean of the table's lines neutral", () => {
    const lut = spectrumLut();
    const n = lut.length / 3;
    const mean = [0, 0, 0];
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) mean[k]! += lut[i * 3 + k]! / n;
    const w = gratingWhite();
    const balanced = mean.map((v, k) => v * w[k]!);
    const y = 0.2126 * mean[0]! + 0.7152 * mean[1]! + 0.0722 * mean[2]!;
    // Neutral: every channel is the mean's luminance.
    for (const v of balanced) expect(v).toBeCloseTo(y, 12);
    // The equal-energy mean is pink before it: red above green and blue.
    expect(mean[0]!).toBeGreaterThan(mean[1]!);
    expect(mean[0]!).toBeGreaterThan(mean[2]!);
  });

  it("the shade pass compiles the grating and the spectrum only on a page with a grating material", () => {
    const key = engine.lights.key({ dir: [0.5, 0, 0.87], level: 0.8 });
    const plain = shadeSource([engine.materials.matte(), engine.materials.sheen({ roughness: 0.3, anisotropy: 0 })], [key], true);
    // (specColour names the grating under an #ifdef that is off there.)
    expect(plain).not.toMatch(/#define PK_GRATING|vec3 gratingSpec\(|PK_SPECTRUM_LUT/);
    const withFoil = shadeSource([engine.materials.matte(), foil(ok)], [key], true);
    expect(withFoil).toMatch(/#define PK_GRATING\n/);
    expect(withFoil).toMatch(/vec3 gratingSpec\(MatOut m/);
    expect(withFoil).toMatch(/const vec3 PK_SPECTRUM_LUT\[81\]/);
    // The lights colour their highlight through specColour on every page.
    expect(plain).toMatch(/specColour\(m, s\.n, normalize\(u_key_0_specDir\)/);
  });
});
