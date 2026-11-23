// detail: the detail dial reaches the surface. The page is rendered frozen at detail 0, 0.5 and 1 (same seed, t 2,
// text hidden, ink off, the checks' standard view). For each frame, the high-frequency share is the energy of its luminance
// minus its 4 px box blur (a 9 px window), over the energy of its luminance about its mean (a flat frame has no
// structure to share). The share must rise strictly from 0 to 0.5 to 1, and its relative rise from 0 to 1,
// (share(1) - share(0)) / share(0), must be at least `detail.minRise`. Relative, because a smooth page has a
// small share at every detail (lights.html 0.006) and a textured one a large share (cloth.html 0.57); a dial
// wired to nothing rises by exactly 0 on either.
//
// The frames are read with the finish grain off (`__paint.setGrain(0)`, as relight and banding-grain read theirs).
// The grain does not depend on the dial, so it is not the dial's to score, and it is most of the fine energy at
// detail 0 (97 to 99% on the kit's test pages, Phase 2 Task 2c findings): on a dark frame, which has 3 to 14 times
// less total energy than the light one, it set a share baseline high enough to swamp the dial's real gain, and the
// rise read negative on pages whose paint does gain fine structure. With it off, the share is the paint's own.
// It cannot go under the finish's always-on half-level dither (the output's own rounding noise, on at grain 0):
// a page whose paint shows no fine structure reads a share of about 2e-4 at every detail (lights-overhead.html,
// light, seed 1: 1.96e-4 / 1.74e-4 / 2.18e-4, Phase 2 Task 2c fix round 1), and its rise is that noise's.
// The same rule takes the halftone screen off (`__paint.setScreen(false)`, Phase 2 Task 8), so the share reads with
// the whole finish off. The screen is print structure the dial does not drive, like the grain, and it is most of a
// screened frame's fine energy: test/pages/halftone-lit.html read 0.992 / 0.994 / 0.995 (light) with it on, a rise
// of 0.003. On a page with no screen the hook does nothing, so its share is as before. The relight run at detail 0
// below keeps the screen on: the page must take light as it is drawn.
//
// `shareAt` is the one share read: scripts/measure.mjs imports it from dist, so the readings behind
// `detail.minRise` are taken the way this check takes them.
//
// Macro relief stays at every detail level, so at detail 0 the page must still pass relight: its laws are run at
// detail 0 and reported in the line. A relight failure at detail 0 fails this check only when relight does not
// also fail at the page's own detail; otherwise it is the relight check's failure to report, not the dial's.
//
// All of it runs twice, on the page opened in the light and then the dark colour scheme, and relight at detail 0 is
// read in the same scheme as the shares (`relight.checkScheme`). A dial can reach the surface in one palette and
// barely show in the other (bar 06 in dark, Phase 2 Task 1). The line names the failing scheme first
// (`joinSchemes`), and every measured key carries its scheme: `rise.light`, `rise.dark`.
import type { Rgba } from "./harness.ts";
import { hasHook, hideText, open, round } from "./frames.ts";
import { boxBlur, luminance } from "./image.ts";
import * as relight from "./relight.ts";
import { threshold } from "./threshold.ts";
import { joinSchemes, SCHEMES, type Check, type CheckOpts, type CheckResult, type Scheme, type SchemePart, type Target } from "./types.ts";

const NAME = "detail";
const T = 2;
const BLUR_RADIUS = 4;
const LEVELS = [0, 0.5, 1] as const;

const result = (status: CheckResult["status"], line: string, measured: Record<string, number>): CheckResult => ({ name: NAME, status, line: `${NAME}: ${line}`, measured });

/** Energy of (luminance minus its 4 px blur) over the energy of luminance about its mean; 0 for a flat frame. */
export function highFrequencyShare(f: Rgba): number {
  const lum = luminance(f);
  const blur = boxBlur(lum, f.w, f.h, BLUR_RADIUS);
  let mean = 0;
  for (const v of lum) mean += v / lum.length;
  let fine = 0;
  let total = 0;
  for (let i = 0; i < lum.length; i++) {
    fine += (lum[i]! - blur[i]!) ** 2;
    total += (lum[i]! - mean) ** 2;
  }
  return total > 0 ? fine / total : 0;
}

const NO_HOOK = "the page has no window.__paint hook, so its detail cannot be set";

/**
 * The high-frequency share at one dial level, read as this check reads it: frozen at t 2, text hidden, all ink off,
 * the whole finish off (grain 0, halftone screen hidden). `null` when the page has no hook. scripts/measure.mjs reads its detail cells through this too.
 */
export async function shareAt(target: Target, opts: CheckOpts, detail: number, dark: boolean): Promise<number | null> {
  const h = await open(target, opts, { t: T, detail, dark });
  let frame: Rgba;
  try {
    if (!(await hasHook(h))) return null;
    await hideText(h);
    // All ink off: text ink is not paint (text-contrast's floor turns it off too; picture ink, such as halftone
    // dots, is paint there). detail turns picture ink off as well, for its own reason: ink spread softens glyph
    // edges as detail rises, which would lower the share on a page whose frame is mostly text (the paper-mud
    // faults), and dots, which do not change with the dial, could dilute its rise. Not re-measured with dots on.
    await h.hook("__paint.setInk(false)");
    await h.hook("__paint.setGrain(0)");
    await h.hook("__paint.setScreen(false)");
    frame = await h.shot();
  } finally {
    await h.close();
  }
  return highFrequencyShare(frame);
}

/** detail in one colour scheme: the shares at detail 0, 0.5 and 1 and relight at detail 0, all opened in `scheme`. */
async function checkScheme(target: Target, opts: CheckOpts, scheme: Scheme): Promise<SchemePart & { noHook?: true }> {
  const minRise = threshold("detail.minRise", target.bar);
  const dark = scheme === "dark";
  const shares: number[] = [];
  for (const d of LEVELS) {
    const share = await shareAt(target, opts, d, dark);
    if (share === null) return { scheme, status: "partial", line: NO_HOOK, measured: {}, noHook: true };
    shares.push(share);
  }
  const [s0, s5, s1] = shares as [number, number, number];
  const rise = s0 > 0 ? (s1 - s0) / s0 : 0;
  const measured: Record<string, number> = { "share.0": s0, "share.0.5": s5, "share.1": s1, rise };

  const atZero = await relight.checkScheme(target, { ...opts, detail: 0 }, scheme);
  measured["relight0.fail"] = atZero.status === "fail" ? 1 : 0;
  const relightLine = `at detail 0 relight: ${atZero.line}`;
  let relightProblem = "";
  if (atZero.status === "fail") {
    const own = await relight.checkScheme(target, opts, scheme);
    measured["relightOwn.fail"] = own.status === "fail" ? 1 : 0;
    if (own.status !== "fail") relightProblem = "at detail 0 the page fails relight, though it passes at its own detail: its macro relief does not survive the dial";
  }

  const facts = `high-frequency share (finish grain and screen off) ${round(s0)} / ${round(s5)} / ${round(s1)} at detail 0 / 0.5 / 1, relative rise ${round(rise)} (minimum ${minRise})`;
  const problems: string[] = [];
  if (!(s0 < s5 && s5 < s1)) problems.push("the high-frequency share does not rise strictly with the dial");
  else if (rise < minRise) problems.push(`the high-frequency share does not rise enough: a relative rise of ${round(rise)} from detail 0 to 1, under ${minRise}`);
  if (relightProblem) problems.push(relightProblem);
  return problems.length
    ? { scheme, status: "fail", line: `${problems.join("; ")} (${facts}; ${relightLine})`, measured }
    : { scheme, status: "pass", line: `${facts}; ${relightLine}`, measured };
}

export const check: Check = async (target, opts) => {
  const parts: SchemePart[] = [];
  for (const scheme of SCHEMES) {
    const part = await checkScheme(target, opts, scheme);
    if (part.noHook) return result("partial", NO_HOOK, {});
    parts.push(part);
  }
  return joinSchemes(NAME, parts);
};
