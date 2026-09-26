import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db/client.js";
import { sessions } from "../../db/schema/index.js";
import {
  createTestAdmin,
  createTestUser,
  deleteTestAdmin,
  deleteTestUser,
  type TestAdmin,
  type TestUser,
} from "../../lib/testAuth.js";
import { purgeEndedSessions } from "./sessionRetention.service.js";

const DAY = 24 * 60 * 60 * 1000;

describe("session retention", () => {
  let admin: TestAdmin;
  let user: TestUser;
  const now = new Date();

  beforeAll(async () => {
    admin = await createTestAdmin();
    user = await createTestUser(admin.id);
  });

  afterAll(async () => {
    await deleteTestUser(user.id);
    await deleteTestAdmin(admin.id);
  });

  async function insertSession(opts: { expiresAt: Date; revokedAt: Date | null }): Promise<string> {
    const id = randomUUID();
    await db.insert(sessions).values({
      id,
      familyId: id,
      userId: user.id,
      refreshTokenHash: `retention-test-${id}`,
      issuedAt: new Date(opts.expiresAt.getTime() - 7 * DAY),
      lastUsedAt: new Date(opts.expiresAt.getTime() - 7 * DAY),
      expiresAt: opts.expiresAt,
      revokedAt: opts.revokedAt,
      ip: "10.0.0.1",
      userAgent: "retention-test",
    });
    return id;
  }

  async function remaining(ids: string[]): Promise<Set<string>> {
    const rows = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(inArray(sessions.id, ids));
    return new Set(rows.map((r) => r.id));
  }

  it("deletes sessions ended more than 90 days ago and keeps everything else", async () => {
    const ago = (days: number) => new Date(now.getTime() - days * DAY);
    const revoked91 = await insertSession({ expiresAt: ago(85), revokedAt: ago(91) });
    const expired91 = await insertSession({ expiresAt: ago(91), revokedAt: null });
    const revoked89 = await insertSession({ expiresAt: ago(83), revokedAt: ago(89) });
    const expired89 = await insertSession({ expiresAt: ago(89), revokedAt: null });
    // Expired long ago but revoked recently: retention runs from the revocation.
    const revokedRecentlyAfterExpiry = await insertSession({
      expiresAt: ago(120),
      revokedAt: ago(10),
    });
    const live = await insertSession({
      expiresAt: new Date(now.getTime() + 7 * DAY),
      revokedAt: null,
    });
    const all = [revoked91, expired91, revoked89, expired89, revokedRecentlyAfterExpiry, live];

    try {
      const deleted = await purgeEndedSessions(now);
      expect(deleted).toBeGreaterThanOrEqual(2);

      const left = await remaining(all);
      expect(left.has(revoked91)).toBe(false);
      expect(left.has(expired91)).toBe(false);
      expect(left.has(revoked89)).toBe(true);
      expect(left.has(expired89)).toBe(true);
      expect(left.has(revokedRecentlyAfterExpiry)).toBe(true);
      expect(left.has(live)).toBe(true);
    } finally {
      await db.delete(sessions).where(inArray(sessions.id, all));
    }
  });

  it("is harmless when two instances run it at the same time: every old row deleted exactly once", async () => {
    const old = new Date(now.getTime() - 200 * DAY);
    const ids: string[] = [];
    for (let i = 0; i < 60; i++) {
      ids.push(await insertSession({ expiresAt: old, revokedAt: old }));
    }

    try {
      // Small batches so the two runs genuinely interleave.
      const [a, b] = await Promise.all([purgeEndedSessions(now, 7), purgeEndedSessions(now, 7)]);
      expect((await remaining(ids)).size).toBe(0);
      // SKIP LOCKED gives the two runs disjoint batches: their counts add up
      // to exactly our 60 rows (the first test already cleared any older
      // backlog), so nothing was counted — or deleted — twice.
      expect(a + b).toBe(ids.length);
    } finally {
      await db.delete(sessions).where(inArray(sessions.id, ids));
    }
  });

  it("does nothing, cheaply, when there's nothing to delete", async () => {
    await purgeEndedSessions(now);
    expect(await purgeEndedSessions(now)).toBe(0);
  });
});
