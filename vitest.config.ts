import { defineConfig } from "vitest/config";

// Pure frontend helpers and Worker boundary tests with mocked fetch/cache.
// No DOM or network — separate from the app build configuration.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "worker/src/**/*.test.ts"],
  },
});
