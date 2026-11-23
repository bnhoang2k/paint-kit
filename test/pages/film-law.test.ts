// The film branch of the iridescence law, judged (Phase 2 Task 18c, task-18-law-design.md step 9). Each honest page passes
// with every condition on the right side of its limit and (e) read. Each planted fault fails for its own condition, with
// that condition's line and reading. film-drift cannot read (c), so it does not pass. A page with foil and film reads both.
// The limits are `relight.filmShift`, `relight.filmMatch`, `relight.ambientBand`, `relight.filmApart` and
// `relight.filmSpread` in src/checks/thresholds.json. Each row reads what the law reads, through `checkScheme`.
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveTarget } from "../../src/checks/gate.ts";
import { closeBrowsers } from "../../src/checks/harness.ts";
import { checkScheme, FILM_E_NOT_READ, filmLimits, filmSchemeReading, filmVerdict } from "../../src/checks/relight.ts";
import { serveRoot } from "../../src/checks/serve.ts";
import { threshold } from "../../src/checks/threshold.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");
const STEEL = "?range=26,54&ior=2.343";
const SCHEMES = ["light", "dark"] as const;
const CASES = SCHEMES.flatMap((scheme) => [1, 2, 3].map((seed) => ({ scheme, seed, name: `${scheme} seed ${seed}` })));
const th = (n: string) => threshold(n, null);

let server: { url: string; close(): Promise<void> };
beforeAll(async () => {
  server = await serveRoot(ROOT);
});
afterAll(async () => {
  await server?.close();
  await closeBrowsers();
});

const target = (rel: string, query = "") => {
  const t = resolveTarget(path.join(ROOT, rel), {}, server.url);
  return { ...t, url: t.url + query };
};

type Law = { status: string; line: string; m: Record<string, number> };

/** The iridescence law alone on a page in one scheme at one seed: its line, status and measured keys. */
async function filmLaw(rel: string, scheme: "light" | "dark", seed: number, query = ""): Promise<Law> {
  const part = await checkScheme(target(rel, query), { seed }, scheme, ["iridescence"]);
  const status = /^iridescence (pass|FAIL|PARTIAL)/.exec(part.line)?.[1] ?? "missing";
  const m = Object.fromEntries(Object.entries(part.measured).filter(([k]) => k.startsWith("iridescence.")));
  console.log(`FILM LAW ${rel}${query} ${scheme} seed ${seed}: ${part.line}\n  ${JSON.stringify(m)}`);
  return { status, line: part.line, m };
}

/** Every condition on the right side of its limit, (e) read. */
function expectHonest(r: Law) {
  expect(r.status, r.line).toBe("pass");
  expect(r.m["iridescence.film.key"]).toBeGreaterThan(th("relight.filmShift"));
  expect(r.m["iridescence.film.tilt"]).toBeGreaterThan(th("relight.filmShift"));
  expect(r.m["iridescence.film.match"]).toBeLessThan(th("relight.filmMatch"));
  expect(r.m["iridescence.film.time"]).toBeLessThan(th("relight.ambientBand"));
  expect(r.m["iridescence.film.apart"]).toBeGreaterThan(th("relight.filmApart"));
  expect(r.line).not.toContain(FILM_E_NOT_READ);
  expect(r.m["iridescence.film.spread"]).toBeLessThan(th("relight.filmSpread"));
}

describe("iridescence: the law passes film", () => {
  it.each(CASES)("film.html passes the iridescence law: $name", async ({ scheme, seed }) => {
    expectHonest(await filmLaw("test/pages/film.html", scheme, seed));
  });
  it.each(CASES)("film-metal.html passes the iridescence law: $name", async ({ scheme, seed }) => {
    expectHonest(await filmLaw("test/pages/film-metal.html", scheme, seed));
  });
  it.each(CASES)("the steel page passes the iridescence law: $name", async ({ scheme, seed }) => {
    expectHonest(await filmLaw("test/pages/film-metal.html", scheme, seed, STEEL));
  });
});

describe("iridescence: (b) reads one thickness, not a gradient across an OPD bin", () => {
  // A 5 nm OPD bin holds a thickness gradient. On a page whose ramp runs one way (bar 11), a bin's halves by row differ in
  // mean thickness, and Task 18c's (b) read that as a colour mismatch; Task 18e removes the part the ramp's own curve
  // explains. ?oneway=1 runs both steel panels the same way: the regression page for this class.
  it.each(CASES)("a one-way steel ramp passes (b): $name", async ({ scheme, seed }) => {
    const r = await filmLaw("test/pages/film-metal.html", scheme, seed, `${STEEL}&oneway=1`);
    expect(r.line).not.toMatch(/\(b\) film/);
    expect(r.m["iridescence.film.match"]).toBeLessThan(th("relight.filmMatch"));
  });
});

describe("iridescence: (e) reads no colour the film's ramp never measured", () => {
  // Steel counts no bin from OPD 175 to 225 nm. These keys move a bin at that gap's edge into it (task-18c-review.md).
  it.each([
    { off: 20, level: 0.4 },
    { off: 0, level: 0.5 },
  ])("the honest steel page does not fail (e) with the key $off degrees off the eye at level $level", async ({ off, level }) => {
    const r = await filmLaw("test/pages/film-metal.html", "light", 1, `${STEEL}&keyOff=${off}&keyLevel=${level}`);
    expect(r.line).not.toMatch(/\(e\) turning/);
    if (r.m["iridescence.film.spread"] !== undefined) expect(r.m["iridescence.film.spread"]).toBeLessThan(th("relight.filmSpread"));
  });
});

/** Each fault's own condition: its line text and its reading on the fail side. */
const expectKey = (r: Law) => {
  expect(r.line).toMatch(/\(a\) turning/);
  expect(r.m["iridescence.film.key"]).toBeLessThanOrEqual(th("relight.filmShift"));
};
const expectTilt = (r: Law) => {
  expect(r.line).toMatch(/\(a\) tilting/);
  expect(r.m["iridescence.film.tilt"]).toBeLessThanOrEqual(th("relight.filmShift"));
};
const expectMatch = (r: Law) => {
  expect(r.line).toMatch(/\(b\) film/);
  expect(r.m["iridescence.film.match"]).toBeGreaterThanOrEqual(th("relight.filmMatch"));
};
const expectTime = (r: Law) => {
  expect(r.line).toMatch(/\(c\) with nothing moved/);
  expect(r.m["iridescence.film.time"]).toBeGreaterThanOrEqual(th("relight.ambientBand"));
};
const expectApart = (r: Law) => {
  expect(r.line).toMatch(/\(d\) film/);
  expect(r.m["iridescence.film.apart"]).toBeLessThanOrEqual(th("relight.filmApart"));
};
const expectSpread = (r: Law) => {
  expect(r.line).toMatch(/\(e\) turning/);
  expect(r.m["iridescence.film.spread"]).toBeGreaterThanOrEqual(th("relight.filmSpread"));
};
const OWN: Record<string, (r: Law) => void> = {
  "film-fixed-light": expectKey,
  "film-fixed-light-metal": expectKey,
  "film-fixed-surface": expectTilt,
  "film-fixed-surface-metal": expectTilt,
  "film-place-hue": expectMatch,
  "film-place-hue-metal": expectMatch,
  "film-clock": expectTime,
  "film-clock-metal": expectTime,
  "film-no-thickness": expectApart,
  "film-no-thickness-metal": expectApart,
  "film-no-angle": expectSpread,
  "film-no-angle-metal": expectSpread,
  "film-no-angle-steel": expectSpread,
  "film-view-normal": expectMatch,
  "film-view-normal-metal": expectMatch,
};
const FAULTS = Object.keys(OWN).flatMap((fault) => CASES.map((c) => ({ ...c, fault })));

describe("iridescence: the planted film faults fail the law for their own reason", () => {
  it.each(FAULTS)("$fault fails the iridescence law: $name", async ({ fault, scheme, seed }) => {
    const r = await filmLaw(`test/faults/${fault}/index.html`, scheme, seed);
    expect(r.status, r.line).toBe("FAIL");
    OWN[fault]!(r);
  });
});

describe("iridescence: a film whose thickness drifts cannot read (c)", () => {
  const DRIFTS = ["film-drift", "film-drift-metal"].flatMap((page) => CASES.map((c) => ({ ...c, page, name: `${page} ${c.name}` })));
  it.each(DRIFTS)("film-drift does not pass the iridescence law: $name", async ({ page, scheme, seed }) => {
    const r = await filmLaw(`test/faults/${page}/index.html`, scheme, seed);
    expect(r.status, r.line).toBe("PARTIAL");
    expect(r.line).toMatch(/so \(c\) cannot be read/);
    expect(r.m["iridescence.film.still"]).toBe(0);
    expect(r.m["iridescence.film.time"]).toBeUndefined();
  });
});

describe("iridescence: foil and film on one page", () => {
  it("a page with foil and film reads both", async () => {
    const r = await filmLaw("test/pages/film-foil.html", "light", 1);
    expect(r.status, r.line).toBe("pass");
    expect(r.line).toContain("foil: ");
    expect(r.line).toContain("film: ");
    expect(r.m["iridescence.light"]).toBeGreaterThan(th("relight.iridescenceShift"));
    expect(r.m["iridescence.apart"]).toBeGreaterThan(th("relight.iridescenceApart"));
    expect(r.m["iridescence.film.key"]).toBeGreaterThan(th("relight.filmShift"));
    expect(r.m["iridescence.film.spread"]).toBeLessThan(th("relight.filmSpread"));
  });
});

describe("iridescence: the key's turn sets no limit", () => {
  // The builder's 30-degree turn must not decide (e): the honest ratio stays under the limit at half and at one and a
  // half times that turn, on the dielectric page and on the steel page.
  const PAGES = [
    ["test/pages/film.html", ""],
    ["test/pages/film-metal.html", STEEL],
  ] as const;
  const atTurn = async (turn: number) => {
    for (const [rel, query] of PAGES) {
      const r = await filmSchemeReading(target(rel, query), { seed: 1 }, "light", turn);
      console.log(`FILM TURN ${rel}${query} ${turn} degrees: ratio ${r.spread?.ratio} denominator ${r.spread?.denom} noise ${r.spread?.noise} read ${r.spread?.read}`);
      expect(r.spread?.read, `${rel}${query}`).toBe(true);
      expect(r.spread!.ratio).toBeLessThan(th("relight.filmSpread"));
    }
  };
  it("(e) stays under its limit at a 15-degree turn", () => atTurn(15));
  it("(e) stays under its limit at a 45-degree turn", () => atTurn(45));

  // Planted case, chosen before any reading at this turn: 1 degree. On the steel page a 1-degree turn moves the OPD 0.055 nm
  // at 26 nm of oxide and 0.113 nm at 54 nm, about 1/40 of the 30-degree turn's 2.186 and 4.540 nm and under 1/40 of one
  // 5 nm OPD bin. A turn that small moves the film along its ramp by less than the page's own noise, so (e) must not read.
  it("a 1-degree key turn stays unread on the steel page", async () => {
    const r = await filmSchemeReading(target("test/pages/film-metal.html", STEEL), { seed: 1 }, "light", 1);
    console.log(`FILM TURN steel 1 degree: ratio ${r.spread?.ratio} denominator ${r.spread?.denom} noise ${r.spread?.noise} read ${r.spread?.read}`);
    expect(r.spread).not.toBeNull();
    expect(r.spread!.noise! / r.spread!.denom).toBeGreaterThanOrEqual(th("relight.filmSpread"));
    expect(r.spread!.read).toBe(false);
    const v = filmVerdict(r, filmLimits(th));
    expect(v.line).toContain(FILM_E_NOT_READ);
    expect(v.measured["iridescence.film.spread"]).toBeUndefined();
  });
});
