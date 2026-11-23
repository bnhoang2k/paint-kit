#!/usr/bin/env node
// Every reading of the iridescence law's film branch (Phase 2 Tasks 18b to 18e), with no limit in use. It reads the honest
// pages (bar 11 among them) and every planted film fault at seeds 1 to 3, light and dark, and writes one JSON result per page, seed and scheme
// under node_modules/.cache/paint-kit/film-readings/. A result that already exists for this build and page is skipped, so
// a run resumes across commands. Run `pnpm build` first, and never during a run.
//
//   node scripts/film-readings.mjs [--only <text>] [--cap <seconds>] [--jobs <n>]
//   node scripts/film-readings.mjs --report <file.md> [--limit <value>]
//
// --only reads the pages whose name contains the text. --cap (default 125) stops the run cleanly and prints how many
// remain. --jobs (default 3) is how many pages read at once. --report writes the tables from the results on disk, and
// --limit is the (e) limit its "(e) read" column judges the read floor at (default: no limit, so every (e) with a (b) reads).
// This script compares readings by direction only. It computes no threshold, no margin and no recommended value.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "node_modules/.cache/paint-kit/film-readings");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};

/** The (e) limit the report's read floor uses: (e) is read when the page's (b) over (e)'s denominator is under it. */
const LIMIT = Number(arg("limit", "Infinity"));
const noiseOf = (s) => (s && s.noise !== null && s.noise !== undefined && s.denom > 0 ? s.noise / s.denom : null);
const eRead = (s) => noiseOf(s) !== null && noiseOf(s) < LIMIT;

const HONEST = [
  { name: "film", rel: "test/pages/film.html", query: "" },
  { name: "film-metal", rel: "test/pages/film-metal.html", query: "" },
  { name: "film-steel", rel: "test/pages/film-metal.html", query: "?range=26,54&ior=2.343" },
  // Task 18d: the steel page with both panels' ramps run one way, as a heated bar's runs.
  { name: "film-steel-oneway", rel: "test/pages/film-metal.html", query: "?range=26,54&ior=2.343&oneway=1" },
  // Task 18e: bar 11 joins the honest set. Its bin beside steel's gap reads (b) by row, which the one-way page never does.
  { name: "bar-11-heat-tint", rel: "bars/11-heat-tint/index.html", query: "" },
];
/** The design note's fault table: what each fault must fail, what it also fails, and what it is expected to pass. */
const FAULTS = {
  "film-fixed-light": { must: ["aKey"], also: ["e"], pass: ["aTilt", "b", "c", "d"] },
  "film-fixed-surface": { must: ["aTilt"], also: [], pass: ["aKey", "b", "c", "d", "e"] },
  "film-place-hue": { must: ["b"], also: [], pass: ["aKey", "aTilt", "c", "d", "e"] },
  "film-clock": { must: ["c"], also: [], pass: ["aKey", "aTilt", "b", "d", "e"] },
  "film-no-thickness": { must: ["d"], also: [], pass: ["aKey", "aTilt", "b", "c"], unread: ["e"] },
  "film-no-angle": { must: ["e"], also: [], pass: ["aKey", "aTilt", "b", "c", "d"] },
  "film-view-normal": { must: ["b"], also: [], pass: ["aKey", "aTilt", "c", "d"] },
  "film-drift": { must: [], also: [], pass: [], unread: ["c"] },
};
const FAULT_PAGES = [
  ...Object.keys(FAULTS).flatMap((f) => ["", "-metal"].map((s) => ({ name: f + s, fault: f, rel: `test/faults/${f}${s}/index.html`, query: "" }))),
  // film-no-angle at the settled steel values (Task 18c): it joins (e)'s fault set.
  { name: "film-no-angle-steel", fault: "film-no-angle", rel: "test/faults/film-no-angle-steel/index.html", query: "" },
];
const PAGES = [...HONEST, ...FAULT_PAGES];
const SEEDS = [1, 2, 3];
const SCHEMES = ["light", "dark"];
const fileOf = (page, seed, scheme) => path.join(OUT, `${page.name}__seed${seed}__${scheme}.json`);

/** A hash of every built file of the engine and the checks, so a result from another build is read again. */
function buildStamp() {
  const hash = createHash("sha1");
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else hash.update(readFileSync(p));
    }
  };
  walk(path.join(ROOT, "dist/src/engine"));
  walk(path.join(ROOT, "dist/src/checks"));
  return hash.digest("hex");
}
const pageStamp = (page) => createHash("sha1").update(readFileSync(path.join(ROOT, page.rel))).update(page.query).digest("hex");
function done(page, seed, scheme, build) {
  const f = fileOf(page, seed, scheme);
  if (!existsSync(f)) return false;
  try {
    const r = JSON.parse(readFileSync(f, "utf8"));
    return r.build === build && r.page === pageStamp(page);
  } catch {
    return false;
  }
}

const n = (v, d = 4) => (v === null || v === undefined ? "not read" : v.toFixed(d));
const summary = (r) =>
  `key ${n(r.key)} tilt ${n(r.tilt)} | b ${n(r.match?.spread, 5)} (${r.match?.split ?? "-"}, OPD ${n(r.match?.opd, 1)}, raw ${n(r.match?.raw, 5)}) step ${n(r.step)} | c ${n(r.time)} still ${n(r.still, 3)} | d ${n(r.apart?.dist)} | e ${n(r.spread?.ratio, 3)} noise/denom ${n(noiseOf(r.spread), 3)} denom ${n(r.spread?.denom)} step ${n(r.spread?.step)} | bins ${r.bins.a}/${r.bins.b}`;

async function read() {
  const only = arg("only", "");
  const cap = Number(arg("cap", "125")) * 1000;
  const jobs = Number(arg("jobs", "3"));
  const start = Date.now();
  const build = buildStamp();
  mkdirSync(OUT, { recursive: true });
  const todo = [];
  for (const page of PAGES) {
    if (only && !page.name.includes(only)) continue;
    for (const seed of SEEDS) for (const scheme of SCHEMES) if (!done(page, seed, scheme, build)) todo.push({ page, seed, scheme });
  }
  const total = todo.length;
  console.log(`film-readings: ${total} to read`);
  const { filmSchemeReading } = await import(path.join(ROOT, "dist/src/checks/relight.js"));
  const { resolveTarget } = await import(path.join(ROOT, "dist/src/checks/gate.js"));
  const { serveRoot } = await import(path.join(ROOT, "dist/src/checks/serve.js"));
  const { closeBrowsers } = await import(path.join(ROOT, "dist/src/checks/harness.js"));
  const server = await serveRoot(ROOT);
  let finished = 0;
  let failed = 0;
  let longest = 0;
  const finish = async (word) => {
    const left = total - finished - failed;
    console.log(`film-readings: ${word}: ${finished} read, ${failed} failed, ${left} remain (${((Date.now() - start) / 1000).toFixed(0)} s)`);
    await closeBrowsers().catch(() => {});
    await server.close().catch(() => {});
    process.exit(failed ? 1 : 0);
  };
  // The cap is a hard stop: a reading still running then is dropped, and no result file is half written.
  const timer = setTimeout(() => void finish("stopped at the cap"), cap);
  const worker = async () => {
    while (todo.length) {
      if (Date.now() - start + longest > cap) return;
      const { page, seed, scheme } = todo.shift();
      const t0 = Date.now();
      try {
        const t = resolveTarget(path.join(ROOT, page.rel), {}, server.url);
        const reading = await filmSchemeReading({ ...t, url: t.url + page.query }, { seed }, scheme, undefined, Infinity);
        const f = fileOf(page, seed, scheme);
        writeFileSync(`${f}.tmp`, JSON.stringify({ name: page.name, seed, scheme, build, page: pageStamp(page), reading }));
        renameSync(`${f}.tmp`, f);
        finished++;
        longest = Math.max(longest, Date.now() - t0);
        console.log(`${page.name} seed ${seed} ${scheme}: ${summary(reading)} [${((Date.now() - t0) / 1000).toFixed(0)} s]`);
      } catch (e) {
        failed++;
        console.log(`${page.name} seed ${seed} ${scheme}: FAILED ${String(e).slice(0, 300)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: jobs }, worker));
  clearTimeout(timer);
  await finish(todo.length ? "stopped before the cap" : "complete");
}

/** The six readings of one run, each with the side it fails on: "low" for an over condition, "high" for an under one. */
const CONDITIONS = {
  aKey: { label: "(a) key", side: "low", get: (r) => r.key },
  aTilt: { label: "(a) tilt", side: "low", get: (r) => r.tilt },
  b: { label: "(b)", side: "high", get: (r) => r.match?.spread ?? null },
  c: { label: "(c)", side: "high", get: (r) => r.time },
  d: { label: "(d)", side: "low", get: (r) => r.apart?.dist ?? null },
  e: { label: "(e)", side: "high", get: (r) => (eRead(r.spread) ? r.spread.ratio : null) },
};

function report(out) {
  const build = buildStamp();
  const load = (page) =>
    SEEDS.flatMap((seed) =>
      SCHEMES.map((scheme) => {
        const f = fileOf(page, seed, scheme);
        return done(page, seed, scheme, build) ? { seed, scheme, r: JSON.parse(readFileSync(f, "utf8")).reading } : { seed, scheme, r: null };
      }),
    );
  const head = "| page | seed | scheme | (a) key | (a) tilt | (a) step | (b) | (b) split | (b) step | (c) | (c) still | (c) step | (d) | (d) step | (e) ratio | (b) / (e) denominator | (e) read | (e) denominator | (e) tint step | (e) ratio step | bins A / B |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n";
  const row = (name, { seed, scheme, r }) => {
    if (!r) return `| ${name} | ${seed} | ${scheme} | no result |${" |".repeat(17)}\n`;
    const s = r.spread;
    return `| ${name} | ${seed} | ${scheme} | ${n(r.key)} | ${n(r.tilt)} | 0.0011 to 0.0023 | ${n(r.match?.spread)} | ${r.match?.split ?? "-"} | ${n(r.step)} | ${n(r.time)} | ${n(r.still, 3)} | ${n(1 / 255)} | ${n(r.apart?.dist)} | ${n(r.step)} | ${n(s?.ratio, 3)} | ${n(noiseOf(s), 3)} | ${s ? (eRead(s) ? "yes" : "no") : "no bin"} | ${n(s?.denom)} | ${n(s?.step)} | ${s && s.denom > 0 ? n(s.step / s.denom, 3) : "-"} | ${r.bins.a} / ${r.bins.b} |\n`;
  };
  const honest = HONEST.flatMap((p) => load(p).map((x) => ({ ...x, name: p.name })));
  const reads = (rows, c) => rows.filter((x) => x.r).map((x) => CONDITIONS[c].get(x.r)).filter((v) => v !== null && v !== undefined);
  const weakest = Object.fromEntries(Object.keys(CONDITIONS).map((c) => [c, CONDITIONS[c].side === "low" ? Math.min(...reads(honest, c)) : Math.max(...reads(honest, c))]));
  const verdictOf = (rows, c) => {
    const v = rows.filter((x) => x.r).map((x) => CONDITIONS[c].get(x.r));
    const read = v.filter((x) => x !== null && x !== undefined);
    if (!read.length) return "not read";
    const past = read.filter((x) => (CONDITIONS[c].side === "low" ? x < weakest[c] : x > weakest[c])).length;
    const unread = v.length - read.length;
    const tail = unread ? `, ${unread} not read` : "";
    if (past === read.length) return `past honest ${past}/${read.length}${tail}`;
    return past ? `mixed ${past}/${read.length}${tail}` : `inside honest 0/${read.length}${tail}`;
  };
  /** The lowest and highest reading of a condition over some runs, as text. */
  const spanOf = (rows, c) => {
    const v = reads(rows, c);
    return v.length ? `${n(Math.min(...v))} to ${n(Math.max(...v))}` : "not read";
  };
  let md = `# Task 18c: film readings\n\nStatus: the readings the film limits are chosen from. Generated by \`node scripts/film-readings.mjs --report\` on one build. Every reading is taken with no limit in use. ${Number.isFinite(LIMIT) ? `The "(e) read" column judges the read floor at the (e) limit ${LIMIT}.` : "No (e) limit is applied: every (e) with a (b) reading reads."}\n\n`;
  md += `## How to read the tables\n\n- Each row is one page at one seed in one colour scheme, read by \`filmSchemeReading\` in \`src/checks/relight.ts\`.\n- (a) key and (a) tilt: mean over the film pixels of each pixel's own OKLab chroma change. Each is an "over" condition.\n- (b): the worst split of the worst bin, in tint distance. An "under" condition.\n- (c): mean absolute 8-bit difference from t to t + 1 on held film pixels (0..1). An "under" condition. "(c) still" is the share of film pixels that held.\n- (d): mean tint distance over the bin pairs. An "over" condition.\n- (e): the ratio, an "under" condition. The ratio prints even when (e) is not read. "(b) / (e) denominator" is the read floor's reading: the page's own (b) over (e)'s denominator, a mean per bin. "(e) read" is "yes" when that is under the (e) limit.\n- 8-bit steps, as the gap rule defines them. (a): 0.0011 to 0.0023 OKLab chroma, as foil. (b) and (d): the largest tint change that one encoded level on one channel makes on any bin counted at position A. (c): 1 / 255. (e): the tint step over the bins counted at A or B, and that step over the denominator.\n\n`;
  md += `## Honest pages\n\n${head}${HONEST.flatMap((p) => load(p).map((x) => row(p.name, x))).join("")}\n`;
  md += `## Weakest honest reading of each condition\n\nThe direction comparison below uses these values only to say which side of the honest pages a fault falls on.\n\n| condition | fails toward | weakest honest reading |\n|---|---|---|\n${Object.keys(CONDITIONS).map((c) => `| ${CONDITIONS[c].label} | ${CONDITIONS[c].side === "low" ? "lower" : "higher"} | ${reads(honest, c).length ? n(weakest[c]) : "no honest page reads it"} |`).join("\n")}\n\n`;
  md += `## Conditions an honest page does not read\n\nA condition a page does not read gives no honest reading from that page.\n\n| page | condition | runs not read | what the runs show |\n|---|---|---|---|\n`;
  let gaps = 0;
  for (const p of HONEST) {
    const rows = load(p).filter((x) => x.r);
    for (const c of Object.keys(CONDITIONS)) {
      const missing = rows.filter((x) => CONDITIONS[c].get(x.r) === null || CONDITIONS[c].get(x.r) === undefined);
      if (!missing.length) continue;
      gaps++;
      const s = missing[0].r.spread;
      const why = c === "e" && s ? `denominator ${spanOf(missing.map((x) => ({ r: { key: x.r.spread.denom } })), "aKey")}, tint step ${spanOf(missing.map((x) => ({ r: { key: x.r.spread.step } })), "aKey")}, ratio as computed ${spanOf(missing.map((x) => ({ r: { key: x.r.spread.ratio } })), "aKey")}` : "-";
      md += `| ${p.name} | ${CONDITIONS[c].label} | ${missing.length} of ${rows.length} | ${why} |\n`;
    }
  }
  if (!gaps) md += "| none | | | |\n";
  md += "\n";
  md += `## Fault pages\n\n${head}${FAULT_PAGES.flatMap((p) => load(p).map((x) => row(p.name, x))).join("")}\n`;
  md += `## Each fault against the note's table, by direction\n\n"past honest k/m" means k of the m runs that read the condition fall beyond the weakest honest reading, on its fail side. "inside honest" means none do. "mixed" means some do. Each fault page has six runs.\n\n| fault page | ${Object.values(CONDITIONS).map((c) => c.label).join(" | ")} | note expects to fail | result |\n|---|---|---|---|---|---|---|---|---|\n`;
  const odd = [];
  for (const p of FAULT_PAGES) {
    const rows = load(p);
    const e = FAULTS[p.fault];
    const v = Object.fromEntries(Object.keys(CONDITIONS).map((c) => [c, verdictOf(rows, c)]));
    const notes = [];
    for (const c of e.must) if (!v[c].startsWith("past honest") || v[c].includes("not read")) notes.push(`must fail ${CONDITIONS[c].label}, reads ${v[c]} (${spanOf(rows, c)}; weakest honest ${n(weakest[c])})`);
    for (const c of e.also) if (!v[c].startsWith("past honest")) notes.push(`note says it also fails ${CONDITIONS[c].label}, reads ${v[c]} (${spanOf(rows, c)}; weakest honest ${n(weakest[c])})`);
    for (const c of e.pass) if (v[c].startsWith("past honest") || v[c].startsWith("mixed")) notes.push(`expected to pass ${CONDITIONS[c].label}, reads ${v[c]} (${spanOf(rows, c)}; weakest honest ${n(weakest[c])})`);
    for (const c of e.unread ?? []) if (v[c] !== "not read") notes.push(`expected ${CONDITIONS[c].label} not read, reads ${v[c]}`);
    if (notes.length) odd.push(`- **${p.name}**: ${notes.join("; ")}.`);
    const expected = [...e.must.map((c) => CONDITIONS[c].label), ...e.also.map((c) => `${CONDITIONS[c].label} (also)`), ...(e.unread ?? []).map((c) => `${CONDITIONS[c].label} not read`)].join(", ");
    md += `| ${p.name} | ${Object.keys(CONDITIONS).map((c) => v[c]).join(" | ")} | ${expected} | ${notes.length ? "differs" : "as expected"} |\n`;
  }
  md += `\n## Where a fault differs from the note's table\n\nThese compare a fault with the honest pages' weakest reading. No limit exists yet, so none of them is a pass or a fail of the law.\n\n${odd.length ? odd.join("\n") : "None."}\n`;
  const hue = FAULT_PAGES.filter((p) => p.fault === "film-place-hue").flatMap((p) => load(p));
  md += `\n## The note's stop rule for film-place-hue\n\nThe note stops the work if this fault's (b) reads under 2.25 x H, with H the highest honest (b). H is ${n(weakest.b)}, so 2.25 x H is ${n(2.25 * weakest.b)}. The fault reads ${spanOf(hue, "b")}. ${Math.min(...reads(hue, "b")) < 2.25 * weakest.b ? "The stop rule is met." : "The stop rule is not met."}\n`;
  writeFileSync(out, md);
  console.log(`film-readings: wrote ${out}: ${odd.length} fault pages differ from the note's table`);
  for (const line of odd) console.log(line);
}

if (process.argv.includes("--report")) report(path.resolve(arg("report")));
else await read();
