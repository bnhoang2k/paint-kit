// The palette eval set: every honest test page and every palette cheat, each with the verdict the palette check
// must give it. It is the measuring stick for the check (check-fix (b) round 3): a change to the check is judged by
// how many rows land on their verdict, not by one page's number.
//
// `today` marks a row the check got wrong when the set was written (HEAD 3b32bbb, the probe-based check); such a row
// asserts today's verdict so the set passes and documents the gap. `reason` is the sub-reason a cheat must fail by.
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CHECKS, gate } from "../../src/checks/gate.ts";
import { closeBrowsers } from "../../src/checks/harness.ts";
import { serveRoot } from "../../src/checks/serve.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");
let server: { url: string; close(): Promise<void> };

beforeAll(async () => {
  server = await serveRoot(ROOT);
});

afterAll(async () => {
  await server?.close();
  await closeBrowsers();
});

type Verdict = "pass" | "fail";
type Row = { page: string; should: Verdict; why: string; today?: Verdict; reason?: RegExp };

const HONEST: Row[] = [
  "core", "paper", "cloth", "halftone", "halftone-caption", "halftone-lit", "grown", "lights", "lights-overhead", "blend", "ink-cases", "tone",
].map((p) => ({ page: `test/pages/${p}.html`, should: "pass", why: "honest: every colour comes from the live tokens" }));
// Wrong on HEAD 3b32bbb (the probe check), right since round 3: cloth (weft and zipper pixels mix two tokens, so the
// per-token rule failed it) and lights-overhead (its frame mean, L 0.499, took the dark branch and sent the far
// ground next to its own ground). `today` is kept for a future row the check gets wrong.

const CHEATS: Row[] = [
  { page: "test/faults/core-nopalette/index.html", should: "fail", why: "the engine seam stops reading the tokens: the frame ignores a swap", reason: /the frame ignores the page's tokens/ },
  { page: "test/faults/core-hexcolour/index.html", should: "fail", why: "a hex colour literal in page code", reason: /colour literal\(s\) outside the tokens/ },
  { page: "test/faults/core-accent-stripe/index.html", should: "fail", why: "an accent read once in page code (probe span) and baked into a band", reason: /page code reads the palette itself.*calls getComputedStyle/ },
  { page: "test/faults/cloth-accent-baked/index.html", should: "fail", why: "a page palette source that keeps the first accent it read", reason: /page code reads the palette itself.*not a direct fromPage/ },
  { page: "test/faults/lights-baked/index.html", should: "fail", why: "a custom Light in page code: a painted cone, no live light", reason: /page code makes its own Light.*light shader/ },
  { page: "test/faults/core-ramp-read-once/index.html", should: "fail", why: "cheat i: the ramp read once through fromPage().read() and passed as a fixed colour", reason: /page code reads the palette itself.*calls \.read\(\)/ },
  { page: "test/faults/lights-glow-cached/index.html", should: "fail", why: "cheat ii: a custom Light that caches the glow's uniforms at the first resolve", reason: /page code makes its own Light.*resolve, with or testPositions/ },
  { page: "test/faults/core-band-mostly-baked/index.html", should: "fail", why: "cheat iii: a band 90% baked from a token read once, 10% live", reason: /page code reads the palette itself.*calls getComputedStyle/ },
  { page: "test/faults/tone-read-once/index.html", should: "fail", why: "the engine resolves the materials' tones once and not on a palette change: the card and the desk keep their old colours", reason: /the frame ignores the page's tokens/ },
  { page: "test/faults/core-second-accent-once/index.html", should: "fail", why: "cheat iv: a two-accent page whose second accent is read once", reason: /page code reads the palette itself.*not a direct fromPage/ },
];

const PALETTE = CHECKS.filter((c) => c.name === "palette");

describe("palette eval set", () => {
  it.each([...HONEST, ...CHEATS])("$page: palette $should", async (row) => {
    const r = await gate(path.join(ROOT, row.page), { baseUrl: server.url }, PALETTE);
    const res = r.results.find((c) => c.name === "palette")!;
    console.log(`EVAL ${row.page} should=${row.should} got=${res.status}${row.today ? ` (today ${row.today})` : ""}\n  ${res.line}\n  ${JSON.stringify(res.measured)}`);
    expect(res.status).toBe(row.today ?? row.should);
    if (row.reason && !row.today) expect(res.line).toMatch(row.reason);
  }, 120_000);
});
