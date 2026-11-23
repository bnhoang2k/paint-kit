import { luminance } from "./image.js";
/**
 * Peak to peak of each edge's position, px. An edge read in fewer than half its scan lines is NaN (no shape there),
 * never 0, so a missing shape cannot pass as a straight one.
 */
export function outlineRipple(f, box, o) {
    const lum = luminance(f);
    const at = (x, y) => (x < 0 || y < 0 || x >= f.w || y >= f.h ? NaN : lum[y * f.w + x]);
    // First crossing under the cut along a line from `from` towards `to` (inclusive), as a position on that line.
    const cross = (read, from, to) => {
        const step = to >= from ? 1 : -1;
        let prev = read(from);
        for (let s = from + step; step > 0 ? s <= to : s >= to; s += step) {
            const v = read(s);
            if (Number.isNaN(v))
                return NaN;
            if (v < o.cut) {
                const k = prev > v ? (prev - o.cut) / (prev - v) : 1;
                return s - step + step * k;
            }
            prev = v;
        }
        return NaN;
    };
    const p2p = (xs, lines) => {
        const ok = xs.filter((x) => Number.isFinite(x));
        return ok.length * 2 < lines ? NaN : Math.max(...ok) - Math.min(...ok);
    };
    const cols = [];
    for (let x = Math.ceil(box.x0 + o.corner); x < box.x1 - o.corner; x++)
        cols.push(x);
    const rows = [];
    for (let y = Math.ceil(box.y0 + o.corner); y < box.y1 - o.corner; y++)
        rows.push(y);
    const y0 = Math.round(box.y0), y1 = Math.round(box.y1), x0 = Math.round(box.x0), x1 = Math.round(box.x1);
    return {
        top: p2p(cols.map((x) => cross((y) => at(x, y), y0 - o.reach, y0 + o.reach)), cols.length),
        bottom: p2p(cols.map((x) => cross((y) => at(x, y), y1 + o.reach, y1 - o.reach)), cols.length),
        left: p2p(rows.map((y) => cross((x) => at(x, y), x0 - o.reach, x0 + o.reach)), rows.length),
        right: p2p(rows.map((y) => cross((x) => at(x, y), x1 + o.reach, x1 - o.reach)), rows.length),
    };
}
