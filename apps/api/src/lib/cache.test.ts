import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../db/client.js";
import { banks } from "../db/schema/index.js";
import * as banksService from "../modules/banks/banks.service.js";
import { getWorkspaceNav, invalidateWorkspaceCache } from "./cache.js";
import { buildWorkspaceNav } from "./workspaceNav.js";
import { redis } from "./redis.js";
import { createTestAdmin, deleteTestAdmin } from "./testAuth.js";

// Pass-through spy so tests can count real rebuilds.
vi.mock("./workspaceNav.js", async () => {
  const actual = await vi.importActual<typeof import("./workspaceNav.js")>("./workspaceNav.js");
  return { ...actual, buildWorkspaceNav: vi.fn(actual.buildWorkspaceNav) };
});
const buildSpy = vi.mocked(buildWorkspaceNav);

describe("description tree cache", () => {
  beforeEach(() => {
    buildSpy.mockClear();
  });

  it("is invalidated by a write: read, write, read again — the change is visible", async () => {
    const admin = await createTestAdmin();
    try {
      const before = await getWorkspaceNav();

      const bank = await banksService.createBank(admin.id, `Cache Test Bank ${randomUUID()}`);

      const after = await getWorkspaceNav();

      expect(before.banks.some((b) => b.id === bank.id)).toBe(false);
      expect(after.banks.some((b) => b.id === bank.id)).toBe(true);

      await db.delete(banks).where(eq(banks.id, bank.id));
    } finally {
      await deleteTestAdmin(admin.id);
    }
  });

  it("falls through to Postgres without throwing when Redis is unreachable", async () => {
    const getSpy = vi.spyOn(redis, "get").mockRejectedValue(new Error("simulated redis outage"));
    try {
      await expect(getWorkspaceNav()).resolves.toHaveProperty("banks");
    } finally {
      getSpy.mockRestore();
    }
  });

  // Regression: the version used to be an INCR counter that defaulted to 1
  // when the key was missing, so the first write after the key vanished
  // INCR'd it to 1 — the version readers were already using — and the
  // change stayed invisible until the TTL. This test used to pass only
  // when an earlier test file happened to create the key first.
  it("still invalidates on the first write after the version key has gone missing", async () => {
    const admin = await createTestAdmin();
    try {
      await redis.del("nav:version");
      const before = await getWorkspaceNav(); // caches under whatever version it now picks

      const bank = await banksService.createBank(admin.id, `Cache Test Bank ${randomUUID()}`);
      const after = await getWorkspaceNav();

      expect(before.banks.some((b) => b.id === bank.id)).toBe(false);
      expect(after.banks.some((b) => b.id === bank.id)).toBe(true);

      await db.delete(banks).where(eq(banks.id, bank.id));
    } finally {
      await deleteTestAdmin(admin.id);
    }
  });

  it("never serves a leftover payload from an old version when the key goes missing", async () => {
    await redis.del("nav:version");
    // What a counter scheme would have produced before the key vanished.
    await redis.set(
      "nav:v1",
      JSON.stringify({
        statuses: [],
        loanTypes: [],
        banks: [{ id: "stale", name: "Stale", loanTypes: [] }],
      }),
      "EX",
      60,
    );
    try {
      const tree = await getWorkspaceNav();
      expect(tree.banks.some((b) => b.id === "stale")).toBe(false);
    } finally {
      await redis.del("nav:v1");
    }
  });

  it("rebuilds once, not once per request, when many requests miss at the same time", async () => {
    await invalidateWorkspaceCache();
    buildSpy.mockClear();

    const results = await Promise.all(Array.from({ length: 50 }, () => getWorkspaceNav()));

    expect(buildSpy).toHaveBeenCalledTimes(1);
    for (const r of results) expect(r).toEqual(results[0]);
  });

  it("never caches a failed rebuild: every overlapping waiter sees the error, the next request retries", async () => {
    await invalidateWorkspaceCache();
    buildSpy.mockClear();
    // Fails after a delay, like a real rebuild would, so the concurrent
    // requests genuinely overlap it (an instant rejection would settle
    // before the others finished their Redis reads).
    buildSpy.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          setTimeout(() => {
            reject(new Error("simulated rebuild failure"));
          }, 200);
        }),
    );

    const outcomes = await Promise.allSettled(Array.from({ length: 5 }, () => getWorkspaceNav()));
    expect(outcomes.map((o) => o.status)).toEqual(Array(5).fill("rejected"));
    expect(buildSpy).toHaveBeenCalledTimes(1);

    await expect(getWorkspaceNav()).resolves.toHaveProperty("banks");
    expect(buildSpy).toHaveBeenCalledTimes(2);
  });

  describe("in-process copy keyed by version", () => {
    it("serves a warm read without fetching the payload from Redis, and still sees another instance's invalidation", async () => {
      await getWorkspaceNav(); // warm this instance
      const getSpy = vi.spyOn(redis, "get");
      // A bank inserted directly, bypassing the service, so nothing invalidates.
      const [bank] = await db
        .insert(banks)
        .values({ name: `Memo Bank ${randomUUID()}` })
        .returning();
      if (!bank) throw new Error("fixture insert failed");
      try {
        const warm = await getWorkspaceNav();
        expect(warm.banks.some((b) => b.id === bank.id)).toBe(false); // served from memory
        expect(getSpy.mock.calls.map(([key]) => key)).toEqual(["nav:version"]); // no payload fetch

        // What another instance's admin write does: replace the version token.
        await redis.set("nav:version", randomUUID());
        const after = await getWorkspaceNav();
        expect(after.banks.some((b) => b.id === bank.id)).toBe(true);
      } finally {
        getSpy.mockRestore();
        await db.delete(banks).where(eq(banks.id, bank.id));
        await invalidateWorkspaceCache();
      }
    });

    it("hands out a frozen tree, so no request can mutate another's view", async () => {
      const tree = await getWorkspaceNav();
      expect(Object.isFrozen(tree)).toBe(true);
      expect(Object.isFrozen(tree.banks)).toBe(true);
      expect(() => {
        (tree.banks as unknown as unknown[]).push({});
      }).toThrow(TypeError);
    });

    it("isn't used when Redis is down: reads fall through to Postgres, fresh", async () => {
      await getWorkspaceNav(); // warm memo
      const [bank] = await db
        .insert(banks)
        .values({ name: `Memo Bank ${randomUUID()}` })
        .returning();
      if (!bank) throw new Error("fixture insert failed");
      const getSpy = vi.spyOn(redis, "get").mockRejectedValue(new Error("simulated redis outage"));
      try {
        const tree = await getWorkspaceNav();
        expect(tree.banks.some((b) => b.id === bank.id)).toBe(true);
      } finally {
        getSpy.mockRestore();
        await db.delete(banks).where(eq(banks.id, bank.id));
        await invalidateWorkspaceCache();
      }
    });
  });
});
