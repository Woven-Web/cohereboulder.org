import { defineConfig } from "vitest/config";

// Unit tests for the pure modules only (src/lib/eventForm.ts, src/lib/ics.ts
// today). No DOM, no network — kept separate from vite.config.ts so the app
// build config stays untouched by this.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
