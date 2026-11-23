// Builds the static site (GitHub Pages) into out/site: the gallery page (site/index.html), the clips (media/),
// each bar folder, and the built engine (dist/src). A bar loads the engine from the root path
// /dist/src/engine/index.js (AGENTS.md); a project site is served under /<repo>/, so the site's copy of each bar
// points its import map one folder up the tree instead. The bars in the repo are not changed.
// Usage: node scripts/build-site.mjs   (run `pnpm build` first)
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "out", "site");
const ENGINE = '"/dist/src/engine/index.js"';

if (!existsSync(path.join(ROOT, "dist", "src", "engine", "index.js"))) throw new Error("no dist/src/engine: run pnpm build first");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

cpSync(path.join(ROOT, "site", "index.html"), path.join(OUT, "index.html"));
cpSync(path.join(ROOT, "media"), path.join(OUT, "media"), { recursive: true });
cpSync(path.join(ROOT, "dist", "src"), path.join(OUT, "dist", "src"), { recursive: true });

const bars = readdirSync(path.join(ROOT, "bars"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
for (const bar of bars) {
  const from = path.join(ROOT, "bars", bar);
  const to = path.join(OUT, "bars", bar);
  cpSync(from, to, { recursive: true, filter: (f) => !f.endsWith(".test.ts") && !f.endsWith("sheet.png") });
  const page = path.join(to, "index.html");
  const html = readFileSync(page, "utf8");
  if (!html.includes(ENGINE)) throw new Error(`bars/${bar}/index.html: no import map entry ${ENGINE}`);
  writeFileSync(page, html.replaceAll(ENGINE, '"../../dist/src/engine/index.js"'));
}
writeFileSync(path.join(OUT, ".nojekyll"), "");
console.log(`out/site: index.html, media, dist/src and ${bars.length} bars`);
