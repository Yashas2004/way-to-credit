import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../../app.js";
import { db } from "../../db/client.js";
import { milestones, userMilestones, users } from "../../db/schema/index.js";
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

interface MyCreditsBody {
  creditPoints: number;
  milestones: { milestoneId: string; levelNumber: number; title: string }[];
}

const app = createApp();

describe("user credits API", () => {
  let admin: TestAdmin;
  let user: TestUser;
  let otherUser: TestUser;
  let userCookie: string;
  let otherUserCookie: string;
  let milestoneAId: string;
  let milestoneBId: string;

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(WITHIN_WINDOW_INSTANT);

    admin = await createTestAdmin();
    user = await createTestUser(admin.id);
    otherUser = await createTestUser(admin.id);
    userCookie = await loginAs(app, user.userId);
    otherUserCookie = await loginAs(app, otherUser.userId);

    // Unusual level/points numbers, deliberately outside the seeded 1-6/5-30
    // range, so this test never depends on (or collides with) seed data.
    const [milestoneA] = await db
      .insert(milestones)
      .values({
        levelNumber: 9001,
        pointsRequired: 9001,
        title: "Milestone A",
        message: "A message",
      })
      .returning();
    const [milestoneB] = await db
      .insert(milestones)
      .values({
        levelNumber: 9002,
        pointsRequired: 9002,
        title: "Milestone B",
        message: "B message",
      })
      .returning();
    if (!milestoneA || !milestoneB) throw new Error("fixture insert failed");
    milestoneAId = milestoneA.id;
    milestoneBId = milestoneB.id;

    await db.update(users).set({ creditPoints: 42 }).where(eq(users.id, user.id));
    await db.insert(userMilestones).values({ userId: user.id, milestoneId: milestoneAId });
    await db.insert(userMilestones).values({ userId: otherUser.id, milestoneId: milestoneBId });
  });

  afterAll(async () => {
    vi.useRealTimers();

    await db.delete(userMilestones).where(eq(userMilestones.milestoneId, milestoneAId));
    await db.delete(userMilestones).where(eq(userMilestones.milestoneId, milestoneBId));
    await db.delete(milestones).where(eq(milestones.id, milestoneAId));
    await db.delete(milestones).where(eq(milestones.id, milestoneBId));
    await deleteTestUser(user.id);
    await deleteTestUser(otherUser.id);
    await deleteTestAdmin(admin.id);
  });

  it("returns creditPoints and only the calling user's own unlocked milestones", async () => {
    const res = await request(app).get("/api/user/me/credits").set("Cookie", userCookie);
    expect(res.status).toBe(200);
    const body = res.body as MyCreditsBody;
    expect(body.creditPoints).toBe(42);
    expect(body.milestones.some((m) => m.milestoneId === milestoneAId)).toBe(true);
    expect(body.milestones.some((m) => m.milestoneId === milestoneBId)).toBe(false);
  });

  it("never includes a milestone unlocked only by another user", async () => {
    const res = await request(app).get("/api/user/me/credits").set("Cookie", otherUserCookie);
    expect(res.status).toBe(200);
    const body = res.body as MyCreditsBody;
    expect(body.milestones.some((m) => m.milestoneId === milestoneBId)).toBe(true);
    expect(body.milestones.some((m) => m.milestoneId === milestoneAId)).toBe(false);
  });
});
