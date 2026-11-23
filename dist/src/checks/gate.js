// The gate: resolves a target (a bar folder or an html page), runs every registered check, and gives one verdict.
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { loadBar } from "../bar.js";
import * as banding from "./banding-grain.js";
import * as detail from "./detail.js";
import * as flash from "./flash.js";
import * as hygiene from "./hygiene.js";
import * as palette from "./palette.js";
import * as relight from "./relight.js";
import * as render from "./render.js";
import { REPO_ROOT } from "./root.js";
import { serveRoot } from "./serve.js";
import * as still from "./still.js";
import * as textContrast from "./text-contrast.js";
/** Every check, in the order the gate prints them. Later tasks add theirs with one entry. */
export const CHECKS = [
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
export class UsageError extends Error {
}
export function resolveTarget(arg, opts, base) {
    const abs = path.resolve(arg);
    if (!existsSync(abs))
        throw new UsageError(`gate: ${arg} does not exist`);
    const isDir = statSync(abs).isDirectory();
    const html = isDir ? path.join(abs, "index.html") : abs;
    if (!existsSync(html))
        throw new UsageError(`gate: ${path.relative(process.cwd(), html) || html} does not exist`);
    const rel = path.relative(REPO_ROOT, html);
    if (rel.startsWith("..") || path.isAbsolute(rel))
        throw new UsageError(`gate: ${arg} is outside the repo (${REPO_ROOT}), which the gate serves`);
    const relPosix = rel.split(path.sep).join("/");
    // A folder, or an html file in a folder with a bar.json beside it, is a bar.
    const barDir = isDir ? abs : path.dirname(abs);
    const bar = existsSync(path.join(barDir, "bar.json")) ? loadBar(barDir) : null;
    if (opts.seeds !== undefined) {
        if (!bar)
            throw new UsageError(`gate: ${arg} has no bar.json, so it has no seeds to pick from`);
        const missing = opts.seeds.filter((s) => !bar.seeds.includes(s));
        if (missing.length > 0)
            throw new UsageError(`gate: seed ${missing.join(", ")} is not in ${arg}'s bar.json seeds`);
        bar.seeds = bar.seeds.filter((s) => opts.seeds.includes(s));
    }
    return { url: `${base}/${relPosix}${bar?.query ? `?${bar.query}` : ""}`, bar, control: opts.control ?? relPosix.startsWith("controls/") };
}
const word = { pass: "pass", fail: "FAIL", skip: "skip", partial: "PARTIAL" };
/** Seeds a check runs at: every seed in bar.json for a bar, else one run at the page's default (seed 1; a control gets none). */
export const seedsOf = (t) => (t.control || !t.bar ? [undefined] : [...new Set(t.bar.seeds)]);
const RANK = { fail: 3, partial: 2, pass: 1, skip: 0 };
/**
 * One check's result over a bar's seeds (in bar.json order). It fails when any seed fails, else it is partial when
 * any seed is partial; the line names those seeds and gives the first one's reason. A pass names every seed and
 * gives the first seed's numbers. `measured` holds the reported seed's numbers, `seed` (which seed that is), and
 * every seed's numbers as `<key>@<seed>`. A single run is returned as it is.
 */
export function combineSeeds(name, runs) {
    if (runs.length === 1)
        return runs[0].result;
    const worst = runs.reduce((w, r) => (RANK[r.result.status] > RANK[w.result.status] ? r : w), runs[0]).result.status;
    const hit = runs.filter((r) => r.result.status === worst);
    const shown = hit[0];
    const body = shown.result.line.startsWith(`${name}: `) ? shown.result.line.slice(name.length + 2) : shown.result.line;
    const all = runs.map((r) => r.seed).join(", ");
    const at = hit.map((r) => r.seed).join(", ");
    const s = hit.length > 1 ? "seeds" : "seed";
    const head = worst === "fail" ? `fails at ${s} ${at} of ${all}` : worst === "partial" ? `partial at ${s} ${at} of ${all}` : `${worst === "pass" ? "passes" : "skips"} at seeds ${all}`;
    const measured = { ...shown.result.measured, seed: shown.seed };
    for (const r of runs)
        for (const [k, v] of Object.entries(r.result.measured))
            measured[`${k}@${r.seed}`] = v;
    return { name, status: worst, line: `${name}: ${head}; at seed ${shown.seed}: ${body}`, measured };
}
/**
 * Runs one registered check on `t` as the gate does: once on a control (its control half or its skip) and on a bare
 * page, and at every seed in bar.json for a bar (combined by `combineSeeds`), since a law that holds only at the
 * first seed is not a pass. Each check keeps its own light/dark halves at every seed. A run that throws is
 * `partial` for that seed, never a pass. Off a control, an entry's `applies` is asked once first: a skip reason
 * skips the check with that reason; an `applies` that throws makes it `partial`, never a silent skip.
 */
export async function runEntry(c, t, opts) {
    const skip = (why) => ({ name: c.name, status: "skip", line: `${c.name}: ${why}`, measured: {} });
    if (t.control && "skip" in c.control)
        return skip(c.control.skip);
    // Applicability does not depend on the seed (it reads the page's HTML), so it is asked once, at the first seed.
    if (!t.control && c.applies) {
        const first = seedsOf(t)[0];
        let ok;
        try {
            ok = await c.applies(t, first === undefined ? opts : { ...opts, seed: first });
        }
        catch (e) {
            const msg = (e instanceof Error ? e.message : String(e)).split("\n")[0];
            return { name: c.name, status: "partial", line: `${c.name}: could not tell whether it applies: ${msg}`, measured: {} };
        }
        if (ok !== true)
            return skip(ok.skip);
    }
    const fn = t.control ? c.control : c.run;
    const runs = [];
    for (const seed of seedsOf(t)) {
        let result;
        try {
            result = await fn(t, seed === undefined ? opts : { ...opts, seed });
        }
        catch (e) {
            const msg = (e instanceof Error ? e.message : String(e)).split("\n")[0];
            result = { name: c.name, status: "partial", line: `${c.name}: could not run: ${msg}`, measured: {} };
        }
        runs.push({ seed: seed ?? 1, result });
    }
    return combineSeeds(c.name, runs);
}
/** Runs each check through `runEntry`, in order: a bar at each of its seeds. `checks` is the registry unless a test passes fakes. */
export async function runAll(t, opts, checks = CHECKS) {
    const results = [];
    for (const c of checks)
        results.push(await runEntry(c, t, opts));
    return results;
}
/**
 * Runs every check on `target` (a bar folder or an html file), a bar at each of its seeds. A check that throws is
 * `partial`, never a pass. `checks` is the registry unless a test passes fakes.
 */
export async function gate(target, opts = {}, checks = CHECKS) {
    const server = opts.baseUrl === undefined ? await serveRoot(REPO_ROOT) : undefined;
    try {
        const t = resolveTarget(target, opts, opts.baseUrl ?? server.url);
        const results = await runAll(t, opts, checks);
        const fails = results.filter((r) => r.status === "fail").length;
        const verdict = fails > 0 ? `failed: ${fails}` : results.some((r) => r.status === "partial") ? "partial" : "passed";
        const lines = results.map((r) => `${word[r.status].padEnd(8)}${r.line}`);
        if (t.control)
            lines.push(fails > 0 || verdict === "partial" ? "control: flagged" : "control: quiet");
        return { verdict, lines, results };
    }
    finally {
        await server?.close();
    }
}
