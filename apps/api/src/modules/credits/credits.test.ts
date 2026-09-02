import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../../app.js";
import { db } from "../../db/client.js";
import {
  banks,
  creditTransactions,
  loanTypes,
  milestones,
  queries,
  statuses,
  userMilestones,
  users,
} from "../../db/schema/index.js";
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

interface CreditHistoryBody {
  items: {
    id: string;
    delta: number;
    reason: string;
    createdAt: string;
    queryId: string | null;
    bankNameSnapshot: string | null;
    loanTypeNameSnapshot: string | null;
    statusNameSnapshot: string | null;
  }[];
  nextCursor: string | null;
}

describe("credit history API", () => {
  let admin: TestAdmin;
  let user: TestUser;
  let otherUser: TestUser;
  let userCookie: string;
  let otherUserCookie: string;
  let bankId: string;
  let loanTypeId: string;
  let statusId: string;
  let queryAId: string;
  let queryBId: string;

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(WITHIN_WINDOW_INSTANT);

    admin = await createTestAdmin();
    user = await createTestUser(admin.id);
    otherUser = await createTestUser(admin.id);
    userCookie = await loginAs(app, user.userId);
    otherUserCookie = await loginAs(app, otherUser.userId);

    const [bank] = await db
      .insert(banks)
      .values({ name: `History Test Bank ${randomUUID()}` })
      .returning();
    const [loanType] = await db
      .insert(loanTypes)
      .values({ name: `History Test Loan Type ${randomUUID()}` })
      .returning();
    const [status] = await db
      .insert(statuses)
      .values({ name: `History Test Status ${randomUUID()}`, sortOrder: 1 })
      .returning();
    if (!bank || !loanType || !status) throw new Error("fixture insert failed");
    bankId = bank.id;
    loanTypeId = loanType.id;
    statusId = status.id;

    const [queryA] = await db
      .insert(queries)
      .values({
        raisedBy: user.id,
        bankId,
        loanTypeId,
        statusId,
        bankNameSnapshot: bank.name,
        loanTypeNameSnapshot: loanType.name,
        statusNameSnapshot: status.name,
        message: "Query A",
        status: "approved",
        resolvedAt: new Date(),
        resolvedBy: admin.id,
      })
      .returning();
    const [queryB] = await db
      .insert(queries)
      .values({
        raisedBy: user.id,
        bankId,
        loanTypeId,
        statusId,
        bankNameSnapshot: bank.name,
        loanTypeNameSnapshot: loanType.name,
        statusNameSnapshot: status.name,
        message: "Query B",
        status: "approved",
        resolvedAt: new Date(),
        resolvedBy: admin.id,
      })
      .returning();
    if (!queryA || !queryB) throw new Error("fixture insert failed");
    queryAId = queryA.id;
    queryBId = queryB.id;

    // Oldest to newest: manual adjustment, then two query approvals — lets
    // the "newest first" ordering assertion distinguish all three.
    await db
      .insert(creditTransactions)
      .values({ userId: user.id, delta: 2, reason: "Welcome bonus", queryId: null });
    await db
      .insert(creditTransactions)
      .values({ userId: user.id, delta: 1, reason: "Query approved", queryId: queryAId });
    await db
      .insert(creditTransactions)
      .values({ userId: user.id, delta: 1, reason: "Query approved", queryId: queryBId });
    // One row for the other user, to prove it never leaks into `user`'s history.
    await db
      .insert(creditTransactions)
      .values({
        userId: otherUser.id,
        delta: 5,
        reason: "Other user's own history",
        queryId: null,
      });
  });

  afterAll(async () => {
    vi.useRealTimers();

    await db.delete(creditTransactions).where(eq(creditTransactions.userId, user.id));
    await db.delete(creditTransactions).where(eq(creditTransactions.userId, otherUser.id));
    await db.delete(queries).where(eq(queries.bankId, bankId));
    await db.delete(banks).where(eq(banks.id, bankId));
    await db.delete(loanTypes).where(eq(loanTypes.id, loanTypeId));
    await db.delete(statuses).where(eq(statuses.id, statusId));
    await deleteTestUser(user.id);
    await deleteTestUser(otherUser.id);
    await deleteTestAdmin(admin.id);
  });

  it("returns this user's own ledger newest first, with query snapshots joined and manual adjustments null", async () => {
    const res = await request(app).get("/api/user/me/credits/history").set("Cookie", userCookie);
    expect(res.status).toBe(200);
    const body = res.body as CreditHistoryBody;
    expect(body.items).toHaveLength(3);

    const [first, second, third] = body.items;
    expect(first?.queryId).toBe(queryBId);
    expect(first?.bankNameSnapshot).not.toBeNull();
    expect(second?.queryId).toBe(queryAId);
    expect(third?.queryId).toBeNull();
    expect(third?.bankNameSnapshot).toBeNull();
    expect(third?.loanTypeNameSnapshot).toBeNull();
    expect(third?.statusNameSnapshot).toBeNull();
    expect(third?.reason).toBe("Welcome bonus");
  });

  it("paginates with a cursor, and never returns another user's rows", async () => {
    const firstPage = await request(app)
      .get("/api/user/me/credits/history")
      .query({ limit: 1 })
      .set("Cookie", userCookie);
    expect(firstPage.status).toBe(200);
    const firstBody = firstPage.body as CreditHistoryBody;
    expect(firstBody.items).toHaveLength(1);
    expect(firstBody.nextCursor).not.toBeNull();

    const secondPage = await request(app)
      .get("/api/user/me/credits/history")
      .query({ limit: 10, cursor: firstBody.nextCursor })
      .set("Cookie", userCookie);
    const secondBody = secondPage.body as CreditHistoryBody;
    expect(secondBody.items).toHaveLength(2);
    expect(secondBody.items.every((item) => item.id !== firstBody.items[0]?.id)).toBe(true);

    const otherUserRes = await request(app)
      .get("/api/user/me/credits/history")
      .set("Cookie", otherUserCookie);
    const otherUserBody = otherUserRes.body as CreditHistoryBody;
    expect(otherUserBody.items).toHaveLength(1);
    expect(otherUserBody.items[0]?.reason).toBe("Other user's own history");
  });
});
