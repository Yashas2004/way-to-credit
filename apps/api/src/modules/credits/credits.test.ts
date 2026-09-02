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

interface RewardsMapBody {
  creditPoints: number;
  milestones: {
    milestoneId: string;
    levelNumber: number;
    pointsRequired: number;
    unlockedAt: string | null;
    seenAt: string | null;
  }[];
}

describe("rewards map API", () => {
  let admin: TestAdmin;
  let user: TestUser;
  let otherUser: TestUser;
  let userCookie: string;
  let otherUserCookie: string;
  let lockedId: string;
  let unlockedUnseenId: string;
  let unlockedSeenId: string;

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(WITHIN_WINDOW_INSTANT);

    admin = await createTestAdmin();
    user = await createTestUser(admin.id);
    otherUser = await createTestUser(admin.id);
    userCookie = await loginAs(app, user.userId);
    otherUserCookie = await loginAs(app, otherUser.userId);

    // A dedicated, unique level/points range so this never collides with
    // seed data or any other test file's own reserved range.
    const [locked] = await db
      .insert(milestones)
      .values({ levelNumber: 9101, pointsRequired: 9101, title: "Locked", message: "m" })
      .returning();
    const [unseen] = await db
      .insert(milestones)
      .values({ levelNumber: 9102, pointsRequired: 3, title: "Unseen", message: "m" })
      .returning();
    const [seen] = await db
      .insert(milestones)
      .values({ levelNumber: 9103, pointsRequired: 1, title: "Seen", message: "m" })
      .returning();
    if (!locked || !unseen || !seen) throw new Error("fixture insert failed");
    lockedId = locked.id;
    unlockedUnseenId = unseen.id;
    unlockedSeenId = seen.id;

    await db.update(users).set({ creditPoints: 4 }).where(eq(users.id, user.id));
    await db.insert(userMilestones).values({ userId: user.id, milestoneId: unlockedUnseenId });
    await db
      .insert(userMilestones)
      .values({ userId: user.id, milestoneId: unlockedSeenId, seenAt: new Date() });
  });

  afterAll(async () => {
    vi.useRealTimers();

    await db.delete(userMilestones).where(eq(userMilestones.userId, user.id));
    await db.delete(milestones).where(eq(milestones.id, lockedId));
    await db.delete(milestones).where(eq(milestones.id, unlockedUnseenId));
    await db.delete(milestones).where(eq(milestones.id, unlockedSeenId));
    await deleteTestUser(user.id);
    await deleteTestUser(otherUser.id);
    await deleteTestAdmin(admin.id);
  });

  it("includes locked milestones with null unlockedAt/seenAt, and distinguishes unseen from seen", async () => {
    const res = await request(app).get("/api/user/me/rewards").set("Cookie", userCookie);
    expect(res.status).toBe(200);
    const body = res.body as RewardsMapBody;
    expect(body.creditPoints).toBe(4);

    const locked = body.milestones.find((m) => m.milestoneId === lockedId);
    expect(locked?.unlockedAt).toBeNull();
    expect(locked?.seenAt).toBeNull();

    const unseen = body.milestones.find((m) => m.milestoneId === unlockedUnseenId);
    expect(unseen?.unlockedAt).not.toBeNull();
    expect(unseen?.seenAt).toBeNull();

    const seen = body.milestones.find((m) => m.milestoneId === unlockedSeenId);
    expect(seen?.unlockedAt).not.toBeNull();
    expect(seen?.seenAt).not.toBeNull();
  });

  it("orders milestones by levelNumber ascending", async () => {
    const res = await request(app).get("/api/user/me/rewards").set("Cookie", userCookie);
    const body = res.body as RewardsMapBody;
    const levels = body.milestones.map((m) => m.levelNumber);
    const sorted = [...levels].sort((a, b) => a - b);
    expect(levels).toEqual(sorted);
  });

  it("never leaks another user's unlock/seen state for the same milestone", async () => {
    const res = await request(app).get("/api/user/me/rewards").set("Cookie", otherUserCookie);
    const body = res.body as RewardsMapBody;
    const unseenForOtherUser = body.milestones.find((m) => m.milestoneId === unlockedUnseenId);
    expect(unseenForOtherUser?.unlockedAt).toBeNull();
    expect(unseenForOtherUser?.seenAt).toBeNull();
  });
});
