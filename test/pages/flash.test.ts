// The flash check (WCAG 2.3.1) on planted pages: a full-viewport light/dark swap at 5 Hz must fail, the same at
// 2 Hz must pass, and a saturated red / grey swap at 5 Hz (equal luminance) must fail on the red rule alone.
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadBar } from "../../src/bar.ts";
import { check as flash } from "../../src/checks/flash.ts";
import { open } from "../../src/checks/frames.ts";
import { closeBrowsers } from "../../src/checks/harness.ts";
import { serveRoot } from "../../src/checks/serve.ts";
import type { Target } from "../../src/checks/types.ts";

let server: { url: string; close(): Promise<void> };
const ROOT = path.resolve(import.meta.dirname, "../..");
const target = (rel: string): Target => ({ url: `${server.url}/${rel}`, bar: null, control: false });

beforeAll(async () => {
  server = await serveRoot(ROOT);
});

afterAll(async () => {
  await server?.close();
  await closeBrowsers();
});

describe("flash", () => {
  it("fails test/faults/flash-5hz: 5 general flashes per s over the whole viewport", async () => {
    const r = await flash(target("test/faults/flash-5hz/index.html"), {});
    expect(r.status, r.line).toBe("fail");
    expect(r.measured.generalFlashes).toBe(5);
    expect(r.measured.redFlashes).toBe(0);
  }, 120_000);

  it("passes test/pages/flash-2hz.html: 2 general flashes per s", async () => {
    const r = await flash(target("test/pages/flash-2hz.html"), {});
    expect(r.status, r.line).toBe("pass");
    expect(r.measured.generalFlashes).toBe(2);
  }, 120_000);

  it("fails test/faults/flash-red-5hz on red flashes alone", async () => {
    const r = await flash(target("test/faults/flash-red-5hz/index.html"), {});
    expect(r.status, r.line).toBe("fail");
    expect(r.measured.redFlashes).toBe(5);
    expect(r.measured.generalFlashes).toBe(0);
  }, 120_000);

  it("fails test/faults/flash-css-5hz: a CSS @keyframes swap at 5 Hz, stepped with the page clock", async () => {
    const r = await flash(target("test/faults/flash-css-5hz/index.html"), {});
    expect(r.status, r.line).toBe("fail");
    expect(r.measured.generalFlashes, r.line).toBe(5);
  }, 120_000);

  // The pointer on the stepped clock: a glow that follows the engine's eased pointer, nothing moving with time.
  const POINTER = "test/faults/flash-pointer-5hz";
  const pointerTarget = (withPath: boolean): Target => {
    const { flash: declared, ...rest } = loadBar(path.join(ROOT, POINTER));
    return { url: `${server.url}/${POINTER}/index.html`, bar: withPath && declared ? { ...rest, flash: declared } : rest, control: false };
  };

  it("fails test/faults/flash-pointer-5hz with its declared pointer path: the glow flashes at 5 Hz as the pointer swings", async () => {
    const r = await flash(pointerTarget(true), {});
    expect(r.status, r.line).toBe("fail");
    expect(r.measured.generalFlashes).toBeGreaterThan(3);
    expect(r.measured.pointerLegs).toBe(21);
    expect(r.line).toContain("pointer path: 21 legs");
  }, 120_000);

  it("passes the same page with no pointer path: the path is what catches it", async () => {
    const r = await flash(pointerTarget(false), {});
    expect(r.status, r.line).toBe("pass");
    expect(r.measured.generalFlashes).toBe(0);
    expect(r.line).toContain("pointer path: none");
  }, 120_000);

  it("replays the pointer path deterministically: the same t gives the same frame", async () => {
    const t = pointerTarget(true);
    const h = await open(t, {}, { t: 0 });
    try {
      await h.hook(`__paint.setPointerPath(${JSON.stringify(t.bar!.flash!.pointer)})`);
      await h.hook("__paint.setTime(0.55)");
      const a = await h.page.screenshot({ type: "png" });
      await h.hook("__paint.setTime(1.3)");
      const mid = await h.page.screenshot({ type: "png" });
      await h.hook("__paint.setTime(0.55)");
      const b = await h.page.screenshot({ type: "png" });
      expect(a.equals(mid), "the pointer moved the glow between 0.55 s and 1.3 s").toBe(false);
      expect(a.equals(b), "setTime(0.55) twice gave two frames").toBe(true);
    } finally {
      await h.close();
    }
  }, 120_000);
});
