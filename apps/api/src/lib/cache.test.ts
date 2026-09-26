import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db } from "../db/client.js";
import { banks } from "../db/schema/index.js";
import * as banksService from "../modules/banks/banks.service.js";
import { getDescriptionTree } from "./cache.js";
import { redis } from "./redis.js";
import { createTestAdmin, deleteTestAdmin } from "./testAuth.js";

describe("description tree cache", () => {
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
});
