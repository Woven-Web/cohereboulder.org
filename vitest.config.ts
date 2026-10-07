import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Pure frontend helpers and Worker boundary tests with mocked fetch/cache.
// No DOM or network — separate from the app build configuration.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "worker/src/**/*.test.ts"],
  },
});
