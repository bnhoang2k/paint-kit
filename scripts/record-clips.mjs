// Records a looping clip of each bar for the README and the site. The page runs live in Chromium on the machine's
// GPU while a script plays the bar's own input (a pointer loop, a drag, a scroll); the DevTools screencast hands
// over every painted frame with its time, and the frames are resampled to a fixed rate and encoded as an animated
// WebP with img2webp. Live, not on the engine's fixed clock, because a bar's own page code (a lamp easing to the
// pointer, a zip's spring, a scroll-driven shred) runs on the browser's frame loop.
// Usage: node scripts/record-clips.mjs [--only <text>] [--fps 30] [--out media]
// Needs `pnpm build`, Playwright's Chromium and img2webp (libwebp). Writes <out>/<bar>-light.webp and -dark.webp.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { serveRoot } from "../dist/src/checks/serve.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? dflt : process.argv[i + 1];
};
const only = arg("--only", "");
const FPS = Number(arg("--fps", "30"));
const OUT = path.resolve(ROOT, arg("--out", "media"));
const MAX_W = 800;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The input each clip plays, as a function of the page and the clip time. `warm`: seconds the page runs before
// recording starts. `seconds`: the clip length. `move(f)`: the pointer at clip fraction f, in viewport fractions,
// on a closed loop so the end meets the start.
const loop = (rx, ry, cx = 0.5, cy = 0.5) => (f) => [cx + rx * Math.cos(f * Math.PI * 2), cy + ry * Math.sin(f * Math.PI * 2)];
const CLIPS = {
  "01-lamp-on-paper": { warm: 1, seconds: 8, move: loop(0.32, 0.05, 0.5, 0.55) },
  "02-denim-zip": { warm: 1, seconds: 5, drag: true, dpr: 1.5 },
  "03-halftone-resolve": { warm: 0, seconds: 6 },
  "04-paper-shred": { warm: 1, seconds: 6, scroll: true, fps: 24, q: 60 },
  "05-pool-light": { warm: 2, seconds: 6, dpr: 1.5, move: loop(0.25, 0.15) },
  "06-glimmer": { warm: 1, seconds: 8, move: loop(0.3, 0.25) },
  "07-light-stamp": { warm: 1, seconds: 8, move: loop(0.32, 0.28) },
  "10-foil-card": { warm: 1, seconds: 8, move: loop(0.3, 0.28) },
  "11-heat-tint": { warm: 1, seconds: 8, move: loop(0.38, 0.2) },
  "12-burn-card": { warm: 0, seconds: 6, darkOnly: true },
};

const bars = Object.keys(CLIPS).filter((b) => b.includes(only));
mkdirSync(OUT, { recursive: true });
const server = await serveRoot(ROOT);
const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
try {
  for (const bar of bars) {
    const clip = CLIPS[bar];
    const meta = JSON.parse(readFileSync(path.join(ROOT, "bars", bar, "bar.json"), "utf8"));
    const view = meta.view ?? { width: 960, height: 600 };
    const q = new URLSearchParams(meta.query ?? "");
    q.set("seed", "1");
    for (const dark of clip.darkOnly ? [true] : [false, true]) {
      const name = `${bar}-${dark ? "dark" : "light"}`;
      const dpr = clip.dpr ?? 1;
      const ctx = await browser.newContext({ viewport: view, deviceScaleFactor: dpr, colorScheme: dark ? "dark" : "light" });
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`${server.url}/bars/${bar}/index.html?${q}`, { waitUntil: "load" });
      await page.waitForFunction("window.__paint?.ready === true", undefined, { timeout: 30000 });
      if (clip.move) await page.mouse.move(...px(clip.move(0), view));
      await sleep(clip.warm * 1000);

      // Every painted frame, with its time in s, from the screencast.
      const cdp = await ctx.newCDPSession(page);
      const shots = [];
      cdp.on("Page.screencastFrame", async (e) => {
        shots.push({ t: e.metadata.timestamp, data: e.data });
        await cdp.send("Page.screencastFrameAck", { sessionId: e.sessionId }).catch(() => {});
      });
      // Frames at most MAX_W px wide: a README shows a clip at about 830 px, a pair at about 400.
      const scale = Math.min(dpr, MAX_W / view.width);
      await cdp.send("Page.startScreencast", { format: "png", maxWidth: Math.round(view.width * scale), maxHeight: Math.round(view.height * scale), everyNthFrame: 1 });
      const start = Date.now();
      const drag = clip.drag ? await dragPlan(page) : null;
      let down = false;
      for (;;) {
        const f = (Date.now() - start) / (clip.seconds * 1000);
        if (f >= 1) break;
        if (clip.move) await page.mouse.move(...px(clip.move(f), view));
        if (clip.scroll) await page.evaluate((g) => scrollTo(0, Math.min(1, g * 1.15) * (document.documentElement.scrollHeight - innerHeight)), f);
        if (drag) {
          const g = Math.min(1, Math.max(0, (f - 0.1) / 0.35));
          if (f > 0.1 && f < 0.5) {
            await page.mouse.move(drag.x, drag.y0 + (drag.y1 - drag.y0) * g * g * (3 - 2 * g));
            if (!down) { await page.mouse.down(); down = true; }
          } else if (down) { await page.mouse.up(); down = false; }
        }
        await sleep(8);
      }
      await cdp.send("Page.stopScreencast");
      await ctx.close();
      if (errors.length) throw new Error(`${name}: ${errors.join("; ")}`);
      if (shots.length < 2) throw new Error(`${name}: the screencast sent ${shots.length} frames`);

      // Resample to a fixed rate: each tick takes the last frame painted at or before it.
      const dir = mkdtempSync(path.join(tmpdir(), `clip-${name}-`));
      const t0 = shots[0].t;
      const fps = clip.fps ?? FPS;
      const count = Math.round(clip.seconds * fps);
      const files = [];
      let j = 0;
      for (let i = 0; i < count; i++) {
        while (j + 1 < shots.length && shots[j + 1].t - t0 <= i / fps) j++;
        const file = path.join(dir, `${String(i).padStart(4, "0")}.png`);
        writeFileSync(file, Buffer.from(shots[j].data, "base64"));
        files.push(file);
      }
      const out = path.join(OUT, `${name}.webp`);
      execFileSync("img2webp", ["-loop", "0", "-lossy", "-q", String(clip.q ?? 82), "-m", "6", "-d", String(Math.round(1000 / fps)), ...files, "-o", out], { stdio: "pipe" });
      rmSync(dir, { recursive: true, force: true });
      const span = shots[shots.length - 1].t - t0;
      console.log(`${name}: ${shots.length} painted frames in ${span.toFixed(1)} s (${(shots.length / span).toFixed(0)} fps) -> ${path.relative(ROOT, out)}`);
    }
  }
} finally {
  await browser.close();
  await server.close();
}

function px([x, y], view) {
  return [Math.round(x * view.width), Math.round(y * view.height)];
}

// Bar 02's pull: from the zip tab at rest down past the commit point (slider top 426), in page px. The numbers
// are the page's MOTION block (screenW 393, gapCenterX 197.2, restSliderTop 94.6, tabLength 81), which lives in a
// module and is not reachable from here.
async function dragPlan(page) {
  return page.evaluate(() => {
    const r = document.querySelector("#phone").getBoundingClientRect();
    const s = r.width / 393;
    return { x: r.left + 197.2 * s, y0: r.top + (94.6 + 81 * 0.6) * s, y1: r.top + 852 * 0.8 * s };
  });
}
