import table from "./thresholds.json" with { type: "json" };
const TABLE = table;
/** A threshold's value: the bar's own entry when it has one, else `thresholds.json`. Throws on an unknown name. */
export function threshold(name, bar) {
    const own = bar?.thresholds?.[name] ?? TABLE[name];
    if (own === undefined)
        throw new Error(`unknown threshold "${name}"`);
    return own.value;
}
