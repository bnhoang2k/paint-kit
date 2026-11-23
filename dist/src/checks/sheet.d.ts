export declare const SHEET_SEEDS: readonly [1, 2, 3];
export declare const SHEET_DETAILS: readonly [0, 0.5, 1];
/** The cell for a view: the view's aspect, CELL_AREA pixels, whole pixels (393 x 852 gives 215 x 466). */
export declare function cellFor(view: {
    width: number;
    height: number;
}): {
    w: number;
    h: number;
};
export type SheetOpts = {
    baseUrl?: string;
};
/** Writes the sheet PNG to `out` and returns how many cells it holds. */
export declare function makeSheet(targetArg: string, out: string, opts?: SheetOpts): Promise<{
    cells: number;
    width: number;
    height: number;
}>;
