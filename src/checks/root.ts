import path from "node:path";
import { fileURLToPath } from "node:url";

/** The repo root, resolved from this module (src/checks or dist/src/checks), never from cwd. */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), import.meta.url.includes("/dist/") ? "../../.." : "../..");
