import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Page tests open a browser; they run under `pnpm test:pages` (vitest.pages.config.ts).
    exclude: [...configDefaults.exclude, "test/pages/**", "test/faults/**"],
    environment: "node",
    passWithNoTests: true,
  },
});
