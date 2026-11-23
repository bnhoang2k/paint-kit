/** The stamp init writes beside the copy. Its presence is what lets a later init replace the copy. */
export declare const STAMP: string;
export type InitResult = {
    root: string;
    engine: string;
    version: string;
    files: number;
    replaced: boolean;
};
/**
 * Copies `<kit>/dist/src/engine` (its .js files only) to `<folder>/dist/src/engine` and writes `<folder>/dist/paint-kit.json`.
 * `folder` is the folder the project serves at `/`. A copy init wrote before (it has the stamp) is replaced; any other
 * `dist/src/engine` is left alone and is a usage error.
 */
export declare function init(folder: string, kitRoot?: string): InitResult;
/** What init prints: where the copy went, how a page loads it, and the next steps from AGENTS.md. */
export declare function nextSteps(r: InitResult, kitRoot?: string): string;
