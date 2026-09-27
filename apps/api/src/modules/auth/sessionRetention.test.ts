import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db/client.js";
import { sessions } from "../../db/schema/index.js";
import {
  createTestAdmin,
  createTestUser,
  deleteTestAdmin,
  deleteTestUser,
  TEST_PASSWORD,
  type TestAdmin,
  type TestUser,
  WITHIN_WINDOW_INSTANT,
} from "../../lib/testAuth.js";
import * as authService from "./auth.service.js";
import { purgeEndedSessions } from "./sessionRetention.service.js";

const DAY = 24 * 60 * 60 * 1000;

describe("session retention", () => {
  let admin: TestAdmin;
  let user: TestUser;
  const now = new Date();
  const ago = (days: number) => new Date(now.getTime() - days * DAY);

  beforeAll(async () => {
    admin = await createTestAdmin();
    user = await createTestUser(admin.id);
  });

  afterAll(async () => {
    await deleteTestUser(user.id);
    await deleteTestAdmin(admin.id);
  });

  /** A session row. Without `familyId` it's a family's first row (the login); with one, a refresh row in that family. */
  async function insertSession(opts: {
    expiresAt: Date;
    revokedAt: Date | null;
    familyId?: string;
    compromisedAt?: Date;
  }): Promise<string> {
    const id = randomUUID();
    await db.insert(sessions).values({
      id,
      familyId: opts.familyId ?? id,
      userId: user.id,
      refreshTokenHash: `retention-test-${id}`,
      issuedAt: new Date(opts.expiresAt.getTime() - 7 * DAY),
      lastUsedAt: new Date(opts.expiresAt.getTime() - 7 * DAY),
      expiresAt: opts.expiresAt,
      revokedAt: opts.revokedAt,
      compromisedAt: opts.compromisedAt ?? null,
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

  it("keeps a login (a family's first row) for 90 days after it ended", async () => {
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
      await purgeEndedSessions(now);
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

  it("deletes a superseded refresh row 3 days after its token expires — not before, so reuse detection still works", async () => {
    const login = await insertSession({
      expiresAt: new Date(now.getTime() + 6 * DAY),
      revokedAt: ago(11),
    });
    const expired4DaysAgo = await insertSession({
      familyId: login,
      expiresAt: ago(4),
      revokedAt: ago(11),
    });
    const expired2DaysAgo = await insertSession({
      familyId: login,
      expiresAt: ago(2),
      revokedAt: ago(9),
    });
    // Rotated an hour ago: its token is still replayable, so its row must stay.
    const rotatedAnHourAgo = await insertSession({
      familyId: login,
      expiresAt: new Date(now.getTime() + 6 * DAY),
      revokedAt: new Date(now.getTime() - 60 * 60 * 1000),
    });
    const all = [login, expired4DaysAgo, expired2DaysAgo, rotatedAnHourAgo];

    try {
      await purgeEndedSessions(now);
      const left = await remaining(all);
      expect(left.has(expired4DaysAgo)).toBe(false);
      expect(left.has(expired2DaysAgo)).toBe(true);
      expect(left.has(rotatedAnHourAgo)).toBe(true);
      expect(left.has(login)).toBe(true); // the login row is on the 90-day rule
    } finally {
      await db.delete(sessions).where(inArray(sessions.id, all));
    }
  });

  it("keeps every row of a compromised family, refreshes included, for 90 days from detection", async () => {
    // Detected 10 days ago; its refresh rows expired a month ago.
    const keptLogin = await insertSession({
      expiresAt: ago(35),
      revokedAt: ago(40),
      compromisedAt: ago(10),
    });
    const keptRefreshes = [
      await insertSession({
        familyId: keptLogin,
        expiresAt: ago(30),
        revokedAt: ago(37),
        compromisedAt: ago(10),
      }),
      await insertSession({
        familyId: keptLogin,
        expiresAt: ago(30),
        revokedAt: ago(10),
        compromisedAt: ago(10),
      }),
    ];
    // Detected 91 days ago: past the 90 days, all of it goes.
    const goneLogin = await insertSession({
      expiresAt: ago(95),
      revokedAt: ago(100),
      compromisedAt: ago(91),
    });
    const goneRefresh = await insertSession({
      familyId: goneLogin,
      expiresAt: ago(91),
      revokedAt: ago(91),
      compromisedAt: ago(91),
    });
    const all = [keptLogin, ...keptRefreshes, goneLogin, goneRefresh];

    try {
      await purgeEndedSessions(now);
      const left = await remaining(all);
      expect([keptLogin, ...keptRefreshes].every((id) => left.has(id))).toBe(true);
      expect(left.has(goneLogin)).toBe(false);
      expect(left.has(goneRefresh)).toBe(false);
    } finally {
      await db.delete(sessions).where(inArray(sessions.id, all));
    }
  });

  it("marks the whole family compromised when a rotated refresh token is replayed, exempting it from short retention", async () => {
    const context = { ip: "10.0.0.9", userAgent: "retention-theft-test" };
    const first = await authService.login(
      { identifier: user.userId, password: TEST_PASSWORD },
      context,
      WITHIN_WINDOW_INSTANT,
    );
    const second = await authService.refresh(first.refreshToken, context, WITHIN_WINDOW_INSTANT);
    await authService.refresh(second.refreshToken, context, WITHIN_WINDOW_INSTANT);

    // Replaying the first (already rotated) token is the theft signal.
    await expect(
      authService.refresh(first.refreshToken, context, WITHIN_WINDOW_INSTANT),
    ).rejects.toThrow();

    const family = await db.select().from(sessions).where(eq(sessions.userId, user.id));
    try {
      expect(family).toHaveLength(3);
      expect(new Set(family.map((s) => s.familyId)).size).toBe(1);
      expect(family.every((s) => s.compromisedAt !== null && s.revokedAt !== null)).toBe(true);

      // 30 days on, every refresh row is well past "token expiry + 3 days",
      // yet none is deleted: the family is evidence.
      await purgeEndedSessions(new Date(WITHIN_WINDOW_INSTANT.getTime() + 30 * DAY));
      expect((await remaining(family.map((s) => s.id))).size).toBe(3);
    } finally {
      await db.delete(sessions).where(eq(sessions.userId, user.id));
    }
  });

  it("is harmless when two instances run it at the same time: every due row deleted exactly once", async () => {
    // Clear any backlog other test files left (their refresh flows leave
    // purgeable rows), so the count below is only ours.
    await purgeEndedSessions(now);

    const old = ago(200);
    const ids: string[] = [];
    for (let i = 0; i < 60; i++) {
      ids.push(await insertSession({ expiresAt: old, revokedAt: old }));
    }

    try {
      // Small batches so the two runs genuinely interleave.
      const [a, b] = await Promise.all([purgeEndedSessions(now, 7), purgeEndedSessions(now, 7)]);
      expect((await remaining(ids)).size).toBe(0);
      // SKIP LOCKED gives the two runs disjoint batches: their counts add
      // up to exactly our 60 rows, so nothing was deleted twice.
      expect(a + b).toBe(ids.length);
    } finally {
      await db.delete(sessions).where(inArray(sessions.id, ids));
    }
  });

  it("does nothing when nothing is due", async () => {
    await purgeEndedSessions(now);
    expect(await purgeEndedSessions(now)).toBe(0);
  });
});
