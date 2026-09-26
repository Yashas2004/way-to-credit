import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../db/client.js";
import { banks } from "../db/schema/index.js";
import * as banksService from "../modules/banks/banks.service.js";
import { getDescriptionTree, invalidateDescriptionTreeCache } from "./cache.js";
import { buildDescriptionTree } from "./descriptionTree.js";
import { redis } from "./redis.js";
import { createTestAdmin, deleteTestAdmin } from "./testAuth.js";

// Pass-through spy so tests can count real rebuilds.
vi.mock("./descriptionTree.js", async () => {
  const actual =
    await vi.importActual<typeof import("./descriptionTree.js")>("./descriptionTree.js");
  return { ...actual, buildDescriptionTree: vi.fn(actual.buildDescriptionTree) };
});
const buildSpy = vi.mocked(buildDescriptionTree);

describe("description tree cache", () => {
  beforeEach(() => {
    buildSpy.mockClear();
  });

  it("is invalidated by a write: read, write, read again — the change is visible", async () => {
    const admin = await createTestAdmin();
    try {
      const before = await getDescriptionTree();

      const bank = await banksService.createBank(admin.id, `Cache Test Bank ${randomUUID()}`);

      const after = await getDescriptionTree();

      expect(before.some((b) => b.bankId === bank.id)).toBe(false);
      expect(after.some((b) => b.bankId === bank.id)).toBe(true);

      await db.delete(banks).where(eq(banks.id, bank.id));
    } finally {
      await deleteTestAdmin(admin.id);
    }
  });

  it("falls through to Postgres without throwing when Redis is unreachable", async () => {
    const getSpy = vi.spyOn(redis, "get").mockRejectedValue(new Error("simulated redis outage"));
    try {
      await expect(getDescriptionTree()).resolves.toBeInstanceOf(Array);
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
      await redis.del("tree:version");
      const before = await getDescriptionTree(); // caches under whatever version it now picks

      const bank = await banksService.createBank(admin.id, `Cache Test Bank ${randomUUID()}`);
      const after = await getDescriptionTree();

      expect(before.some((b) => b.bankId === bank.id)).toBe(false);
      expect(after.some((b) => b.bankId === bank.id)).toBe(true);

      await db.delete(banks).where(eq(banks.id, bank.id));
    } finally {
      await deleteTestAdmin(admin.id);
    }
  });

  it("never serves a leftover payload from an old version when the key goes missing", async () => {
    await redis.del("tree:version");
    // What a counter scheme would have produced before the key vanished.
    await redis.set(
      "tree:v1",
      JSON.stringify([{ bankId: "stale", bankName: "Stale", loanTypes: [] }]),
      "EX",
      60,
    );
    try {
      const tree = await getDescriptionTree();
      expect(tree.some((b) => b.bankId === "stale")).toBe(false);
    } finally {
      await redis.del("tree:v1");
    }
  });

  it("rebuilds once, not once per request, when many requests miss at the same time", async () => {
    await invalidateDescriptionTreeCache();
    buildSpy.mockClear();

    const results = await Promise.all(Array.from({ length: 50 }, () => getDescriptionTree()));

    expect(buildSpy).toHaveBeenCalledTimes(1);
    for (const r of results) expect(r).toEqual(results[0]);
  });

  it("never caches a failed rebuild: every overlapping waiter sees the error, the next request retries", async () => {
    await invalidateDescriptionTreeCache();
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

    const outcomes = await Promise.allSettled(
      Array.from({ length: 5 }, () => getDescriptionTree()),
    );
    expect(outcomes.map((o) => o.status)).toEqual(Array(5).fill("rejected"));
    expect(buildSpy).toHaveBeenCalledTimes(1);

    await expect(getDescriptionTree()).resolves.toBeInstanceOf(Array);
    expect(buildSpy).toHaveBeenCalledTimes(2);
  });

  describe("in-process copy keyed by version", () => {
    it("serves a warm read without fetching the payload from Redis, and still sees another instance's invalidation", async () => {
      await getDescriptionTree(); // warm this instance
      const getSpy = vi.spyOn(redis, "get");
      // A bank inserted directly, bypassing the service, so nothing invalidates.
      const [bank] = await db
        .insert(banks)
        .values({ name: `Memo Bank ${randomUUID()}` })
        .returning();
      if (!bank) throw new Error("fixture insert failed");
      try {
        const warm = await getDescriptionTree();
        expect(warm.some((b) => b.bankId === bank.id)).toBe(false); // served from memory
        expect(getSpy.mock.calls.map(([key]) => key)).toEqual(["tree:version"]); // no payload fetch

        // What another instance's admin write does: replace the version token.
        await redis.set("tree:version", randomUUID());
        const after = await getDescriptionTree();
        expect(after.some((b) => b.bankId === bank.id)).toBe(true);
      } finally {
        getSpy.mockRestore();
        await db.delete(banks).where(eq(banks.id, bank.id));
        await invalidateDescriptionTreeCache();
      }
    });

    it("hands out a frozen tree, so no request can mutate another's view", async () => {
      const tree = await getDescriptionTree();
      expect(Object.isFrozen(tree)).toBe(true);
      expect(() => {
        (tree as unknown as unknown[]).push({});
      }).toThrow(TypeError);
    });

    it("isn't used when Redis is down: reads fall through to Postgres, fresh", async () => {
      await getDescriptionTree(); // warm memo
      const [bank] = await db
        .insert(banks)
        .values({ name: `Memo Bank ${randomUUID()}` })
        .returning();
      if (!bank) throw new Error("fixture insert failed");
      const getSpy = vi.spyOn(redis, "get").mockRejectedValue(new Error("simulated redis outage"));
      try {
        const tree = await getDescriptionTree();
        expect(tree.some((b) => b.bankId === bank.id)).toBe(true);
      } finally {
        getSpy.mockRestore();
        await db.delete(banks).where(eq(banks.id, bank.id));
        await invalidateDescriptionTreeCache();
      }
    });
  });
});
