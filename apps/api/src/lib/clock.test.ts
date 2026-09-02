import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// env is a module-level singleton parsed once at import time (config/env.ts),
// so it's mocked per-test via vi.doMock + a fresh dynamic import rather than
// mutating `process.env` and hoping a re-parse happens.
async function loadCurrentInstant(nodeEnv: string, fakeNow: string | undefined) {
  vi.resetModules();
  vi.doMock("../config/env.js", () => ({
    env: { NODE_ENV: nodeEnv, FAKE_NOW: fakeNow },
  }));
  const mod = await import("./clock.js");
  return mod.currentInstant;
}

describe("currentInstant", () => {
  const REAL_NOW = new Date("2026-06-01T10:00:00.000Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(REAL_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.doUnmock("../config/env.js");
    vi.resetModules();
  });

  it("returns the real time when FAKE_NOW is unset", async () => {
    const currentInstant = await loadCurrentInstant("development", undefined);
    expect(currentInstant()).toEqual(REAL_NOW);
  });

  it("returns FAKE_NOW when NODE_ENV is development and FAKE_NOW is set", async () => {
    const currentInstant = await loadCurrentInstant("development", "2026-01-01T12:00:00.000Z");
    expect(currentInstant()).toEqual(new Date("2026-01-01T12:00:00.000Z"));
  });

  it("ignores FAKE_NOW outside NODE_ENV=development — production", async () => {
    const currentInstant = await loadCurrentInstant("production", "2026-01-01T12:00:00.000Z");
    expect(currentInstant()).toEqual(REAL_NOW);
  });

  it("ignores FAKE_NOW outside NODE_ENV=development — test", async () => {
    const currentInstant = await loadCurrentInstant("test", "2026-01-01T12:00:00.000Z");
    expect(currentInstant()).toEqual(REAL_NOW);
  });
});
