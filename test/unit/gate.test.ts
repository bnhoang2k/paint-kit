import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { combineSeeds, gate, resolveTarget, runAll, runEntry } from "../../src/checks/gate.ts";
import type { BarConfig } from "../../src/bar.ts";
import type { CheckEntry, CheckOpts, CheckResult, Target } from "../../src/checks/types.ts";
import { REPO_ROOT } from "../../src/checks/root.ts";
import { checkInkSource } from "../../src/engine/hook.ts";

const dir = path.join(REPO_ROOT, "out", "unit-gate-bar");
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("resolveTarget", () => {
  it("loads the sibling bar.json when the target is an html path", () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "index.html"), "<!doctype html>");
    writeFileSync(
      path.join(dir, "bar.json"),
      JSON.stringify({ id: "unit", reference: { shelfKey: "k", title: "t" }, palette: { ground: "--ground", ink: "--ink", accents: [] }, detail: 0.5, seeds: [1], laws: ["relief"], alive: { rests: "still" }, beats: [] }),
    );
    expect(resolveTarget(path.join(dir, "index.html"), {}, "http://x").bar?.id).toBe("unit");
    expect(resolveTarget(dir, {}, "http://x").bar?.id).toBe("unit");
  });

  it("appends the bar's query to the page's url, and leaves a bar with none alone", () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "index.html"), "<!doctype html>");
    const bar = { id: "unit", reference: { shelfKey: "k", title: "t" }, palette: { ground: "--ground", ink: "--ink", accents: [] }, detail: 0.5, seeds: [1], laws: ["relief"], alive: { rests: "still" }, beats: [] };
    writeFileSync(path.join(dir, "bar.json"), JSON.stringify({ ...bar, query: "burnAt=0" }));
    expect(resolveTarget(dir, {}, "http://x").url).toMatch(/\/index\.html\?burnAt=0$/);
    writeFileSync(path.join(dir, "bar.json"), JSON.stringify(bar));
    expect(resolveTarget(dir, {}, "http://x").url).toMatch(/\/index\.html$/);
  });

  it("gives a bare page no bar", () => {
    expect(resolveTarget(path.join(REPO_ROOT, "test/pages/core.html"), {}, "http://x").bar).toBeNull();
  });

  // Phase 2 Task 2e: a page test runs one seed per test, so the gate takes `seeds` to pick among bar.json's.
  it("keeps only the picked seeds, and refuses a seed bar.json does not list or a page with no bar", () => {
    const bars = path.join(REPO_ROOT, "bars/01-lamp-on-paper");
    expect(resolveTarget(bars, {}, "http://x").bar?.seeds).toEqual([1, 2, 3]);
    expect(resolveTarget(bars, { seeds: [2] }, "http://x").bar?.seeds).toEqual([2]);
    expect(resolveTarget(bars, {}, "http://x").bar?.seeds).toEqual([1, 2, 3]);
    expect(() => resolveTarget(bars, { seeds: [9] }, "http://x")).toThrow(/seed 9 is not in/);
    expect(() => resolveTarget(path.join(REPO_ROOT, "test/pages/core.html"), { seeds: [1] }, "http://x")).toThrow(/no bar\.json/);
  });
});

describe("the gate at every bar seed (check-fix (g))", () => {
  const bar = (seeds: number[]) => ({ id: "unit", seeds }) as unknown as BarConfig;
  const target = (seeds: number[] | null, control = false): Target => ({ url: "http://x/p.html", bar: seeds ? bar(seeds) : null, control });
  const res = (status: CheckResult["status"], v: number): CheckResult => ({ name: "law", status, line: `law: ${status} ${v}`, measured: { v } });
  // A fake check that fails only at the seeds given, and records the seed each run was opened at.
  const entry = (failAt: number[], seen: (number | undefined)[]): CheckEntry => ({
    name: "law",
    run: async (_t, o: CheckOpts) => {
      seen.push(o.seed);
      return res(failAt.includes(o.seed ?? 1) ? "fail" : "pass", o.seed ?? 1);
    },
    control: async (_t, o: CheckOpts) => {
      seen.push(o.seed);
      return res("pass", 0);
    },
  });

  it("runs a bar at every seed in bar.json order, and fails when only a later seed fails, naming it", async () => {
    const seen: (number | undefined)[] = [];
    const r = await runEntry(entry([3], seen), target([1, 2, 3]), {});
    expect(seen).toEqual([1, 2, 3]);
    expect(r.status).toBe("fail");
    expect(r.line).toBe("law: fails at seed 3 of 1, 2, 3; at seed 3: fail 3");
    expect(r.measured).toMatchObject({ v: 3, seed: 3, "v@1": 1, "v@2": 2, "v@3": 3 });
  });

  it("names every failing seed and passes only when each seed passes", async () => {
    expect((await runEntry(entry([1, 3], []), target([2, 1, 3]), {})).line).toBe("law: fails at seeds 1, 3 of 2, 1, 3; at seed 1: fail 1");
    const ok = await runEntry(entry([], []), target([2, 1, 3]), {});
    expect(ok.status).toBe("pass");
    expect(ok.line).toBe("law: passes at seeds 2, 1, 3; at seed 2: pass 2");
  });

  it("keeps one run, at the default seed, for a bare page, a control and a one-seed bar", async () => {
    const bare: (number | undefined)[] = [];
    expect(await runEntry(entry([], bare), target(null), {})).toEqual(res("pass", 1));
    expect(bare).toEqual([undefined]);
    const ctl: (number | undefined)[] = [];
    await runEntry(entry([], ctl), target([1, 2, 3], true), {});
    expect(ctl).toEqual([undefined]);
    const one: (number | undefined)[] = [];
    expect((await runEntry(entry([], one), target([4]), {})).line).toBe("law: pass 4");
    expect(one).toEqual([4]);
  });

  it("is partial when a seed throws or is partial and none fails; a fail outranks it", async () => {
    let n = 0;
    const throws: CheckEntry = { name: "law", run: async () => (++n === 2 ? Promise.reject(new Error("boom\nstack")) : res("pass", n)), control: { skip: "x" } };
    const r = await runEntry(throws, target([1, 2, 3]), {});
    expect(r.status).toBe("partial");
    expect(r.line).toBe("law: partial at seed 2 of 1, 2, 3; at seed 2: could not run: boom");
    const mixed = combineSeeds("law", [{ seed: 1, result: res("partial", 1) }, { seed: 2, result: res("fail", 2) }]);
    expect(mixed.status).toBe("fail");
    expect(mixed.line).toBe("law: fails at seed 2 of 1, 2; at seed 2: fail 2");
  });
});

describe("gate() runs each entry per seed through runEntry (check-fix (g), m3)", () => {
  const seedDir = path.join(REPO_ROOT, "out", "unit-gate-seeds");
  afterAll(() => rmSync(seedDir, { recursive: true, force: true }));

  it("a fake check run by gate() on a three-seed bar is opened at seeds 1, 2, 3 and fails by the later seed", async () => {
    mkdirSync(seedDir, { recursive: true });
    writeFileSync(path.join(seedDir, "index.html"), "<!doctype html>");
    writeFileSync(
      path.join(seedDir, "bar.json"),
      JSON.stringify({ id: "unit", reference: { shelfKey: "k", title: "t" }, palette: { ground: "--ground", ink: "--ink", accents: [] }, detail: 0.5, seeds: [1, 2, 3], laws: ["relief"], alive: { rests: "still" }, beats: [] }),
    );
    const seen: (number | undefined)[] = [];
    const fake: CheckEntry = {
      name: "law",
      run: async (_t, o) => {
        seen.push(o.seed);
        return { name: "law", status: o.seed === 3 ? "fail" : "pass", line: `law: ${o.seed}`, measured: {} };
      },
      control: { skip: "x" },
    };
    // baseUrl given, so gate() starts no server; the fake opens nothing. Calling c.run(t, opts) in place of
    // runEntry would run once with no seed, and this test would fail.
    const r = await gate(seedDir, { baseUrl: "http://unused" }, [fake]);
    expect(seen).toEqual([1, 2, 3]);
    expect(r.results[0]!.line).toBe("law: fails at seed 3 of 1, 2, 3; at seed 3: 3");
    expect(r.verdict).toBe("failed: 1");
    // runAll is the same path, exported.
    const again: (number | undefined)[] = [];
    await runAll({ url: "http://x/p.html", bar: { id: "unit", seeds: [2, 1] } as unknown as BarConfig, control: false }, {}, [
      { ...fake, run: async (t, o) => (again.push(o.seed), fake.run(t, o)) },
    ]);
    expect(again).toEqual([2, 1]);
  });
});

describe("applicability from the registry (check-fix (f))", () => {
  const t = (control = false): Target => ({ url: "http://x/p.html", bar: { id: "unit", seeds: [4, 5] } as unknown as BarConfig, control });
  const ran: string[] = [];
  const entry = (applies: NonNullable<CheckEntry["applies"]>): CheckEntry => ({
    name: "tc",
    run: async (_t, o) => (ran.push(`run ${o.seed}`), { name: "tc", status: "pass", line: "tc: ran", measured: {} }),
    control: async () => (ran.push("control"), { name: "tc", status: "pass", line: "tc: control", measured: {} }),
    applies,
  });

  it("skips with the entry's reason, asks once at the first seed, and never runs the check", async () => {
    ran.length = 0;
    const asked: (number | undefined)[] = [];
    const r = await runEntry(entry(async (_t, o) => (asked.push(o.seed), { skip: "does not apply: no text" })), t(), {});
    expect(r).toEqual({ name: "tc", status: "skip", line: "tc: does not apply: no text", measured: {} });
    expect(asked).toEqual([4]);
    expect(ran).toEqual([]);
  });

  it("runs every seed when it applies, and a control ignores applies", async () => {
    ran.length = 0;
    expect((await runEntry(entry(async () => true), t(), {})).status).toBe("pass");
    expect(ran).toEqual(["run 4", "run 5"]);
    ran.length = 0;
    const r = await runEntry(entry(async () => ({ skip: "no" })), t(true), {});
    expect(r.line).toBe("tc: control");
    expect(ran).toEqual(["control"]);
  });

  it("is partial, never a silent skip, when applies throws", async () => {
    const r = await runEntry(entry(async () => Promise.reject(new Error("page died\nstack"))), t(), {});
    expect(r.status).toBe("partial");
    expect(r.line).toBe("tc: could not tell whether it applies: page died");
  });
});

describe("setInk's ink source (check-fix (f) fix round 2)", () => {
  it("accepts text and picture, and throws on anything else rather than doing nothing", () => {
    expect(checkInkSource("text")).toBe("text");
    expect(checkInkSource("picture")).toBe("picture");
    for (const bad of ["Text", "pictures", "", null, 1]) expect(() => checkInkSource(bad), String(bad)).toThrow(/unknown ink source/);
  });
});
