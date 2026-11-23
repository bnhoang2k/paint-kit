export const SCHEMES = ["light", "dark"];
const RANK = { skip: 0, pass: 1, partial: 2, fail: 3 };
/**
 * Joins a check's light and dark halves. Status: the worse half (fail over partial over pass; skip only when both
 * skip). Line: `<name>: <scheme>: <line>; <scheme>: <line>`, the worse half first, light first on a tie, so a line
 * names the failing scheme first. Measured: every key gains its half's `.light` or `.dark` suffix.
 */
export function joinSchemes(name, parts) {
    const order = [...parts].sort((a, b) => RANK[b.status] - RANK[a.status]);
    const status = order[0]?.status ?? "skip";
    const measured = {};
    for (const p of parts)
        for (const [k, v] of Object.entries(p.measured))
            measured[`${k}.${p.scheme}`] = v;
    return { name, status, line: `${name}: ${order.map((p) => `${p.scheme}: ${p.line}`).join("; ")}`, measured };
}
