import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { hideText } from "../../src/checks/frames.ts";
import { closeBrowsers, openPage } from "../../src/checks/harness.ts";
import { meanAbsDiff } from "../../src/checks/image.ts";
import { VISIBLE_TEXT } from "../../src/checks/text-contrast.ts";
import { serveRoot } from "../../src/checks/serve.ts";

afterAll(closeBrowsers);

describe("harness", () => {
  it("opens the control and returns a non-blank frame", async () => {
    const server = await serveRoot(path.resolve(import.meta.dirname, "../.."));
    const h = await openPage(`${server.url}/controls/spectral-drape/index.html`, {});
    try {
      const f = await h.shot("control-spectral-drape");
      expect(f.w).toBe(2880);
      let sum = 0;
      let sum2 = 0;
      const n = f.w * f.h;
      for (let i = 0; i < n; i++) {
        const o = i * 4;
        const l = (0.2126 * f.data[o]! + 0.7152 * f.data[o + 1]! + 0.0722 * f.data[o + 2]!) / 255;
        sum += l;
        sum2 += l * l;
      }
      const mean = sum / n;
      const std = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
      expect(std).toBeGreaterThan(0.02);
      expect(h.errors).toEqual([]);
    } finally {
      await h.close();
      await server.close();
    }
  });

  it("webgl:false makes getContext('webgl2') null", async () => {
    const server = await serveRoot(path.resolve(import.meta.dirname, "../.."));
    const h = await openPage(`${server.url}/controls/spectral-drape/index.html`, { webgl: false });
    try {
      expect(await h.hook<boolean>("document.createElement('canvas').getContext('webgl2') === null")).toBe(true);
    } finally {
      await h.close();
      await server.close();
    }
  });

  it("initScript runs before the page and shows through hook", async () => {
    const server = await serveRoot(path.resolve(import.meta.dirname, "../.."));
    const h = await openPage(`${server.url}/controls/spectral-drape/index.html`, { initScript: "globalThis.__probe = 42;" });
    try {
      expect(await h.hook<number>("globalThis.__probe")).toBe(42);
    } finally {
      await h.close();
      await server.close();
    }
  });

  it("drops SwiftShader's GL Driver Message lines from warnings, and keeps the rest", async () => {
    const server = await serveRoot(path.resolve(import.meta.dirname, "../.."));
    const initScript = [
      `console.warn("[.WebGL-0x12c0043f000]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels");`,
      `console.warn("GL Driver Message (planted, no prefix)");`,
      `console.warn("planted page warning, mentions GL Driver Message mid-line");`,
    ].join("\n");
    const h = await openPage(`${server.url}/controls/spectral-drape/index.html`, { initScript });
    try {
      expect(h.warnings).toContain("planted page warning, mentions GL Driver Message mid-line");
      expect(h.warnings.filter((w) => /^(\[[^\]]*\])?GL Driver Message/.test(w))).toEqual([]);
    } finally {
      await h.close();
      await server.close();
    }
  });

  it("hideText hides text sitting directly in <body>, so the paint-only frame shows the paint alone", async () => {
    // check-fix (f) fix round 1: `body *` matched elements only, so a bare text node in <body> stayed in the
    // frame the checks read as "the paint alone" and could add luminance range. The canvas goes behind the flow
    // (z-index -1, as many pages place it), so the bare text paints over it.
    const server = await serveRoot(path.resolve(import.meta.dirname, "../.."));
    const h = await openPage(`${server.url}/test/pages/core.html`, { seed: 1, t: 1 });
    try {
      await h.hook(`(() => { document.querySelector("canvas").style.zIndex = "-1"; })()`);
      await hideText(h);
      const without = await h.shot();
      await h.hook(`(() => { document.body.style.fontSize = "80px"; document.body.prepend(document.createTextNode("WWWW MMMM WWWW")); })()`);
      const withText = await h.shot();
      expect(meanAbsDiff(without, withText)).toBe(0);
      expect(h.errors).toEqual([]);
    } finally {
      await h.close();
      await server.close();
    }
  });

  it("text-contrast's visible-text test sees shadow-root, pseudo-element and form-control text, and not blank pages", async () => {
    const server = await serveRoot(path.resolve(import.meta.dirname, "../.."));
    const h = await openPage(`${server.url}/test/pages/core.html`, { seed: 1, t: 1 });
    const count = async (body: string) => {
      await h.page.setContent(`<!doctype html><html><head><style>.b::before { content: "Hello"; }</style></head><body>${body}</body></html>`);
      return h.page.evaluate(VISIBLE_TEXT);
    };
    try {
      const cases: Record<string, string> = {
        plain: "<p>Hello</p>",
        shadow: '<div id="x"></div><script>document.getElementById("x").attachShadow({ mode: "open" }).innerHTML = "<p>Hello</p>";</script>',
        nestedShadow:
          '<div id="x"></div><script>const r = document.getElementById("x").attachShadow({ mode: "open" }); r.innerHTML = "<span id=y></span>"; r.getElementById("y").attachShadow({ mode: "open" }).innerHTML = "<button>Go</button>";</script>',
        before: '<div class="b" style="width: 50px; height: 20px"></div>',
        inputValue: '<input type="button" value="Get started">',
        placeholder: '<input placeholder="Your email">',
      };
      for (const [name, body] of Object.entries(cases)) expect(await count(body), name).toBeGreaterThan(0);
      for (const [name, body] of Object.entries({ empty: "<canvas></canvas>", blank: "<div>   </div>", script: "<script>1</script>" }))
        expect(await count(body), name).toBe(0);
    } finally {
      await h.close();
      await server.close();
    }
  });
});

describe("bar view", () => {
  it("a bar that declares a view opens at that size for checks", async () => {
    const { open } = await import("../../src/checks/frames.ts");
    const { resolveTarget } = await import("../../src/checks/gate.ts");
    const root = path.resolve(import.meta.dirname, "../..");
    const server = await serveRoot(root);
    try {
      const target = resolveTarget(path.join(root, "bars/02-denim-zip"), {}, server.url);
      expect(target.bar?.view).toEqual({ width: 393, height: 852 });
      const h = await open(target, {}, { t: 0 });
      try {
        expect(await h.hook<number[]>("[innerWidth, innerHeight, devicePixelRatio]")).toEqual([393, 852, 1]);
      } finally {
        await h.close();
      }
    } finally {
      await server.close();
    }
  });
});
