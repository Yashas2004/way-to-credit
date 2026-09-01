import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Test files share real Postgres/Redis state (admin/session rows, the
    // description-tree cache, login rate-limit counters) — running files in
    // parallel produces cross-file races that are real testing artifacts,
    // not production bugs. Serialize.
    fileParallelism: false,
    globalSetup: ["./src/testGlobalSetup.ts"],
  },
});
