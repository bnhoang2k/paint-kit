// One source for the twill weave: the engine's shared GLSL chunk (GLSL_TWILL) defines it, `fields.twill` builds
// from it, and a page that moves its cloth (bar 02) includes it through `paint-kit` instead of copying it.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as engine from "../../src/engine/index.ts";
import { GLSL_TWILL } from "../../src/engine/glsl/twill.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const CHUNK = "src/engine/glsl/twill.ts";

// Every file that could hold weave GLSL: the engine's sources and every bar page.
function sources(): string[] {
  const out: string[] = [];
  const walk = (rel: string, ext: string) => {
    for (const e of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
      const r = path.join(rel, e.name);
      if (e.isDirectory()) walk(r, ext);
      else if (r.endsWith(ext)) out.push(r);
    }
  };
  walk("src/engine", ".ts");
  walk("bars", ".html");
  return out;
}

// The weave's body, as it would show in a copy: its struct, its functions and its depth constants. The yarn
// profile and the weave cell maths are the parts a copy would carry, whatever it renamed.
const BODY = [
  /struct\s+\w*Weave\s*\{/,
  /\bfloat\s+\w*yarn\s*\(\s*float/i,
  /sqrt\(1\.0 \+ \w*RATIO \* \w*RATIO\) \/ \(4\.0 \* \w*RATIO/,
  /mod\(\w+\.cell\.x - \w+\.cell\.y, 4\.0\)/,
  /\b0\.0011\b/,
  /\b0\.00045\b/,
];

describe("the twill weave has one source", () => {
  it("the engine exports the chunk", () => {
    expect(engine.GLSL_TWILL).toBe(GLSL_TWILL);
    expect(GLSL_TWILL).toMatch(/float twillHeight\(vec2 q, float wales, float angle, float side, float detail\)/);
    expect(GLSL_TWILL).toMatch(/vec2 twillDir\(vec2 q, float wales, float angle\)/);
  });

  it("only the chunk defines the weave body", () => {
    const hits = sources().filter((rel) => BODY.some((re) => re.test(read(rel))));
    expect(hits).toEqual([CHUNK]);
  });

  it("fields.twill and bar 02 build from the chunk", () => {
    expect(read("src/engine/fields/twill.ts")).toMatch(/\$\{GLSL_TWILL\}/);
    const bar = read("bars/02-denim-zip/index.html");
    expect(bar).toMatch(/import \{[^}]*\bGLSL_TWILL\b[^}]*\} from 'paint-kit'/);
    expect(bar).toMatch(/\$\{GLSL_TWILL\}/);
    expect(bar).toMatch(/twillHeight\(/);
    expect(bar).toMatch(/twillDir\(/);
  });
});
