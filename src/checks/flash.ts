// flash (check 9, WCAG 2.3.1): no part of the page flashes more than 3 times in any 1 s, general or red, over more
// than 25% of any 341 x 256 CSS px window. The page is opened frozen and stepped with setTime at the engine's 60
// ticks per s, so the frames are the ones a viewer sees at 60 fps and every run gives the same count. CSS animations
// in the HTML layer are paused and stepped to the same clock, and a pointer path in bar.json (`flash.pointer`) is
// replayed by the engine's pointer tick by tick. The counting rule is in flash-count.ts.
import { decodePng } from "./harness.ts";
import { cellsOf, FLASH_RULE, FlashCounter, type Cells, type FlashMeasure, type FlashRule } from "./flash-count.ts";
import { hasHook, open, round } from "./frames.ts";
import { threshold } from "./threshold.ts";
import type { Check, CheckResult, Target } from "./types.ts";
import { TICKS_PER_SECOND } from "../bar.ts";

const NAME = "flash";
const FPS = TICKS_PER_SECOND;

const result = (status: CheckResult["status"], line: string, measured: Record<string, number>): CheckResult => ({ name: NAME, status, line: `${NAME}: ${line}`, measured });

/** The rule with the bar's own overrides (bar.json `thresholds`), else thresholds.json. */
export function ruleOf(target: Target): FlashRule {
  const t = (k: string) => threshold(`flash.${k}`, target.bar);
  return {
    ...FLASH_RULE,
    maxPerSecond: t("maxPerSecond"),
    areaShare: t("areaShare"),
    window: { width: t("windowWidth"), height: t("windowHeight") },
    lumaDelta: t("lumaDelta"),
    darkMax: t("darkMax"),
    redRatio: t("redRatio"),
    redChroma: t("redChroma"),
    cell: t("cell"),
    stride: t("stride"),
  };
}

/**
 * Runs in the page after each setTime(t): pauses every CSS animation and transition (and any Web Animation) and puts
 * it at the page clock, so the HTML layer is sampled at 60 fps too, not at the wall time between screenshots. An
 * animation running at the first step is put at t; one that first appears at a later step starts from that step.
 */
function stepAnimations(t: number): void {
  const w = window as unknown as { __flashAnimStart?: WeakMap<Animation, number> };
  const start = (w.__flashAnimStart ??= new WeakMap());
  for (const a of document.getAnimations()) {
    if (!start.has(a)) start.set(a, t);
    a.pause();
    a.currentTime = (t - start.get(a)!) * 1000;
  }
}

const where = (m: FlashMeasure) => (m.frame < 0 ? "" : ` (window at ${m.x}, ${m.y} CSS px, 1 s from ${round(m.frame / FPS, 3)} s)`);

export const check: Check = async (target, opts) => {
  const rule = ruleOf(target);
  const path = target.bar?.flash?.pointer;
  // The settle time plus the tail, and at least the pointer path and 1 s after it (the eased pointer's glide).
  const seconds = Math.max((target.bar?.settle ?? 0) + threshold("flash.tailSeconds", target.bar), path ? path[path.length - 1]!.t + 1 : 0);
  const count = Math.round(seconds * FPS) + 1;
  const h = await open(target, opts, { t: 0 });
  // Counted online: each frame is sampled, fed to the tracker and dropped.
  const counter = new FlashCounter(FPS, rule);
  try {
    if (!(await hasHook(h))) return result("partial", "the page has no window.__paint hook, so it cannot be stepped frame by frame", {});
    if (path) {
      // The declared pointer path: the engine eases its pointer along it tick by tick, so setTime(t) replays it.
      if (!(await h.hook<boolean>("typeof window.__paint.setPointerPath === 'function'"))) {
        return result("fail", "bar.json declares flash.pointer, but the page's hook has no setPointerPath to replay it", {});
      }
      await h.hook(`__paint.setPointerPath(${JSON.stringify(path)})`);
    }
    let lastPng: Buffer | undefined;
    let last: Cells | undefined;
    for (let i = 0; i < count; i++) {
      await h.hook(`__paint.setTime(${i / FPS})`);
      await h.page.evaluate(stepAnimations, i / FPS);
      const png = await h.page.screenshot({ type: "png" });
      // A frame identical to the last is not decoded again: a still page stays cheap.
      if (!(last && lastPng && png.equals(lastPng))) last = cellsOf(decodePng(png), rule);
      counter.push(last);
      lastPng = png;
    }
  } finally {
    await h.close();
  }
  const r = counter.report();
  const measured = {
    generalFlashes: r.general.flashes,
    redFlashes: r.red.flashes,
    generalShare: r.general.share,
    redShare: r.red.share,
    frames: r.frames,
    seconds,
    pointerLegs: path ? path.length - 1 : 0,
  };
  const max = rule.maxPerSecond;
  const pct = (s: number) => `${Math.round(s * 100)}%`;
  const facts =
    `${r.general.flashes} general${where(r.general)} and ${r.red.flashes} red${where(r.red)} flashes per s over more than ` +
    `${pct(rule.areaShare)} of a ${rule.window.width} x ${rule.window.height} CSS px window; largest share flashing over ${max} per s: ` +
    `${pct(r.general.share)} general, ${pct(r.red.share)} red; ${r.frames} frames stepped frozen, 0 to ${round(seconds, 2)} s at ${FPS} fps; ` +
    (path ? `pointer path: ${path.length - 1} legs, ${round(path[0]!.t, 2)} to ${round(path[path.length - 1]!.t, 2)} s` : "pointer path: none (pointer at rest)");
  const bad = [r.general.flashes > max ? "general" : "", r.red.flashes > max ? "red" : ""].filter(Boolean);
  return bad.length > 0
    ? result("fail", `${bad.join(" and ")} flashes over WCAG 2.3.1's ${max} per s: ${facts}`, measured)
    : result("pass", facts, measured);
};
