// `window.__paint`: the one debug hook the checks drive a page through. It holds no engine state; it turns
// check calls into engine calls and does the read-backs (on demand only).
import type { Motion } from "./loop.ts";
import type { PointerStop } from "./pointer.ts";
import type { PaletteTokens } from "./palette.ts";
import type { InkSource, Law, Light, Material, PaintStats, SheetSample, TiltOptions } from "./types.ts";

/** The ink source a `setInk` call names, checked: anything but "text" or "picture" throws (checks call the hook by string, so a typo would otherwise be a silent no-op). */
export function checkInkSource(source: unknown): InkSource {
  if (source === "text" || source === "picture") return source;
  throw new Error(`setInk: unknown ink source ${JSON.stringify(source)}; use "text" or "picture"`);
}

/** What the hook needs from a running painter. */
export type EngineHandle = {
  setTime(t: number): void;
  /** The paint's time now, in seconds. */
  time(): number;
  setPointerPath(path: PointerStop[] | null): void;
  /** Holds the surface's tilt (degrees), or null to hand it back to the pointer; throws on a page with no tilt. */
  setTilt(deg: [number, number] | null): void;
  /** The surface's tilt now, in degrees; [0, 0] on a page with no tilt. */
  tilt(): [number, number];
  /** The page's tilt option as resolved (`PaintOptions.tilt`), or null on a page with no tilt. */
  tiltOptions(): TiltOptions | null;
  lights(): Light[];
  setLights(lights: Light[]): void;
  setDetail(d: number): void;
  /** The detail dial now, 0..1. */
  detail(): number;
  setInk(on: boolean, source?: InkSource): void;
  /** The finish's grain as the painter draws it now (0 when the finish draws none). */
  grain(): number;
  /** Redraws with the finish's grain at `g`; nothing else changes. */
  setGrain(g: number): void;
  /** Whether the finish's halftone screen draws now (the page has one and it is shown). */
  screen(): boolean;
  /** Shows or hides the finish's halftone screen (`finish.halftone`), then redraws; its options stay. */
  setScreen(on: boolean): void;
  /** Re-reads the palette now (the page's tokens just changed). */
  paletteChanged(): void;
  /** The palette's token names, when its source lists them (`fromPage` does); otherwise null. */
  tokens(): PaletteTokens | null;
  /** Draws the current state and reads the canvas back, RGBA8, rows bottom to top. */
  readCanvas(): { w: number; h: number; data: Uint8Array };
  sheetGrid(n: number): SheetSample;
  /** A region in CSS px of the canvas, at the sheet's full resolution. */
  sheetRegion(x: number, y: number, w: number, h: number): SheetSample;
  laws(): Law[];
  /** The page's materials, by sheet slot. */
  materials(): Material[];
  motion(): Motion;
  info(): { frames: number; dpr: number; webgl: boolean; sheetW: number; sheetH: number; compiles: number; settle: number };
};

export type PaintHook = {
  ready: boolean;
  setTime(t: number): void;
  /**
   * The path the engine's pointer follows on a frozen page, in viewport fractions ({ t, x, y }, t in s), or null for
   * its rest point. `setTime(t)` then replays the eased pointer along it tick by tick. The flash check sets a bar's
   * `flash.pointer` this way. Hook extra for REFERENCE.md.
   */
  setPointerPath(path: PointerStop[] | null): void;
  /**
   * Holds the surface's tilt at `[a, b]` degrees (pointer.ts: a about the vertical axis, positive when the right side
   * goes away; b about the horizontal axis, positive when the top goes away) at once, over the pointer, and redraws;
   * `null` hands the tilt back to the eased pointer. Each angle is -89 to 89 (it is not held to the page's `max`).
   * Throws on a page with no `tilt` option. Lights and geometry stay; only the view the materials see turns.
   */
  setTilt(deg: [number, number] | null): void;
  /** The surface's tilt as drawn now, in degrees ([a, b], as `setTilt`); [0, 0] on a page with no `tilt` option. */
  tilt(): [number, number];
  /**
   * The page's tilt option, `{ max, drive }` (a copy), or null on a page with no `tilt` option. The relight check's
   * iridescence law turns the surface by `max / 2` with it. Hook extra for REFERENCE.md.
   */
  tiltOptions(): TiltOptions | null;
  setLight(i: number, props: Record<string, unknown>): void;
  moveLight(i: number, step: 0 | 1): void;
  setPalette(tokens: Record<string, string>): void;
  /**
   * The custom property names the painter's palette reads now ({ ground, ink, accents }), or null when its source
   * does not list them. The palette check reads it on a page with no bar, to swap the accent tokens too.
   */
  tokens(): PaletteTokens | null;
  setDetail(d: number): void;
  /**
   * The detail dial as drawn now, 0..1 (`?detail=`, the page's `detail`, the default 0.5, or the last `setDetail`).
   * The relight check's iridescence law reads (b) and (d) at 0 and puts the dial back with it. Hook extra for REFERENCE.md.
   */
  detail(): number;
  /**
   * Shows or hides printed ink, then redraws. With no `source`, all ink (the shade pass reads the ink channel as 0).
   * With a source, only that ink: "text" is the ink the text field (`fields.text`, kind "ink") prints, "picture" the
   * ink any other field prints (halftone dots). The source is where the ink comes from, never which elements a bar
   * scores. A source switch re-draws the fields at the current time with no step, so the sheet itself (and
   * `sheetRegion`) holds only the ink still shown. Hook extra for REFERENCE.md.
   */
  setInk(on: boolean, source?: InkSource): void;
  /** The finish's grain as drawn now: the page's declared `finish.grain` (or the default), or the last `setGrain`. */
  grain(): number;
  /**
   * Redraws the frozen frame with the finish's grain at `g` and nothing else changed, so the finish's own share of
   * a frame is frame(declared grain) minus frame(grain 0). The banding-grain check reads it that way.
   */
  setGrain(g: number): void;
  /** Whether the finish's halftone screen (`finish.halftone`) draws now: the page has one and it is not hidden. */
  screen(): boolean;
  /**
   * Shows or hides the finish's halftone screen and redraws, keeping its options; on a page without one it does
   * nothing. The detail check reads its high-frequency share with it off, as with the grain. Hook extra for REFERENCE.md.
   */
  setScreen(on: boolean): void;
  stats(): PaintStats;
  /** The sheet's channels on a 64 x 64 grid; `param` is 0 everywhere on a page where no field writes it. */
  sheet(): { w: number; h: number } & SheetSample;
  sheetRegion(x: number, y: number, w: number, h: number): SheetSample;
  laws(): Law[];
  /**
   * The page's lights as declared now (after any setLight or moveLight): id, laws and props, read only. A per-frame
   * prop (a moving glow's `at`) shows its value at the paint's current time, and so does `region` (Light.region).
   */
  lights(): { id: string; laws: Law[]; props: Record<string, unknown>; region?: { at: [number, number]; radius: number } }[];
  /**
   * The page's materials by sheet slot (index = the sheet's slot value): id and declared laws, read only, and for a thin
   * film its `film` data (thickness range, index, base).
   */
  materials(): { id: string; laws: Law[]; film?: { range: [number, number]; ior: number; base: "metal" | "dielectric" } }[];
  motion(): Motion;
};

declare global {
  interface Window {
    __paint?: PaintHook;
  }
}

export const SHEET_GRID = 64;
const BINS = 1024;

/** Luminance percentiles (Rec. 709 weights on the encoded 0..1 values) from a 1024-bin histogram. */
export function lumaPercentiles(data: Uint8Array, ps: number[]): number[] {
  const hist = new Uint32Array(BINS);
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const l = (0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!) / 255;
    hist[Math.min(BINS - 1, Math.floor(l * BINS))]!++;
  }
  return ps.map((p) => {
    const want = p * n;
    let seen = 0;
    for (let b = 0; b < BINS; b++) {
      seen += hist[b]!;
      if (seen >= want) return (b + 0.5) / BINS;
    }
    return 1;
  });
}

/** A light's props with each per-frame prop (a function of t, as a moving glow's `at`) read at time `t`. */
export function propsNow(props: Record<string, unknown>, t: number): Record<string, unknown> {
  return Object.fromEntries(Object.entries(props).map(([k, v]) => [k, typeof v === "function" ? (v as (t: number) => unknown)(t) : v]));
}

function withProps(l: Light, props: Record<string, unknown>): Light {
  const next = { ...l.props, ...props };
  return l.with ? l.with(next) : { ...l, props: next };
}

/** Installs `window.__paint` for this engine (the latest painter on a page owns it). `ready` starts false. */
export function installHook(e: EngineHandle): PaintHook {
  const lightAt = (i: number) => {
    const l = e.lights()[i];
    if (!l) throw new RangeError(`__paint: no light at index ${i}`);
    return l;
  };
  const replaceLight = (i: number, l: Light) => {
    const ls = e.lights().slice();
    ls[i] = l;
    e.setLights(ls);
  };
  const hook: PaintHook = {
    ready: false,
    setTime: (t) => e.setTime(t),
    setPointerPath: (path) => e.setPointerPath(path),
    setTilt: (deg) => e.setTilt(deg),
    tilt: () => {
      const [a, b] = e.tilt();
      return [a, b];
    },
    tiltOptions: () => {
      const t = e.tiltOptions();
      return t ? { max: t.max, drive: t.drive } : null;
    },
    setLight: (i, props) => replaceLight(i, withProps(lightAt(i), props)),
    moveLight(i, step) {
      const l = lightAt(i);
      if (!l.testPositions) throw new Error(`__paint.moveLight: light ${i} (${l.id}) declares no test positions`);
      replaceLight(i, withProps(l, l.testPositions(step)));
    },
    setPalette(tokens) {
      for (const [k, v] of Object.entries(tokens)) document.documentElement.style.setProperty(k, v);
      e.paletteChanged();
    },
    tokens() {
      const t = e.tokens();
      return t ? { ground: t.ground, ink: t.ink, accents: [...t.accents] } : null;
    },
    setDetail: (d) => e.setDetail(d),
    detail: () => e.detail(),
    setInk: (on, source) => e.setInk(on, source === undefined ? undefined : checkInkSource(source)),
    grain: () => e.grain(),
    setGrain: (g) => e.setGrain(g),
    screen: () => e.screen(),
    setScreen: (on) => e.setScreen(on === true),
    stats() {
      const { data } = e.readCanvas();
      const [p5, p50, p95, p99] = lumaPercentiles(data, [0.05, 0.5, 0.95, 0.99]) as [number, number, number, number];
      return { p5, p50, p95, p99, ...e.info() };
    },
    sheet: () => ({ w: SHEET_GRID, h: SHEET_GRID, ...e.sheetGrid(SHEET_GRID) }),
    sheetRegion: (x, y, w, h) => e.sheetRegion(x, y, w, h),
    laws: () => e.laws(),
    lights: () =>
      e.lights().map((l) => {
        const region = l.region?.(e.time());
        return { id: l.id, laws: [...l.laws], props: structuredClone(propsNow(l.props, e.time())), ...(region ? { region: { at: [region.at[0], region.at[1]] as [number, number], radius: region.radius } } : {}) };
      }),
    materials: () => e.materials().map((m) => ({ id: m.id, laws: [...m.laws], ...(m.film ? { film: { range: [m.film.range[0], m.film.range[1]] as [number, number], ior: m.film.ior, base: m.film.base } } : {}) })),
    motion: () => e.motion(),
  };
  window.__paint = hook;
  return hook;
}
