// The bar's gate: every check passes on bars/02-denim-zip at each seed in bar.json.
import path from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { gate } from "../../src/checks/gate.ts";
import { closeBrowsers } from "../../src/checks/harness.ts";
import { serveRoot } from "../../src/checks/serve.ts";

// Every check runs at three seeds, each opening several frozen pages: the cloth gate tests took up to 180 s, so this one gets the same.
const ROOT = path.resolve(import.meta.dirname, "../..");
let server: { url: string; close(): Promise<void> };

beforeAll(async () => {
  server = await serveRoot(ROOT);
});
afterAll(async () => {
  await closeBrowsers();
  await server?.close();
});

// One test per seed (Task 2e split), so each runs alone in under 120 s.
for (const seed of [1, 2, 3])
  it(`02-denim-zip gate passes at seed ${seed}`, async () => {
    const r = await gate(path.join(ROOT, "bars/02-denim-zip"), { baseUrl: server.url, seeds: [seed] });
    console.log(r.lines.join("\n"));
    expect(r.verdict).toBe("passed");
  });
