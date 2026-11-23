// render: the page draws something, draws it without errors, and the drawing moves when it should.
import { hasHook, hideText, open, round, sleep } from "./frames.ts";
import { luminance, meanAbsDiff, std } from "./image.ts";
import { threshold } from "./threshold.ts";
import type { Check, CheckResult, Target } from "./types.ts";

const NAME = "render";
const LIVE_MS = 2000;

const result = (status: CheckResult["status"], line: string, measured: Record<string, number>): CheckResult => ({ name: NAME, status, line: `${NAME}: ${line}`, measured });
const firstLine = (e: string) => e.split("\n")[0]!;

/** The verdict from the numbers; `alive` says what "dead" compares (text for the line). */
function judge(target: Target, errors: string[], frameStd: number, diff: number | undefined, aliveWhat: string, rests: string | undefined): CheckResult {
  const blankStd = threshold("render.blankStd", target.bar);
  const aliveDiff = threshold("render.aliveDiff", target.bar);
  const measured: Record<string, number> = { std: frameStd, errors: errors.length };
  if (diff !== undefined) measured.aliveDiff = diff;
  const problems: string[] = [];
  if (errors.length > 0) problems.push(`${errors.length} page error(s), first: ${firstLine(errors[0]!)}`);
  if (frameStd < blankStd) problems.push(`the frame is blank: luminance std ${round(frameStd)} is under ${blankStd}`);
  if (diff !== undefined && diff <= aliveDiff) problems.push(`the page is dead: frames ${aliveWhat} apart differ by ${round(diff, 6)}, not above ${aliveDiff}`);
  const facts = `luminance std ${round(frameStd)}${diff !== undefined ? `, frames apart differ by ${round(diff, 6)}` : ""}, ${errors.length} errors`;
  if (problems.length > 0) return result("fail", `${problems.join("; ")} (${facts})`, measured);
  return result("pass", rests !== undefined ? `${facts}; alive half skipped, the page rests: ${rests}` : facts, measured);
}

export const check: Check = async (target, opts) => {
  const { bar } = target;
  // Live: collect errors over 2 s.
  const live = await open(target, opts);
  let errors: string[];
  try {
    if (!(await hasHook(live))) {
      await sleep(500);
      // A page whose paint call threw has no hook and real errors: that is a render failure, not a gap in the run.
      if (live.errors.length > 0) return result("fail", `the page has no window.__paint hook and reported ${live.errors.length} error(s), first: ${firstLine(live.errors[0]!)}`, { std: 0, errors: live.errors.length });
      return result("partial", "the page has no window.__paint hook, so the frame cannot be set to a time", {});
    }
    await sleep(LIVE_MS);
    errors = [...live.errors];
  } finally {
    await live.close();
  }

  const alive = bar?.alive ?? { t0: 0.5, t1: 1.5 };
  // Frozen: open at t0 (the page stays still), measure the painted surface alone, then move the clock to t1.
  const h = await open(target, opts, { t: "rests" in alive ? 1 : alive.t0 });
  try {
    await hideText(h);
    const a = await h.shot();
    const frameStd = std(luminance(a));
    if ("rests" in alive) return judge(target, [...errors, ...h.errors], frameStd, undefined, "", alive.rests);
    await h.hook(`__paint.setTime(${alive.t1})`);
    const diff = meanAbsDiff(a, await h.shot());
    return judge(target, [...errors, ...h.errors], frameStd, diff, `${alive.t0} s and ${alive.t1} s`, undefined);
  } finally {
    await h.close();
  }
};

/** A control has no `__paint`: it is live, and `__drape.step` stands in for setTime. */
export const controlCheck: Check = async (target, opts) => {
  const h = await open(target, opts);
  try {
    await hideText(h);
    const a = await h.shot();
    await h.hook("__drape.step(1)");
    await sleep(250);
    const diff = meanAbsDiff(a, await h.shot());
    await sleep(LIVE_MS);
    return judge(target, [...h.errors], std(luminance(a)), diff, "1 s of step", undefined);
  } finally {
    await h.close();
  }
};
