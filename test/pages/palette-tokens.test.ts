import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeBrowsers, openPage, type PageHandle } from "../../src/checks/harness.ts";
import { serveRoot } from "../../src/checks/serve.ts";

type Token = { linear: [number, number, number]; x: number; y: number };

// Standard sRGB transfer, written here on its own so the test does not trust the module's encoder.
const encode = (v: number) => {
  const c = Math.min(1, Math.max(0, v));
  return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
};

let server: { url: string; close(): Promise<void> };
let h: PageHandle;

beforeAll(async () => {
  server = await serveRoot(path.resolve(import.meta.dirname, "../.."));
  h = await openPage(`${server.url}/test/pages/palette-tokens.html`, { dpr: 1 });
  await h.page.waitForFunction("window.__tokens !== undefined && window.__glsl !== undefined", undefined, { timeout: 10_000 });
});

afterAll(async () => {
  await h?.close();
  await server?.close();
  await closeBrowsers();
});

describe("palette page", () => {
  it("parses every token form", async () => {
    const tokens = await h.hook<Record<string, Token>>("window.__tokens");
    const frame = await h.shot("palette-tokens");
    const names = ["--a", "--b", "--c", "--d", "--e", "--f", "--g", "--h"];
    expect(Object.keys(tokens).sort()).toEqual(names);
    const rows: string[] = [];
    for (const name of names) {
      const t = tokens[name]!;
      const o = (Math.round(t.y) * frame.w + Math.round(t.x)) * 4;
      const painted = [frame.data[o]!, frame.data[o + 1]!, frame.data[o + 2]!];
      const ours = t.linear.map(encode);
      rows.push(`${name} painted ${painted.join(",")} ours ${ours.map((v) => v.toFixed(2)).join(",")}`);
      for (let i = 0; i < 3; i++) expect(Math.abs(ours[i]! - painted[i]!), rows.at(-1)).toBeLessThanOrEqual(1);
    }
    console.log(rows.join("\n"));
    expect(h.errors).toEqual([]);
  });

  it("watch fires only when a resolved token changes", async () => {
    const fires = async (counter: string, n: number) => {
      await h.page.waitForFunction(`window.${counter} === ${n}`, undefined, { timeout: 5000 });
    };
    const silent = async (counter: string, action: string) => {
      const before = await h.hook<number>(`window.${counter}`);
      await h.hook(action);
      await h.page.waitForTimeout(200);
      expect(await h.hook<number>(`window.${counter}`), action).toBe(before);
    };
    // A data-theme switch changes --w1.
    await h.hook("document.documentElement.dataset.theme = 'dark'");
    await fires("__changes", 1);
    // Attribute writes that change no token stay silent.
    await silent("__changes", "document.documentElement.style.overflow = 'hidden'");
    await silent("__changes", "document.body.style.setProperty('--unrelated', '3px')");
    await silent("__changes", "document.documentElement.classList.add('theme-x')");
    await silent("__changes", "document.body.appendChild(document.createElement('p'))");
    // The colour scheme changes --w2.
    await h.page.emulateMedia({ colorScheme: "dark" });
    await fires("__changes", 2);
    // A token written on body changes --w1.
    await h.hook("document.body.style.setProperty('--w1', 'rebeccapurple')");
    await fires("__changes", 3);
    // A token scoped on `el` is watched there.
    await h.hook("document.getElementById('scope').classList.add('alt')");
    await fires("__scopeChanges", 1);
    // After unsubscribe, nothing fires.
    await h.hook("window.__unwatch()");
    // This write does change a resolved token (--w2), so only the unsubscribe keeps it silent.
    await silent("__changes", "document.body.style.setProperty('--w2', 'olive')");
    expect(h.errors).toEqual([]);
  });

  it("refuses tokens that are not opaque", async () => {
    const errs = await h.hook<string[]>("window.__alphaErrors");
    expect(errs[0]).toMatch(/token --clear .*not opaque/);
    expect(errs[1]).toMatch(/token --half .*not opaque/);
  });

  it("GLSL_OKLAB compiles in a WebGL2 fragment shader", async () => {
    expect(await h.hook<string>("window.__glsl")).toBe("ok");
  });
});
