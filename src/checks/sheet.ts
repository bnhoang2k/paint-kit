// `paint-kit sheet`: one image of a page across seeds 1..3, light and dark, detail 0 / 0.5 / 1 and two key-light
// positions. Each cell is labelled in the image. Cells are screenshots; a small 2D canvas in a blank page composes them.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { resolveTarget, servedRootFor } from "./gate.ts";
import { hasHook, scaledView, viewOf } from "./frames.ts";
import { openPage } from "./harness.ts";
import { serveRoot } from "./serve.ts";

export const SHEET_SEEDS = [1, 2, 3] as const;
export const SHEET_DETAILS = [0, 0.5, 1] as const;
// Each cell is its own page at device ratio 1, so one image pixel is one screen pixel and detail and grain can be judged by eye.
// A cell holds CELL_AREA pixels, shaped like the target's view: the default 960 x 600 view gives 400 x 250 cells, and a
// portrait view (a phone screen) gives tall, narrow cells of the same area. The page is opened at the cell size, so
// the bar lays itself out for that aspect the way it does at its view, with no stretch and no letterbox.
const CELL_AREA = 400 * 250;
const LABEL_H = 22;

/** The cell for a view: the view's aspect, CELL_AREA pixels, whole pixels (393 x 852 gives 215 x 466). */
export function cellFor(view: { width: number; height: number }): { w: number; h: number } {
  const v = scaledView(view, CELL_AREA);
  return { w: v.width, h: v.height };
}

export type SheetOpts = { baseUrl?: string };

/** Writes the sheet PNG to `out` and returns how many cells it holds. */
export async function makeSheet(targetArg: string, out: string, opts: SheetOpts = {}): Promise<{ cells: number; width: number; height: number }> {
  const server = opts.baseUrl === undefined ? await serveRoot(servedRootFor(targetArg)) : undefined;
  try {
    const target = resolveTarget(targetArg, { control: false }, opts.baseUrl ?? server!.url);
    const CELL = { ...cellFor(viewOf(target)), label: LABEL_H };
    const t = target.bar?.alive && "t0" in target.bar.alive ? target.bar.alive.t0 : 1;
    const cells: { label: string; png: string }[] = [];
    for (const seed of SHEET_SEEDS) {
      for (const dark of [false, true]) {
        const h = await openPage(target.url, { width: CELL.w, height: CELL.h, dpr: 1, seed, t, dark });
        try {
          if (!(await hasHook(h))) throw new Error("the page has no window.__paint hook, so detail and light cannot be set");
          // Light 0 must declare test positions for moveLight; a page whose light does not gets one cell per detail.
          const keys: (0 | 1 | null)[] = (await h.page.evaluate("(() => { try { __paint.moveLight(0, 0); return true; } catch { return false; } })()")) ? [0, 1] : [null];
          for (const detail of SHEET_DETAILS) {
            await h.hook(`__paint.setDetail(${detail})`);
            for (const key of keys) {
              if (key !== null) await h.hook(`__paint.moveLight(0, ${key})`);
              const png = (await h.page.screenshot({ type: "png" })).toString("base64");
              const k = key === null ? "key n/a (light 0 has no test positions)" : `key ${key === 0 ? "A" : "B"}`;
              cells.push({ label: `seed ${seed} ${dark ? "dark" : "light"} detail ${detail} ${k}`, png });
            }
          }
        } finally {
          await h.close();
        }
      }
    }
    const cols = cells.length / (SHEET_SEEDS.length * 2 * SHEET_DETAILS.length) * SHEET_DETAILS.length;
    const rows = Math.ceil(cells.length / cols);
    const width = cols * CELL.w;
    const height = rows * (CELL.h + CELL.label);
    const page = await openPage("about:blank", { dpr: 1, width: 400, height: 300 });
    try {
      const dataUrl = await page.hook<string>(`(async () => {
        const cells = ${JSON.stringify(cells)};
        const c = document.createElement("canvas");
        c.width = ${width}; c.height = ${height};
        const g = c.getContext("2d");
        g.fillStyle = "#222"; g.fillRect(0, 0, c.width, c.height);
        g.font = "13px sans-serif"; g.textBaseline = "middle";
        for (let i = 0; i < cells.length; i++) {
          const x = (i % ${cols}) * ${CELL.w}, y = Math.floor(i / ${cols}) * ${CELL.h + CELL.label};
          const img = new Image();
          img.src = "data:image/png;base64," + cells[i].png;
          await img.decode();
          g.drawImage(img, x, y + ${CELL.label}, ${CELL.w}, ${CELL.h});
          g.fillStyle = "#fff"; g.fillText(cells[i].label, x + 6, y + ${CELL.label / 2});
          g.strokeStyle = "#222"; g.strokeRect(x, y, ${CELL.w}, ${CELL.h + CELL.label});
        }
        return c.toDataURL("image/png");
      })()`);
      mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
      writeFileSync(path.resolve(out), Buffer.from(dataUrl.split(",")[1]!, "base64"));
    } finally {
      await page.close();
    }
    return { cells: cells.length, width, height };
  } finally {
    await server?.close();
  }
}
