import { describe, expect, it } from "vitest";
import { COLOUR_API, farAccent, farColours, scanHtml, scanText, structureFindings, tokenMismatch } from "../../src/checks/palette.ts";
import { movedShare } from "../../src/checks/image.ts";
import { linearToOklch, parseCssColor } from "../../src/engine/palette.ts";

describe("palette static scan", () => {
  it("allows custom property declarations (the page's palette)", () => {
    expect(scanText(":root { --ground: #fafafa; --ink: rgb(1, 2, 3); }", "x.css", 1, "css")).toEqual([]);
  });

  it("flags a hex in a value position but not a CSS id selector", () => {
    expect(scanText("#add { color: var(--ink); }\na:hover #bad { margin: 0; }", "x.css", 1, "css")).toEqual([]);
    expect(scanText("p { color: #abc; }", "x.css", 1, "css")).toHaveLength(1);
  });

  it("does not flag a hex-looking id selector in script", () => {
    expect(scanText("document.querySelector('#add'); el.closest(\"#fade\")", "x.js", 1, "js")).toEqual([]);
    expect(scanText("ctx.fillStyle = '#fa0';", "x.js", 1, "js")).toHaveLength(1);
  });

  it("flags rgb(), hsl(), an untagged vec3 literal and a named colour in colour context", () => {
    expect(scanText("p { color: rgb(1, 2, 3); }", "x.css", 1, "css")).toHaveLength(1);
    expect(scanText("p { color: hsl(1 2% 3%); }", "x.css", 1, "css")).toHaveLength(1);
    expect(scanText("vec3 c = vec3(0.9, 0.4, 0.2);", "x.glsl", 1, "js")).toHaveLength(1);
    expect(scanText("vec3 c = vec3(0.9, 0.4, 0.2); // not-colour: a direction", "x.glsl", 1, "js")).toEqual([]);
    expect(scanText("p { color: coral; }", "x.css", 1, "css")).toHaveLength(1);
    expect(scanText("const preset = 'coral';", "x.js", 1, "js")).toEqual([]);
  });

  it("covers inline style attributes, style blocks and scripts of an html text", () => {
    const html = `<style>p { color: var(--ink); } #add { margin: 0 }</style><div style="background: #123456"></div><script>el.style.color = 'red'</script>`;
    const hits = scanHtml(html, "page.html");
    expect(hits).toHaveLength(2);
    expect(scanHtml(`<div style="color: var(--ink)"></div>`, "page.html")).toEqual([]);
  });
});

describe("palette far palette", () => {
  const lch = (css: string) => linearToOklch(parseCssColor(css));
  it("sends each accent to the lightness pole on the other side of 0.5, its hue turned half way round", () => {
    // A dark accent goes to the light pole (0.95), a light one to the dark pole (0.3), the poles the far ground and ink use.
    const dark = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(farAccent(lch("oklch(0.36 0.11 262)")))!;
    expect(Number(dark[1])).toBe(0.95);
    expect(Number(dark[2])).toBeCloseTo(0.11, 3);
    expect(Number(dark[3])).toBeCloseTo(82, 1);
    const light = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(farAccent(lch("oklch(0.7 0.12 50)")))!;
    expect(Number(light[1])).toBe(0.3);
    expect(Number(light[3])).toBeCloseTo(230, 1);
  });
  it("splits at the poles' midpoint, 0.625: an accent at L 0.55 is nearer the dark pole, so it goes to the light one", () => {
    expect(farAccent([0.55, 0.005, 60]).startsWith("oklch(0.95 ")).toBe(true);
    expect(farAccent([0.63, 0.1, 60]).startsWith("oklch(0.3 ")).toBe(true);
  });
  it("sends ground to the pole far from its own lightness and ink to the other pole, whatever the ink's own lightness", () => {
    const L = "oklch(0.95 0.03 30)";
    const D = "oklch(0.3 0.12 30)";
    expect(farColours([[0.93, 0.03, 250], [0.3, 0.04, 255]])).toEqual([D, L]);
    expect(farColours([[0.25, 0.03, 255], [0.92, 0.02, 250]])).toEqual([L, D]);
    // Ground and ink both light: they still go to opposite poles, so the swap never paints them one colour.
    expect(farColours([[0.9, 0.03, 250], [0.8, 0.02, 250]])).toEqual([D, L]);
    expect(farColours([[0.93, 0.03, 250], [0.3, 0.04, 255], [0.62, 0.13, 45]])[2]).toBe(farAccent([0.62, 0.13, 45]));
  });
});

describe("palette moved share (S3)", () => {
  const px = (cs: number[][]) => ({ w: cs.length, h: 1, data: new Uint8ClampedArray(cs.flatMap((c) => [...c, 255])) });
  it("counts the pixels that move by at least the visible distance", () => {
    const before = px([[200, 40, 40], [200, 40, 40], [40, 40, 200], [128, 128, 128]]);
    const after = px([[40, 200, 40], [200, 40, 40], [40, 40, 201], [20, 20, 20]]);
    expect(movedShare(before, after, 0.02)).toBe(0.5);
  });
});

describe("palette structure (S1 token reads, S2 custom lights)", () => {
  const reads = (s: string) => structureFindings(s, "x.js").reads;
  const lights = (s: string) => structureFindings(s, "x.js").lights;
  it("each read rule flags its planted read", () => {
    expect(reads("const v = getComputedStyle(probe).color;")).toEqual(["x.js:1 calls getComputedStyle"]);
    expect(reads("el.style.getPropertyValue('--accent')")).toEqual(["x.js:1 calls getPropertyValue"]);
    expect(reads("const r = fromPage(spec).read();")).toEqual(["x.js:1 calls .read() (reads the palette)"]);
    expect(reads("paint(c, { seed: 1, palette: baked, fields })")).toHaveLength(1);
    expect(reads("paint(c, { seed: 1, palette, fields })")).toHaveLength(1);
    expect(reads("gl.uniform3fv(loc, c);")).toEqual(["x.js:1 sets a uniform directly"]);
    expect(reads("const g = `\nuniform vec3 u_$_baked;`;")[0]).toMatch(/^x\.js:2 declares a vec3 uniform/);
    // Check-fix (b) round 3, fix round 1 (M1): a precision qualifier and vec4 (a tint with alpha) are colour uniforms too.
    for (const p of ["lowp", "mediump", "highp"]) expect(reads(`uniform ${p} vec3 u_$_tint;`)).toEqual([`x.js:1 declares a vec3 uniform (a colour set from page code) without "// not-colour: <reason>"`]);
    expect(reads("uniform vec4 u_$_tint;")).toEqual([`x.js:1 declares a vec4 uniform (a colour set from page code) without "// not-colour: <reason>"`]);
    expect(reads("uniform  highp  vec4 u_$_tint;")).toEqual([`x.js:1 declares a vec4 uniform (a colour set from page code) without "// not-colour: <reason>"`]);
    expect(reads('import { paint, fields, parseCssColor, buildRamp as b } from "paint-kit";')).toEqual(["x.js:1 imports the engine's colour helpers parseCssColor, buildRamp"]);
  });
  it("leaves honest page code alone", () => {
    expect(reads('import { paint, fields, materials, lights, fromPage } from "paint-kit";\npaint(c, { palette: fromPage({ ground: "--ground", ink: "--ink", accents: ["--accent"] }) });')).toEqual([]);
    expect(reads("uniform vec3 u_$_dir; // not-colour: a direction")).toEqual([]);
    expect(reads("uniform highp vec3 u_$_dir; // not-colour: a direction")).toEqual([]);
    expect(reads("uniform vec4 u_$_rect; // not-colour: a box in px")).toEqual([]);
    expect(reads("uniform vec2 uRes;\nuniform highp float uCell;\nuniform mat3 uTurn;")).toEqual([]);
    expect(reads("// getComputedStyle would read the tokens; see https://example.org/a.read()\n/* palette: x */")).toEqual([]);
    expect(reads("m.albedo = mixOklab(uRamp[2], uGround, 0.3);")).toEqual([]);
    expect(lights("new Promise((resolve) => setTimeout(resolve, 10));")).toEqual([]);
  });
  it("each light rule flags its planted Light", () => {
    expect(lights("LightSum light_$(Surf s, MatOut m) {")).toHaveLength(1);
    expect(lights("const g = { ...real, resolve(ramp) { return c; } };")).toEqual(["x.js:1 defines a Light's resolve, with or testPositions"]);
    expect(lights("testPositions: (step) => ({})")).toHaveLength(1);
    expect(lights("with: (p) => fake(p),")).toHaveLength(1);
  });
  it("names every function palette.ts exports except fromPage as a colour helper", () => {
    expect(COLOUR_API).toContain("parseCssColor");
    expect(COLOUR_API).toContain("buildRamp");
    expect(COLOUR_API).not.toContain("fromPage");
  });
});

describe("palette token names", () => {
  const t = (accents: string[]) => ({ ground: "--ground", ink: "--ink", accents });
  it("agrees when the bar and the painter name the same tokens (var() or not)", () => {
    expect(tokenMismatch({ ground: "var(--ground)", ink: "--ink", accents: ["--accent"] }, t(["--accent"]))).toBeNull();
    expect(tokenMismatch(t(["--glow"]), null)).toBeNull();
  });
  it("names both lists when they differ", () => {
    expect(tokenMismatch(t(["--glow"]), t(["--accent"]))).toBe(
      "the bar names the tokens ground --ground, ink --ink, accents [--glow] but the painter reads ground --ground, ink --ink, accents [--accent], so a swap would move tokens the painter never reads",
    );
  });
});
