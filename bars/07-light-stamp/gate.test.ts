// Bar 07's gate: every check that applies passes at the bar's seeds, and the pointer sets the light. Run alone:
// npx vitest run -c vitest.pages.config.ts bars/07-light-stamp/gate.test.ts
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { CHECKS, gate } from "../../src/checks/gate.ts";
import { closeBrowsers, openPage } from "../../src/checks/harness.ts";
import { meanAbsDiff } from "../../src/checks/image.ts";
import { serveRoot } from "../../src/checks/serve.ts";

afterAll(async () => {
  await closeBrowsers();
});

describe("07-light-stamp", () => {
  // Nine checks at three seeds in a software-WebGL browser: minutes, not seconds. One test per seed and check group
  // (bars 03 and 06's split), so each stays under the 120 s every page test must keep. The checks do not read each
  // other, so the three tests of a seed together assert what one gate at that seed asserts: every check that applies
  // passes.
  const GROUPS: [string, (n: string) => boolean][] = [
    ["relight", (n) => n === "relight"],
    ["detail", (n) => n === "detail"],
    ["the other seven checks", (n) => n !== "relight" && n !== "detail"],
  ];
  for (const seed of [1, 2, 3])
    for (const [label, pick] of GROUPS)
      it(`07-light-stamp ${label} pass at seed ${seed}`, async () => {
        const r = await gate(path.resolve(import.meta.dirname), { seeds: [seed] }, CHECKS.filter((c) => pick(c.name)));
        console.log(r.lines.join("\n"));
        expect(r.verdict, r.lines.join("\n")).toBe("passed");
      });

  // The pointer beat (the owner, look review: "Mouse is the light"): the light comes from the cursor's side in both axes,
  // so the faces toward the pointer light up and the shadow falls away from it. With no input the light is the declared key. The page eases the light 0.05 s
  // behind the pointer, so 400 ms after a move it has arrived.
  it("the pointer is the light: pointer right, light from the right; pointer above, light from above", async () => {
    const server = await serveRoot(path.resolve(import.meta.dirname, "../.."));
    try {
      const h = await openPage(`${server.url}/bars/07-light-stamp/`, { width: 960, height: 600, dpr: 1 });
      try {
        const dir = () => h.hook<number[]>("__paint.lights()[0].props.dir");
        expect(await dir(), "with no input the light is not the declared key").toEqual([-0.7, 0.6, 0.4]);
        const c = await h.hook<{ x: number; y: number }>("window.__stamp");
        const at = async (dx: number, dy: number) => {
          await h.page.mouse.move(c.x + dx, c.y + dy, { steps: 4 });
          await h.page.waitForTimeout(400);
          return { dir: await dir(), shot: await h.shot() };
        };
        const right = await at(320, 0);
        const left = await at(-320, 0);
        const above = await at(0, -240);
        const below = await at(0, 240);
        console.log(`pointer dirs: right ${right.dir}, left ${left.dir}, above ${above.dir}, below ${below.dir}`);
        expect(right.dir[0], "pointer right: the light does not come from the right").toBeGreaterThan(0);
        expect(left.dir[0], "pointer left: the light does not come from the left").toBeLessThan(0);
        expect(above.dir[1], "pointer above: the light does not come from above").toBeGreaterThan(0);
        expect(below.dir[1], "pointer below: the light does not come from below").toBeLessThan(0);
        expect(meanAbsDiff(right.shot, left.shot), "moving the pointer left to right did not change the frame").toBeGreaterThan(0);
        expect(h.errors).toEqual([]);
      } finally {
        await h.close();
      }
    } finally {
      await server.close();
    }
  });
});
