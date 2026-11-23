import type { CheckEntry, CheckOpts, CheckResult, Target } from "./types.ts";
/** Every check, in the order the gate prints them. Later tasks add theirs with one entry. */
export declare const CHECKS: CheckEntry[];
/** Thrown for a target the gate cannot resolve; the CLI exits 2 on it. */
export declare class UsageError extends Error {
}
export type GateOpts = CheckOpts & {
    /** Treat the target as a control page. Unset: a page under `controls/` is one. */
    control?: boolean;
    /** An already-running server for the repo root. Unset: the gate serves the root itself. */
    baseUrl?: string;
    /**
     * Run a bar at only these of its bar.json seeds (a test that runs one seed per test, to stay under the page
     * suite's per-test timeout). A seed not in bar.json is a usage error. Unset: every seed in bar.json.
     */
    seeds?: number[];
};
export type GateResult = {
    verdict: string;
    lines: string[];
    results: CheckResult[];
};
export declare function resolveTarget(arg: string, opts: GateOpts, base: string): Target;
/** Seeds a check runs at: every seed in bar.json for a bar, else one run at the page's default (seed 1; a control gets none). */
export declare const seedsOf: (t: Target) => (number | undefined)[];
/**
 * One check's result over a bar's seeds (in bar.json order). It fails when any seed fails, else it is partial when
 * any seed is partial; the line names those seeds and gives the first one's reason. A pass names every seed and
 * gives the first seed's numbers. `measured` holds the reported seed's numbers, `seed` (which seed that is), and
 * every seed's numbers as `<key>@<seed>`. A single run is returned as it is.
 */
export declare function combineSeeds(name: string, runs: {
    seed: number;
    result: CheckResult;
}[]): CheckResult;
/**
 * Runs one registered check on `t` as the gate does: once on a control (its control half or its skip) and on a bare
 * page, and at every seed in bar.json for a bar (combined by `combineSeeds`), since a law that holds only at the
 * first seed is not a pass. Each check keeps its own light/dark halves at every seed. A run that throws is
 * `partial` for that seed, never a pass. Off a control, an entry's `applies` is asked once first: a skip reason
 * skips the check with that reason; an `applies` that throws makes it `partial`, never a silent skip.
 */
export declare function runEntry(c: CheckEntry, t: Target, opts: CheckOpts): Promise<CheckResult>;
/** Runs each check through `runEntry`, in order: a bar at each of its seeds. `checks` is the registry unless a test passes fakes. */
export declare function runAll(t: Target, opts: CheckOpts, checks?: CheckEntry[]): Promise<CheckResult[]>;
/**
 * Runs every check on `target` (a bar folder or an html file), a bar at each of its seeds. A check that throws is
 * `partial`, never a pass. `checks` is the registry unless a test passes fakes.
 */
export declare function gate(target: string, opts?: GateOpts, checks?: CheckEntry[]): Promise<GateResult>;
