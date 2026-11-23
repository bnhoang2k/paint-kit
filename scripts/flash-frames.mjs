// Counts WCAG 2.3.1 flashes over a folder of captured PNG frames with the flash check's own core
// (dist/src/checks/flash-count.js), so a reference capture and a bar are measured by one rule.
// Usage: node scripts/flash-frames.mjs <frames-dir> [fps=60] [scale=1]   (scale = frame px per CSS px)
// Run `pnpm build` first. Prints one JSON line.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { cellsOf, FLASH_RULE, FlashCounter } from "../dist/src/checks/flash-count.js";
import { decodePng } from "../dist/src/checks/harness.js";

const [dir, fpsArg = "60", scaleArg = "1"] = process.argv.slice(2);
if (!dir) {
  console.error("usage: node scripts/flash-frames.mjs <frames-dir> [fps=60] [scale=1]");
  process.exit(2);
}
const fps = Number(fpsArg);
const scale = Number(scaleArg);
const files = readdirSync(dir).filter((f) => f.endsWith(".png")).sort();
// Counted online, one frame at a time, so a long capture never sits in memory.
const counter = new FlashCounter(fps);
const t0 = performance.now();
for (const f of files) counter.push(cellsOf(decodePng(readFileSync(path.join(dir, f))), FLASH_RULE, scale));
const r = counter.report();
const ms = performance.now() - t0;
const span = (m) => (m.frame < 0 ? null : { first: files[m.frame], seconds: [m.frame / fps, (m.frame + fps) / fps] });
console.log(JSON.stringify({ dir, fps, scale, frames: r.frames, msPerFrame: Math.round(ms / r.frames), heapMB: Math.round(process.memoryUsage().heapUsed / 1e6), rssMB: Math.round(process.memoryUsage().rss / 1e6), general: { ...r.general, span: span(r.general) }, red: { ...r.red, span: span(r.red) } }));
