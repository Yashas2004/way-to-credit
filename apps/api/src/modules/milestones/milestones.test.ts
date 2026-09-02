import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../../app.js";
import { db } from "../../db/client.js";
import { creditTransactions, milestones, userMilestones } from "../../db/schema/index.js";
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
import * as creditsService from "../credits/credits.service.js";

interface MilestoneBody {
  id: string;
  levelNumber: number;
  pointsRequired: number;
  title: string;
  message: string;
  isActive: boolean;
  unlockedCount: number;
}

const app = createApp();

// A unique level-number range for this whole file, distinct from the
// seeded 1-6 range and every other test file's own reserved range.
let nextLevel = 9401;
function freshLevel(): number {
  return nextLevel++;
}

describe("admin milestones API", () => {
  let admin: TestAdmin;
  let adminCookie: string;

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(WITHIN_WINDOW_INSTANT);
    admin = await createTestAdmin();
    adminCookie = await loginAs(app, admin.adminId);
  });

  afterAll(async () => {
    vi.useRealTimers();
    await deleteTestAdmin(admin.id);
  });

  it("creates, lists, updates (including isActive), deactivates, and reactivates a milestone", async () => {
    const level = freshLevel();
    const points = 100_000 + level;

    const create = await request(app)
      .post("/api/admin/milestones")
      .set("Cookie", adminCookie)
      .send({ levelNumber: level, pointsRequired: points, title: "Original", message: "msg" });
    expect(create.status).toBe(201);
    const id = (create.body as MilestoneBody).id;
    expect((create.body as MilestoneBody).unlockedCount).toBe(0);

    try {
      const list = await request(app).get("/api/admin/milestones").set("Cookie", adminCookie);
      expect(list.status).toBe(200);
      expect((list.body as MilestoneBody[]).some((m) => m.id === id)).toBe(true);

      const update = await request(app)
        .patch(`/api/admin/milestones/${id}`)
        .set("Cookie", adminCookie)
        .send({ title: "Updated", isActive: false });
      expect(update.status).toBe(200);
      const updated = update.body as MilestoneBody;
      expect(updated.title).toBe("Updated");
      expect(updated.isActive).toBe(false);
      expect(updated.pointsRequired).toBe(points); // unchanged

      const reactivate = await request(app)
        .post(`/api/admin/milestones/${id}/reactivate`)
        .set("Cookie", adminCookie);
      expect(reactivate.status).toBe(200);
      expect((reactivate.body as MilestoneBody).isActive).toBe(true);

      const deactivate = await request(app)
        .post(`/api/admin/milestones/${id}/deactivate`)
        .set("Cookie", adminCookie);
      expect(deactivate.status).toBe(200);
      expect((deactivate.body as MilestoneBody).isActive).toBe(false);
    } finally {
      await db.delete(milestones).where(eq(milestones.id, id));
    }
  });

  it("reflects real unlocks in both the list and a single milestone's update response, and never resets them on edit", async () => {
    const level = freshLevel();
    const points = 500_000 + level;

    const [milestone] = await db
      .insert(milestones)
      .values({
        levelNumber: level,
        pointsRequired: points,
        title: "Unlock count test",
        message: "m",
      })
      .returning();
    if (!milestone) throw new Error("fixture insert failed");

    const userA = await createTestUser(admin.id);
    const userB = await createTestUser(admin.id);
    try {
      await db.insert(userMilestones).values({ userId: userA.id, milestoneId: milestone.id });
      await db.insert(userMilestones).values({ userId: userB.id, milestoneId: milestone.id });

      const list = await request(app).get("/api/admin/milestones").set("Cookie", adminCookie);
      const listed = (list.body as MilestoneBody[]).find((m) => m.id === milestone.id);
      expect(listed?.unlockedCount).toBe(2);

      // Editing title/message must not reset or touch the count.
      const update = await request(app)
        .patch(`/api/admin/milestones/${milestone.id}`)
        .set("Cookie", adminCookie)
        .send({ title: "Fixed typo" });
      expect(update.status).toBe(200);
      expect((update.body as MilestoneBody).unlockedCount).toBe(2);
    } finally {
      await db.delete(userMilestones).where(eq(userMilestones.milestoneId, milestone.id));
      await db.delete(milestones).where(eq(milestones.id, milestone.id));
      await deleteTestUser(userA.id);
      await deleteTestUser(userB.id);
    }
  });

  it("rejects a pointsRequired collision on create and on update", async () => {
    const levelA = freshLevel();
    const pointsA = 200_000 + levelA;
    const levelB = freshLevel();
    const pointsB = 200_000 + levelB;

    const createA = await request(app)
      .post("/api/admin/milestones")
      .set("Cookie", adminCookie)
      .send({ levelNumber: levelA, pointsRequired: pointsA, title: "A", message: "m" });
    expect(createA.status).toBe(201);
    const idA = (createA.body as MilestoneBody).id;

    const createB = await request(app)
      .post("/api/admin/milestones")
      .set("Cookie", adminCookie)
      .send({ levelNumber: levelB, pointsRequired: pointsB, title: "B", message: "m" });
    expect(createB.status).toBe(201);
    const idB = (createB.body as MilestoneBody).id;

    try {
      const collideOnCreate = await request(app)
        .post("/api/admin/milestones")
        .set("Cookie", adminCookie)
        .send({ levelNumber: freshLevel(), pointsRequired: pointsA, title: "C", message: "m" });
      expect(collideOnCreate.status).toBe(409);

      const collideOnUpdate = await request(app)
        .patch(`/api/admin/milestones/${idB}`)
        .set("Cookie", adminCookie)
        .send({ pointsRequired: pointsA });
      expect(collideOnUpdate.status).toBe(409);
    } finally {
      await db.delete(milestones).where(eq(milestones.id, idA));
      await db.delete(milestones).where(eq(milestones.id, idB));
    }
  });

  it("editing a milestone does not alter any existing user_milestones unlock row", async () => {
    const level = freshLevel();
    const points = 300_000 + level;

    const [milestone] = await db
      .insert(milestones)
      .values({
        levelNumber: level,
        pointsRequired: points,
        title: "Before",
        message: "before-msg",
      })
      .returning();
    if (!milestone) throw new Error("fixture insert failed");

    const user = await createTestUser(admin.id);
    try {
      const [unlockBefore] = await db
        .insert(userMilestones)
        .values({ userId: user.id, milestoneId: milestone.id })
        .returning();
      if (!unlockBefore) throw new Error("fixture insert failed");

      const update = await request(app)
        .patch(`/api/admin/milestones/${milestone.id}`)
        .set("Cookie", adminCookie)
        .send({
          title: "After",
          message: "after-msg",
          pointsRequired: points + 1,
          isActive: false,
        });
      expect(update.status).toBe(200);

      const [unlockAfter] = await db
        .select()
        .from(userMilestones)
        .where(eq(userMilestones.id, unlockBefore.id));
      expect(unlockAfter?.unlockedAt).toEqual(unlockBefore.unlockedAt);
      expect(unlockAfter?.seenAt).toBeNull();
    } finally {
      await db.delete(userMilestones).where(eq(userMilestones.milestoneId, milestone.id));
      await db.delete(milestones).where(eq(milestones.id, milestone.id));
      await deleteTestUser(user.id);
    }
  });
});

describe("mark milestone seen", () => {
  let admin: TestAdmin;
  let user: TestUser;
  let otherUser: TestUser;
  let userCookie: string;
  let otherUserCookie: string;
  let milestoneId: string;

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(WITHIN_WINDOW_INSTANT);

    admin = await createTestAdmin();
    user = await createTestUser(admin.id);
    otherUser = await createTestUser(admin.id);
    userCookie = await loginAs(app, user.userId);
    otherUserCookie = await loginAs(app, otherUser.userId);

    const level = freshLevel();
    const [milestone] = await db
      .insert(milestones)
      .values({
        levelNumber: level,
        pointsRequired: 400_000 + level,
        title: "Seen Test",
        message: "m",
      })
      .returning();
    if (!milestone) throw new Error("fixture insert failed");
    milestoneId = milestone.id;

    // Unlock it for `user` only, via the real credit-adjustment core so the
    // unlock row is produced the same way it would be in production.
    await db.transaction(async (tx) => {
      await creditsService.applyCreditAdjustment(
        tx,
        user.id,
        400_000 + level,
        "fixture setup",
        null,
      );
    });
  });

  afterAll(async () => {
    vi.useRealTimers();
    // The fixture's adjustment (400_000+ points) crosses every seeded
    // milestone too, not just this file's own one — clean up by userId,
    // not by this one milestoneId, or deleteTestUser's FK-restrict delete fails.
    await db.delete(userMilestones).where(eq(userMilestones.userId, user.id));
    await db.delete(milestones).where(eq(milestones.id, milestoneId));
    await db.delete(creditTransactions).where(eq(creditTransactions.userId, user.id));
    await deleteTestUser(user.id);
    await deleteTestUser(otherUser.id);
    await deleteTestAdmin(admin.id);
  });

  it("is idempotent — a second call is a no-op returning 200", async () => {
    const first = await request(app)
      .post(`/api/user/me/milestones/${milestoneId}/seen`)
      .set("Cookie", userCookie);
    expect(first.status).toBe(200);

    const [row] = await db
      .select()
      .from(userMilestones)
      .where(eq(userMilestones.milestoneId, milestoneId));
    const seenAtFirst = row?.seenAt;
    expect(seenAtFirst).not.toBeNull();

    const second = await request(app)
      .post(`/api/user/me/milestones/${milestoneId}/seen`)
      .set("Cookie", userCookie);
    expect(second.status).toBe(200);

    const [rowAfter] = await db
      .select()
      .from(userMilestones)
      .where(eq(userMilestones.milestoneId, milestoneId));
    expect(rowAfter?.seenAt).toEqual(seenAtFirst);
  });

  it("a user cannot mark another user's unlock — 404, not another user's row", async () => {
    const res = await request(app)
      .post(`/api/user/me/milestones/${milestoneId}/seen`)
      .set("Cookie", otherUserCookie);
    expect(res.status).toBe(404);
  });

  it("returns 404 for a milestone id the user never unlocked at all", async () => {
    const res = await request(app)
      .post(`/api/user/me/milestones/${randomUUID()}/seen`)
      .set("Cookie", userCookie);
    expect(res.status).toBe(404);
  });
});
