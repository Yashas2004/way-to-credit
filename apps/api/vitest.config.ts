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
    // Vitest's 5 s default is tight for tests that hash passwords (argon2),
    // run real transactions, or deliberately wait (the 3 s pool-acquisition
    // test) on a loaded CI runner — a test that fails only sometimes gets
    // ignored rather than investigated.
    testTimeout: 15_000,
    globalSetup: ["./src/testGlobalSetup.ts"],
  },
});
