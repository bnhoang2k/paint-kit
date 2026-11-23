// hygiene: the page behaves like a good citizen. Pixel ratio capped, a working fallback, no test seam left in.
import { hasHook, open, round, scaledView } from "./frames.ts";
import { threshold } from "./threshold.ts";
import type { Check, CheckResult } from "./types.ts";

const NAME = "hygiene";

type Fallback = {
  attr: string | null;
  canvasShown: boolean;
  groundDiff: number | null;
  parentBg: string;
  noInk: string[];
  noMatch: string[];
};

// All colours are drawn by a 2D canvas to 8-bit sRGB, so oklch() and friends compare as bytes.
const fallbackProbe = (ground: string, always: string[]) => `(() => {
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const px = (colour) => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    return [...ctx.getImageData(0, 0, 1, 1).data];
  };
  const canvas = document.querySelector("canvas");
  const parentBg = canvas ? getComputedStyle(canvas.parentElement).backgroundColor : "";
  const probe = document.createElement("span");
  probe.style.color = "var(" + ${JSON.stringify(ground)} + ")";
  document.body.append(probe);
  const token = getComputedStyle(probe).color;
  probe.remove();
  const a = px(parentBg);
  const b = px(token);
  const noInk = [];
  const noMatch = [];
  for (const sel of ["[data-paint-ink]", ...${JSON.stringify(always)}]) {
    const els = [...document.querySelectorAll(sel)];
    if (els.length === 0 && sel !== "[data-paint-ink]") noMatch.push(sel);
    for (const el of els) if (px(getComputedStyle(el).color)[3] === 0) noInk.push(sel);
  }
  return {
    attr: document.documentElement.dataset.paint ?? null,
    canvasShown: canvas ? canvas.getClientRects().length > 0 : false,
    groundDiff: a[3] === 0 ? null : Math.max(a[0] - b[0], b[0] - a[0], a[1] - b[1], b[1] - a[1], a[2] - b[2], b[2] - a[2]),
    parentBg,
    noInk,
    noMatch,
  };
})()`;

export const check: Check = async (target, opts) => {
  const { bar } = target;
  const done = (status: CheckResult["status"], line: string, measured: Record<string, number>): CheckResult => ({ name: NAME, status, line: `${NAME}: ${line}`, measured });
  const maxDpr = threshold("hygiene.maxDpr", bar);
  const tol = threshold("hygiene.groundTol", bar);
  const problems: string[] = [];
  const measured: Record<string, number> = {};

  // Pixel ratio 3 in, at most 1.5 out. The same page tells us whether a test fault was left in.
  // Small, because device ratio 3 multiplies the pixels by 9: 400 x 300, or as many pixels in a declared view's aspect.
  const small = target.bar?.view ? scaledView(target.bar.view, 400 * 300) : { width: 400, height: 300 };
  const a = await open(target, opts, { dpr: 3, ...small, t: 1 });
  try {
    if (!(await hasHook(a))) return done("partial", "the page has no window.__paint hook, so its pixel ratio cannot be read", {});
    const dpr = (await a.hook<{ dpr: number }>("__paint.stats()")).dpr;
    measured.dpr = dpr;
    if (dpr > maxDpr) problems.push(`pixel ratio ${dpr} at device ratio 3 is over the cap ${maxDpr}`);
    const fault = await a.hook<boolean>("globalThis.__PAINT_TEST_FAULT !== undefined");
    measured.testFault = fault ? 1 : 0;
    if (fault) problems.push("the page sets __PAINT_TEST_FAULT, a test seam that must not ship");
  } finally {
    await a.close();
  }

  // No WebGL: the page shows its ground and readable text.
  const b = await open(target, opts, { webgl: false, t: 1 });
  try {
    const ground = bar?.palette.ground ?? "--ground";
    const always = bar?.text?.always ?? [];
    const f = await b.hook<Fallback>(fallbackProbe(ground, always));
    measured.groundDiff = f.groundDiff ?? -1;
    measured.fallbackAttr = f.attr === "fallback" ? 1 : 0;
    measured.canvasShown = f.canvasShown ? 1 : 0;
    if (f.attr !== "fallback") problems.push(`without WebGL data-paint is ${f.attr === null ? "unset" : `"${f.attr}"`}, not "fallback"`);
    if (f.canvasShown) problems.push("without WebGL the canvas is still shown");
    if (f.groundDiff === null) problems.push(`without WebGL the canvas parent's background is transparent (${f.parentBg}), not the ground ${ground}`);
    else if (f.groundDiff > tol) problems.push(`without WebGL the canvas parent's background is ${f.groundDiff}/255 off the ground ${ground}, over ${tol}`);
    if (f.noInk.length > 0) problems.push(`without WebGL ${f.noInk.length} ink element(s) have transparent text (${[...new Set(f.noInk)].join(", ")})`);
    if (f.noMatch.length > 0) problems.push(`bar text.always matches nothing: ${f.noMatch.join(", ")}`);
  } finally {
    await b.close();
  }

  const facts = `pixel ratio ${measured.dpr} at device ratio 3, ground gap ${round(measured.groundDiff!, 0)}/255 in fallback, test seam ${measured.testFault ? "set" : "unset"}`;
  return problems.length > 0 ? done("fail", `${problems.join("; ")} (${facts})`, measured) : done("pass", facts, measured);
};
