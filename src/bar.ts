// `bar.json`: the contract a bar page signs. `loadBar` reads and validates it, so a check never sees a half-formed bar.
import { readFileSync } from "node:fs";
import path from "node:path";
import type { PointerStop } from "./engine/pointer.ts";
import type { Law } from "./engine/types.ts";

export type BarConfig = {
  id: string;
  reference: { shelfKey: string; title: string };
  palette: { ground: string; ink: string; accents: string[] };
  detail: number;
  seeds: number[];
  /** At least one. */
  laws: Law[];
  /** Either two times a living page differs between, or the reason it holds still untouched. */
  alive: { t0: number; t1: number } | { rests: string };
  text?: { always: string[]; lit: string[] };
  beats: string[];
  thresholds?: Record<string, { value: number; why: string }>;
  motion?: { from: string; cited: string };
  /** The CSS-pixel frame the bar is designed for; checks and the sheet open it at this size. Unset: the checks' VIEW. */
  view?: BarView;
  /**
   * The bar's settle time in seconds: where its picture holds, so reduced motion rests on the frame `setTime` gives
   * there. A whole number of the engine's 1/60 s ticks. Unset: the page has none (it rests on its first frame). The
   * still check holds the engine to it, so a page whose engine settle time drifts fails.
   */
  settle?: number;
  /**
   * What the flash check drives besides time. `pointer`: a path the engine's pointer follows while the check steps
   * the page frozen ({ t, x, y }: t in seconds of page time, ascending; x, y in viewport fractions 0..1, at least two
   * stops), so a pointer-driven light is measured at the engine's 60 ticks per s.
   */
  flash?: { pointer?: PointerStop[] };
  /**
   * URL parameters the gate, the sheet and the bar's page tests open the page with, as `a=1&b=2` (no leading `?`).
   * For a page that waits for the user, such as a burn that starts on a click: the checks have no user, so the page
   * reads a parameter (`?burnAt=0`) that starts it. `seed`, `t` and `detail` are the harness's own and are refused. Unset: none.
   */
  query?: string;
};

export type BarView = { width: number; height: number };

/**
 * Bounds on each side of `view`, in CSS pixels. 320 is the narrowest phone width in common use (the small iPhone
 * SE and Android phones), so no real bar frame is narrower or shorter. 2560 (a large desktop width) caps the cost of
 * software WebGL in the checks: a 2560 x 2560 frame already holds about 11 times the pixels of the default 960 x 600
 * one, and a larger frame would slow every gate run without measuring anything a smaller one misses. Integers only,
 * because a viewport is set in whole CSS pixels.
 */
export const VIEW_SIDE = { min: 320, max: 2560 } as const;

/** The engine's fixed tick (src/engine/loop.ts STEP): settle times are whole numbers of it. */
export const TICKS_PER_SECOND = 60;

export const LAWS: readonly Law[] = ["relief", "falloff", "highlight", "tint", "caustic", "transmit", "shadow", "iridescence", "burn"];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const strList = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === "string");

/** Reads `<dir>/bar.json`. Throws an Error naming the first field that is wrong. */
export function loadBar(dir: string): BarConfig {
  const file = path.join(dir, "bar.json");
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`bar.json: cannot read ${file}: ${(e as Error).message}`);
  }
  const bad = (field: string, want: string): never => {
    throw new Error(`bar.json: ${field} must be ${want} (${file})`);
  };
  if (!isObj(raw)) return bad("the file", "an object");
  if (!isStr(raw.id)) bad("id", "a non-empty string");
  const ref = raw.reference;
  if (!isObj(ref) || !isStr(ref.shelfKey) || !isStr(ref.title)) bad("reference", "{ shelfKey, title } strings");
  const pal = raw.palette;
  if (!isObj(pal) || !isStr(pal.ground) || !isStr(pal.ink) || !strList(pal.accents)) bad("palette", "{ ground, ink, accents[] } strings");
  if (!isNum(raw.detail) || raw.detail < 0 || raw.detail > 1) bad("detail", "a number from 0 to 1");
  if (!Array.isArray(raw.seeds) || raw.seeds.length === 0 || !raw.seeds.every(isNum)) bad("seeds", "a non-empty list of numbers");
  if (!Array.isArray(raw.laws) || raw.laws.length === 0 || !raw.laws.every((l) => LAWS.includes(l as Law))) {
    bad("laws", `a list of at least one of ${LAWS.join(", ")}`);
  }
  const alive = raw.alive;
  if (!isObj(alive) || !((isNum(alive.t0) && isNum(alive.t1)) || isStr(alive.rests))) bad("alive", "{ t0, t1 } numbers or { rests: why }");
  if (!strList(raw.beats)) bad("beats", "a list of strings");
  if (raw.text !== undefined && !(isObj(raw.text) && strList(raw.text.always) && strList(raw.text.lit))) bad("text", "{ always[], lit[] } string lists");
  if (raw.thresholds !== undefined) {
    const t = raw.thresholds;
    if (!isObj(t) || !Object.values(t).every((v) => isObj(v) && isNum(v.value) && isStr(v.why))) bad("thresholds", "a map of { value, why }");
  }
  if (raw.motion !== undefined && !(isObj(raw.motion) && isStr(raw.motion.from) && isStr(raw.motion.cited))) bad("motion", "{ from, cited } strings");
  if (raw.view !== undefined) {
    const side = (n: unknown) => Number.isInteger(n) && (n as number) >= VIEW_SIDE.min && (n as number) <= VIEW_SIDE.max;
    if (!isObj(raw.view) || !side(raw.view.width) || !side(raw.view.height)) {
      bad("view", `{ width, height }, each an integer from ${VIEW_SIDE.min} to ${VIEW_SIDE.max} CSS pixels`);
    }
  }
  if (raw.settle !== undefined) {
    const ticks = isNum(raw.settle) ? raw.settle * TICKS_PER_SECOND : NaN;
    if (!(ticks > 0) || Math.abs(ticks - Math.round(ticks)) > 1e-6) {
      bad("settle", `a time in seconds over 0 that is a whole number of 1/${TICKS_PER_SECOND} s ticks`);
    }
  }
  if (raw.flash !== undefined) {
    const f = raw.flash;
    const stop = (s: unknown) => isObj(s) && isNum(s.t) && s.t >= 0 && isNum(s.x) && s.x >= 0 && s.x <= 1 && isNum(s.y) && s.y >= 0 && s.y <= 1;
    const p = isObj(f) ? f.pointer : undefined;
    const ok = isObj(f) && (p === undefined || (Array.isArray(p) && p.length >= 2 && p.every(stop) && p.every((s, i) => i === 0 || (s as PointerStop).t > (p[i - 1] as PointerStop).t)));
    if (!ok) bad("flash", "{ pointer?: [{ t, x, y }, ...] }: at least two stops, t in seconds from 0 and rising, x and y viewport fractions from 0 to 1");
  }
  if (raw.query !== undefined && !(typeof raw.query === "string" && /^[A-Za-z0-9_.-]+=[A-Za-z0-9_.-]*(&[A-Za-z0-9_.-]+=[A-Za-z0-9_.-]*)*$/.test(raw.query))) {
    bad("query", "URL parameters as a=1&b=2 (letters, digits, _ . -; no leading ?)");
  }
  if (typeof raw.query === "string" && raw.query.split("&").some((kv) => ["seed", "t", "detail"].includes(kv.split("=")[0]!))) {
    bad("query", "URL parameters other than seed, t and detail, which the harness sets");
  }
  return raw as unknown as BarConfig;
}
