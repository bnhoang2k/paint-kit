import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/pages/**/*.test.ts", "bars/*/gate.test.ts"],
    passWithNoTests: true,
    environment: "node",
    // The guard: no page test may run past 120 s. A test that sets its own timeout above this
    // overrides the guard; scripts/test-pages.mjs lists the steps that run over 120 s.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // Each page test drives its own headless Chromium with WebGL. With the default worker
    // count (cores - 1) the browsers starve each other: two whole runs on a 12-core Mac gave
    // 16 and then 31 failures, every one a timeout, while the same pages passed when run alone.
    maxWorkers: 4,
  },
});
