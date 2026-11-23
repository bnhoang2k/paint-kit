import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
const TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
};
/** Serves `root` as static files on a free port. Every response is `Cache-Control: no-store`. */
export async function serveRoot(root) {
    const base = path.resolve(root);
    const server = createServer(async (req, res) => {
        try {
            const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
            let file = path.join(base, pathname);
            if (file !== base && !file.startsWith(base + path.sep))
                throw new Error("outside root");
            if (pathname.endsWith("/"))
                file = path.join(file, "index.html");
            const body = await readFile(file);
            res.writeHead(200, {
                "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream",
                "Cache-Control": "no-store",
            });
            res.end(body);
        }
        catch {
            res.writeHead(404, { "Cache-Control": "no-store" });
            res.end("not found");
        }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    if (addr === null || typeof addr === "string")
        throw new Error("no port");
    return {
        url: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise((resolve) => {
            server.closeAllConnections();
            server.close(() => resolve());
        }),
    };
}
