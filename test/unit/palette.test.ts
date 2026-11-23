import { describe, expect, it } from "vitest";
import {
  buildRamp,
  kelvinToLinear,
  linearToOklab,
  linearToOklch,
  mixOklab,
  oklchToLinear,
  parseCssColor,
  rampAt,
  rampAway,
  tintToward,
  type Vec3,
} from "../../src/engine/palette.ts";
import { denim } from "../../src/engine/materials/denim.ts";
import { glass } from "../../src/engine/materials/glass.ts";
import { matte } from "../../src/engine/materials/matte.ts";
import { paper } from "../../src/engine/materials/paper.ts";
import { sheen } from "../../src/engine/materials/sheen.ts";

const L = (c: Vec3) => linearToOklch(c)[0];
const close = (a: Vec3, b: Vec3, eps = 1e-6) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, -Math.log10(eps)));

describe("palette", () => {
  const ground = oklchToLinear(0.98, 0.01, 90);
  const ink = oklchToLinear(0.15, 0.02, 260);

  it("oklch round trip", () => {
    const [l, c, h] = linearToOklch(oklchToLinear(0.7, 0.1, 40));
    expect(Math.abs(l - 0.7)).toBeLessThan(1e-4);
    expect(Math.abs(c - 0.1)).toBeLessThan(1e-4);
    expect(Math.abs(h - 40)).toBeLessThan(1e-4);
  });

  it("gamut clip reduces chroma, keeps lightness and hue", () => {
    // oklch(0.7 0.4 140) is far outside sRGB.
    const c = oklchToLinear(0.7, 0.4, 140);
    for (const v of c) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    const [l, ch, h] = linearToOklch(c);
    expect(Math.abs(l - 0.7)).toBeLessThan(2e-3);
    expect(Math.abs(h - 140)).toBeLessThan(0.5);
    expect(ch).toBeLessThan(0.4);
    expect(ch).toBeGreaterThan(0.1);
  });

  it("ramp ends are ground and ink", () => {
    const r = buildRamp(ground, ink, [oklchToLinear(0.6, 0.1, 30)]);
    close(r.ground, ground);
    close(r.ink, ink);
    close(r.stops[0], ground);
    close(r.stops[4], ink);
  });

  it("accents sorted by lightness", () => {
    const accents = [oklchToLinear(0.4, 0.1, 30), oklchToLinear(0.8, 0.1, 140), oklchToLinear(0.6, 0.1, 250)];
    const r = buildRamp(ground, ink, accents);
    expect(L(r.stops[1])).toBeCloseTo(0.8, 3);
    expect(L(r.stops[2])).toBeCloseTo(0.6, 3);
    expect(L(r.stops[3])).toBeCloseTo(0.4, 3);
    expect(L(r.stops[1])).toBeGreaterThan(L(r.stops[2]));
    expect(L(r.stops[2])).toBeGreaterThan(L(r.stops[3]));
    // A dark ground runs the other way: stops climb toward the light ink.
    const flipped = buildRamp(ink, ground, accents);
    expect(L(flipped.stops[1])).toBeCloseTo(0.4, 3);
    expect(L(flipped.stops[3])).toBeCloseTo(0.8, 3);
  });

  it("one accent fills two gaps", () => {
    const accent = oklchToLinear(0.6, 0.12, 30);
    const r = buildRamp(ground, ink, [accent]);
    close(r.stops[2], accent);
    close(r.stops[1], mixOklab(ground, accent, 0.5));
    close(r.stops[3], mixOklab(accent, ink, 0.5));
    // No accents: three even OKLab steps from ground to ink.
    const bare = buildRamp(ground, ink, []);
    close(bare.stops[1], mixOklab(ground, ink, 0.25));
    close(bare.stops[2], mixOklab(ground, ink, 0.5));
    close(bare.stops[3], mixOklab(ground, ink, 0.75));
  });

  it("more than three accents is an error", () => {
    const a = oklchToLinear(0.5, 0.1, 30);
    expect(() => buildRamp(ground, ink, [a, a, a, a])).toThrow(/at most 3 accents/);
  });

  it("kelvin 6500 is near white", () => {
    const c = kelvinToLinear(6500);
    for (const v of c) expect(v).toBeGreaterThan(0.95);
    expect(Math.max(...c)).toBeCloseTo(1, 6);
  });

  it("kelvin 2700 is warm", () => {
    const [r, g, b] = kelvinToLinear(2700);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    expect(Math.max(r, g, b)).toBeCloseTo(1, 6);
  });

  // Phase 2 heat colour (behaviour 15): kelvinToLinear reaches down to the Draper point, 798 K.
  it("kelvin from 1667 up is unchanged: every existing bar's light stays where it was", () => {
    // Captured from kelvinToLinear before the extension below 1667 (2026-11-17), compared bit for bit.
    const before: [number, Vec3][] = [
      [1667, [1, 0.17575376418828795, 0]],
      [1800, [1, 0.20728729134489213, 0]],
      [2000, [1, 0.25622119541729294, 0.007922987864222368]],
      [2222, [1, 0.3096710554830969, 0.031006854374971613]],
      [2700, [1, 0.4172658754875295, 0.10000857389876255]],
      [3000, [1, 0.478525613655326, 0.15431674288059444]],
      [4000, [1, 0.6529515389309744, 0.3770110005145376]],
      [4500, [1, 0.7421308342417237, 0.4924830974728531]],
      [5000, [1, 0.8300928441654729, 0.6131940697625651]],
      [6504, [0.9989813845633796, 1, 0.9990972482863749]],
      [7000, [0.894198307236208, 0.9341401476846284, 1]],
      [10000, [0.587340032761263, 0.7207970959092561, 1]],
      [25000, [0.3521988228843218, 0.5280294974862993, 1]],
    ];
    for (const [k, c] of before) expect(kelvinToLinear(k)).toEqual(c);
    expect(kelvinToLinear(30000)).toEqual(kelvinToLinear(25000));
  });

  it("kelvin 798 is a dull red: red-dominant, green under 0.2 of red", () => {
    const [r, g, b] = kelvinToLinear(798);
    expect(r).toBe(1);
    expect(g).toBeLessThan(0.2 * r);
    expect(b).toBeLessThan(0.2 * r);
    // Redder than the old floor at 1667 K, so the extension is real and not the old clamp.
    expect(g).toBeLessThan(kelvinToLinear(1667)[1]);
    // Below the Draper point the input is clamped, as above 25000.
    expect(kelvinToLinear(500)).toEqual(kelvinToLinear(798));
  });

  it("kelvin is continuous at 1667: the Planck integral meets the Kang fit within OKLab 0.01", () => {
    const lab = (k: number) => linearToOklab(kelvinToLinear(k));
    expect(Math.hypot(...lab(1667).map((v, i) => v - lab(1667 - 1e-9)[i]!))).toBeLessThan(0.01);
  });

  it("heat colour walks from red toward yellow-white as kelvin rises, largest channel 1", () => {
    let last = -1;
    for (let k = 798; k <= 6000; k += 7) {
      const [r, g, b] = kelvinToLinear(k);
      expect(Math.max(r, g, b)).toBeCloseTo(1, 12);
      expect(Math.min(r, g, b)).toBeGreaterThanOrEqual(0);
      expect(g / r).toBeGreaterThanOrEqual(last);
      last = g / r;
    }
    expect(kelvinToLinear(1200)[1]).toBeGreaterThan(kelvinToLinear(900)[1]);
  });

  it("tintToward is an OKLab mix by amount", () => {
    const warm = kelvinToLinear(2700);
    close(tintToward(warm, ink, 0), warm);
    close(tintToward(warm, ink, 1), ink);
    close(tintToward(warm, ink, 0.3), mixOklab(warm, ink, 0.3));
  });

  it("parseCssColor reads every computed form", () => {
    // 51/255 = 0.2 encoded; linear 0.0331048.
    close(parseCssColor("rgb(51, 102, 204)"), parseCssColor("color(srgb 0.2 0.4 0.8)"), 1e-6);
    close(parseCssColor("rgba(51, 102, 204, 0.5)"), parseCssColor("rgb(51 102 204)"), 1e-6);
    expect(parseCssColor("rgb(51, 102, 204)")[0]).toBeCloseTo(0.0331048, 6);
    close(parseCssColor("oklch(0.7 0.1 40)"), oklchToLinear(0.7, 0.1, 40), 1e-9);
    close(parseCssColor("oklch(70% 0.1 40deg / 0.5)"), oklchToLinear(0.7, 0.1, 40), 1e-9);
    const lab = parseCssColor("oklab(0.7 0.0766 0.0643)");
    const [l, c, h] = linearToOklch(lab);
    expect(l).toBeCloseTo(0.7, 4);
    expect(c).toBeCloseTo(Math.hypot(0.0766, 0.0643), 4);
    expect(h).toBeCloseTo((Math.atan2(0.0643, 0.0766) * 180) / Math.PI, 2);
    close(parseCssColor("color(srgb-linear 0.1 0.2 0.3)"), [0.1, 0.2, 0.3], 1e-9);
    // Out of gamut: clipped per channel as the browser paints, not chroma-reduced.
    const vivid = parseCssColor("oklch(0.7 0.25 30)");
    expect(vivid[0]).toBe(1);
    expect(vivid[1]).toBeLessThan(oklchToLinear(0.7, 0.25, 30)[1] - 0.01);
    close(parseCssColor("color(srgb 1.2 -0.1 0.5)"), [1, 0, parseCssColor("color(srgb 0 0 0.5)")[2]], 1e-9);
    expect(() => parseCssColor("lab(50 20 30)")).toThrow(/unsupported/);
  });

  it("rampAt walks the five stops: exact on a stop, an OKLab mix between", () => {
    const r = buildRamp(ground, ink, [oklchToLinear(0.6, 0.12, 40)]);
    [0, 0.25, 0.5, 0.75, 1].forEach((t, i) => expect(rampAt(r, t)).toEqual(r.stops[i]));
    expect(rampAt(r, 0)).toEqual(r.ground);
    expect(rampAt(r, 1)).toEqual(r.ink);
    close(rampAt(r, 0.375), mixOklab(r.stops[1], r.stops[2], 0.5));
    expect(rampAt(r, -1)).toEqual(r.ground);
    expect(rampAt(r, 2)).toEqual(r.ink);
    expect(() => rampAt(r, Number.NaN)).toThrow(RangeError);
    // A fresh copy: changing it never changes the ramp.
    rampAt(r, 0)[0] = 9;
    expect(r.stops[0][0]).not.toBe(9);
  });

  it("every toned material resolves its default tone to the ground exactly, and its tone to the ramp", () => {
    const r = buildRamp(ground, ink, [oklchToLinear(0.6, 0.12, 40)]);
    const made = [matte(), paper(), denim(), sheen({ roughness: 0.3, anisotropy: 0.5 }), glass({ frost: 0.1 })];
    for (const m of made) {
      expect(m.resolve, m.id).toBeDefined();
      expect(m.resolve!(r).tone, m.id).toEqual(r.ground);
      expect(m.glsl, m.id).toContain("matBase(s, u_$_tone)");
    }
    expect(matte({ tone: 0.5 }).resolve!(r).tone).toEqual(r.stops[2]);
    expect(paper({ tone: 0.3 }).resolve!(r).tone).toEqual(rampAt(r, 0.3));
    expect(matte({ tone: 4 }).resolve!(r).tone).toEqual(r.ink);
    expect(() => matte({ tone: Number.NaN })).toThrow(RangeError);
  });

  it("rampAway is the neighbouring stop farther from the position: stop 1 at 0, never the position's own stop", () => {
    const r = buildRamp(ground, ink, [oklchToLinear(0.6, 0.12, 40)]);
    expect(rampAway(r, 0)).toEqual(r.stops[1]);
    expect(rampAway(r, 1)).toEqual(r.stops[3]);
    // On stop 1 (one accent: halfway from the ground to the accent), the accent is farther than the ground.
    const d = (a: Vec3, b: Vec3) => Math.hypot(...linearToOklab(a).map((v, i) => v - linearToOklab(b)[i]!));
    const far = d(r.stops[0], r.stops[1]) > d(r.stops[2], r.stops[1]) ? r.stops[0] : r.stops[2];
    expect(rampAway(r, 0.25)).toEqual(far);
    for (const t of [0, 0.1, 0.25, 0.4, 0.5, 0.75, 0.9, 1]) expect(d(rampAway(r, t), rampAt(r, t)), `t ${t}`).toBeGreaterThan(0);
  });

  it("every toned material resolves its default variation target to stop 1, as before tones", () => {
    const r = buildRamp(ground, ink, [oklchToLinear(0.6, 0.12, 40)]);
    for (const m of [matte(), paper(), denim(), sheen({ roughness: 0.3, anisotropy: 0.5 }), glass({ frost: 0.1 })]) expect(m.resolve!(r).away, m.id).toEqual(r.stops[1]);
    expect(matte({ tone: 0.25 }).resolve!(r).away).not.toEqual(r.stops[1]);
  });
});
