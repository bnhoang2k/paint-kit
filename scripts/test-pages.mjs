#!/usr/bin/env node
// Runs the whole page suite as a series of vitest commands, each capped under 150 s, and resumes.
//   node scripts/test-pages.mjs [--build] [--fresh] [--only <text>] [--cap <seconds>] [--state <path>]
// --build runs `pnpm build` once at the start (never between steps). --fresh forgets saved results.
// A file runs as one command. A file that hits the cap is split: each of its tests runs as its own command.
// Each result is saved in node_modules/.cache/paint-kit/pages-runner.json, so a re-run skips what passed.
// A command that hits the cap is killed with its process group plus its whole descendant tree (Chromium leads its own group).
// Saved results carry a stamp (HEAD, diff of test/src/bars/scripts and the config files, untracked files, dist build time); a changed stamp discards them.
import { spawn, execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { statSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { loadavg } from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const STATE = path.resolve(opt("--state") ?? path.join(ROOT, "node_modules/.cache/paint-kit/pages-runner.json"));
// scratch JSON files live beside the state file, so two runners with different --state never share them
const scratch = (n) => path.join(path.dirname(STATE), `${path.basename(STATE, ".json")}.${n}.json`);
const CAP_MS = Number(opt("--cap") ?? 145) * 1000;
const only = opt("--only");
const VITEST = ["vitest", "run", "-c", "vitest.pages.config.ts"];

if (args.includes("--build")) {
  const b = spawnSync("pnpm", ["build"], { cwd: ROOT, stdio: "inherit" });
  if (b.status !== 0) process.exit(b.status ?? 1);
}
mkdirSync(path.dirname(STATE), { recursive: true });
if (args.includes("--fresh") && existsSync(STATE)) rmSync(STATE);
// A failed git call throws: an empty stamp would let stale results look current.
const sh = (cmd, a) => execFileSync(cmd, a, { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 });
const untracked = sh("git", ["ls-files", "--others", "--exclude-standard", "--", "test", "bars", "src"]).split("\n").filter(Boolean).sort();
const untrackedHash = createHash("sha1");
for (const f of untracked) untrackedHash.update(f).update(readFileSync(path.join(ROOT, f)));
const stamp = {
  head: sh("git", ["rev-parse", "HEAD"]).trim(),
  diff: createHash("sha1").update(sh("git", ["diff", "HEAD", "--", "test", "src", "bars", "scripts", "vitest.pages.config.ts", "package.json", "pnpm-lock.yaml"])).digest("hex"),
  untracked: untrackedHash.digest("hex"),
  dist: (() => { try { return statSync(path.join(ROOT, "dist/src/engine/index.js")).mtimeMs; } catch { return 0; } })(),
};
let state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : { units: {} };
if (!state.stamp || JSON.stringify(state.stamp) !== JSON.stringify(stamp)) {
  if (existsSync(STATE)) console.log("saved results discarded: no stamp, or HEAD, tracked diff, untracked test/bars/src files or dist build changed since they were saved");
  state = { units: {} };
}
state.stamp = stamp;
const save = () => writeFileSync(STATE, JSON.stringify(state, null, 1));

const files = [
  ...readdirSync(path.join(ROOT, "test/pages")).filter((f) => f.endsWith(".test.ts")).sort().map((f) => `test/pages/${f}`),
  ...readdirSync(path.join(ROOT, "bars")).map((d) => `bars/${d}/gate.test.ts`).filter((f) => existsSync(path.join(ROOT, f))).sort(),
].filter((f) => !only || f.includes(only));

function descendants(root) {
  try {
    const rows = execFileSync("ps", ["-A", "-o", "pid=,ppid="], { encoding: "utf8" }).trim().split("\n").map((l) => l.trim().split(/\s+/).map(Number));
    const out = [];
    const queue = [root];
    while (queue.length) { const p = queue.pop(); for (const [pid, ppid] of rows) if (ppid === p) { out.push(pid); queue.push(pid); } }
    return out;
  } catch { return []; }
}

/** Runs one vitest command under the cap. Resolves { code, ms, timedOut, tests }. */
function run(extra, outFile) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn("npx", [...VITEST, ...extra, "--reporter=json", `--outputFile=${outFile}`], { cwd: ROOT, detached: true, stdio: ["ignore", "ignore", "ignore"] });
    let timedOut = false;
    // Playwright starts Chromium as its own process-group leader, so the group kill alone misses it.
    // Collect the descendant tree (by parent pid) and kill every member as well as the group.
    const killGroup = () => {
      const kids = descendants(child.pid);
      try { process.kill(-child.pid, "SIGKILL"); } catch {}
      for (const pid of kids) { try { process.kill(pid, "SIGKILL"); } catch {} }
    };
    const timer = setTimeout(() => { timedOut = true; killGroup(); }, CAP_MS);
    child.on("exit", (code) => {
      clearTimeout(timer);
      killGroup(); // leave no worker or browser behind (a Chromium left over reparents; sweep the group and known kids)
      let tests = [];
      try {
        const j = JSON.parse(readFileSync(outFile, "utf8"));
        tests = j.testResults.flatMap((f) => f.assertionResults.map((a) => ({ name: a.fullName, status: a.status, ms: Math.round(a.duration ?? 0) })));
      } catch {}
      resolve({ code: timedOut ? null : code, ms: Date.now() - t0, timedOut, tests });
    });
  });
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\\/-]/g, "\\$&");
/** An anchored pattern for one expanded test name. vitest -t joins describe and test titles with " > " (the JSON fullName uses a space). */
const pattern = (name) => `^${escapeRe(name)}$`;
/** Expanded row names (each.* templates filled in): a collect-only run whose skipped rows carry fullName. */
function listTests(file) {
  const out = scratch("list");
  rmSync(out, { force: true });
  spawnSync("npx", [...VITEST, file, "-t", "^$", "--reporter=json", `--outputFile=${out}`], { cwd: ROOT, stdio: "ignore", timeout: 120000 });
  let j;
  try { j = JSON.parse(readFileSync(out, "utf8")); } catch { return null; }
  return [...new Set(j.testResults.flatMap((f) => f.assertionResults.map((a) => [...(a.ancestorTitles ?? []), a.title].join(" > "))))];
}

async function unit(key, extra, perTest = false) {
  const prev = state.units[key];
  if (prev?.status === "passed") return prev;
  const out = scratch("out");
  rmSync(out, { force: true });
  const load = loadavg()[0].toFixed(1);
  const r = await run(extra, out);
  const nPassed = r.tests.filter((t) => t.status === "passed").length;
  const nFailed = r.tests.filter((t) => t.status === "failed").length;
  // passed only when the JSON shows at least one test passed and none failed (zero tests collected is not a pass; all rows skipped is its own status)
  const nSkipped = r.tests.filter((t) => t.status === "skipped" || t.status === "pending" || t.status === "todo").length;
  // a command that ran, passed nothing, failed nothing and skipped at least one row (a skipIf file) is "skipped"; zero tests at all is a failure
  // whole-file step: "skipped" is allowed. Per-test (-t) step: vitest also reports the filtered-out rows as skipped,
  // so only exactly one passed row and none failed counts; zero or several matched rows is "failed".
  const status = r.timedOut ? "timeout"
    : r.code !== 0 || nFailed > 0 ? "failed"
    : perTest ? (nPassed === 1 ? "passed" : "failed")
    : nPassed > 0 ? "passed" : nSkipped > 0 ? "skipped" : "failed";
  const rec = { status, secs: +(r.ms / 1000).toFixed(1), load, tests: r.tests };
  state.units[key] = rec;
  save();
  console.log(`${status.padEnd(8)} ${String(rec.secs).padStart(6)} s  load ${load}  ${key}`);
  if (status === "failed" && nFailed === 0 && r.code === 0) console.log(perTest ? (nPassed === 0 ? "           no test ran (the name matched no row)" : `           pattern matched ${nPassed} rows`) : "           no test ran (no tests collected, or no JSON result)");
  if (status === "failed") for (const t of r.tests.filter((t) => t.status === "failed")) console.log(`           FAILED: ${t.name}`);
  return rec;
}

let bad = 0;
for (const file of files) {
  const whole = state.units[file];
  if (whole?.status === "passed") { console.log(`skip     ${file} (passed before)`); continue; }
  let rec = whole?.status === "timeout" ? whole : await unit(file, [file]);
  if (rec.status === "timeout") {
    const names = state.units[file]?.names ?? listTests(file);
    if (!names) { console.log(`failed   ${file}: the list run wrote no JSON, so the file cannot be split`); bad++; continue; }
    state.units[file] = { status: "timeout", secs: rec.secs, load: rec.load, tests: [], names };
    save();
    let all = true;
    for (const name of names) {
      const r = await unit(`${file} :: ${name}`, [file, "-t", pattern(name)], true);
      if (r.status === "skipped") continue;
      if (r.status !== "passed") { all = false; bad++; }
    }
    if (all) state.units[file].split = true;
    save();
  } else if (rec.status === "failed") bad++;
}
// Summary over the leaf steps: a file that ran whole, or each test of a file that had to be split.
const leaves = Object.entries(state.units).filter(([k, u]) => k.includes(" :: ") || !u.names);
const inScope = leaves.filter(([k]) => files.some((f) => k === f || k.startsWith(`${f} :: `)));
const count = (s) => inScope.filter(([, u]) => u.status === s).length;
const over = inScope.flatMap(([k, u]) => (u.secs > 120 ? [`${u.secs} s  ${k}`] : []));
if (over.length) console.log(`\nsteps over 120 s:\n  ${over.join("\n  ")}`);
console.log(`\nsummary: ${count("passed")} passed / ${count("failed")} failed / ${count("timeout")} timed out / ${count("skipped")} skipped` + (bad ? "; re-run to resume" : ""));
process.exit(bad ? 1 : 0);
