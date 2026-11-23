import type { Page } from "playwright";
export declare const PLAYWRIGHT_MISSING = "paint-kit needs Playwright's Chromium. Install it with: pnpm add -D playwright && pnpm exec playwright install chromium";
/** Playwright, or null when it cannot be imported. Never throws. */
export declare function playwrightOrNull(): Promise<typeof import("playwright") | null>;
export type OpenOpts = {
    seed?: number;
    t?: number;
    detail?: number;
    reduced?: boolean;
    webgl?: boolean;
    width?: number;
    height?: number;
    dark?: boolean;
    /** Device scale factor (default 2). */
    dpr?: number;
    /** Installed before navigation, so it runs before any page script. */
    initScript?: string;
    /** Max wait for `window.__paint.ready` on a paint page, in ms (default 60000). */
    readyTimeout?: number;
};
export type Rgba = {
    w: number;
    h: number;
    data: Uint8ClampedArray;
};
export type PageHandle = {
    page: Page;
    errors: string[];
    /** Console warnings from page load on. */
    warnings: string[];
    shot(name?: string): Promise<Rgba>;
    hook<T>(expr: string): Promise<T>;
    close(): Promise<void>;
};
/** Decodes an 8-bit RGB or RGBA, non-interlaced PNG into RGBA. */
export declare function decodePng(buf: Buffer): Rgba;
/** Closes the shared browsers, each on its own. The next `openPage` starts new ones. */
export declare function closeBrowsers(): Promise<void>;
/** Opens `url` in headless Chromium. Only the params given are appended to the URL. */
export declare function openPage(url: string, opts?: OpenOpts): Promise<PageHandle>;
