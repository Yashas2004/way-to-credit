import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../../app.js";
import { db } from "../../db/client.js";
import { creditTransactions, milestones, userMilestones, users } from "../../db/schema/index.js";
import {
  createTestAdmin,
  createTestUser,
  deleteTestAdmin,
  deleteTestUser,
  loginAs,
  type TestAdmin,
  type TestUser,
  WITHIN_WINDOW_INSTANT,
} from "../../lib/testAuth.js";

interface AdjustResponseBody {
  userId: string;
  creditPoints: number;
  newlyUnlockedMilestones: { milestoneId: string; levelNumber: number; title: string }[];
}

const app = createApp();

describe("admin credit adjustment API", () => {
  let admin: TestAdmin;
  let adminCookie: string;
  let user: TestUser;
  let milestoneAId: string;
  let milestoneBId: string;
  let milestoneCId: string;

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(WITHIN_WINDOW_INSTANT);

    admin = await createTestAdmin();
    adminCookie = await loginAs(app, admin.adminId);
    user = await createTestUser(admin.id);

    // Distinct from the seeded 5/10/15/20/25/30 range, and all <= 30 so a
    // +30 adjustment actually crosses them. A fresh user's +30 adjustment
    // ALSO crosses every seeded milestone (they're all <= 30 too) — tests
    // below check these three are a subset of what unlocked, not the
    // entire set, and clean up user_milestones by userId (not by these
    // three ids alone) for exactly that reason.
    const [a] = await db
      .insert(milestones)
      .values({ levelNumber: 9301, pointsRequired: 6, title: "A", message: "m" })
      .returning();
    const [b] = await db
      .insert(milestones)
      .values({ levelNumber: 9302, pointsRequired: 12, title: "B", message: "m" })
      .returning();
    const [c] = await db
      .insert(milestones)
      .values({ levelNumber: 9303, pointsRequired: 18, title: "C", message: "m" })
      .returning();
    if (!a || !b || !c) throw new Error("fixture insert failed");
    milestoneAId = a.id;
    milestoneBId = b.id;
    milestoneCId = c.id;
  });

  afterAll(async () => {
    vi.useRealTimers();
    await db.delete(creditTransactions).where(eq(creditTransactions.userId, user.id));
    await db.delete(userMilestones).where(eq(userMilestones.userId, user.id));
    await db.delete(milestones).where(eq(milestones.id, milestoneAId));
    await db.delete(milestones).where(eq(milestones.id, milestoneBId));
    await db.delete(milestones).where(eq(milestones.id, milestoneCId));
    await deleteTestUser(user.id);
    await deleteTestAdmin(admin.id);
  });

  it("jumping several milestone levels at once unlocks all of them in one call", async () => {
    const res = await request(app)
      .post(`/api/admin/users/${user.id}/credits`)
      .set("Cookie", adminCookie)
      .set("Idempotency-Key", randomUUID())
      .send({ delta: 30, reason: "Bulk correction" });

    expect(res.status).toBe(200);
    const body = res.body as AdjustResponseBody;
    expect(body.creditPoints).toBe(30);
    // A fresh user's +30 also crosses every seeded milestone (all <= 30) —
    // assert these three are present, not that they're the only ones.
    const unlockedIds = body.newlyUnlockedMilestones.map((m) => m.milestoneId);
    expect(unlockedIds).toEqual(expect.arrayContaining([milestoneAId, milestoneBId, milestoneCId]));

    const rows = await db.select().from(userMilestones).where(eq(userMilestones.userId, user.id));
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows.every((r) => r.seenAt === null)).toBe(true);
  });

  it("an adjustment that would push credits below zero is rejected, no partial effect", async () => {
    const fresh = await createTestUser(admin.id);
    try {
      const res = await request(app)
        .post(`/api/admin/users/${fresh.id}/credits`)
        .set("Cookie", adminCookie)
        .set("Idempotency-Key", randomUUID())
        .send({ delta: -1, reason: "Should fail" });

      expect(res.status).toBe(409);

      const [row] = await db
        .select({ cp: users.creditPoints })
        .from(users)
        .where(eq(users.id, fresh.id));
      expect(row?.cp).toBe(0);
      const txRows = await db
        .select()
        .from(creditTransactions)
        .where(eq(creditTransactions.userId, fresh.id));
      expect(txRows).toHaveLength(0);
    } finally {
      await deleteTestUser(fresh.id);
    }
  });

  it("the same Idempotency-Key sent twice produces exactly one row and identical responses; a different key produces a second row", async () => {
    const fresh = await createTestUser(admin.id);
    try {
      const key = randomUUID();
      const first = await request(app)
        .post(`/api/admin/users/${fresh.id}/credits`)
        .set("Cookie", adminCookie)
        .set("Idempotency-Key", key)
        .send({ delta: 5, reason: "Idempotency test" });
      expect(first.status).toBe(200);

      const second = await request(app)
        .post(`/api/admin/users/${fresh.id}/credits`)
        .set("Cookie", adminCookie)
        .set("Idempotency-Key", key)
        .send({ delta: 5, reason: "Idempotency test" });
      expect(second.status).toBe(200);
      expect(second.body).toEqual(first.body);

      const rowsAfterRepeat = await db
        .select()
        .from(creditTransactions)
        .where(eq(creditTransactions.userId, fresh.id));
      expect(rowsAfterRepeat).toHaveLength(1);

      const third = await request(app)
        .post(`/api/admin/users/${fresh.id}/credits`)
        .set("Cookie", adminCookie)
        .set("Idempotency-Key", randomUUID())
        .send({ delta: 5, reason: "Different key" });
      expect(third.status).toBe(200);

      const rowsAfterNewKey = await db
        .select()
        .from(creditTransactions)
        .where(eq(creditTransactions.userId, fresh.id));
      expect(rowsAfterNewKey).toHaveLength(2);
    } finally {
      // delta:5 crosses the seeded pointsRequired=5 milestone — clean that
      // unlock up too, or deleteTestUser's FK-restrict delete fails.
      await db.delete(creditTransactions).where(eq(creditTransactions.userId, fresh.id));
      await db.delete(userMilestones).where(eq(userMilestones.userId, fresh.id));
      await deleteTestUser(fresh.id);
    }
  });

  it("returns 400 for a missing or malformed Idempotency-Key header", async () => {
    const missing = await request(app)
      .post(`/api/admin/users/${user.id}/credits`)
      .set("Cookie", adminCookie)
      .send({ delta: 1, reason: "no key" });
    expect(missing.status).toBe(400);

    const malformed = await request(app)
      .post(`/api/admin/users/${user.id}/credits`)
      .set("Cookie", adminCookie)
      .set("Idempotency-Key", "not-a-uuid")
      .send({ delta: 1, reason: "bad key" });
    expect(malformed.status).toBe(400);
  });

  it("a duplicate Idempotency-Key while the first request is still in flight returns 409", async () => {
    const fresh = await createTestUser(admin.id);
    try {
      const key = randomUUID();
      const p1 = request(app)
        .post(`/api/admin/users/${fresh.id}/credits`)
        .set("Cookie", adminCookie)
        .set("Idempotency-Key", key)
        .send({ delta: 1, reason: "race" });
      const p2 = request(app)
        .post(`/api/admin/users/${fresh.id}/credits`)
        .set("Cookie", adminCookie)
        .set("Idempotency-Key", key)
        .send({ delta: 1, reason: "race" });
      const [res1, res2] = await Promise.all([p1, p2]);

      const statuses = [res1.status, res2.status].sort();
      // Either one wins and the other sees PENDING (409), or — if the
      // second request's SET NX happened to land after the first fully
      // completed — both succeed identically via the stored-result path.
      // Either outcome is correct; what must never happen is two ledger rows.
      expect(statuses[0]).toBe(200);
      expect([200, 409]).toContain(statuses[1]);

      const txRows = await db
        .select()
        .from(creditTransactions)
        .where(eq(creditTransactions.userId, fresh.id));
      expect(txRows).toHaveLength(1);
    } finally {
      await db.delete(creditTransactions).where(eq(creditTransactions.userId, fresh.id));
      await deleteTestUser(fresh.id);
    }
  });

  it("rejects a zero delta or a delta outside +/-100", async () => {
    const zero = await request(app)
      .post(`/api/admin/users/${user.id}/credits`)
      .set("Cookie", adminCookie)
      .set("Idempotency-Key", randomUUID())
      .send({ delta: 0, reason: "zero" });
    expect(zero.status).toBe(400);

    const tooLarge = await request(app)
      .post(`/api/admin/users/${user.id}/credits`)
      .set("Cookie", adminCookie)
      .set("Idempotency-Key", randomUUID())
      .send({ delta: 101, reason: "too large" });
    expect(tooLarge.status).toBe(400);
  });

  it("rejects an empty reason", async () => {
    const res = await request(app)
      .post(`/api/admin/users/${user.id}/credits`)
      .set("Cookie", adminCookie)
      .set("Idempotency-Key", randomUUID())
      .send({ delta: 1, reason: "   " });
    expect(res.status).toBe(400);
  });
});
