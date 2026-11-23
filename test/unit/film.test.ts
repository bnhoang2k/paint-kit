// materials.film (Phase 2 Task 18): its options, the phase rule, and the film code the shade pass compiles only on a page
// that has a film. The colour itself is read on the screen in test/pages/film.test.ts.
import { describe, expect, it } from "vitest";
import * as engine from "../../src/engine/index.ts";
import { FILM_TAPS, filmLineSum, filmPhase } from "../../src/engine/glsl/film.ts";
import { spectrumWhite } from "../../src/engine/glsl/spectrum.ts";
import { film } from "../../src/engine/materials/film.ts";
import { foil } from "../../src/engine/materials/foil.ts";
import { shadeSource } from "../../src/engine/shade.ts";
import { spectrumLut } from "../../src/engine/spectrum.ts";

const ok = { range: [100, 400], ior: 1.3, base: "dielectric", pull: 0.3, pullTarget: "nearest" } as const;
const deg = (r: number) => (r * 180) / Math.PI;

describe("materials.film", () => {
  it("is in the engine's materials, with the iridescence and highlight laws and its film data", () => {
    expect(engine.materials.film).toBe(film);
    const m = film({ ...ok, range: [100, 400] });
    expect(m.laws).toEqual(["iridescence", "highlight"]);
    expect(m.film).toEqual({ range: [100, 400], ior: 1.3, base: "dielectric" });
    expect(m.uniforms).toMatchObject({ range: [100, 400], ior: 1.3, base: 0, pull: 0.3, target: 0 });
    expect(film({ ...ok, range: [26, 54], base: "metal", pullTarget: "ground" }).uniforms).toMatchObject({ base: 1, target: 1 });
  });

  it("refuses a bad range, index, base, pull, target, roughness and tone", () => {
    for (const range of [[100], [100, 200, 300], [-1, 100], [100, Number.NaN], "100,400"]) expect(() => film({ ...ok, range: range as never })).toThrow(/range/);
    for (const ior of [0.99, Number.NaN, Number.POSITIVE_INFINITY]) expect(() => film({ ...ok, range: [100, 400], ior })).toThrow(/ior/);
    expect(() => film({ ...ok, range: [100, 400], base: "glass" as never })).toThrow(/base/);
    for (const pull of [-0.1, 1.1, Number.NaN]) expect(() => film({ ...ok, range: [100, 400], pull })).toThrow(/pull/);
    expect(() => film({ ...ok, range: [100, 400], pullTarget: "accent" as never })).toThrow(/pullTarget/);
    for (const roughness of [-0.1, 1.1]) expect(() => film({ ...ok, range: [100, 400], roughness })).toThrow(/roughness/);
    expect(() => film({ ...ok, range: [100, 400], tone: Number.NaN })).toThrow(/tone/);
  });

  it("keeps a reversed range: thickness then falls as param rises", () => {
    expect(film({ ...ok, range: [400, 100] }).film!.range).toEqual([400, 100]);
  });

  it("the conductor's phase is the note's check value: about 49 degrees at 549 nm on steel's oxide", () => {
    expect(deg(filmPhase(2.343, "metal", 549))).toBeCloseTo(49.3, 1);
  });

  it("the dielectric's phase comes from the two interfaces' order of index", () => {
    // Air, film 1.3, base 1.5: both reflections flip, so they cancel.
    expect(deg(filmPhase(1.3, "dielectric", 550))).toBeCloseTo(0, 6);
    // Air, film 2.0, base 1.5: only the first flips.
    expect(deg(filmPhase(2, "dielectric", 550))).toBeCloseTo(180, 6);
  });

  it("a flat reflectance sums to white of luminance 1 over the film's taps", () => {
    const lut = spectrumLut();
    const white = spectrumWhite();
    const sum = [0, 0, 0];
    const step = (lut.length / 3 - 1) / (FILM_TAPS - 1);
    for (let i = 0; i < FILM_TAPS; i++) for (let k = 0; k < 3; k++) sum[k]! += (lut[i * step * 3 + k]! * white[k]!) / filmLineSum();
    expect(0.2126 * sum[0]! + 0.7152 * sum[1]! + 0.0722 * sum[2]!).toBeCloseTo(1, 10);
    // Neutral to within 1% per channel: the taps are every second line of the table the white balance was made from.
    for (const v of sum) expect(Math.abs(v - 1)).toBeLessThan(0.01);
  });

  it("the shade pass compiles the film only on a page with a film, and the spectrum once beside foil", () => {
    const key = engine.lights.key({ dir: [0.5, 0, 0.87], level: 0.8 });
    const plain = shadeSource([engine.materials.matte()], [key], true);
    expect(plain).not.toMatch(/#define PK_FILM|vec3 filmSpec\(|PK_SPECTRUM_LUT/);
    const withFilm = shadeSource([engine.materials.matte(), film({ ...ok, range: [100, 400] })], [key], true);
    expect(withFilm).toMatch(/#define PK_FILM\n/);
    expect(withFilm).toMatch(/vec3 filmSpec\(MatOut m/);
    expect(withFilm).not.toMatch(/#define PK_GRATING\n/);
    const both = shadeSource([film({ ...ok, range: [100, 400] }), foil({ spacing: 1.5, pull: 0.3, pullTarget: "nearest" })], [key], true);
    expect(both.match(/const vec3 PK_SPECTRUM_LUT\[81\]/g)).toHaveLength(1);
  });
});
