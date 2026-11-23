import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { gate } from "../../src/checks/gate.ts";
import { closeBrowsers, decodePng } from "../../src/checks/harness.ts";
import { threshold } from "../../src/checks/threshold.ts";
import { makeSheet } from "../../src/checks/sheet.ts";
import { serveRoot } from "../../src/checks/serve.ts";
import { readFileSync } from "node:fs";

const ROOT = path.resolve(import.meta.dirname, "../..");
let server: { url: string; close(): Promise<void> };

beforeAll(async () => {
  server = await serveRoot(ROOT);
});

afterAll(async () => {
  await server?.close();
  await closeBrowsers();
});

const run = (rel: string, control?: boolean) => gate(path.join(ROOT, rel), { baseUrl: server.url, ...(control === undefined ? {} : { control }) });
const statusOf = (r: Awaited<ReturnType<typeof run>>) => Object.fromEntries(r.results.map((c) => [c.name, c.status]));

describe("plumbing checks (render, still, hygiene)", () => {
  it("core passes all six", async () => {
    const r = await run("test/pages/core.html");
    console.log(r.lines.join("\n"));
    expect(statusOf(r)).toEqual({ render: "pass", palette: "pass", "banding-grain": "pass", still: "pass", hygiene: "pass", relight: "pass", detail: "pass", "text-contrast": "pass", flash: "pass" });
    expect(r.verdict).toBe("passed");
  });

  // Page-level faults break one thing in the page; engine-level faults go through __PAINT_TEST_FAULT, which
  // hygiene fails on every page that sets it, so those also fail hygiene. Nothing else may fail. Each fault must
  // also fail for its OWN reason: `reason` asserts the measured numbers behind the named check.
  type Measured = Record<string, Record<string, number>>;
  const th = (n: string) => threshold(n, null);
  const FAULTS: [string, string, boolean, (m: Measured, lines: string[]) => void][] = [
    ["core-blank", "render", false, (m) => {
      expect(m.render!.std).toBeLessThan(th("render.blankStd"));
      // A sheet with no height at all is also under the relight check's relief floor.
      expect(m.relight!["relief.heightRange.light"]).toBeLessThanOrEqual(th("relight.minRelief"));
    }],
    ["core-dead", "render", false, (m) => {
      expect(m.render!.std).toBeGreaterThanOrEqual(th("render.blankStd"));
      expect(m.render!.aliveDiff).toBeLessThanOrEqual(th("render.aliveDiff"));
    }],
    ["core-nocompile", "render", false, (m) => expect(m.render!.errors).toBeGreaterThan(0)],
    ["core-ignores-reduced", "still", true, (m) => expect(m.still!.reducedDiff).toBeGreaterThan(th("still.reducedDiff"))],
    ["core-runs-hidden", "still", true, (m) => expect(m.still!.hiddenFrames).toBeGreaterThan(th("still.hiddenFrames"))],
    ["core-dpr3", "hygiene", true, (m) => expect(m.hygiene!.dpr).toBeGreaterThan(th("hygiene.maxDpr"))],
    ["core-nofallback", "hygiene", true, (m, lines) => {
      expect(m.hygiene!.fallbackAttr).toBe(0);
      expect(lines.find((l) => l.includes("hygiene:"))).toMatch(/data-paint/);
    }],
    ["core-hexcolour", "palette", false, (m) => {
      expect(m.palette!.staticHits).toBeGreaterThan(0);
      expect(m.palette!.movedShare).toBeGreaterThanOrEqual(th("palette.moveShare")); // the smoke test is fine
    }],
    ["core-nopalette", "palette", true, (m) => {
      expect(m.palette!.movedShare).toBeLessThan(th("palette.moveShare")); // no swap moves anything
      expect(m.palette!.staticHits).toBe(0);
      expect(m.palette!.tokenReads).toBe(0);
    }],
    // A band of 15% glazed with an accent read once in page code: the smoke test passes (the frame moves), the
    // static token-read rule (S1) fails it.
    ["core-accent-stripe", "palette", false, (m, lines) => {
      expect(m.palette!.movedShare).toBeGreaterThanOrEqual(th("palette.moveShare"));
      expect(m.palette!.tokenReads).toBeGreaterThan(0);
      expect(m.palette!.staticHits).toBe(0);
      expect(lines.find((l) => l.includes("palette:"))).toMatch(/page code reads the palette itself.*calls getComputedStyle/);
    }],
    ["core-nofinish", "banding-grain", true, (m) => expect(m["banding-grain"]!["run.dark"]).toBeGreaterThan(th("banding.maxRun"))],
    ["core-nograin", "banding-grain", false, (m) => expect(m["banding-grain"]!["grain.dark"]).toBeLessThan(th("grain.floor"))],
    ["core-grain2x", "banding-grain", false, (m) => {
      expect(Math.max(m["banding-grain"]!["grain.light"]!, m["banding-grain"]!["grain.dark"]!)).toBeGreaterThan(th("grain.ceiling"));
    }],
  ];
  it.each(FAULTS)("each core fault fails its check: %s fails %s", async (fault, named, engineLevel, reason) => {
    const r = await run(`test/faults/${fault}/index.html`);
    console.log(`${fault}\n${r.lines.join("\n")}\n${JSON.stringify(r.results.map((c) => [c.name, c.measured]))}`);
    const failing = r.results.filter((c) => c.status === "fail").map((c) => c.name).sort();
    expect(statusOf(r)[named]).toBe("fail");
    // The blank fault's sheet is flat, so relight's relief floor fails it as well, and its frame has no luminance
    // range, so text-contrast's range floor fails it too (light range 0.044, under 0.07). detail fails it in light
    // only: with the finish grain off (Phase 2 Task 2c) its light frame at detail 0 is nearly flat, so its fine share is
    // almost all of its energy, and the share falls as the dial adds coarser energy (seed 1: 0.997 / 0.385 / 0.176, not
    // strict); in dark it rises (rise 0.961) and passes. The check's status is the worse scheme's (joinSchemes), so
    // detail still fails overall and stays in this exact list.
    const alsoFails = fault === "core-blank" ? ["detail", "relight", "text-contrast"] : [];
    expect(failing).toEqual([...new Set([named, ...(engineLevel ? ["hygiene"] : []), ...alsoFails])].sort());
    // A page whose paint call threw has no hook, so the checks that need it are partial; every other fault leaves none.
    // core-accent-stripe is the one exception (driver ruling, Task 2d): its 15% glaze band is a second material slot
    // across the dark lamp's pool, and 5 of the 8 on-page falloff samples sit on it. The falloff fit leaves out samples
    // on a slot other than the pool's (the pool-slot rule), which drops the fit rms from 0.2615 to 0.0153, but only 3
    // samples remain and the law needs 4. So relight is honestly partial there, for exactly that reason; lowering the
    // minimum would be a limit change, and moving the band would rig the fault. Every other core fault leaves none.
    if (fault === "core-accent-stripe") {
      expect(r.results.filter((c) => c.status === "partial").map((c) => c.name)).toEqual(["relight"]);
      expect(r.results.find((c) => c.name === "relight")!.line).toMatch(/dark: .*falloff PARTIAL \(only 3 samples in the full-light cone are on the page and under the finish's knee, needs 4;/);
    } else if (fault !== "core-nocompile") expect(r.results.some((c) => c.status === "partial")).toBe(false);
    reason(Object.fromEntries(r.results.map((c) => [c.name, c.measured])), r.lines);
  });

  it("control is quiet in control mode", async () => {
    const r = await run("controls/spectral-drape", true);
    console.log(r.lines.join("\n"));
    expect(statusOf(r)).toEqual({ render: "pass", palette: "skip", "banding-grain": "pass", still: "pass", hygiene: "skip", relight: "skip", detail: "skip", "text-contrast": "pass", flash: "skip" });
    expect(r.lines).toContain("control: quiet");
    expect(r.verdict).toBe("passed");
  });

  it("sheet writes a labelled grid", async () => {
    const out = path.join(ROOT, "out", "core-sheet.png");
    const info = await makeSheet(path.join(ROOT, "test/pages/core.html"), out, { baseUrl: server.url });
    const png = decodePng(readFileSync(out));
    console.log(`sheet: ${info.cells} cells, ${png.w}x${png.h}`);
    expect(info.cells).toBe(36);
    expect(png.w).toBeGreaterThan(800);
    expect(png.h).toBeGreaterThan(600);
  });
});
