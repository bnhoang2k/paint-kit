// palette: colour comes from the page's tokens. Runtime: swap the tokens and the frame follows. Static: no colour literals.
//
// Token names: with a bar, `bar.palette` (ground, ink, accents); without one, the names the painter's palette reads,
// from `__paint.tokens()` (`fromPage` lists them); without that, `--ground` and `--ink` and no accents.
// `__paint.setPalette` writes these custom properties on the root element.
//
// The rule has three halves (check-fix (b) round 3; three pixel-only designs did not converge, so the guarantee moved
// into code structure, with a pixel smoke test beside it):
//   S1 the engine owns token reads. Page and bar code may not read the palette: no getComputedStyle or
//      getPropertyValue, no import of the engine's colour helpers (every function palette.ts exports except
//      fromPage), no `.read()` call, no `palette:` that is not a direct `fromPage(...)` call (a page's own palette
//      source), and no colour uniform it sets (a GLSL `uniform vec3` or `vec4`, with or without a precision
//      qualifier, without `// not-colour: <reason>` on its line, or a direct `uniform3f` / `uniform4f` call). A field that builds a picture from the palette takes it from the
//      engine (`FieldContext.colours`, halftone's function source).
//   S2 lights come from the engine's light constructors only. Page and bar code may not define a light shader
//      (`LightSum` / `light_$`) or an object with a Light's `resolve`, `with` or `testPositions`.
//   S3 runtime smoke test: every token goes to a far colour at once and the share of the frame's pixels that move
//      by a visible amount (OKLab distance palette.visibleMove) must reach palette.moveShare. Far colours come from
//      each token's OWN lightness: ground goes to the pole farther from its own OKLab L (the light pole
//      oklch(0.95 0.03 30) under the poles' midpoint 0.625, else the dark pole oklch(0.3 0.12 30)) and ink to the
//      other pole, so the two never meet; each accent goes to the farther pole lightness, its own chroma, its hue
//      turned 180 degrees. No probes, no per-token rule: S1 and S2 close the read-once holes the per-token rule chased.
// S1 and S2 scan the target's inline <script> bodies (and bar-local .js and .glsl files when a bar exists), with
// comments removed. Token names: with a bar, `bar.palette`; without one, `__paint.tokens()` (what fromPage lists);
// without that, `--ground` and `--ink` and no accents. They are needed only by S3 (S1 bans the read, not a name).
// The gate opens the page in the light scheme only; CheckOpts.dark opens the dark scheme for a one-off run.
// With a bar, the bar's token names must be the ones the painter reads (`__paint.tokens()`, when it lists them):
// otherwise the swap would move tokens the painter never reads, so the check is partial and names both.
//
// Static rule: scan the page's inline <style>, <script> and style="" attributes (and bar-local .js, .glsl and .css files when a bar exists).
// A custom property DECLARATION in CSS (`--x: oklch(...)`) is the page's palette and is allowed: it is removed
// before scanning. Everything else is flagged: `#rgb`..`#rrggbbaa` in a value position (a CSS id selector such as `#add` is not a colour), `rgb(`/`rgba(`, `hsl(`/`hsla(`, a GLSL
// `vec3(a, b, c)` of three number literals without `// not-colour:` on its line, and a CSS named colour only in a
// colour context (a colour property's value, `.style.<colour property> = '...'`, `fillStyle`, `strokeStyle`).
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { hasHook, hideText, open, round } from "./frames.ts";
import * as enginePalette from "../engine/palette.ts";
import { linearToOklch, parseCssColor, type PaletteTokens, type Vec3 } from "../engine/palette.ts";
import { movedShare } from "./image.ts";
import { REPO_ROOT } from "./root.ts";
import { threshold } from "./threshold.ts";
import type { Check, CheckResult } from "./types.ts";

const NAME = "palette";
const NAMED = "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen".split(" ");
const NAMED_RE = new RegExp(`\\b(${NAMED.join("|")})\\b`, "i");
const NUM = String.raw`[-+]?(?:\d+\.?\d*|\.\d+)`;
const VEC3 = new RegExp(String.raw`\bvec3\(\s*${NUM}\s*,\s*${NUM}\s*,\s*${NUM}\s*\)`);
const COLOUR_PROP = String.raw`(?:color|background(?:-color)?|border(?:-(?:top|right|bottom|left))?(?:-color)?|outline(?:-color)?|fill|stroke|caret-color|accent-color|text-decoration-color)`;
const CSS_DECL = new RegExp(String.raw`(?:^|[;{\s])${COLOUR_PROP}\s*:\s*([^;}]*)`, "gi");
const JS_STYLE = /\.style\.(?:\w*[cC]olor|background\w*|fill|stroke)\s*=\s*(['"`])([^'"`]*)\1|\b(?:fillStyle|strokeStyle)\s*=\s*(['"`])([^'"`]*)\3/g;

type Kind = "css" | "js";
const HEX = /#[0-9a-f]{3,8}\b/i;
const SELECTOR_CALL = /\b(?:querySelector(?:All)?|closest|matches|getElementById)\(\s*(['"`])[^'"`]*\1/g;

/** Inline <style> and <script> bodies and `style="..."` attributes of an html text, each with the line it starts on. */
function inlineBlocks(html: string): { text: string; line: number; kind: Kind }[] {
  const out: { text: string; line: number; kind: Kind }[] = [];
  const lineAt = (i: number) => html.slice(0, i).split("\n").length;
  for (const m of html.matchAll(/<(style|script)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
    if (/\bsrc\s*=/.test(m[2]!)) continue;
    if (/type\s*=\s*["']importmap["']/i.test(m[2]!)) continue;
    out.push({ text: m[3]!, line: lineAt(m.index! + m[0].indexOf(">") + 1), kind: m[1]!.toLowerCase() === "style" ? "css" : "js" });
  }
  for (const m of html.matchAll(/\sstyle\s*=\s*(["'])([\s\S]*?)\1/gi)) out.push({ text: `${m[2]};`, line: lineAt(m.index!), kind: "css" });
  return out;
}

/**
 * Findings for one text: `where:line what`. Custom property declarations are stripped first (they are the palette).
 * A hex colour counts only in a value position: in CSS, between `:` and the `;` or `}` that ends the declaration
 * (so a selector such as `#add` is never a hex colour); in script, anywhere except inside the string of a selector
 * call such as `querySelector('#add')`.
 */
export function scanText(raw: string, where: string, firstLine = 1, kind: Kind = "js"): string[] {
  let text = raw.replace(/--[\w-]+\s*:[^;}]*/g, (d) => d.replace(/[^\n]/g, " "));
  if (kind === "js") text = text.replace(SELECTOR_CALL, (d) => d.replace(/[^\n]/g, " "));
  const found: string[] = [];
  const lineOf = (index: number) => firstLine + text.slice(0, index).split("\n").length - 1;
  text.split("\n").forEach((ln, i) => {
    const at = `${where}:${firstLine + i}`;
    if (kind === "js" && HEX.test(ln)) found.push(`${at} hex colour ${ln.match(HEX)![0]}`);
    if (/\brgba?\(/i.test(ln)) found.push(`${at} rgb() colour`);
    if (/\bhsla?\(/i.test(ln)) found.push(`${at} hsl() colour`);
    if (VEC3.test(ln) && !ln.includes("// not-colour:")) found.push(`${at} vec3 literal ${ln.match(VEC3)![0]} without "// not-colour: <reason>"`);
    JS_STYLE.lastIndex = 0;
    for (const m of ln.matchAll(JS_STYLE)) {
      const v = (m[2] ?? m[4] ?? "").replace(/var\([^)]*\)/g, "");
      if (NAMED_RE.test(v)) found.push(`${at} named colour "${v.trim()}" assigned in script`);
    }
  });
  if (kind === "css") {
    for (const m of text.matchAll(/:\s*([^;{}]*)[;}]/g)) {
      const hex = m[1]!.match(HEX);
      if (hex) found.push(`${where}:${lineOf(m.index!)} hex colour ${hex[0]}`);
    }
  }
  for (const m of text.matchAll(CSS_DECL)) {
    const v = m[1]!.replace(/var\([^)]*\)/g, "");
    const named = v.match(NAMED_RE);
    if (named) found.push(`${where}:${lineOf(m.index!)} named colour ${named[0]} in CSS`);
  }
  return [...new Set(found)];
}

/** The static half over an html text: inline style blocks, style attributes and scripts. */
export function scanHtml(html: string, where: string): string[] {
  return inlineBlocks(html).flatMap((b) => scanText(b.text, where, b.line, b.kind));
}

function barFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const f = path.join(dir, name);
    if (statSync(f).isDirectory()) out.push(...barFiles(f));
    else if (/\.(js|glsl|css)$/.test(name)) out.push(f);
  }
  return out;
}

/** A file's name in a finding: relative to the kit for a file inside it, the full path for a page outside it. */
const rel = (f: string): string => {
  const r = path.relative(REPO_ROOT, f);
  return r.startsWith("..") || path.isAbsolute(r) ? f : r;
};

/** Static half over the target's html (a path under the repo root) and, with a bar, its local .js, .glsl and .css files. */
export function staticFindings(htmlFile: string, hasBar: boolean): string[] {
  const found = scanHtml(readFileSync(htmlFile, "utf8"), rel(htmlFile));
  if (hasBar) {
    for (const f of barFiles(path.dirname(htmlFile))) found.push(...scanText(readFileSync(f, "utf8"), rel(f), 1, f.endsWith(".css") ? "css" : "js"));
  }
  return found;
}

/** The two lightness poles of the far palette, as `oklch()`. */
const DARK_POLE = { L: 0.3, C: 0.12, h: 30 };
const LIGHT_POLE = { L: 0.95, C: 0.03, h: 30 };
const css = (p: { L: number; C: number; h: number }) => `oklch(${p.L} ${p.C} ${p.h})`;
/** The poles' midpoint: an accent under it is nearer the dark pole, so the light pole is its far side. */
const POLE_MID = (DARK_POLE.L + LIGHT_POLE.L) / 2;

/**
 * Far colours for every token, from each token's own OKLCH (S3): ground to the pole farther from its own lightness,
 * ink to the other pole (so ground and ink never share one), each accent by `farAccent`.
 */
export function farColours(lch: Vec3[]): string[] {
  const [g, , ...accents] = lch;
  const groundPole = g![0] < POLE_MID ? LIGHT_POLE : DARK_POLE;
  const inkPole = groundPole === LIGHT_POLE ? DARK_POLE : LIGHT_POLE;
  return [css(groundPole), css(inkPole), ...accents.map(farAccent)];
}

/**
 * An accent's far colour, from its own OKLCH: the farther of the two pole lightnesses (the light pole under the
 * poles' midpoint, 0.625, else the dark pole), its own chroma, its hue turned 180 degrees. Chroma and hue are rounded to 4 and 2 decimals.
 */
export function farAccent([L, C, h]: Vec3): string {
  const far = L < POLE_MID ? LIGHT_POLE.L : DARK_POLE.L;
  return `oklch(${far} ${Number(C.toFixed(4))} ${Number(((h + 180) % 360).toFixed(2))})`;
}

const tokenName = (t: string) => t.trim().replace(/^var\(\s*/, "").replace(/\s*\)$/, "");

/** A line naming both lists when a bar's token names differ from the names the painter reads; null when they agree or the painter lists none. */
export function tokenMismatch(barTokens: PaletteTokens | null, listed: PaletteTokens | null): string | null {
  if (!barTokens || !listed) return null;
  const norm = (t: PaletteTokens) => ({ ground: tokenName(t.ground), ink: tokenName(t.ink), accents: t.accents.map(tokenName) });
  const b = norm(barTokens);
  const l = norm(listed);
  const same = b.ground === l.ground && b.ink === l.ink && b.accents.length === l.accents.length && b.accents.every((a, i) => a === l.accents[i]);
  if (same) return null;
  const show = (t: PaletteTokens) => `ground ${t.ground}, ink ${t.ink}, accents [${t.accents.join(", ")}]`;
  return `the bar names the tokens ${show(b)} but the painter reads ${show(l)}, so a swap would move tokens the painter never reads`;
}

const pct = (v: number) => `${round(v * 100, 1)}%`;

/** Engine functions page code may not call (S1): every function palette.ts exports except `fromPage`. */
export const COLOUR_API = Object.keys(enginePalette).filter((k) => k !== "fromPage" && typeof (enginePalette as Record<string, unknown>)[k] === "function");

/** Comments blanked (newlines kept, so line numbers hold); a `//` after `:` (a URL) is not a comment. */
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " ")).replace(/(^|[^:])\/\/[^\n]*/gm, (m, pre: string) => pre + " ".repeat(m.length - pre.length));

const READS: [RegExp, string][] = [
  [/\bgetComputedStyle\s*\(/, "calls getComputedStyle"],
  [/\.getPropertyValue\s*\(/, "calls getPropertyValue"],
  [/\.read\s*\(\s*\)/, "calls .read() (reads the palette)"],
  [/\bpalette\s*:(?!\s*fromPage\s*\()|(?:^|[{,])\s*palette\s*(?:[,}]|$)/, "passes paint() a palette that is not a direct fromPage(...) call (its own palette source)"],
  [/\buniform[34]f(?:v)?\s*\(/, "sets a uniform directly"],
];
const LIGHTS: [RegExp, string][] = [
  [/\bLightSum\b|\blight_\$/, "defines a light shader (LightSum light_$)"],
  [/\b(?:resolve|with|testPositions)\s*(?:\([^)]*\)\s*\{|:)/, "defines a Light's resolve, with or testPositions"],
];

/**
 * S1 and S2 over one script or shader text: `{ reads, lights }`, each finding `where:line what`. Comments are
 * removed first; a `uniform vec3` or `uniform vec4` (with or without a precision qualifier) is a colour uniform
 * unless its own line carries `// not-colour: <reason>`.
 */
export function structureFindings(raw: string, where: string, firstLine = 1): { reads: string[]; lights: string[] } {
  const reads: string[] = [];
  const lights: string[] = [];
  const raws = raw.split("\n");
  const text = stripComments(raw);
  for (const m of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']paint-kit["']/g)) {
    const used = m[1]!.split(",").map((s) => s.trim().split(/\s+as\s+/)[0]!).filter((n) => COLOUR_API.includes(n));
    if (used.length) reads.push(`${where}:${firstLine + text.slice(0, m.index).split("\n").length - 1} imports the engine's colour helper${used.length > 1 ? "s" : ""} ${used.join(", ")}`);
  }
  text.split("\n").forEach((ln, i) => {
    const at = `${where}:${firstLine + i}`;
    for (const [re, what] of READS) if (re.test(ln)) reads.push(`${at} ${what}`);
    // A precision qualifier may stand between `uniform` and the type; vec4 is a colour with alpha.
    const colourUniform = /\buniform\s+(?:(?:lowp|mediump|highp)\s+)?(vec[34])\b/.exec(ln);
    if (colourUniform && !raws[i]!.includes("// not-colour:")) reads.push(`${at} declares a ${colourUniform[1]} uniform (a colour set from page code) without "// not-colour: <reason>"`);
    for (const [re, what] of LIGHTS) if (re.test(ln)) lights.push(`${at} ${what}`);
  });
  return { reads, lights };
}

/** S1 and S2 over the target's html scripts and, with a bar, its local .js and .glsl files. */
export function structureOf(htmlFile: string, hasBar: boolean): { reads: string[]; lights: string[] } {
  const parts = inlineBlocks(readFileSync(htmlFile, "utf8")).filter((b) => b.kind === "js").map((b) => structureFindings(b.text, rel(htmlFile), b.line));
  if (hasBar) for (const f of barFiles(path.dirname(htmlFile))) if (!f.endsWith(".css")) parts.push(structureFindings(readFileSync(f, "utf8"), rel(f)));
  return { reads: parts.flatMap((p) => p.reads), lights: parts.flatMap((p) => p.lights) };
}

const list = (hits: string[]) => `${hits.slice(0, 3).join("; ")}${hits.length > 3 ? "; ..." : ""}`;

export const check: Check = async (target, opts) => {
  const { bar } = target;
  const done = (status: CheckResult["status"], line: string, measured: Record<string, number>): CheckResult => ({ name: NAME, status, line: `${NAME}: ${line}`, measured });
  const floor = threshold("palette.moveShare", bar);
  const visible = threshold("palette.visibleMove", bar);
  const problems: string[] = [];
  const measured: Record<string, number> = {};
  let tokenWords = "";

  // S3: swap every token to its far colour at once; a visible share of the frame must move.
  const h = await open(target, opts, { t: 1 });
  try {
    if (!(await hasHook(h))) return done("partial", "the page has no window.__paint hook, so its tokens cannot be swapped", {});
    const listed = await h.hook<PaletteTokens | null>("typeof __paint.tokens === 'function' ? __paint.tokens() : null");
    const pal = bar?.palette ?? listed ?? { ground: "--ground", ink: "--ink", accents: [] };
    const names = [pal.ground, pal.ink, ...pal.accents].map(tokenName);
    const mismatch = tokenMismatch(bar?.palette ?? null, listed);
    if (mismatch) return done("partial", mismatch, {});
    const unset = await h.hook<string[]>(`${JSON.stringify(names)}.filter((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() === "")`);
    if (unset.length) return done("partial", `the palette token${unset.length > 1 ? "s" : ""} ${unset.join(", ")} ${unset.length > 1 ? "are" : "is"} unset, so the frame's tokens are unknown`, {});
    const computed = await h.hook<string[]>(
      `${JSON.stringify(names)}.map((n) => { const p = document.createElement("span"); p.style.color = "var(" + n + ")"; document.body.append(p); const v = getComputedStyle(p).color; p.remove(); return v; })`,
    );
    await hideText(h);
    const before = await h.shot();
    const far = farColours(computed.map((c) => linearToOklch(parseCssColor(c))));
    await h.hook(`__paint.setPalette(${JSON.stringify(Object.fromEntries(names.map((n, i) => [n, far[i]!])))})`);
    const after = await h.shot();
    measured.movedShare = movedShare(before, after, visible);
    measured.accents = pal.accents.length;
    tokenWords = `ground, ink${pal.accents.length ? ` and ${pal.accents.length} accent${pal.accents.length > 1 ? "s" : ""}` : ", no accents"}`;
    if (measured.movedShare < floor) problems.push(`the frame ignores the page's tokens: ${pct(measured.movedShare)} of its pixels moved visibly when every token was swapped, under ${pct(floor)}`);
  } finally {
    await h.close();
  }

  // S1, S2 and the colour literals: static.
  // The page's own file: a page outside the kit is served from its init folder, not the repo.
  const file = target.file ?? path.join(REPO_ROOT, decodeURIComponent(new URL(target.url).pathname));
  const hits = existsSync(file) ? staticFindings(file, bar !== null) : [];
  const shape = existsSync(file) ? structureOf(file, bar !== null) : { reads: [], lights: [] };
  measured.staticHits = hits.length;
  measured.tokenReads = shape.reads.length;
  measured.customLights = shape.lights.length;
  if (shape.reads.length > 0) problems.push(`page code reads the palette itself (only the engine may): ${list(shape.reads)}`);
  if (shape.lights.length > 0) problems.push(`page code makes its own Light (only the engine's light constructors may): ${list(shape.lights)}`);
  if (hits.length > 0) problems.push(`${hits.length} colour literal(s) outside the tokens: ${list(hits)}`);

  const facts = `${pct(measured.movedShare ?? 0)} of the frame moved by OKLab ${visible} or more when every token was swapped (${tokenWords}; needs ${pct(floor)}), ${shape.reads.length} palette reads and ${shape.lights.length} custom lights in page code, ${hits.length} colour literals`;
  return problems.length > 0 ? done("fail", `${problems.join("; ")} (${facts})`, measured) : done("pass", facts, measured);
};
