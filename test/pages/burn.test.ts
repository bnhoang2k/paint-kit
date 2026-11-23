// Behaviour tests for the burn field, the paper's scorch and the ember light on test/pages/burn.html (Phase 2
// Task 20; behaviours 16 to 18, and 21 for start() under reduced motion): the burned share never drops, paper the front
// has passed is darker than it was before, the ember light passes the tint law (and a front across the whole card reads
// partial), a resize keeps the burned state, a waiting burn shows a whole card until its start call (a second start is
// ignored), and under reduced motion the start call shows the end state. The tolerances here are test constants, each
// with its reason.
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CHECKS, resolveTarget } from "../../src/checks/gate.ts";
import { closeBrowsers, openPage, type OpenOpts, type PageHandle, type Rgba } from "../../src/checks/harness.ts";
import { checkScheme } from "../../src/checks/relight.ts";
import { serveRoot } from "../../src/checks/serve.ts";
import { threshold } from "../../src/checks/threshold.ts";
import { RAG_AMP } from "../../src/engine/fields/burn.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");
const W = 960;
const H = 600;
const FROZEN: OpenOpts = { dpr: 1, width: W, height: H };
/** The page's burn rag (burn.html): the front's largest shift from straight is RAG x RAG_AMP short-side units. */
const RAG = 0.6;
/** `__paint.sheet()`'s grid side. */
const GRID = 64;

let server: { url: string; close(): Promise<void> };
const url = (query = "") => `${server.url}/test/pages/burn.html${query}`;

beforeAll(async () => {
  server = await serveRoot(ROOT);
});

afterAll(async () => {
  await server?.close();
  await closeBrowsers();
});

async function withPage<T>(opts: OpenOpts, fn: (h: PageHandle) => Promise<T>, query = ""): Promise<T> {
  const h = await openPage(url(query), opts);
  try {
    expect(h.errors).toEqual([]);
    const r = await fn(h);
    // An error during the body (a resize, start(), setTime) counts too.
    expect(h.errors).toEqual([]);
    return r;
  } finally {
    await h.close();
  }
}

type Sheet = { w: number; h: number; coverage: number[]; param: number[] };
const sheet = (h: PageHandle) => h.hook<Sheet>("__paint.sheet()");
/** Share of the sheet's grid where the paper is gone (coverage under a half, the blend's own cut). */
const burnedShare = (s: Sheet) => s.coverage.filter((c) => c < 0.5).length / s.coverage.length;
const twoFrames = "new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))";
/**
 * Rec. 709 luma of the screenshot's 8-bit sRGB values at the grid cell (i, j), rows top down, as the sheet grid samples
 * it: 0..255, so one 8-bit step is 1.
 */
const luma8At = (f: Rgba, i: number, j: number) => {
  const x = Math.floor(((i + 0.5) * f.w) / GRID);
  const y = Math.floor(((j + 0.5) * f.h) / GRID);
  const p = (y * f.w + x) * 4;
  return 0.2126 * f.data[p]! + 0.7152 * f.data[p + 1]! + 0.0722 * f.data[p + 2]!;
};
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;

describe("burn page", () => {
  it("burn: burned share at t 1, 2, 3, 4, 5 never drops", async () => {
    const shares: number[] = [];
    await withPage({ ...FROZEN, t: 1 }, async (h) => {
      for (const t of [1, 2, 3, 4, 5]) {
        await h.hook(`__paint.setTime(${t})`);
        shares.push(burnedShare(await sheet(h)));
      }
    });
    console.log(`burned share at t 1..5: ${shares.map((s) => s.toFixed(4)).join(", ")}`);
    for (let k = 1; k < shares.length; k++) expect(shares[k], `t ${k + 1} after t ${k}`).toBeGreaterThanOrEqual(shares[k - 1]!);
    // The front moves: by t 5 some paper is gone (speed 0.15 x 5 s, less the 1.2 s band, is over half the short side).
    expect(shares[4]).toBeGreaterThan(shares[0]!);
  });

  it("burn: scorch band luminance below unburned paper", async () => {
    // The same pixels before and after the front passes them, with the ember at level 0, so neither place nor the
    // ember's light can stand in for scorch. Band cells at t 3 have param 0.15 to 0.85 (away from the front and the
    // hole's antialiased edge); at t 1 the front stood 0.3 short-side units lower, below every one of them.
    for (const dark of [false, true]) {
      const scheme = dark ? "dark" : "light";
      await withPage({ ...FROZEN, t: 3, dark }, async (h) => {
        await h.hook("__paint.setLight(1, { level: 0 })");
        const late = await sheet(h);
        const fLate = await h.shot();
        await h.hook("__paint.setTime(1)");
        const early = await sheet(h);
        const fEarly = await h.shot();
        const before: number[] = [];
        const after: number[] = [];
        for (let j = 0; j < GRID; j++)
          for (let i = 0; i < GRID; i++) {
            const k = j * GRID + i;
            if (late.coverage[k]! <= 0.5 || !(late.param[k]! > 0.15 && late.param[k]! < 0.85)) continue;
            if (early.coverage[k]! <= 0.5 || early.param[k] !== 0) continue;
            before.push(luma8At(fEarly, i, j));
            after.push(luma8At(fLate, i, j));
          }
        const drop = mean(before) - mean(after);
        console.log(`scorch (${scheme}): ${before.length} cells, 8-bit luma ${mean(before).toFixed(2)} before the front, ${mean(after).toFixed(2)} after: drop ${drop.toFixed(2)}`);
        // At t 3 the band is 0.15 x 1.2 = 0.18 short-side units deep across the sheet: hundreds of grid cells.
        expect(before.length, scheme).toBeGreaterThan(50);
        // Darker by more than one 8-bit step: the driver's ruling (Task 20 fix round 1, I3).
        expect(drop, scheme).toBeGreaterThan(1);
      });
    }
  });

  it("burn: tint passes with the ember light", async () => {
    const relightOn = async (query: string) => {
      const t = resolveTarget(path.join(ROOT, "test/pages/burn.html"), {}, server.url);
      t.url += query;
      const r = await CHECKS.find((c) => c.name === "relight")!.run(t, {});
      console.log(`burn.html${query}: ${r.line}\n${JSON.stringify(r.measured)}`);
      // The line reads "relight: light: ...; dark: ...": each scheme's part.
      return { r, parts: { light: r.line.split("; dark: ")[0]!, dark: r.line.split("; dark: ")[1] ?? "" } };
    };
    // A burn from a point: the ember lights a disc, and the tint law's circle (Light.region) has paper beyond it.
    const point = await relightOn("?from=point");
    for (const scheme of ["light", "dark"] as const) {
      expect(point.parts[scheme], scheme).toMatch(/tint pass/);
      expect(point.r.measured[`tint.hueGain.${scheme}`], scheme).toBeGreaterThan(0);
      expect(point.r.measured[`tint.chromaGain.${scheme}`], scheme).toBeGreaterThan(0);
    }
    // A front across the whole card, started 1 s early so that at the law's frozen time (2 s) the front stands 0.45
    // short-side units up: the circle holding its light then covers the whole frame, and nothing lies beyond it. That
    // is never a pass by default (Task 20 fix round 1, I2): partial, or a fail that also names the empty beyond.
    const bottom = await relightOn("?start=-1");
    for (const scheme of ["light", "dark"] as const) {
      expect(bottom.parts[scheme], scheme).toMatch(/tint (PARTIAL \(nothing beyond 1\.2 x|FAIL \(.*no pixel lies beyond 1\.2 x radius)/);
      expect(bottom.parts[scheme], scheme).not.toMatch(/tint pass/);
    }
  }, 120_000);

  // The burn law (Phase 2 Task 21), read alone (`checkScheme`'s `only`) in each scheme.
  const burnLaw = async (rel: string, seed: number, query = "") => {
    const t = resolveTarget(path.join(ROOT, rel), {}, server.url);
    t.url += query;
    const parts = [];
    for (const scheme of ["light", "dark"] as const) {
      const part = await checkScheme(t, { seed }, scheme, ["burn"]);
      console.log(`${rel}${query} seed ${seed} ${scheme}: ${part.line}`);
      parts.push(part);
    }
    return parts;
  };

  it.each([1, 2, 3])("burn law: burn.html passes at seed %i, light and dark", async (seed) => {
    for (const part of await burnLaw("test/pages/burn.html", seed)) {
      expect(part.status, `${part.scheme}: ${part.line}`).toBe("pass");
      expect(part.line).toMatch(/^burn pass \(\(a\) .*; \(b\) .*; \(c\) /);
    }
  }, 120_000);

  it("burn law: a burn from a point passes at seed 1, light and dark", async () => {
    for (const part of await burnLaw("test/pages/burn.html", 1, "?from=point")) expect(part.status, `${part.scheme}: ${part.line}`).toBe("pass");
  }, 120_000);

  // A card smaller than the frame (Task 21 fix round 1, I1): its edges on the ground are not the front, so the paper
  // ahead of the front that the ember lights is read by its distance from the front alone.
  it("burn law: a card on the ground passes at seed 1, light and dark", async () => {
    for (const part of await burnLaw("test/pages/burn.html", 1, "?card=1")) {
      expect(part.status, `${part.scheme}: ${part.line}`).toBe("pass");
      expect(part.measured["burn.ember.fade"]).toBeLessThan(threshold("relight.emberFade", null));
    }
  }, 120_000);

  // The torn burn: the torn front, the hot rim and the specks keep the burn law.
  it("burn law: a torn burn with a rim and specks passes at seed 1, light and dark", async () => {
    for (const part of await burnLaw("test/pages/burn.html", 1, "?card=1&torn=1")) expect(part.status, `${part.scheme}: ${part.line}`).toBe("pass");
  }, 120_000);

  // Where the front stands on the card at t 4.5: 0.15 x 4.5 = 0.675 short-side units up from the page's bottom edge.
  const TORN_T = 4.5;
  /** The card's columns and rows on the sheet's grid (burn.html's 0.53 x 0.9 card at 960 x 600), 2 cells in from its edges. */
  const CARD_COLS = [24, 40] as const;
  const CARD_ROWS = [5, 58] as const;
  /** The front's spread over the card, short-side units: the highest burned row of each column, highest less lowest. */
  const frontSpread = (s: Sheet) => {
    const tops: number[] = [];
    for (let i = CARD_COLS[0]; i <= CARD_COLS[1]; i++) {
      let top: number = CARD_ROWS[1];
      for (let j = CARD_ROWS[0]; j <= CARD_ROWS[1]; j++)
        if (s.coverage[j * GRID + i]! < 0.5) {
          top = j;
          break;
        }
      tops.push(top);
    }
    return ((Math.max(...tops) - Math.min(...tops)) * H) / GRID / Math.min(W, H);
  };
  it("burn: a torn front spreads across the card, and a front with no tear does not", async () => {
    const read = (query: string) => withPage({ ...FROZEN, t: TORN_T }, async (h) => frontSpread(await sheet(h)), query);
    const torn = await read("?card=1&torn=1");
    const plain = await read("?card=1");
    console.log(`front spread over the card at t ${TORN_T}: torn ${torn.toFixed(3)}, no tear ${plain.toFixed(3)} short-side units`);
    // The reference's front spreads 39% of the card's width at its narrowest: 0.21 short-side units on this 0.53 wide card.
    expect(torn).toBeGreaterThanOrEqual(0.21);
    expect(plain, "the planted fault: a front with no tear must not reach the reference's spread").toBeLessThan(0.21);
  }, 120_000);

  /** Luma of each pixel of a frame, 0..255. */
  const lumaOf = (f: Rgba) => Float32Array.from({ length: f.w * f.h }, (_, k) => 0.2126 * f.data[k * 4]! + 0.7152 * f.data[k * 4 + 1]! + 0.0722 * f.data[k * 4 + 2]!);
  /** Hot pixels (luma at least 170, brighter than any lit paper here) and the share of them within `near` px of a hole pixel. */
  const hotAtHole = (lit: Float32Array, off: Float32Array, w: number, h: number, near: number) => {
    const hole = (k: number) => off[k]! < 24; // ember off: the black char at the hole's edge (burn.html's dark ground is lighter)
    let hot = 0;
    let at = 0;
    for (let y = near; y < h - near; y++)
      for (let x = near; x < w - near; x++) {
        if (lit[y * w + x]! < 170) continue;
        hot++;
        let found = false;
        for (let dy = -near; dy <= near && !found; dy++) for (let dx = -near; dx <= near && !found; dx++) found = hole((y + dy) * w + x + dx);
        if (found) at++;
      }
    return { hot, share: hot ? at / hot : 0 };
  };
  it("burn: the hottest light sits on the hole's edge, and a band away from the hole fails the reading", async () => {
    const read = (query: string) =>
      withPage({ ...FROZEN, t: TORN_T, dark: true }, async (h) => {
        const lit = lumaOf(await h.shot());
        await h.hook("__paint.setLight(1, { level: 0 })");
        const off = lumaOf(await h.shot());
        return { ...hotAtHole(lit, off, W, H, 6), offHot: off.filter((v) => v >= 170).length };
      }, query);
    const rim = await read("?card=1&torn=1");
    const plain = await read("?card=1");
    console.log(`hot pixels: rim ${rim.hot} with ${(rim.share * 100).toFixed(1)}% within 6 px of the hole; no rim ${plain.hot}`);
    expect(rim.hot, "no pixel is hot").toBeGreaterThan(100);
    expect(rim.share, "the hot light does not sit on the hole's edge").toBeGreaterThanOrEqual(0.9);
    expect(rim.offHot, "the rim still glows with the ember at level 0").toBe(0);
    expect(plain.hot, "the planted fault: a page with no rim must have no hot edge").toBeLessThan(rim.hot / 10);
    // The reading's own planted fault: a hot band 20 px from the hole must not read as an edge.
    const fw = 80;
    const fh = 40;
    const band = new Float32Array(fw * fh).fill(90);
    const ground = new Float32Array(fw * fh).fill(90);
    for (let y = 30; y < fh; y++) for (let x = 0; x < fw; x++) ground[y * fw + x] = 10;
    for (let y = 8; y < 11; y++) for (let x = 0; x < fw; x++) band[y * fw + x] = 200;
    expect(hotAtHole(band, ground, fw, fh, 6).share).toBe(0);
  }, 120_000);

  /** Per frame pixel, 1 where the sheet has no surface (coverage near 0): the bare ground, read from the sheet and not from luma. */
  const bareGround = async (h: PageHandle) => {
    const t = await h.hook<{ w: number; h: number; bare: number[] }>(
      "(() => { const s = __paint.stats(); const g = __paint.sheetRegion(0, 0, innerWidth, innerHeight); return { w: s.sheetW, h: s.sheetH, bare: Array.from(g.coverage, (c) => (c < 0.02 ? 1 : 0)) }; })()",
    );
    return Uint8Array.from({ length: W * H }, (_, p) => t.bare[Math.floor((Math.floor(p / W) * t.h) / H) * t.w + Math.floor(((p % W) * t.w) / W)]!);
  };
  /** Bare-ground pixels the ember lifts by at least 40 luma, inside and outside the card's box (12 px margin for a rising speck), and the ember-off ground's spread. */
  const specksIn = (lit: Float32Array, off: Float32Array, bare: Uint8Array) => {
    const box = { x0: W / 2 - 0.265 * H - 12, x1: W / 2 + 0.265 * H + 12, y0: H / 2 - 0.45 * H - 12, y1: H / 2 + 0.45 * H + 12 };
    let inside = 0;
    let outside = 0;
    let lo = 255;
    let hi = 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const k = y * W + x;
        if (!bare[k]) continue;
        lo = Math.min(lo, off[k]!);
        hi = Math.max(hi, off[k]!);
        if (lit[k]! - off[k]! < 40) continue;
        if (x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1) inside++;
        else outside++;
      }
    return { inside, outside, offSpread: hi - lo };
  };
  it("burn: specks glow on the bare ground inside the card, nowhere outside it, and are out at rest", async () => {
    const at = (t: number, extra = "") =>
      withPage({ ...FROZEN, t, dark: true }, async (h) => {
        await h.hook("__paint.setGrain(0)");
        const lit = lumaOf(await h.shot());
        const bare = await bareGround(h);
        await h.hook("__paint.setLight(1, { level: 0 })");
        return specksIn(lit, lumaOf(await h.shot()), bare);
      }, `?card=1&torn=1&norim=1${extra}`);
    const mid = await at(TORN_T);
    const rest = await at(40);
    const none = await at(TORN_T, "&nospecks=1");
    const wide = await at(TORN_T, "&widebox=1");
    console.log(`specks at t ${TORN_T}: ${mid.inside} px inside the card, ${mid.outside} outside, ember-off ground spread ${mid.offSpread.toFixed(1)}; at rest ${rest.inside} and ${rest.outside}; no specks ${none.inside}; wide box ${wide.outside} outside`);
    expect(mid.inside, "no speck glows in the burned area").toBeGreaterThan(30);
    expect(mid.outside, "a speck glows outside the card").toBe(0);
    expect(rest.inside + rest.outside, "a speck still glows at rest").toBe(0);
    // At level 0 the ember adds nothing to the ground: one flat colour, within the output's rounding.
    expect(mid.offSpread, "the ember at level 0 still lights the ground").toBeLessThanOrEqual(2);
    // The planted faults: the reading sees no speck on a page with none, and sees specks outside a box wider than the card.
    expect(none.inside, "the reading counts something that is not a speck").toBe(0);
    expect(wide.outside, "the reading cannot see a speck outside the card").toBeGreaterThan(30);
  }, 120_000);

  // Each planted fault fails its own part by that part's reading, and no other part fails.
  const FAULTS: Record<string, { part: "a" | "b" | "c"; reading: (m: Record<string, number>) => void }> = {
    "burn-retreat": { part: "a", reading: (m) => expect(m["burn.jitter"]).toBeGreaterThan(threshold("relight.burnJitter", null)) },
    "burn-clean-wipe": { part: "b", reading: (m) => expect(m["burn.scorchDrop"]).toBeLessThanOrEqual(threshold("relight.scorchDrop", null)) },
    "burn-glow-dark": { part: "c", reading: (m) => expect(m["burn.ember.warmth"]).toBeLessThanOrEqual(0) },
    "burn-glow-flat": { part: "c", reading: (m) => expect(m["burn.ember.beyondDiff"]).toBeGreaterThan(threshold("relight.ambientBand", null)) },
    // Flat out to reach, then nothing: beyond reads 0, so only the fade can fail it.
    "burn-glow-step": {
      part: "c",
      reading: (m) => {
        expect(m["burn.ember.beyondDiff"]).toBeLessThanOrEqual(threshold("relight.ambientBand", null));
        expect(m["burn.ember.fade"]).toBeGreaterThanOrEqual(threshold("relight.emberFade", null));
      },
    },
  };
  it.each(Object.keys(FAULTS))("burn law: test/faults/%s fails its own part, light and dark", async (name) => {
    const f = FAULTS[name]!;
    for (const part of await burnLaw(`test/faults/${name}`, 1)) {
      expect(part.status, `${part.scheme}: ${part.line}`).toBe("fail");
      expect(part.line).toMatch(new RegExp(`\\(${f.part}\\) FAIL: `));
      for (const other of ["a", "b", "c"].filter((p) => p !== f.part)) expect(part.line).not.toMatch(new RegExp(`\\(${other}\\) FAIL`));
      f.reading(part.measured);
    }
  }, 120_000);

  it("burn: a resize at t 2 keeps the burned share", async () => {
    await withPage({ ...FROZEN, t: 2 }, async (h) => {
      const before = burnedShare(await sheet(h));
      // Narrower, same height: the short side (the height) is unchanged, so the front stands at the same height.
      await h.page.setViewportSize({ width: 720, height: H });
      await h.hook(twoFrames);
      const after = burnedShare(await sheet(h));
      console.log(`burned share at t 2: ${before.toFixed(4)} at ${W} px, ${after.toFixed(4)} at 720 px`);
      expect(before).toBeGreaterThan(0.05);
      // A different width samples the rag at other places: the front's mean height can move by at most the rag's
      // largest shift (RAG x RAG_AMP short-side units, the sheet being 1 unit high), plus one grid row each side.
      expect(Math.abs(after - before)).toBeLessThanOrEqual(RAG * RAG_AMP + 2 / GRID);
    });
  });

  it("burn: startAt null shows an unburned card", async () => {
    await withPage(
      { ...FROZEN, t: 3 },
      async (h) => {
        const waiting = await sheet(h);
        expect(burnedShare(waiting)).toBe(0);
        expect(Math.max(...waiting.param)).toBe(0);
        // The start call starts it at the frozen time (3 s); 2 s later paper has burned.
        await h.hook("burnStart()");
        await h.hook("__paint.setTime(5)");
        const started = burnedShare(await sheet(h));
        expect(started).toBeGreaterThan(0);
        // A second start on a running burn is ignored: the same frame at 5 s, not a restart there.
        await h.hook("burnStart()");
        await h.hook("__paint.setTime(5)");
        await h.hook(twoFrames);
        expect(burnedShare(await sheet(h))).toBe(started);
        console.log(`waiting: burned 0, param max 0; started at 3 s, at 5 s burned ${started.toFixed(4)}, after a second start ${started.toFixed(4)}`);
      },
      "?wait=1",
    );
  });

  it("burn: under reduced motion the start call shows the end state", async () => {
    await withPage(
      { dpr: 1, width: W, height: H, reduced: true },
      async (h) => {
        await h.hook(twoFrames);
        expect(burnedShare(await sheet(h))).toBe(0);
        await h.hook("burnStart()");
        await h.hook(twoFrames);
        const share = burnedShare(await sheet(h));
        console.log(`reduced motion: burned share after start ${share.toFixed(4)}, motion ${await h.hook<string>("__paint.motion()")}`);
        // The settle tick is where every point's arrival plus the band has passed (BurnField's settleTicks), so the
        // whole card is gone: the end state, as behaviour 21 asks.
        expect(share).toBe(1);
      },
      "?wait=1",
    );
  });
});
