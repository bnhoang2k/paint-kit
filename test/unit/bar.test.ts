import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadBar } from "../../src/bar.ts";

const good = {
  id: "paper",
  reference: { shelfKey: "paper-01", title: "Paper under one light" },
  palette: { ground: "--ground", ink: "--ink", accents: ["--accent"] },
  detail: 0.5,
  seeds: [1, 2, 3],
  laws: ["relief", "falloff"],
  alive: { t0: 0.5, t1: 1.5 },
  beats: ["settles"],
};

function barDir(json: unknown): string {
  const dir = mkdtempSync(path.join(tmpdir(), "paint-kit-bar-"));
  writeFileSync(path.join(dir, "bar.json"), JSON.stringify(json));
  return dir;
}

describe("loadBar", () => {
  it("loadBar rejects a bar with no laws", () => {
    expect(() => loadBar(barDir({ ...good, laws: [] }))).toThrow(/laws/);
  });

  it("loadBar accepts a complete bar", () => {
    const bar = loadBar(barDir(good));
    expect(bar.id).toBe("paper");
    expect(bar.laws).toEqual(["relief", "falloff"]);
  });

  it("loadBar accepts an alive.rests bar", () => {
    const bar = loadBar(barDir({ ...good, alive: { rests: "a printed sheet holds still" } }));
    expect(bar.alive).toEqual({ rests: "a printed sheet holds still" });
  });

  it("loadBar rejects an unknown law, a bad alive and a missing file", () => {
    expect(() => loadBar(barDir({ ...good, laws: ["gloss"] }))).toThrow(/laws/);
    expect(() => loadBar(barDir({ ...good, alive: { t0: 1 } }))).toThrow(/alive/);
    expect(() => loadBar(barDir({ ...good, detail: 2 }))).toThrow(/detail/);
    expect(() => loadBar(path.join(tmpdir(), "paint-kit-no-such-bar"))).toThrow(/bar\.json/);
  });
});

describe("bar settle", () => {
  it("loadBar accepts a settle time that is a whole number of 1/60 s ticks, and leaves it unset when absent", () => {
    expect(loadBar(barDir({ ...good, settle: 0.75 })).settle).toBe(0.75);
    expect(loadBar(barDir({ ...good, settle: 5 })).settle).toBe(5);
    expect(loadBar(barDir({ ...good, settle: 1 / 60 })).settle).toBe(1 / 60);
    expect(loadBar(barDir(good)).settle).toBeUndefined();
  });

  it("loadBar rejects a settle time of 0, a negative one, one between ticks, or a non-number", () => {
    for (const settle of [0, -0.75, 0.755, 0.01, "0.75", null, [0.75]]) {
      expect(() => loadBar(barDir({ ...good, settle })), JSON.stringify(settle)).toThrow(/settle/);
    }
  });
});

describe("bar view", () => {
  it("loadBar accepts a view of whole CSS pixels from 320 to 2560 per side", () => {
    expect(loadBar(barDir({ ...good, view: { width: 393, height: 852 } })).view).toEqual({ width: 393, height: 852 });
    expect(loadBar(barDir({ ...good, view: { width: 320, height: 2560 } })).view).toEqual({ width: 320, height: 2560 });
    expect(loadBar(barDir(good)).view).toBeUndefined();
  });

  it("loadBar rejects a view side of 0, 319, 2561, a fraction, a missing side or a non-object", () => {
    for (const view of [
      { width: 0, height: 852 },
      { width: 393, height: 319 },
      { width: 2561, height: 852 },
      { width: 393.5, height: 852 },
      { width: 393 },
      { height: 852 },
      "393x852",
    ]) {
      expect(() => loadBar(barDir({ ...good, view })), JSON.stringify(view)).toThrow(/view/);
    }
  });

  it("pageOpts and the sheet cell follow a declared view, and keep the default without one", async () => {
    const { pageOpts, VIEW } = await import("../../src/checks/frames.ts");
    const { cellFor } = await import("../../src/checks/sheet.ts");
    const bar = loadBar(barDir({ ...good, view: { width: 393, height: 852 } }));
    const o = pageOpts({ url: "x", bar, control: false }, {});
    expect([o.width, o.height, o.dpr]).toEqual([393, 852, 1]);
    const d = pageOpts({ url: "x", bar: loadBar(barDir(good)), control: false }, {});
    expect([d.width, d.height]).toEqual([VIEW.width, VIEW.height]);
    // An extra override (a check's own small frame) still wins.
    expect(pageOpts({ url: "x", bar, control: false }, {}, { width: 500 }).width).toBe(500);
    expect(cellFor(VIEW)).toEqual({ w: 400, h: 250 });
    const c = cellFor({ width: 393, height: 852 });
    expect(c).toEqual({ w: 215, h: 466 });
    expect(Math.abs(c.w / c.h - 393 / 852)).toBeLessThan(0.005);
  });
});

describe("bar flash.pointer", () => {
  const path = [{ t: 0, x: 0.3, y: 0.3 }, { t: 0.15, x: 0.65, y: 0.25 }];
  it("loadBar accepts a pointer path of two or more rising stops in viewport fractions", () => {
    expect(loadBar(barDir({ ...good, flash: { pointer: path } })).flash?.pointer).toEqual(path);
    expect(loadBar(barDir({ ...good, flash: {} })).flash?.pointer).toBeUndefined();
  });

  it("loadBar rejects one stop, falling or repeated times, a fraction outside 0..1, a negative t or a non-list", () => {
    const bads = [
      [path[0]],
      [path[1], path[0]],
      [path[0], { ...path[0] }],
      [path[0], { t: 1, x: 1.2, y: 0.5 }],
      [{ t: -1, x: 0.5, y: 0.5 }, path[1]],
      [path[0], { t: 1, x: 0.5 }],
      "path",
    ];
    for (const pointer of bads) expect(() => loadBar(barDir({ ...good, flash: { pointer } })), JSON.stringify(pointer)).toThrow(/flash/);
    expect(() => loadBar(barDir({ ...good, flash: [] }))).toThrow(/flash/);
  });
});

describe("bar query", () => {
  it("loadBar accepts URL parameters and leaves query unset when absent", () => {
    expect(loadBar(barDir({ ...good, query: "burnAt=0" })).query).toBe("burnAt=0");
    expect(loadBar(barDir({ ...good, query: "a=1&b.c=2-x" })).query).toBe("a=1&b.c=2-x");
    expect(loadBar(barDir(good)).query).toBeUndefined();
  });

  it("loadBar rejects the harness's own parameters", () => {
    for (const query of ["t=3", "seed=2", "detail=1", "burnAt=0&t=3"]) {
      expect(() => loadBar(barDir({ ...good, query })), query).toThrow(/query/);
    }
  });

  it("loadBar rejects a leading ?, an empty string, a bare key, a space or a non-string", () => {
    for (const query of ["?burnAt=0", "", "burnAt", "a=1&", "a=1 b=2", 3, null]) {
      expect(() => loadBar(barDir({ ...good, query })), JSON.stringify(query)).toThrow(/query/);
    }
  });
});
