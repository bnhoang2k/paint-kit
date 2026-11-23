// Shadows and the shadow law (Phase 2 Task 7). A light with a `shadow` option casts a shadow from the sheet's height
// in the shading pass; the relight check's shadow law reads it (src/checks/relight.ts, header "shadow").
//   1. test/pages/shadow.html (a card raised off a desk under a key light that casts) passes the shadow law at seeds 1
//      to 3, light and dark; so does its lamp variant (`?lamp=1`) and its card on the bare ground with the ground
//      shadow on (`?bare=1&ground=1`).
//   2. Each planted fault on its copy fails the law, light and dark, seeds 1 to 3, for its own measured reason:
//      shadow-baked (the shadow held at the light's declared place) by the shift (b), under relight.shadowShift;
//      shadow-same-side (the march runs away from the light) by the side (a) and the shift (b); shadow-spec-only (the
//      shadow attenuates only the highlight) by its depth, under relight.shadowDark.
//   3. The floor: a flat sheet (`?flat=1`) with a shadow light darkens under relight.shadowNone of the frame and the
//      law reports that nothing is raised (partial, never a pass or a fail).
//   4. Text ink is not height (Review Focus 5): test/pages/shadow-ink.html, whose only marks are `data-paint-ink`
//      text, reads a mask share under relight.shadowNone; its fault shadow-reads-ink (the march reads ink as height)
//      reads at or over it and fails.
//   5. A raised sheet that blocks nothing (test/pages/lights-shadow.html: lights.html's warp under a high lamp that
//      casts) reads partial: there is no shadow to judge, and none is drawn.
//   6. The bare ground: by default the shadow leaves coverage-0 ground exactly as it was; with `ground: true` it
//      darkens some of it and lightens no pixel anywhere.
//   7. The bare ground with `shadow.ground` off (`?bare=1`): the shadow law's oracle lets no coverage-0 texel receive
//      the shadow, as the shading pass draws none there, so the card on the bare ground reads partial (the sheet's
//      height blocks under relight.shadowNone of what can receive it: no shadow to judge), never a fail; its planted
//      fault shadow-ground-leak (the engine shades the bare ground anyway) fails, by darkening where nothing blocks.
//   8. Every page with no `shadow` option renders pixel-identical to the build before shadows: frame-baseline.test.ts
//      with FRAME_BASELINE=<frames of 0d67158>. Not repeated here.
// Readings at 960 x 600, dpr 1, t 2, text hidden: the relight check's own conditions (checkScheme).
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveTarget } from "../../src/checks/gate.ts";
import { closeBrowsers, openPage, type Rgba } from "../../src/checks/harness.ts";
import { checkScheme } from "../../src/checks/relight.ts";
import { serveRoot } from "../../src/checks/serve.ts";
import { threshold } from "../../src/checks/threshold.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");
const PAGE = "test/pages/shadow.html";
const INK = "test/pages/shadow-ink.html";
const LIGHTS = "test/pages/lights-shadow.html";
let server: { url: string; close(): Promise<void> };

beforeAll(async () => {
  server = await serveRoot(ROOT);
});
afterAll(async () => {
  await server?.close();
  await closeBrowsers();
});

const th = (n: string) => threshold(n, null);
const SCHEMES = ["light", "dark"] as const;
const CASES = SCHEMES.flatMap((scheme) => [1, 2, 3].map((seed) => ({ scheme, seed, name: `${scheme} seed ${seed}` })));

/** The shadow law's own verdict on a page in one scheme at one seed: its line and status, and every measured key. */
async function shadowLaw(rel: string, scheme: "light" | "dark", seed: number) {
  const [file, query] = rel.split("?");
  const t = resolveTarget(path.join(ROOT, file!), {}, server.url);
  if (query) t.url += `?${query}`;
  const part = await checkScheme(t, { seed }, scheme);
  const line = part.line.split(/; (?=[a-z]+ (?:pass|FAIL|PARTIAL) )/).find((s) => s.startsWith("shadow ")) ?? "";
  const status = /^shadow (pass|FAIL|PARTIAL)/.exec(line)?.[1] ?? "missing";
  const m = Object.fromEntries(Object.entries(part.measured).filter(([k]) => k.startsWith("shadow.")));
  console.log(`SHADOW ${rel} ${scheme} seed ${seed}: ${line}\n  ${JSON.stringify(m)}`);
  return { status, line, m };
}

describe("shadow: the law passes an honest shadow", () => {
  it.each(CASES)("shadow.html (key) passes the shadow law: $name", async ({ scheme, seed }) => {
    const r = await shadowLaw(PAGE, scheme, seed);
    expect(r.status, r.line).toBe("pass");
    for (const k of [0, 1]) {
      expect(r.m[`shadow.side.${k}`]).toBeGreaterThan(0);
      expect(r.m[`shadow.share.${k}`]).toBeGreaterThanOrEqual(th("relight.shadowNone"));
      expect(r.m[`shadow.depth.${k}`]).toBeGreaterThan(th("relight.shadowDark"));
    }
    expect(r.m["shadow.shift"]).toBeGreaterThanOrEqual(th("relight.shadowShift"));
  });

  it.each(SCHEMES)("shadow.html?lamp=1 (a lamp casts) passes the shadow law: %s seed 1", async (scheme) => {
    const r = await shadowLaw(`${PAGE}?lamp=1`, scheme, 1);
    expect(r.status, r.line).toBe("pass");
  });

  it.each(SCHEMES)("shadow.html?bare=1&ground=1 (the card on the bare ground, the ground shadow on) passes: %s seed 1", async (scheme) => {
    const r = await shadowLaw(`${PAGE}?bare=1&ground=1`, scheme, 1);
    expect(r.status, r.line).toBe("pass");
  });
});

const FAULTS = ["shadow-baked", "shadow-same-side", "shadow-spec-only"].flatMap((fault) => CASES.map((c) => ({ ...c, fault })));

describe("shadow: the planted faults fail the law for their own reason", () => {
  it.each(FAULTS)("$fault fails the shadow law: $name", async ({ fault, scheme, seed }) => {
    const r = await shadowLaw(`test/faults/${fault}/index.html`, scheme, seed);
    expect(r.status, r.line).toBe("FAIL");
    if (fault === "shadow-baked") expect(r.m["shadow.shift"]).toBeLessThan(th("relight.shadowShift"));
    if (fault === "shadow-same-side") {
      expect(Math.min(r.m["shadow.side.0"]!, r.m["shadow.side.1"]!)).toBeLessThanOrEqual(0);
      expect(r.m["shadow.shift"]).toBeLessThan(th("relight.shadowShift"));
    }
    if (fault === "shadow-spec-only") expect(Math.max(r.m["shadow.depth.0"]!, r.m["shadow.depth.1"]!)).toBeLessThanOrEqual(th("relight.shadowDark"));
  });
});

describe("shadow: no shadow where nothing is raised", () => {
  it.each(SCHEMES)("a flat sheet with a shadow light darkens under relight.shadowNone and reads partial: %s seed 1", async (scheme) => {
    const r = await shadowLaw(`${PAGE}?flat=1`, scheme, 1);
    expect(r.m["shadow.heightRange"]).toBeLessThanOrEqual(th("relight.minRelief"));
    expect(r.m["shadow.share"]).toBeLessThan(th("relight.shadowNone"));
    expect(r.status, r.line).toBe("PARTIAL");
  });

  it.each(SCHEMES)("text ink casts no shadow: shadow-ink.html reads a mask share under relight.shadowNone: %s seed 1", async (scheme) => {
    const r = await shadowLaw(INK, scheme, 1);
    expect(r.m["shadow.share"]).toBeLessThan(th("relight.shadowNone"));
    expect(r.status, r.line).toBe("PARTIAL");
  });

  it.each(CASES)("the planted fault shadow-reads-ink (ink read as height) fails the floor: $name", async ({ scheme, seed }) => {
    const r = await shadowLaw("test/faults/shadow-reads-ink/index.html", scheme, seed);
    expect(r.m["shadow.share"]).toBeGreaterThanOrEqual(th("relight.shadowNone"));
    expect(r.status, r.line).toBe("FAIL");
  });

  it.each(SCHEMES)("a raised sheet that blocks nothing (lights-shadow.html) reads partial: %s seed 1", async (scheme) => {
    const r = await shadowLaw(LIGHTS, scheme, 1);
    expect(r.m["shadow.heightRange"]).toBeGreaterThan(th("relight.minRelief"));
    expect(r.m["shadow.share"]).toBeLessThan(th("relight.shadowNone"));
    expect(r.status, r.line).toBe("PARTIAL");
  });
});

describe("shadow: the bare ground with the ground shadow off", () => {
  it.each(CASES)("shadow.html?bare=1 (no ground shadow, so none drawn on the bare ground) reads partial, never a fail: $name", async ({ scheme, seed }) => {
    const r = await shadowLaw(`${PAGE}?bare=1`, scheme, seed);
    for (const k of [0, 1]) expect(r.m[`shadow.predicted.${k}`]).toBeLessThan(th("relight.shadowNone"));
    expect(r.m["shadow.share"]).toBeLessThan(th("relight.shadowNone"));
    expect(r.status, r.line).toBe("PARTIAL");
  });

  it.each(CASES)("the planted fault shadow-ground-leak (the bare ground shaded with the ground shadow off) fails: $name", async ({ scheme, seed }) => {
    const r = await shadowLaw("test/faults/shadow-ground-leak/index.html?bare=1", scheme, seed);
    expect(r.m["shadow.share"]).toBeGreaterThanOrEqual(th("relight.shadowNone"));
    expect(r.status, r.line).toBe("FAIL");
  });
});

const lin = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const lum = (f: Rgba, p: number) => 0.2126 * lin(f.data[p * 4]!) + 0.7152 * lin(f.data[p * 4 + 1]!) + 0.0722 * lin(f.data[p * 4 + 2]!);

/** shadow.html on the bare ground with the shadow on and off, and which frame pixels are bare ground (coverage 0). */
async function bareFrames(ground: boolean, dark: boolean) {
  const h = await openPage(`${server.url}/${PAGE}?bare=1${ground ? "&ground=1" : ""}`, { dpr: 1, width: 960, height: 600, t: 2, seed: 1, dark });
  try {
    const declared = (await h.hook<{ props: Record<string, unknown> }[]>("__paint.lights()"))[0]!.props.shadow;
    const on = await h.shot();
    await h.hook("__paint.setLight(0, { shadow: null })");
    const off = await h.shot();
    await h.hook(`__paint.setLight(0, { shadow: ${JSON.stringify(declared)} })`);
    const g = await h.hook<{ coverage: number[]; w: number; h: number }>("(() => { const s = __paint.stats(); return { ...__paint.sheetRegion(0, 0, innerWidth, innerHeight), w: s.sheetW, h: s.sheetH }; })()");
    expect(h.errors).toEqual([]);
    const bare = new Uint8Array(on.w * on.h);
    for (let p = 0; p < bare.length; p++) {
      const t = Math.floor((Math.floor(p / on.w) * g.h) / on.h) * g.w + Math.floor(((p % on.w) * g.w) / on.w);
      bare[p] = g.coverage[t]! <= 0 ? 1 : 0;
    }
    return { on, off, bare };
  } finally {
    await h.close();
  }
}

describe("shadow: the bare ground", () => {
  it.each([false, true])("by default the shadow leaves the bare ground exactly as it was (dark=%s)", async (dark) => {
    const { on, off, bare } = await bareFrames(false, dark);
    let n = 0;
    let changed = 0;
    for (let p = 0; p < bare.length; p++) {
      if (!bare[p]) continue;
      n++;
      for (let k = 0; k < 3; k++) if (on.data[p * 4 + k] !== off.data[p * 4 + k]) changed++;
    }
    console.log(`SHADOW ground off dark=${dark}: ${n} bare-ground pixels, ${changed} channels changed by the shadow`);
    expect(n).toBeGreaterThan(0);
    expect(changed).toBe(0);
  });

  it.each([false, true])("with ground: true the shadow darkens some bare ground and lightens no pixel (dark=%s)", async (dark) => {
    const { on, off, bare } = await bareFrames(true, dark);
    let darker = 0;
    let lighter = 0;
    for (let p = 0; p < bare.length; p++) {
      const a = lum(on, p);
      const b = lum(off, p);
      if (a > b) lighter++;
      if (bare[p] && b > 0 && (b - a) / b > th("relight.shadowDark")) darker++;
    }
    console.log(`SHADOW ground on dark=${dark}: ${darker} bare-ground pixels darker by over relight.shadowDark, ${lighter} pixels lighter`);
    expect(darker).toBeGreaterThan(0);
    expect(lighter).toBe(0);
  });
});
