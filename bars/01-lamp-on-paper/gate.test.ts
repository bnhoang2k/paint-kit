// Bar 01's gate: every check that applies passes at the bar's seeds. Run alone:
// npx vitest run -c vitest.pages.config.ts bars/01-lamp-on-paper/gate.test.ts
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { gate } from "../../src/checks/gate.ts";
import { closeBrowsers, openPage } from "../../src/checks/harness.ts";
import { serveRoot } from "../../src/checks/serve.ts";

afterAll(async () => {
  await closeBrowsers();
});

describe("01-lamp-on-paper", () => {
  // Eight checks at three seeds in a software-WebGL browser: minutes, not seconds.
  // One test per seed (Task 2e split), so each runs alone in under 120 s.
  for (const seed of [1, 2, 3])
    it(`01-lamp-on-paper gate passes at seed ${seed}`, async () => {
      const r = await gate(path.resolve(import.meta.dirname), { seeds: [seed] });
      console.log(r.lines.join("\n"));
      expect(r.verdict, r.lines.join("\n")).toBe("passed");
    });

  // The hold beat (review I1): a drag on the capsule slides the lamp and never switches day and night; a still
  // hold of the same length does. 1 s is more than twice the hold time, so a missed cancel cannot hide.
  it("a 1 s drag on the capsule keeps night; a still 1 s hold switches to day", async () => {
    const server = await serveRoot(path.resolve(import.meta.dirname, "../.."));
    try {
      const h = await openPage(`${server.url}/bars/01-lamp-on-paper/`, { width: 960, height: 600, dpr: 1 });
      try {
        const mode = () => h.hook<string>("document.documentElement.dataset.mode");
        const centre = async () => {
          const b = (await h.page.locator(".capsule").boundingBox())!;
          return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
        };
        expect(await mode()).toBe("night");

        // Drag: 10 moves of 20 px, 100 ms apart, with the button held.
        let p = await centre();
        await h.page.mouse.move(p.x, p.y);
        await h.page.mouse.down();
        for (let i = 1; i <= 10; i++) {
          await h.page.mouse.move(p.x - 20 * i, p.y);
          await h.page.waitForTimeout(100);
        }
        await h.page.mouse.up();
        await h.page.waitForTimeout(300);
        expect(await mode(), "a drag switched day and night").toBe("night");

        // Still hold: 1 s with no movement.
        await h.page.waitForTimeout(500);
        p = await centre();
        await h.page.mouse.move(p.x, p.y);
        await h.page.waitForTimeout(300);
        await h.page.mouse.down();
        await h.page.waitForTimeout(1000);
        await h.page.mouse.up();
        expect(await mode(), "a still hold did not switch").toBe("day");
        expect(h.errors).toEqual([]);
      } finally {
        await h.close();
      }
    } finally {
      await server.close();
    }
  });
});
