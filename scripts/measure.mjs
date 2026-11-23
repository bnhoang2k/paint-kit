// Measures the numbers behind each threshold in src/checks/thresholds.json (plan Task 20, Step 1), with the checks'
// own code from dist/, so a threshold is set from the same reading the gate makes:
//   - every kept bar (bars/*) at seeds 1 to 3, light and dark (the gate reads render and palette in light only, and
//     relight and detail in both since Phase 2 Task 2; dark is read here too, for the record);
//   - the control (controls/*), three live runs, on the checks that apply to it;
//   - the planted faults (test/faults/*) each threshold has to keep failing, at seeds 1 to 3.
// Phase 2 Task 25 adds the readings behind the thresholds set in Phase 2 (shadow, iridescence, film, burn, tone): the
// relight kind's new measured keys on the kept bars, the new laws' planted faults, and a `tone` kind on its test pages.
// Each reading is one cell (target x check x seed x scheme). Cells are written to the JSON file as they finish and a
// cell already there is skipped, so a long run can be split into short ones (`--budget`).
//
// Usage (run `pnpm build` first):
//   node scripts/measure.mjs --out <cells.json> [--budget <seconds>] [--only <substring of a cell id>] [--bars <list>] [--dry]
//   node scripts/measure.mjs --table <cells.json> [--md <table.md>]
// The first form prints "complete" when every cell is in the file, else "partial: <n> cells left".
// `--bars 07,10` keeps only the cells on those kept bars (a folder name or its number prefix) and their own planted
// fault copies (test/faults/<kind>-<bar folder>-*): no other fault, page or control cell. `--dry` prints how many cells
// are left to run, by kind, and runs none.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadBar } from "../dist/src/bar.js";
import * as banding from "../dist/src/checks/banding-grain.js";
import { shareAt } from "../dist/src/checks/detail.js";
import { hasHook, hideText, open } from "../dist/src/checks/frames.js";
import { closeBrowsers, openPage } from "../dist/src/checks/harness.js";
import { meanOklab, oklabDistance } from "../dist/src/checks/image.js";
import * as palette from "../dist/src/checks/palette.js";
import * as relight from "../dist/src/checks/relight.js";
import * as render from "../dist/src/checks/render.js";
import { REPO_ROOT } from "../dist/src/checks/root.js";
import { serveRoot } from "../dist/src/checks/serve.js";
import * as text from "../dist/src/checks/text-contrast.js";

const SEEDS = [1, 2, 3];
const SCHEMES = ["light", "dark"];

// ---------------------------------------------------------------------------------------------------------------
// Readings that are not a check's own `measured` (the check reads them but does not report them).

/**
 * detail's high-frequency share at detail 0, 0.5 and 1, without its nested relight runs. Each share comes from the
 * check's own `shareAt` (text hidden, ink off, finish off: grain 0 and the halftone screen hidden), so the read
 * cannot drift from the gate's.
 */
async function detailShares(target, opts) {
  const shares = [];
  for (const d of [0, 0.5, 1]) {
    const share = await shareAt(target, opts, d, opts.dark === true);
    if (share === null) return { status: "partial", line: "no hook", measured: {} };
    shares.push(share);
  }
  const [s0, s5, s1] = shares;
  const rise = s0 > 0 ? (s1 - s0) / s0 : 0;
  const strict = s0 < s5 && s5 < s1 ? 1 : 0;
  return { status: "measured", line: "", measured: { "share.0": s0, "share.0.5": s5, "share.1": s1, rise, strict } };
}

const relLum = (d, o) => {
  const f = (v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(d[o]) + 0.7152 * f(d[o + 1]) + 0.0722 * f(d[o + 2]);
};
const quantile = (xs, q) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))] : NaN;
};

/**
 * text.litLevel's quantity: on the paint text-contrast scores against (text ink off, picture ink on), the level of
 * the sheet the page's lights leave unlit, as a fraction of the frame's 99th percentile (the reference litLevel
 * multiplies). Unlit = pixels whose relative luminance moves by under 0.002 when every lamp, glow and key is set to
 * level 0 (ambient alone left). Reported: the unlit pixels' median and p95 over p99, and the lit pixels' p5 over p99.
 */
async function litLevel(target, opts) {
  const t = target.bar && "t0" in target.bar.alive ? target.bar.alive.t0 : 1;
  const h = await open(target, opts, { t });
  try {
    if (!(await hasHook(h))) return { status: "partial", line: "no hook", measured: {} };
    await hideText(h);
    await h.hook('__paint.setInk(false, "text")');
    const on = await h.shot();
    const lights = await h.hook("__paint.lights()");
    for (const [i, l] of lights.entries()) if (l.id !== "ambient") await h.hook(`__paint.setLight(${i}, { level: 0 })`);
    const off = await h.shot();
    const lumOn = [];
    const unlit = [];
    const lit = [];
    for (let p = 0; p < on.w * on.h; p++) {
      const a = relLum(on.data, p * 4);
      lumOn.push(a);
      (Math.abs(a - relLum(off.data, p * 4)) < 0.002 ? unlit : lit).push(a);
    }
    const p99 = quantile(lumOn, 0.99);
    return {
      status: "measured",
      line: "",
      measured: {
        p99,
        unlitShare: unlit.length / lumOn.length,
        "unlit.p50": quantile(unlit, 0.5) / p99,
        "unlit.p95": quantile(unlit, 0.95) / p99,
        "lit.p5": quantile(lit, 0.05) / p99,
        "lit.p50": quantile(lit, 0.5) / p99,
      },
    };
  } finally {
    await h.close();
  }
}

/**
 * tone.minSplit's quantity, as test/pages/tone.test.ts's `split()` reads it: the OKLab distance between the mean colour
 * of the toned card and the mean colour of the desk beside it, in the boxes the page gives as `window.__tone`, at
 * 960 x 600, dpr 1, t 2, detail 0.5. Only pages that set `window.__tone` can be read (no kept bar does).
 */
async function toneSplit(target, opts) {
  const h = await openPage(target.url, { dpr: 1, width: 960, height: 600, t: 2, detail: 0.5, ...opts });
  try {
    const boxes = await h.hook("window.__tone");
    if (!boxes?.card || !boxes?.desk) return { status: "partial", line: "no window.__tone boxes", measured: {} };
    const f = await h.shot();
    if (h.errors.length) return { status: "error", line: h.errors.join("; "), measured: {} };
    const inBox = (b) => (i) => {
      const x = i % f.w;
      const y = Math.floor(i / f.w);
      return x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
    };
    const card = meanOklab(f, inBox(boxes.card));
    const desk = meanOklab(f, inBox(boxes.desk));
    return { status: "measured", line: "", measured: { split: oklabDistance(card, desk), "card.L": card[0], "desk.L": desk[0] } };
  } finally {
    await h.close();
  }
}

// halftone.litSplit is not reproduced here. Its reading is test/pages/halftone.test.ts's 'halftone after light'
// block (screenCells, decileSplit, moveSplit, readScreen: about 130 lines, with the frozen view and two-frame waits
// that file sets up), and a second copy could drift from the one its test asserts. Its readings print as LIT lines in
// `pnpm test:pages -t 'halftone lit'` (test/pages/halftone-lit.html and test/faults/halftone-lit-fixed, seeds 1 to
// 3, light and dark). That reading needs the page's `window.__screen` and `window.setScreen`, which no kept bar sets.

// ---------------------------------------------------------------------------------------------------------------
// The cells.

/** How each measurement runs: on a page (`run`) or on a control (`control`); `both` when the check reads both schemes itself. */
const KINDS = {
  render: { run: render.check, control: render.controlCheck },
  palette: { run: palette.check },
  banding: { run: banding.check, control: banding.controlCheck, both: true },
  // relight.check reads both schemes and suffixes its keys; a cell reads one scheme (opts.dark) with plain keys.
  // Its planted faults are read in both schemes too (`faultSchemes`), as the gate reads every page in both: the
  // relief limit's nearest fault is paper-mud in dark (Phase 2 Task 2b).
  relight: { run: (target, opts) => relight.checkScheme(target, opts, opts.dark ? "dark" : "light"), faultSchemes: ["light", "dark"] },
  // The detail check also runs relight at detail 0 on every bar (its macro-relief floor), so a relight threshold's kept
  // range includes these readings. Light and dark, as the detail check reads both since Phase 2 Task 2 (dark cells
  // added in Task 2b for the relative relief).
  relight0: { run: (target, opts) => relight.checkScheme(target, { ...opts, detail: 0 }, opts.dark ? "dark" : "light") },
  // Faults read in light and dark since Phase 2 Task 2c (the check reads both schemes; detail.minRise is set on both).
  // Its test pages are read at seed 1 only (`pageSeeds`): they have no bar.json, so the gate and their tests run them
  // at seed 1.
  detail: { run: detailShares, faultSchemes: ["light", "dark"], pageSeeds: [1] },
  text: { run: text.check, control: text.controlCheck, both: true },
  lit: { run: litLevel },
  // Read on test pages and faults only (`pagesOnly`): the reading needs the page's window.__tone boxes. Light and dark,
  // seeds 1 to 3, as tone.test.ts reads it.
  tone: { run: toneSplit, pagesOnly: true, faultSchemes: ["light", "dark"] },
};

/** Planted faults and the measurements whose thresholds they test. Read at seeds 1 to 3. */
const FAULTS = {
  render: ["core-blank"],
  palette: ["core-nopalette", "lights-baked", "lights-glow-cached", "core-band-mostly-baked", "cloth-accent-baked"],
  banding: ["core-nofinish", "core-nograin", "core-grain2x", "cloth-grain2x", "paper-hotspot", "core-fieldnoise"],
  relight: [
    "core-blank", "lights-flat", "lights-baked", "paper-mud", "cloth-gloss-off", "cloth-spec-frozen", "cloth-sheen-static", "cloth-painted-streak", "relight-01-lamp-on-paper", "relight-mud-near-black", "lights-nofalloff", "lights-overhead-nofalloff",
    // Phase 2's laws (Task 25): shadow, iridescence (foil), the film branch, burn.
    "shadow-baked", "shadow-ground-leak", "shadow-reads-ink", "shadow-same-side", "shadow-spec-only",
    "iridescence-clock", "iridescence-fixed-light", "iridescence-fixed-surface", "iridescence-flat-normal", "iridescence-flat-normal-foil", "iridescence-no-groove", "iridescence-place-hue", "iridescence-place-hue-drift", "iridescence-pointer-x", "iridescence-white",
    "film-clock", "film-clock-metal", "film-drift", "film-drift-metal", "film-fixed-light", "film-fixed-light-metal", "film-fixed-surface", "film-fixed-surface-metal", "film-no-angle", "film-no-angle-metal", "film-no-angle-steel", "film-no-thickness", "film-no-thickness-metal", "film-place-hue", "film-place-hue-metal", "film-view-normal", "film-view-normal-metal",
    "burn-clean-wipe", "burn-glow-dark", "burn-glow-flat", "burn-glow-step", "burn-retreat",
  ],
  detail: ["cloth-detail-dead", "detail-03-halftone-resolve", "detail-04-paper-shred", "core-blank", "paper-mud", "paper-hotspot"],
  text: ["core-blank", "paper-mud", "paper-mud-plain", "paper-mud-shadow", "paper-mud-wordy", "paper-mud-partial", "paper-mud-pinhole", "paper-mud-lattice", "glimmer-flat", "glimmer-flat-ambient"],
  lit: ["paper-unlit", "paper-bright-ground"],
  tone: ["tone-split-none"],
};

/**
 * A kind's planted faults: its FAULTS list, plus, for the kinds in COPY_KINDS, every folder test/faults/<kind>-<NN>-*
 * there when the run starts (a fault planted on a copy of kept bar NN, such as relight-12-burn-card-<fault>), each once.
 * Only relight globs (Task 25): render-, palette- and detail- copies exist too, and globbing them would add cells to
 * readings those kinds' thresholds were not set on.
 */
const COPY_KINDS = ["relight"];
function faultsOf(kind) {
  const dir = path.join(REPO_ROOT, "test/faults");
  const copies = COPY_KINDS.includes(kind) && existsSync(dir) ? readdirSync(dir).sort().filter((n) => new RegExp(`^${kind}-\\d\\d-`).test(n) && existsSync(path.join(dir, n, "index.html"))) : [];
  return [...new Set([...(FAULTS[kind] ?? []), ...copies])];
}

/** Planted faults whose fault is planted under prefers-color-scheme: dark only; read in dark, seeds 1 to 3 (Phase 2 Task 2b). */
const DARK_FAULTS = {
  relight: ["relight-dark-01-lamp-on-paper", "relight-dark-02-denim-zip"],
  detail: ["detail-dark-01-lamp-on-paper", "detail-dark-04-paper-shred"],
};

/**
 * Honest test pages an existing rule was derived on (not kept bars), seeds 1 to 3 unless the kind sets `pageSeeds`, in
 * the schemes the kind reads faults in (relight: light and dark, Phase 2 Task 3). For relight and lit they are read for
 * comparison only. For detail (Phase 2 Task 2c fix round 1) the honest side of detail.minRise is the kept bars plus
 * every test page whose own test asserts it passes detail: core (checks-basic.test.ts), lights (relight.test.ts,
 * detail-dial.test.ts), water (relight.test.ts, water.test.ts), grown (grown.test.ts), cloth (cloth.test.ts) and glass
 * (glass.test.ts). glass-white and lights-overhead are read for the record; no test asserts that they pass detail.
 */
const PAGES = {
  relight: ["test/pages/lights.html", "test/pages/lights-overhead.html", "test/pages/cloth.html", "test/pages/islands.html"],
  lit: ["test/pages/paper.html"],
  detail: ["test/pages/core.html", "test/pages/lights.html", "test/pages/water.html", "test/pages/grown.html", "test/pages/cloth.html", "test/pages/glass.html", "test/pages/glass-white.html", "test/pages/lights-overhead.html"],
  // tone.minSplit's honest side (no kept bar exposes the card and desk boxes the reading needs).
  tone: ["test/pages/tone.html"],
};

function targetsOf(group) {
  const dir = path.join(REPO_ROOT, group);
  return existsSync(dir) ? readdirSync(dir).sort().filter((n) => existsSync(path.join(dir, n, "index.html"))).map((n) => `${group}/${n}`) : [];
}

function cells() {
  const out = [];
  const bars = targetsOf("bars");
  const controls = targetsOf("controls");
  for (const [kind, k] of Object.entries(KINDS)) {
    const schemes = k.both ? ["both"] : (k.schemes ?? SCHEMES);
    for (const b of k.pagesOnly ? [] : bars) {
      if (kind === "lit" && !(loadBar(path.join(REPO_ROOT, b)).text?.lit?.length > 0)) continue;
      for (const seed of SEEDS) for (const scheme of schemes) out.push({ id: `bar|${b}|${kind}|${seed}|${scheme}`, group: "bar", rel: b, kind, seed, scheme });
    }
    if (k.control) for (const c of controls) for (const run of SEEDS) out.push({ id: `control|${c}|${kind}|${run}|live`, group: "control", rel: c, kind, seed: run, scheme: "live" });
    for (const f of faultsOf(kind)) for (const seed of SEEDS) for (const scheme of k.both ? ["both"] : (k.faultSchemes ?? ["light"])) out.push({ id: `fault|test/faults/${f}|${kind}|${seed}|${scheme}`, group: "fault", rel: `test/faults/${f}`, kind, seed, scheme });
    for (const f of DARK_FAULTS[kind] ?? []) for (const seed of SEEDS) out.push({ id: `fault|test/faults/${f}|${kind}|${seed}|dark`, group: "fault", rel: `test/faults/${f}`, kind, seed, scheme: "dark" });
    for (const p of PAGES[kind] ?? []) for (const seed of k.pageSeeds ?? SEEDS) for (const scheme of k.both ? ["both"] : (k.faultSchemes ?? ["light"])) out.push({ id: `page|${p}|${kind}|${seed}|${scheme}`, group: "page", rel: p, kind, seed, scheme });
  }
  return out;
}

function targetOf(rel, base, control) {
  const abs = path.join(REPO_ROOT, rel);
  const isDir = !rel.endsWith(".html");
  const dir = isDir ? abs : path.dirname(abs);
  const bar = existsSync(path.join(dir, "bar.json")) ? loadBar(dir) : null;
  // The bar's own URL parameters (`query`, e.g. bar 12's burnAt=0), as the gate opens it (src/checks/gate.ts).
  return { url: `${base}/${isDir ? `${rel}/index.html` : rel}${bar?.query ? `?${bar.query}` : ""}`, bar, control };
}

/**
 * The `--bars` filter: null keeps every cell; else a bar cell on a listed bar, or a fault cell on a listed bar's own
 * copy (test/faults/<kind>-<bar folder>-*). A listed name matches a folder name or its number prefix ("07").
 */
function barFilter(list) {
  if (!list) return null;
  const names = list.split(",").map((s) => s.trim()).filter(Boolean);
  const folders = targetsOf("bars").map((b) => b.slice("bars/".length)).filter((f) => names.some((n) => f === n || f.startsWith(`${n}-`)));
  if (!folders.length) throw new Error(`--bars ${list}: no bar folder matches`);
  return (c) => (c.group === "bar" && folders.includes(c.rel.slice("bars/".length))) || (c.group === "fault" && folders.some((f) => c.rel.startsWith(`test/faults/${c.kind}-${f}-`)));
}

async function measure(outFile, budget, only, bars, dry) {
  const done = existsSync(outFile) ? JSON.parse(readFileSync(outFile, "utf8")) : {};
  const keep = barFilter(bars);
  const wanted = () => cells().filter((c) => !(c.id in done) && (!only || c.id.includes(only)) && (!keep || keep(c)));
  const todo = wanted();
  if (dry) {
    const by = {};
    for (const c of todo) by[c.kind] = (by[c.kind] ?? 0) + 1;
    console.log(`${todo.length} cells left: ${JSON.stringify(by)}`);
    return;
  }
  const t0 = performance.now();
  const server = await serveRoot(REPO_ROOT);
  let n = 0;
  try {
    for (const c of todo) {
      if ((performance.now() - t0) / 1000 > budget) break;
      const control = c.group === "control";
      const target = targetOf(c.rel, server.url, control);
      const k = KINDS[c.kind];
      const opts = control ? {} : { seed: c.seed, ...(c.scheme === "dark" ? { dark: true } : {}) };
      const s = performance.now();
      let r;
      try {
        r = await (control ? k.control : k.run)(target, opts);
      } catch (e) {
        r = { status: "error", line: String(e?.message ?? e).split("\n")[0], measured: {} };
      }
      done[c.id] = { ...c, status: r.status, line: r.line.slice(0, 400), measured: r.measured, ms: Math.round(performance.now() - s) };
      writeFileSync(outFile, JSON.stringify(done, null, 1));
      n++;
      console.log(`${c.id}: ${r.status} (${done[c.id].ms} ms)`);
    }
  } finally {
    await server.close();
    await closeBrowsers();
  }
  const left = wanted().length;
  console.log(left === 0 ? `complete (${n} measured this run)` : `partial: ${left} cells left (${n} measured this run)`);
}

// ---------------------------------------------------------------------------------------------------------------
// The table: for each threshold, the readings behind it.

/**
 * Each row: the threshold, the measurement kind, and how to read a cell's value(s). `gated` names the schemes the gate
 * reads for a bar (the kept range is taken over those; the others are shown beside it).
 */
const ROWS = [
  ["render.blankStd", "render", (m) => [m.std], ["light"]],
  ["palette.moveShare", "palette", (m) => [m.movedShare], ["light"]],
  ["banding.maxRun", "banding", (m) => [m["run.light"], m["run.dark"], m["run.live"]], ["both", "live"]],
  ["banding.smoothMax (mask share)", "banding", (m) => [m["share.light"], m["share.dark"], m["share.live"]], ["both", "live"]],
  ["grain.floor / grain.ceiling", "banding", (m) => [m["grain.light"], m["grain.dark"]], ["both"]],
  // relief.diff is relative since Phase 2 Task 2b: mean RGB change over mean RGB brightness; read in both schemes.
  ["relight.reliefDiff (relative)", "relight", (m) => [m["relief.diff"]], ["light", "dark"]],
  ["relight.reliefDiff (relative, detail 0)", "relight0", (m) => [m["relief.diff"]], ["light", "dark"]],
  // The raw floor under the relative change (Task 2b fix round 3): relief.rawDiff, mean absolute RGB difference / 255.
  ["relight.reliefRawFloor", "relight", (m) => [m["relief.rawDiff"]], ["light", "dark"]],
  ["relight.reliefRawFloor (detail 0)", "relight0", (m) => [m["relief.rawDiff"]], ["light", "dark"]],
  ["relight.minRelief", "relight", (m) => [m["relief.heightRange"]], ["light"]],
  ["relight.highlightShift", "relight", (m) => [m["highlight.shift"]], ["light"]],
  // Per material slot since Phase 2 Task 3: the judged slot's brightest-1% shift; the whole frame's beside it.
  ["relight.brightShift", "relight", (m) => [m["highlight.brightShift"]], ["light", "dark"]],
  ["relight.brightShift (whole frame, not gated)", "relight", (m) => [m["highlight.brightShift.frame"]], ["light", "dark"]],
  ["relight.highlightShift (detail 0)", "relight0", (m) => [m["highlight.shift"]], ["light"]],
  ["relight.brightShift (detail 0)", "relight0", (m) => [m["highlight.brightShift"]], ["light", "dark"]],
  // Per page since Phase 2 Task 3: span over the page's own fit rms (the widest fit's) must be at least the value.
  ["relight.falloffSpan (span / fit rms)", "relight", (m) => [m["falloff.span"] === undefined ? undefined : m["falloff.span"] / m["falloff.rms"]], ["light", "dark"]],
  ["relight.falloffSpan (fit rms)", "relight", (m) => [m["falloff.rms"]], ["light", "dark"]],
  ["relight.falloffSpan (span)", "relight", (m) => [m["falloff.span"]], ["light", "dark"]],
  ["relight.falloffSlack (|p - 2|)", "relight", (m) => [m["falloff.exponent"] === undefined ? undefined : Math.abs(m["falloff.exponent"] - 2)], ["light"]],
  ["relight.ambientBand (falloff 1.5 x cone)", "relight", (m) => [m["falloff.outsideDiff"]], ["light"]],
  ["relight.ambientBand (transmit outside)", "relight", (m) => [m["transmit.outside"]], ["light"]],
  ["relight.causticOverlap", "relight", (m) => [m["caustic.overlap"]], ["light"]],
  ["relight.causticConcentration", "relight", (m) => [m["caustic.concentration"]], ["light"]],
  ["relight.causticConcentration (detail 0)", "relight0", (m) => [m["caustic.concentration"]], ["light"]],
  ["relight.transmitShare", "relight", (m) => [m["transmit.share"]], ["light"]],
  ["relight.transmitOverlap", "relight", (m) => [m["transmit.overlap"]], ["light"]],
  ["relight.tileSpread", "relight", (m) => [m["transmit.tileSpread"]], ["light"]],
  ["relight.tileSpread (detail 0)", "relight0", (m) => [m["transmit.tileSpread"]], ["light"]],
  ["relight.tileWhite (252/255 = 0.9882)", "relight", (m) => [m["transmit.tileWhite"]], ["light"]],
  ["text.rangeFloor (min of light, dark)", "text", (m) => [m["light.range"] === undefined ? m.range : Math.min(m["light.range"], m["dark.range"])], ["both", "live"]],
  ["text.rangeFloor (light; dark)", "text", (m) => [m["light.range"], m["dark.range"], m.range], ["both", "live"]],
  ["text.rangePaintMin (paint share)", "text", (m) => [m["light.paint"], m["dark.paint"]], ["both"]],
  ["text.litLevel (unlit p95 / p99)", "lit", (m) => [m["unlit.p95"]], ["light", "dark"]],
  ["text.litLevel (lit p5 / p99)", "lit", (m) => [m["lit.p5"]], ["light", "dark"]],
  // Gated in both schemes since Phase 2 Task 2 (the check reads both); shares read with the finish grain off since Task 2c.
  ["detail.minRise", "detail", (m) => [m.rise], ["light", "dark"]],
  // Phase 2 (Task 25). Each label says which side of the value an honest page must read. The relight check reads light
  // and dark, so both are gated. A cell with no reading for a key (the page does not declare that law) is left out.
  // shadow.depth is the smaller of the two test positions' deepest relative darkening (shadow.depth.<k>).
  ["relight.shadowDark (shadow depth; kept must be over)", "relight", (m) => [m["shadow.depth"]], ["light", "dark"]],
  ["relight.shadowShift (px against the light's move; kept must be at or over)", "relight", (m) => [m["shadow.shift"]], ["light", "dark"]],
  // The mask share at each test position must reach it where the sheet's height blocks the light; the smaller decides.
  ["relight.shadowNone (smaller mask share; kept must be at or over)", "relight", (m) => [min2(m["shadow.share.0"], m["shadow.share.1"])], ["light", "dark"]],
  // The share the sheet's height blocks at each test position: at or over the value means the law expects a shadow.
  ["relight.shadowNone (predicted share at positions 0 / 1; over means a shadow is expected)", "relight", (m) => [m["shadow.predicted.0"], m["shadow.predicted.1"]], ["light", "dark"]],
  ["relight.iridescenceShift (key / tilt; kept must be over)", "relight", (m) => [m["iridescence.light"], m["iridescence.tilt"]], ["light", "dark"]],
  ["relight.iridescenceMatch (kept must be under)", "relight", (m) => [m["iridescence.match"]], ["light", "dark"]],
  ["relight.iridescenceApart (kept must be over)", "relight", (m) => [m["iridescence.apart"]], ["light", "dark"]],
  ["relight.iridescenceSpread (kept must be over)", "relight", (m) => [m["iridescence.spread"]], ["light", "dark"]],
  ["relight.filmShift (key / tilt; kept must be over)", "relight", (m) => [m["iridescence.film.key"], m["iridescence.film.tilt"]], ["light", "dark"]],
  ["relight.filmMatch (kept must be under)", "relight", (m) => [m["iridescence.film.match"]], ["light", "dark"]],
  ["relight.filmApart (kept must be over)", "relight", (m) => [m["iridescence.film.apart"]], ["light", "dark"]],
  // Written only when (e) is read (the page's (b) noise under the limit).
  ["relight.filmSpread (kept must be under)", "relight", (m) => [m["iridescence.film.spread"]], ["light", "dark"]],
  ["relight.burnJitter (largest share drop; kept must be at or under)", "relight", (m) => [m["burn.jitter"]], ["light", "dark"]],
  ["relight.scorchDrop (kept must be over)", "relight", (m) => [m["burn.scorchDrop"]], ["light", "dark"]],
  ["relight.emberFade (outer / inner quarter; kept must be under)", "relight", (m) => [m["burn.ember.fade"]], ["light", "dark"]],
  // Read on test pages only (no kept bar sets window.__tone): kept is empty, the page and fault rows carry it.
  ["tone.minSplit (card-desk OKLab distance; honest must be over)", "tone", (m) => [m.split], ["light", "dark"]],
];

const min2 = (a, b) => (a === undefined ? b : b === undefined ? a : Math.min(a, b));
const fmt = (x) => (x === undefined || x === null || Number.isNaN(x) ? "-" : Math.abs(x) >= 100 ? x.toFixed(1) : Math.abs(x) >= 1 ? x.toFixed(3) : x.toPrecision(4));
/** Percentile by linear interpolation between order statistics (type 7), as a spreadsheet's PERCENTILE. */
const pct = (xs, q) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return NaN;
  const x = q * (s.length - 1);
  const i = Math.floor(x);
  return s[i] + (s[Math.min(i + 1, s.length - 1)] - s[i]) * (x - i);
};
const vals = (cs, read) => cs.flatMap((c) => read(c.measured ?? {}).filter((v) => typeof v === "number" && Number.isFinite(v)));

function table(inFile, mdFile) {
  const all = Object.values(JSON.parse(readFileSync(inFile, "utf8")));
  const th = JSON.parse(readFileSync(path.join(REPO_ROOT, "src/checks/thresholds.json"), "utf8"));
  const lines = ["# Task 20 measurements", "", `Cells: ${all.length}. Kept bars at seeds 1 to 3; "gated" is the schemes the gate reads; "other" is the rest (dark for checks the gate reads in light). Percentiles by linear interpolation.`, ""];
  const summary = {};
  for (const [key, kind, read, gated] of ROWS) {
    const base = key.split(" ")[0];
    const value = th[base]?.value;
    const of = (group, schemes) => all.filter((c) => c.group === group && c.kind === kind && (!schemes || schemes.includes(c.scheme)));
    const kept = vals(of("bar", gated), read);
    const other = vals(of("bar").filter((c) => !gated.includes(c.scheme)), read);
    const ctl = vals(of("control"), read);
    lines.push(`## ${key} (value ${value ?? "-"})`, "");
    lines.push(`kept (gated, n ${kept.length}): p5 ${fmt(pct(kept, 0.05))}, p95 ${fmt(pct(kept, 0.95))}, min ${fmt(Math.min(...kept))}, max ${fmt(Math.max(...kept))}`);
    if (other.length) lines.push(`kept (other scheme, n ${other.length}): p5 ${fmt(pct(other, 0.05))}, p95 ${fmt(pct(other, 0.95))}, min ${fmt(Math.min(...other))}, max ${fmt(Math.max(...other))}`);
    if (ctl.length) lines.push(`control (n ${ctl.length}): ${ctl.map(fmt).join(", ")}`);
    lines.push("", "| target | scheme | seed 1 | seed 2 | seed 3 |", "|---|---|---|---|---|");
    const rows = new Map();
    for (const c of all.filter((x) => x.kind === kind)) {
      const v = read(c.measured ?? {});
      if (!v.some((x) => typeof x === "number" && Number.isFinite(x))) continue;
      const k = `${c.group === "bar" ? "" : `${c.group}: `}${c.rel} | ${c.scheme}`;
      if (!rows.has(k)) rows.set(k, {});
      rows.get(k)[c.seed] = v.filter((x) => typeof x === "number").map(fmt).join(" / ") + (c.status === "fail" || c.status === "partial" || c.status === "error" ? ` (${c.status})` : "");
    }
    for (const [k, r] of rows) lines.push(`| ${k.replace(" | ", " | ")} | ${r[1] ?? "-"} | ${r[2] ?? "-"} | ${r[3] ?? "-"} |`);
    lines.push("");
    summary[key] = { value, kept: { n: kept.length, p5: pct(kept, 0.05), p95: pct(kept, 0.95), min: Math.min(...kept), max: Math.max(...kept) }, other: other.length ? { p5: pct(other, 0.05), p95: pct(other, 0.95), min: Math.min(...other), max: Math.max(...other) } : null, control: ctl };
  }
  const md = lines.join("\n");
  if (mdFile) writeFileSync(mdFile, md);
  console.log(JSON.stringify(summary, null, 1));
}

// ---------------------------------------------------------------------------------------------------------------

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
if (arg("--table")) table(arg("--table"), arg("--md"));
else if (arg("--out")) await measure(arg("--out"), Number(arg("--budget") ?? Infinity), arg("--only"), arg("--bars"), args.includes("--dry"));
else {
  console.error("usage: node scripts/measure.mjs --out <cells.json> [--budget <s>] [--only <id part>] [--bars <list>] [--dry] | --table <cells.json> [--md <md>]");
  process.exit(2);
}
