import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import type { Browser, Page } from "playwright";

export const PLAYWRIGHT_MISSING =
  "paint-kit needs Playwright's Chromium. Install it with: pnpm add -D playwright && pnpm exec playwright install chromium";

/** Playwright, or null when it cannot be imported. Never throws. */
export async function playwrightOrNull(): Promise<typeof import("playwright") | null> {
  try {
    return await import("playwright");
  } catch {
    return null;
  }
}

export type OpenOpts = {
  seed?: number;
  t?: number;
  detail?: number;
  reduced?: boolean;
  webgl?: boolean;
  width?: number;
  height?: number;
  dark?: boolean;
  /** Device scale factor (default 2). */
  dpr?: number;
  /** Installed before navigation, so it runs before any page script. */
  initScript?: string;
  /** Max wait for `window.__paint.ready` on a paint page, in ms (default 60000). */
  readyTimeout?: number;
};

export type Rgba = { w: number; h: number; data: Uint8ClampedArray };

export type PageHandle = {
  page: Page;
  errors: string[];
  /** Console warnings from page load on. */
  warnings: string[];
  shot(name?: string): Promise<Rgba>;
  hook<T>(expr: string): Promise<T>;
  close(): Promise<void>;
};

// <repo root>/out, resolved from this module (src/checks or dist/src/checks), never from cwd.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), import.meta.url.includes("/dist/") ? "../../.." : "../..");

// Software WebGL flags, as lab/2026-11-wild-sampler/shot.mjs uses them.
const GL_FLAGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"];

// SwiftShader's GPU process logs "GL Driver Message ... GPU stall due to ReadPixels" (up to 4 times) on the
// first WebGL page a fresh browser opens, whatever that page does. It is the browser's log, not the page's,
// so `warnings` leaves it out and a "warns exactly once" check holds on whichever page opens first. Chrome
// prefixes the line with the context, as in "[.WebGL-0x12c0043f000]GL Driver Message (OpenGL, Performance, ...".
const GL_DRIVER_NOISE = /^(\[\.WebGL-[^\]]*\])?GL Driver Message/;

/** Decodes an 8-bit RGB or RGBA, non-interlaced PNG into RGBA. */
export function decodePng(buf: Buffer): Rgba {
  let pos = 8;
  let w = 0;
  let h = 0;
  let channels = 4;
  const idat: Buffer[] = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      w = body.readUInt32BE(0);
      h = body.readUInt32BE(4);
      const depth = body[8];
      const colour = body[9];
      const interlace = body[12];
      if (depth !== 8 || (colour !== 2 && colour !== 6) || interlace !== 0) {
        throw new Error(`unsupported PNG: depth ${depth}, colour type ${colour}, interlace ${interlace}`);
      }
      channels = colour === 2 ? 3 : 4;
    } else if (type === "IDAT") idat.push(body);
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * channels;
  const data = new Uint8ClampedArray(w * h * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)]!;
    const line = new Uint8Array(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels]! : 0;
      const b = prev[i]!;
      const c = i >= channels ? prev[i - channels]! : 0;
      let add = 0;
      if (filter === 1) add = a;
      else if (filter === 2) add = b;
      else if (filter === 3) add = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = (line[i]! + add) & 255;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      data[o] = line[x * channels]!;
      data[o + 1] = line[x * channels + 1]!;
      data[o + 2] = line[x * channels + 2]!;
      data[o + 3] = channels === 4 ? line[x * channels + 3]! : 255;
    }
    prev = line;
  }
  return { w, h, data };
}

let shared: Promise<Browser> | undefined;
let sharedNoGl: Promise<Browser> | undefined;

async function launch(webgl: boolean): Promise<Browser> {
  const pw = await playwrightOrNull();
  if (!pw) throw new Error(PLAYWRIGHT_MISSING);
  // sRGB output profile on every machine, so a painted pixel is the CSS colour (palette checks allow 1 level).
  const colour = ["--force-color-profile=srgb"];
  const b = await pw.chromium.launch({
    headless: true,
    args: [...colour, ...(webgl ? GL_FLAGS : ["--disable-webgl", "--disable-webgl2"])],
  });
  b.on("disconnected", () => {
    if (webgl) shared = undefined;
    else sharedNoGl = undefined;
  });
  return b;
}

function browserFor(webgl: boolean): Promise<Browser> {
  const p = launch(webgl);
  p.catch(() => {
    if (webgl) shared = undefined;
    else sharedNoGl = undefined;
  });
  if (webgl) shared = p;
  else sharedNoGl = p;
  return p;
}

/** Closes the shared browsers, each on its own. The next `openPage` starts new ones. */
export async function closeBrowsers(): Promise<void> {
  const list = [shared, sharedNoGl];
  shared = undefined;
  sharedNoGl = undefined;
  await Promise.allSettled(list.map(async (b) => (b ? (await b).close() : undefined)));
}

/** Opens `url` in headless Chromium. Only the params given are appended to the URL. */
export async function openPage(url: string, opts: OpenOpts = {}): Promise<PageHandle> {
  const webgl = opts.webgl ?? true;
  const browser = await (webgl ? (shared ?? browserFor(true)) : (sharedNoGl ?? browserFor(false)));
  const context = await browser.newContext({
    viewport: { width: opts.width ?? 1440, height: opts.height ?? 900 },
    deviceScaleFactor: opts.dpr ?? 2,
    reducedMotion: opts.reduced ? "reduce" : "no-preference",
    colorScheme: opts.dark ? "dark" : "light",
  });
  const page = await context.newPage();
  const errors: string[] = [];
  const warnings: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
    else if (m.type() === "warning" && !GL_DRIVER_NOISE.test(m.text())) warnings.push(m.text());
  });
  page.on("requestfailed", (r) => errors.push(`requestfailed: ${r.url()}`));
  if (opts.initScript) await page.addInitScript(opts.initScript);

  const u = new URL(url);
  if (opts.seed !== undefined) u.searchParams.set("seed", String(opts.seed));
  if (opts.t !== undefined) u.searchParams.set("t", String(opts.t));
  if (opts.detail !== undefined) u.searchParams.set("detail", String(opts.detail));
  try {
    await page.goto(u.toString(), { waitUntil: "load" });
    // A page with no `__paint` (the control) gets a fixed 1 s. A paint page must become ready, or this throws.
    const hasPaint = await page
      .waitForFunction("window.__paint !== undefined", undefined, { timeout: 1000 })
      .then(() => true, () => false);
    if (hasPaint) {
      await page
        .waitForFunction("window.__paint?.ready === true", undefined, { timeout: opts.readyTimeout ?? 60000 })
        .catch(() => {
          throw new Error(`page never became ready (window.__paint.ready): ${u.toString()}`);
        });
    }
  } catch (e) {
    await context.close();
    throw e;
  }

  return {
    page,
    errors,
    warnings,
    async shot(name) {
      const png = await page.screenshot({ type: "png" });
      if (name) {
        const file = path.join(REPO_ROOT, "out", `${name}.png`);
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(file, png);
      }
      return decodePng(png);
    },
    hook: <T>(expr: string) => page.evaluate(expr) as Promise<T>,
    close: () => context.close(),
  };
}
