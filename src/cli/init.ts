// `paint-kit init <folder>`: copies the kit's built engine into a project, so a page there loads it the way a bar does.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ENGINE_ENTRY, UsageError } from "../checks/gate.ts";
import { REPO_ROOT } from "../checks/root.ts";

/** The stamp init writes beside the copy. Its presence is what lets a later init replace the copy. */
export const STAMP = path.join("dist", "paint-kit.json");
const ENGINE_DIR = path.dirname(ENGINE_ENTRY);

export type InitResult = { root: string; engine: string; version: string; files: number; replaced: boolean };

const countJs = (dir: string): number =>
  readdirSync(dir).reduce((n, name) => {
    const f = path.join(dir, name);
    return n + (statSync(f).isDirectory() ? countJs(f) : name.endsWith(".js") ? 1 : 0);
  }, 0);

/**
 * Copies `<kit>/dist/src/engine` (its .js files only) to `<folder>/dist/src/engine` and writes `<folder>/dist/paint-kit.json`.
 * `folder` is the folder the project serves at `/`. A copy init wrote before (it has the stamp) is replaced; any other
 * `dist/src/engine` is left alone and is a usage error.
 */
export function init(folder: string, kitRoot: string = REPO_ROOT): InitResult {
  const src = path.join(kitRoot, ENGINE_DIR);
  if (!existsSync(path.join(kitRoot, ENGINE_ENTRY))) throw new UsageError(`init: the kit's engine is not built; run \`pnpm build\` in ${kitRoot}`);
  const root = path.resolve(folder);
  if (path.relative(kitRoot, root) === "") throw new UsageError("init: the folder is the kit itself, which already serves its engine");
  if (existsSync(root) && !statSync(root).isDirectory()) throw new UsageError(`init: ${folder} is a file, not a folder`);
  const engine = path.join(root, ENGINE_DIR);
  const stamp = path.join(root, STAMP);
  const replaced = existsSync(engine);
  if (replaced && !existsSync(stamp)) {
    throw new UsageError(`init: ${engine} already exists and paint-kit init did not write it (no ${STAMP.split(path.sep).join("/")}); move it, then run init again`);
  }
  if (replaced) rmSync(engine, { recursive: true });
  mkdirSync(engine, { recursive: true });
  cpSync(src, engine, { recursive: true, filter: (f) => statSync(f).isDirectory() || f.endsWith(".js") });
  const version = (JSON.parse(readFileSync(path.join(kitRoot, "package.json"), "utf8")) as { version: string }).version;
  writeFileSync(
    stamp,
    `${JSON.stringify({ version, engine: ENGINE_DIR.split(path.sep).join("/"), note: "Copied by paint-kit init. Run init again after a kit update to refresh it." }, null, 2)}\n`,
  );
  return { root, engine, version, files: countJs(engine), replaced };
}

/** What init prints: where the copy went, how a page loads it, and the next steps from AGENTS.md. */
export function nextSteps(r: InitResult, kitRoot: string = REPO_ROOT): string {
  const cli = `node ${path.join(kitRoot, "dist", "src", "cli", "paint-kit.js")}`;
  const at = (...p: string[]) => path.join(kitRoot, ...p);
  return `paint-kit init: ${r.replaced ? "replaced" : "copied"} the engine (paint-kit ${r.version}, ${r.files} files) at ${r.engine}

Serve ${r.root} at / so a page loads the engine with this import map:
  <script type="importmap">{"imports":{"paint-kit":"/dist/src/engine/index.js"}}</script>

Next steps (${at("AGENTS.md")}):
  1. Name the surface, what it is made of, the light on it, and the laws it must obey (section 1).
  2. Find the nearest bar in ${at("bars", "INDEX.md")} and copy its folder under ${r.root}.
     Keep index.html, bar.json and notes.md; drop study.md and gate.test.ts (section 2).
  3. Change the content and write bar.json for your page (section 3). Every name is in ${at("REFERENCE.md")}.
  4. Gate it:  ${cli} gate ${path.join(r.root, "<page>")}
  5. Look at it:  ${cli} sheet ${path.join(r.root, "<page>")} --out ${path.join(r.root, "<page>", "sheet.png")}

Run init again after a kit update to refresh the copy.`;
}
