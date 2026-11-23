import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { init, nextSteps } from "../../src/cli/init.ts";
import { UsageError, resolveTarget, servedRootFor } from "../../src/checks/gate.ts";
import { REPO_ROOT } from "../../src/checks/root.ts";

// Everything here lives outside the repo, as a project that uses the kit does.
const tmp = mkdtempSync(path.join(tmpdir(), "paint-kit-init-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

/** A fake kit with a built engine: two .js files (one nested) and a .d.ts that init must leave out. */
function fakeKit(name: string): string {
  const kit = path.join(tmp, name);
  mkdirSync(path.join(kit, "dist/src/engine/lights"), { recursive: true });
  writeFileSync(path.join(kit, "package.json"), JSON.stringify({ version: "9.8.7" }));
  writeFileSync(path.join(kit, "dist/src/engine/index.js"), "export const v = 1;\n");
  writeFileSync(path.join(kit, "dist/src/engine/index.d.ts"), "export declare const v: number;\n");
  writeFileSync(path.join(kit, "dist/src/engine/lights/lamp.js"), "export const lamp = 1;\n");
  return kit;
}

describe("init", () => {
  it("copies the engine's .js files to <folder>/dist/src/engine and stamps the version", () => {
    const kit = fakeKit("kit-a");
    const site = path.join(tmp, "site-a");
    const r = init(site, kit);
    expect(r).toMatchObject({ root: site, version: "9.8.7", files: 2, replaced: false });
    expect(readFileSync(path.join(site, "dist/src/engine/index.js"), "utf8")).toBe("export const v = 1;\n");
    expect(existsSync(path.join(site, "dist/src/engine/lights/lamp.js"))).toBe(true);
    expect(existsSync(path.join(site, "dist/src/engine/index.d.ts"))).toBe(false);
    expect(JSON.parse(readFileSync(path.join(site, "dist/paint-kit.json"), "utf8")).version).toBe("9.8.7");
  });

  it("replaces a copy it wrote before, dropping files the new engine no longer has", () => {
    const kit = fakeKit("kit-b");
    const site = path.join(tmp, "site-b");
    init(site, kit);
    writeFileSync(path.join(site, "dist/src/engine/stale.js"), "old\n");
    expect(init(site, kit).replaced).toBe(true);
    expect(existsSync(path.join(site, "dist/src/engine/stale.js"))).toBe(false);
  });

  it("refuses to touch a dist/src/engine it did not write, and a kit with no built engine", () => {
    const kit = fakeKit("kit-c");
    const site = path.join(tmp, "site-c");
    mkdirSync(path.join(site, "dist/src/engine"), { recursive: true });
    writeFileSync(path.join(site, "dist/src/engine/theirs.js"), "theirs\n");
    expect(() => init(site, kit)).toThrow(UsageError);
    expect(() => init(site, kit)).toThrow(/did not write it/);
    expect(readFileSync(path.join(site, "dist/src/engine/theirs.js"), "utf8")).toBe("theirs\n");
    rmSync(path.join(kit, "dist"), { recursive: true });
    expect(() => init(path.join(tmp, "site-c2"), kit)).toThrow(/not built; run `pnpm build`/);
  });

  it("prints the import map and the gate command for the folder", () => {
    const kit = fakeKit("kit-d");
    const out = nextSteps(init(path.join(tmp, "site-d"), kit), kit);
    expect(out).toContain('{"imports":{"paint-kit":"/dist/src/engine/index.js"}}');
    expect(out).toContain(`${path.join(kit, "dist/src/cli/paint-kit.js")} gate ${path.join(tmp, "site-d")}`);
  });
});

describe("the gate's served root for a page outside the kit", () => {
  const bar = { id: "outside", reference: { shelfKey: "none", title: "t" }, palette: { ground: "--ground", ink: "--ink", accents: [] }, detail: 0.5, seeds: [1, 2], laws: ["relief"], alive: { rests: "still" }, beats: [] };

  it("serves the nearest folder above the page that init set up, and points the url and file at the page", () => {
    const site = path.join(tmp, "site-e");
    init(site, fakeKit("kit-e"));
    const page = path.join(site, "pages/lamp");
    mkdirSync(page, { recursive: true });
    writeFileSync(path.join(page, "index.html"), "<!doctype html>");
    writeFileSync(path.join(page, "bar.json"), JSON.stringify(bar));
    expect(servedRootFor(page)).toBe(site);
    const t = resolveTarget(page, {}, "http://x");
    expect(t).toMatchObject({ url: "http://x/pages/lamp/index.html", file: path.join(page, "index.html"), control: false });
    expect(t.bar?.seeds).toEqual([1, 2]);
  });

  // Planted fault: a page outside the kit with no engine above it once read as "outside the repo"; now it names init.
  it("refuses a page with no engine above it, and names init", () => {
    const page = path.join(tmp, "bare");
    mkdirSync(page, { recursive: true });
    writeFileSync(path.join(page, "index.html"), "<!doctype html>");
    expect(() => servedRootFor(page)).toThrow(/paint-kit init <folder>/);
    expect(() => resolveTarget(page, {}, "http://x")).toThrow(UsageError);
  });

  it("keeps serving the kit repo for a page inside it", () => {
    expect(servedRootFor(path.join(REPO_ROOT, "bars/01-lamp-on-paper"))).toBe(REPO_ROOT);
    expect(resolveTarget(path.join(REPO_ROOT, "bars/01-lamp-on-paper"), {}, "http://x").url).toBe("http://x/bars/01-lamp-on-paper/index.html");
  });
});
