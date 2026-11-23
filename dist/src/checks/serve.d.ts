/** Serves `root` as static files on a free port. Every response is `Cache-Control: no-store`. */
export declare function serveRoot(root: string): Promise<{
    url: string;
    close(): Promise<void>;
}>;
