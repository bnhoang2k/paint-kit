// The gate: resolves a target (a bar folder or an html page), runs every registered check, and gives one verdict.
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { loadBar } from "../bar.ts";
import * as banding from "./banding-grain.ts";
import * as detail from "./detail.ts";
import * as flash from "./flash.ts";
import * as hygiene from "./hygiene.ts";
import * as palette from "./palette.ts";
import * as relight from "./relight.ts";
import * as render from "./render.ts";
import { REPO_ROOT } from "./root.ts";
import { serveRoot } from "./serve.ts";
import * as still from "./still.ts";
import * as textContrast from "./text-contrast.ts";
import type { CheckEntry, CheckOpts, CheckResult, Target } from "./types.ts";

/** Every check, in the order the gate prints them. Later tasks add theirs with one entry. */
export const CHECKS: CheckEntry[] = [
  { name: "render", run: render.check, control: render.controlCheck },
  { name: "palette", run: palette.check, control: { skip: "a control has no paint tokens to swap" } },
  { name: "banding-grain", run: banding.check, control: banding.controlCheck },
  { name: "still", run: still.check, control: still.controlCheck },
  { name: "hygiene", run: hygiene.check, control: { skip: "a control has no paint hook, fallback or ink to inspect" } },
  { name: "relight", run: relight.check, control: { skip: "a control has no paint hook or declared lights to move" } },
  { name: "detail", run: detail.check, control: { skip: "a control has no detail dial" } },
  // On a control only the range floor applies (ruling 3): it has no ink text to score. On any other page the check
  // applies only when the page has text (spec, grown-field proof: "`text-contrast` does not apply: the page has no text").
  { name: "text-contrast", run: textContrast.check, control: textContrast.controlCheck, applies: textContrast.applies },
  // Check 9 (WCAG 2.3.1) runs on every page: any bar can flash (a resolve, a glitch), and a still page passes cheaply.
  { name: "flash", run: flash.check, control: { skip: "a control has no setTime to step it frame by frame" } },
];

/** Thrown for a target the gate cannot resolve; the CLI exits 2 on it. */
export class UsageError extends Error {}

export type GateOpts = CheckOpts & {
  /** Treat the target as a control page. Unset: a page under `controls/` is one. */
  control?: boolean;
  /** An already-running server for the target's served root (`servedRootFor`). Unset: the gate serves it itself. */
  baseUrl?: string;
  /**
   * Run a bar at only these of its bar.json seeds (a test that runs one seed per test, to stay under the page
   * suite's per-test timeout). A seed not in bar.json is a usage error. Unset: every seed in bar.json.
   */
  seeds?: number[];
};

export type GateResult = { verdict: string; lines: string[]; results: CheckResult[] };

/** The file a project's import map loads the engine from, under the folder that is served at `/`. */
export const ENGINE_ENTRY = path.join("dist", "src", "engine", "index.js");

/**
 * The folder the gate serves for a page: the kit repo for a page inside it, else the nearest folder above the page
 * that holds `dist/src/engine/index.js` (the folder `paint-kit init` set up). Without one the page cannot load the
 * engine, so it is a usage error that names `init`.
 */
export function servedRootOf(html: string): string {
  const inKit = path.relative(REPO_ROOT, html);
  if (!inKit.startsWith("..") && !path.isAbsolute(inKit)) return REPO_ROOT;
  for (let d = path.dirname(html); ; d = path.dirname(d)) {
    if (existsSync(path.join(d, ENGINE_ENTRY))) return d;
    if (path.dirname(d) === d) break;
  }
  throw new UsageError(
    `gate: ${html} is outside the kit and no folder above it holds ${ENGINE_ENTRY.split(path.sep).join("/")}; run \`paint-kit init <folder>\` on the folder your site serves at /`,
  );
}

/** The page's html for a target argument (a folder means its index.html). */
function htmlOf(arg: string): string {
  const abs = path.resolve(arg);
  if (!existsSync(abs)) throw new UsageError(`gate: ${arg} does not exist`);
  const html = statSync(abs).isDirectory() ? path.join(abs, "index.html") : abs;
  if (!existsSync(html)) throw new UsageError(`gate: ${path.relative(process.cwd(), html) || html} does not exist`);
  return html;
}

/** The folder to serve for a target argument: see `servedRootOf`. */
export const servedRootFor = (arg: string): string => servedRootOf(htmlOf(arg));

/** `base` serves `servedRootFor(arg)`: the kit repo for a page inside it, the init folder for one outside. */
export function resolveTarget(arg: string, opts: GateOpts, base: string): Target {
  const abs = path.resolve(arg);
  const html = htmlOf(arg);
  const isDir = html !== abs;
  const rel = path.relative(servedRootOf(html), html);
  const relPosix = rel.split(path.sep).join("/");
  // A folder, or an html file in a folder with a bar.json beside it, is a bar.
  const barDir = isDir ? abs : path.dirname(abs);
  const bar = existsSync(path.join(barDir, "bar.json")) ? loadBar(barDir) : null;
  if (opts.seeds !== undefined) {
    if (!bar) throw new UsageError(`gate: ${arg} has no bar.json, so it has no seeds to pick from`);
    const missing = opts.seeds.filter((s) => !bar.seeds.includes(s));
    if (missing.length > 0) throw new UsageError(`gate: seed ${missing.join(", ")} is not in ${arg}'s bar.json seeds`);
    bar.seeds = bar.seeds.filter((s) => opts.seeds!.includes(s));
  }
  const inKit = path.relative(REPO_ROOT, html);
  const control = opts.control ?? (!inKit.startsWith("..") && inKit.split(path.sep)[0] === "controls");
  return { url: `${base}/${relPosix}${bar?.query ? `?${bar.query}` : ""}`, bar, control, file: html };
}

const word = { pass: "pass", fail: "FAIL", skip: "skip", partial: "PARTIAL" } as const;

/** Seeds a check runs at: every seed in bar.json for a bar, else one run at the page's default (seed 1; a control gets none). */
export const seedsOf = (t: Target): (number | undefined)[] => (t.control || !t.bar ? [undefined] : [...new Set(t.bar.seeds)]);

const RANK: Record<CheckResult["status"], number> = { fail: 3, partial: 2, pass: 1, skip: 0 };

/**
 * One check's result over a bar's seeds (in bar.json order). It fails when any seed fails, else it is partial when
 * any seed is partial; the line names those seeds and gives the first one's reason. A pass names every seed and
 * gives the first seed's numbers. `measured` holds the reported seed's numbers, `seed` (which seed that is), and
 * every seed's numbers as `<key>@<seed>`. A single run is returned as it is.
 */
export function combineSeeds(name: string, runs: { seed: number; result: CheckResult }[]): CheckResult {
  if (runs.length === 1) return runs[0]!.result;
  const worst = runs.reduce((w, r) => (RANK[r.result.status] > RANK[w.result.status] ? r : w), runs[0]!).result.status;
  const hit = runs.filter((r) => r.result.status === worst);
  const shown = hit[0]!;
  const body = shown.result.line.startsWith(`${name}: `) ? shown.result.line.slice(name.length + 2) : shown.result.line;
  const all = runs.map((r) => r.seed).join(", ");
  const at = hit.map((r) => r.seed).join(", ");
  const s = hit.length > 1 ? "seeds" : "seed";
  const head =
    worst === "fail" ? `fails at ${s} ${at} of ${all}` : worst === "partial" ? `partial at ${s} ${at} of ${all}` : `${worst === "pass" ? "passes" : "skips"} at seeds ${all}`;
  const measured: Record<string, number> = { ...shown.result.measured, seed: shown.seed };
  for (const r of runs) for (const [k, v] of Object.entries(r.result.measured)) measured[`${k}@${r.seed}`] = v;
  return { name, status: worst, line: `${name}: ${head}; at seed ${shown.seed}: ${body}`, measured };
}

/**
 * Runs one registered check on `t` as the gate does: once on a control (its control half or its skip) and on a bare
 * page, and at every seed in bar.json for a bar (combined by `combineSeeds`), since a law that holds only at the
 * first seed is not a pass. Each check keeps its own light/dark halves at every seed. A run that throws is
 * `partial` for that seed, never a pass. Off a control, an entry's `applies` is asked once first: a skip reason
 * skips the check with that reason; an `applies` that throws makes it `partial`, never a silent skip.
 */
export async function runEntry(c: CheckEntry, t: Target, opts: CheckOpts): Promise<CheckResult> {
  const skip = (why: string): CheckResult => ({ name: c.name, status: "skip", line: `${c.name}: ${why}`, measured: {} });
  if (t.control && "skip" in c.control) return skip(c.control.skip);
  // Applicability does not depend on the seed (it reads the page's HTML), so it is asked once, at the first seed.
  if (!t.control && c.applies) {
    const first = seedsOf(t)[0];
    let ok: true | { skip: string };
    try {
      ok = await c.applies(t, first === undefined ? opts : { ...opts, seed: first });
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).split("\n")[0];
      return { name: c.name, status: "partial", line: `${c.name}: could not tell whether it applies: ${msg}`, measured: {} };
    }
    if (ok !== true) return skip(ok.skip);
  }
  const fn = t.control ? (c.control as Exclude<CheckEntry["control"], { skip: string }>) : c.run;
  const runs: { seed: number; result: CheckResult }[] = [];
  for (const seed of seedsOf(t)) {
    let result: CheckResult;
    try {
      result = await fn(t, seed === undefined ? opts : { ...opts, seed });
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).split("\n")[0];
      result = { name: c.name, status: "partial", line: `${c.name}: could not run: ${msg}`, measured: {} };
    }
    runs.push({ seed: seed ?? 1, result });
  }
  return combineSeeds(c.name, runs);
}

/** Runs each check through `runEntry`, in order: a bar at each of its seeds. `checks` is the registry unless a test passes fakes. */
export async function runAll(t: Target, opts: CheckOpts, checks: CheckEntry[] = CHECKS): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  for (const c of checks) results.push(await runEntry(c, t, opts));
  return results;
}

/**
 * Runs every check on `target` (a bar folder or an html file), a bar at each of its seeds. A check that throws is
 * `partial`, never a pass. `checks` is the registry unless a test passes fakes.
 */
export async function gate(target: string, opts: GateOpts = {}, checks: CheckEntry[] = CHECKS): Promise<GateResult> {
  const server = opts.baseUrl === undefined ? await serveRoot(servedRootFor(target)) : undefined;
  try {
    const t = resolveTarget(target, opts, opts.baseUrl ?? server!.url);
    const results = await runAll(t, opts, checks);
    const fails = results.filter((r) => r.status === "fail").length;
    const verdict = fails > 0 ? `failed: ${fails}` : results.some((r) => r.status === "partial") ? "partial" : "passed";
    const lines = results.map((r) => `${word[r.status].padEnd(8)}${r.line}`);
    if (t.control) lines.push(fails > 0 || verdict === "partial" ? "control: flagged" : "control: quiet");
    return { verdict, lines, results };
  } finally {
    await server?.close();
  }
}
