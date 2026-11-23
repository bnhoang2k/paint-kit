// The spectrum helper: wavelengths and temperatures to linear colour, pulled toward the page's ramp
// (Phase 2 behaviours 13 and 15).
import { describe, expect, it } from "vitest";
import * as engine from "../../src/engine/index.ts";
import { GLSL_SPECTRUM } from "../../src/engine/glsl/spectrum.ts";
import {
  buildRamp,
  kelvinToLinear,
  linearToOklab,
  linearToOklch,
  mixOklab,
  oklchToLinear,
  xyzToLinear,
  type Ramp,
  type Vec3,
} from "../../src/engine/palette.ts";
import { CIE_1931_2DEG, blackbodyXyz, pullToRamp, spectrumLut, wavelengthToLinear } from "../../src/engine/spectrum.ts";

const close = (a: Vec3, b: Vec3, eps = 1e-6) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, -Math.log10(eps)));
const okDist = (a: Vec3, b: Vec3) => {
  const p = linearToOklab(a);
  const q = linearToOklab(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};
const hueGap = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

// Two palettes a page might carry: a warm paper one and a cool night one.
const warm: Ramp = buildRamp(oklchToLinear(0.95, 0.03, 85), oklchToLinear(0.2, 0.03, 40), [
  oklchToLinear(0.75, 0.12, 60),
  oklchToLinear(0.55, 0.14, 25),
]);
const cool: Ramp = buildRamp(oklchToLinear(0.25, 0.05, 250), oklchToLinear(0.92, 0.02, 200), [
  oklchToLinear(0.6, 0.12, 160),
  oklchToLinear(0.45, 0.12, 290),
]);

describe("spectrum", () => {
  it("the CIE 1931 table runs 380 to 780 nm at 5 nm, with the published anchor values", () => {
    expect(CIE_1931_2DEG.length).toBe(81);
    CIE_1931_2DEG.forEach((row, i) => expect(row[0]).toBe(380 + 5 * i));
    // y-bar is the photopic luminous efficiency: 1 at 555 nm, its peak.
    const at = (nm: number) => CIE_1931_2DEG[(nm - 380) / 5]!;
    expect(at(555)[2]).toBe(1);
    expect(Math.max(...CIE_1931_2DEG.map((r) => r[2]))).toBe(1);
    // Spot rows from CIE 018:2019 dataset (doi 10.25039/CIE.DS.xvudnb9b).
    expect(at(380)).toEqual([380, 0.001368, 0.000039, 0.006450001]);
    expect(at(600)).toEqual([600, 1.0622, 0.631, 0.0008]);
    expect(at(780)).toEqual([780, 0.00004150994, 0.00001499, 0]);
  });

  it("wavelengthToLinear: 550 nm is green-dominant, 450 nm blue-dominant, 620 nm red-dominant", () => {
    const [r5, g5, b5] = wavelengthToLinear(550);
    expect(g5).toBeGreaterThan(r5);
    expect(g5).toBeGreaterThan(b5);
    const [r4, g4, b4] = wavelengthToLinear(450);
    expect(b4).toBeGreaterThan(r4);
    expect(b4).toBeGreaterThan(g4);
    const [r6, g6, b6] = wavelengthToLinear(620);
    expect(r6).toBeGreaterThan(g6);
    expect(r6).toBeGreaterThan(b6);
  });

  it("wavelengthToLinear is unclipped, linear between samples, and dark outside 380 to 780 nm", () => {
    // Spectral colours lie outside sRGB: 500 nm needs negative red.
    expect(wavelengthToLinear(500)[0]).toBeLessThan(0);
    close(wavelengthToLinear(552.5), wavelengthToLinear(550).map((v, i) => (v + wavelengthToLinear(555)[i]!) / 2) as Vec3, 1e-12);
    expect(wavelengthToLinear(379)).toEqual([0, 0, 0]);
    expect(wavelengthToLinear(781)).toEqual([0, 0, 0]);
    // A unit-power line at 555 nm has Y = 1: its linear sRGB has relative luminance 1.
    const [r, g, b] = wavelengthToLinear(555);
    expect(0.2126729 * r + 0.7151522 * g + 0.072175 * b).toBeCloseTo(1, 4);
  });

  it("spectrumLut holds the 81 samples as RGB triples", () => {
    const lut = spectrumLut();
    expect(lut).toBeInstanceOf(Float32Array);
    expect(lut.length).toBe(81 * 3);
    for (let i = 0; i < 81; i++) {
      const c = wavelengthToLinear(380 + 5 * i);
      for (let k = 0; k < 3; k++) expect(lut[3 * i + k]).toBe(Math.fround(c[k]!));
    }
  });

  it("the Planck integral agrees with the Kang fit where both hold (1667 to 4000 K)", () => {
    // The two are independent: CIE table plus Planck's law, and Kang et al.'s fit of the locus.
    const planck = (k: number): Vec3 => {
      const c = xyzToLinear(blackbodyXyz(k)).map((v) => Math.max(0, v)) as Vec3;
      const m = Math.max(...c);
      return c.map((v) => v / m) as Vec3;
    };
    for (const k of [1667, 2000, 2500, 3000, 3500, 4000]) expect(okDist(planck(k), kelvinToLinear(k))).toBeLessThan(0.01);
    expect(blackbodyXyz(3000)[1]).toBe(1);
  });

  it("pull at amount 0 returns the colour as given", () => {
    const c: Vec3 = [0.4, 0.2, 0.1];
    expect(pullToRamp(c, warm, 0, "nearest")).toEqual(c);
    expect(pullToRamp(c, warm, 0, "ground")).toEqual(c);
    // An out-of-gamut spectral colour too: amount 0 is no pull at all.
    const line = wavelengthToLinear(500);
    expect(pullToRamp(line, warm, 0, "nearest")).toEqual(line);
  });

  it("pull at amount 1, nearest: a ramp stop, the one nearest in OKLab", () => {
    for (const c of [wavelengthToLinear(470), wavelengthToLinear(530), wavelengthToLinear(610), [0.5, 0.5, 0.5] as Vec3]) {
      const out = pullToRamp(c, warm, 1, "nearest");
      const dists = warm.stops.map((s) => okDist(c, s));
      const nearest = warm.stops[dists.indexOf(Math.min(...dists))]!;
      close(out, nearest, 1e-6);
    }
  });

  it("pull at amount 1, ground: the ground's hue at the colour's own lightness", () => {
    const [, , gh] = linearToOklch(warm.ground);
    for (const c of [wavelengthToLinear(470), wavelengthToLinear(530), [0.3, 0.6, 0.2] as Vec3]) {
      const out = pullToRamp(c, warm, 1, "ground");
      const [L, , h] = linearToOklch(out);
      expect(hueGap(h, gh)).toBeLessThan(0.5);
      expect(Math.abs(L - Math.min(1, linearToOklch(c)[0]))).toBeLessThan(2e-3);
    }
  });

  it("pull follows the ramp", () => {
    const c = wavelengthToLinear(520);
    for (const target of ["nearest", "ground"] as const) {
      const full = pullToRamp(c, warm, 1, target);
      // The amount is a mix in OKLab from the colour toward the target: none, part, all.
      expect(pullToRamp(c, warm, 0, target)).toEqual(c);
      close(pullToRamp(c, warm, 0.5, target), mixOklab(c, full, 0.5), 1e-3);
      expect(okDist(pullToRamp(c, warm, 0.25, target), c)).toBeLessThan(okDist(pullToRamp(c, warm, 0.75, target), c));
      // A new ramp (the page's tokens changed) changes the result.
      expect(okDist(pullToRamp(c, warm, 0.5, target), pullToRamp(c, cool, 0.5, target))).toBeGreaterThan(0.02);
    }
  });

  it("pull clamps the amount to 0..1 and comes back in gamut", () => {
    const c = wavelengthToLinear(500);
    expect(pullToRamp(c, warm, -1, "nearest")).toEqual(pullToRamp(c, warm, 0, "nearest"));
    expect(pullToRamp(c, warm, 2, "ground")).toEqual(pullToRamp(c, warm, 1, "ground"));
    for (const v of pullToRamp(c, warm, 0.3, "nearest")) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe("spectrum GLSL", () => {
  it("the engine exports the helpers and the chunk", () => {
    expect(engine.GLSL_SPECTRUM).toBe(GLSL_SPECTRUM);
    expect(engine.pullToRamp).toBe(pullToRamp);
    expect(engine.wavelengthToLinear).toBe(wavelengthToLinear);
    expect(engine.spectrumLut).toBe(spectrumLut);
    expect(engine.CIE_1931_2DEG).toBe(CIE_1931_2DEG);
  });

  it("defines pk_spectrum and pk_pull once, guarded, over the shade pass's ramp uniforms", () => {
    expect(GLSL_SPECTRUM).toMatch(/\bvec3 pk_spectrum\(float nm\)/);
    expect(GLSL_SPECTRUM).toMatch(/\bvec3 pk_pull\(vec3 c, float amount, int target\)/);
    expect(GLSL_SPECTRUM).toMatch(/#ifndef PK_SPECTRUM\b[\s\S]*#define PK_SPECTRUM\b[\s\S]*#endif/);
    // It reads the ramp GLSL_OKLAB declares; it never declares its own colour uniforms.
    expect(GLSL_SPECTRUM).toMatch(/\buRamp\[/);
    expect(GLSL_SPECTRUM).toMatch(/\buGround\b/);
    expect(GLSL_SPECTRUM).not.toMatch(/\buniform\b/);
  });

  it("its table is spectrumLut, sample for sample", () => {
    const body = /vec3\[81\]\(([\s\S]*?)\);/.exec(GLSL_SPECTRUM)![1]!;
    const nums = [...body.matchAll(/vec3\(([^)]*)\)/g)].flatMap((m) => m[1]!.split(",").map(Number));
    const lut = spectrumLut();
    expect(nums.length).toBe(lut.length);
    nums.forEach((v, i) => expect(v).toBeCloseTo(lut[i]!, 6));
  });
});
