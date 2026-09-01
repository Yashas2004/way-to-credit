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
});
