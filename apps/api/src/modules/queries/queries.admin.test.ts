import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../../app.js";
import { db } from "../../db/client.js";
import {
  bankLoanTypes,
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

interface AdminQueryRowBody {
  id: string;
  raisedBy: string;
  status: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
}

interface ErrorBody {
  error: { code: string };
}

const app = createApp();

describe("admin queries API — approve/reject", () => {
  let admin: TestAdmin;
  let adminCookie: string;
  let user: TestUser;
  let userCookie: string;
  let milestoneUser: TestUser;
  let milestoneUserCookie: string;

  let bankId: string;
  let loanTypeId: string;
  let statusId: string;
  let milestoneId: string;

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(WITHIN_WINDOW_INSTANT);

    admin = await createTestAdmin();
    user = await createTestUser(admin.id);
    milestoneUser = await createTestUser(admin.id);
    adminCookie = await loginAs(app, admin.adminId);
    userCookie = await loginAs(app, user.userId);
    milestoneUserCookie = await loginAs(app, milestoneUser.userId);

    const [bank] = await db
      .insert(banks)
      .values({ name: `Approve Test Bank ${randomUUID()}` })
      .returning();
    const [loanType] = await db
      .insert(loanTypes)
      .values({ name: `Approve Test Loan Type ${randomUUID()}` })
      .returning();
    const [status] = await db
      .insert(statuses)
      .values({ name: `Approve Test Status ${randomUUID()}`, sortOrder: 1 })
      .returning();
    if (!bank || !loanType || !status) throw new Error("fixture insert failed");
    bankId = bank.id;
    loanTypeId = loanType.id;
    statusId = status.id;
    await db.insert(bankLoanTypes).values({ bankId, loanTypeId });

    // Dedicated to the milestoneUser (starts at 0 credits) — one approval
    // crosses it exactly. Level/points chosen well outside the seeded
    // 1-6/5-30 range so this test never depends on or collides with seed data.
    const [milestone] = await db
      .insert(milestones)
      .values({ levelNumber: 9201, pointsRequired: 1, title: "First Point", message: "msg" })
      .returning();
    if (!milestone) throw new Error("fixture insert failed");
    milestoneId = milestone.id;
  });

  afterAll(async () => {
    vi.useRealTimers();

    await db.delete(creditTransactions).where(eq(creditTransactions.userId, user.id));
    await db.delete(creditTransactions).where(eq(creditTransactions.userId, milestoneUser.id));
    await db.delete(userMilestones).where(eq(userMilestones.milestoneId, milestoneId));
    await db.delete(milestones).where(eq(milestones.id, milestoneId));
    await db.delete(queries).where(eq(queries.bankId, bankId));
    await db
      .delete(bankLoanTypes)
      .where(and(eq(bankLoanTypes.bankId, bankId), eq(bankLoanTypes.loanTypeId, loanTypeId)));
    await db.delete(banks).where(eq(banks.id, bankId));
    await db.delete(loanTypes).where(eq(loanTypes.id, loanTypeId));
    await db.delete(statuses).where(eq(statuses.id, statusId));
    await deleteTestUser(user.id);
    await deleteTestUser(milestoneUser.id);
    await deleteTestAdmin(admin.id);
  });

  async function raiseQueryAs(cookie: string): Promise<string> {
    const res = await request(app)
      .post("/api/user/queries")
      .set("Cookie", cookie)
      .send({ bankId, loanTypeId, statusId, message: `Query ${randomUUID()}` });
    expect(res.status).toBe(201);
    return (res.body as { id: string }).id;
  }

  it("concurrent double-approval awards exactly one credit — the central test", async () => {
    const queryId = await raiseQueryAs(userCookie);

    // Fire both without awaiting between them, then await both.
    const p1 = request(app)
      .post(`/api/admin/queries/${queryId}/approve`)
      .set("Cookie", adminCookie);
    const p2 = request(app)
      .post(`/api/admin/queries/${queryId}/approve`)
      .set("Cookie", adminCookie);
    const [res1, res2] = await Promise.all([p1, p2]);

    const statuses_ = [res1.status, res2.status].sort();
    expect(statuses_).toEqual([200, 409]);

    const failed = res1.status === 409 ? res1 : res2;
    // Assert the specific code, not just the status — under real contention
    // the losing side could in principle hit RESOURCE_BUSY instead if the
    // winner's transaction somehow stalled past lock_timeout; asserting
    // only the status would let that pass as a false green.
    expect((failed.body as ErrorBody).error.code).toBe("ALREADY_RESOLVED");

    const [userRow] = await db.select().from(users).where(eq(users.id, user.id));
    expect(userRow?.creditPoints).toBe(1);

    const txRows = await db
      .select()
      .from(creditTransactions)
      .where(eq(creditTransactions.queryId, queryId));
    expect(txRows).toHaveLength(1);
  });

  it("approving an already-approved query returns 409 and does not move credits", async () => {
    const queryId = await raiseQueryAs(userCookie);

    const first = await request(app)
      .post(`/api/admin/queries/${queryId}/approve`)
      .set("Cookie", adminCookie);
    expect(first.status).toBe(200);

    const [before] = await db
      .select({ cp: users.creditPoints })
      .from(users)
      .where(eq(users.id, user.id));

    const second = await request(app)
      .post(`/api/admin/queries/${queryId}/approve`)
      .set("Cookie", adminCookie);
    expect(second.status).toBe(409);
    expect((second.body as ErrorBody).error.code).toBe("ALREADY_RESOLVED");

    const [after] = await db
      .select({ cp: users.creditPoints })
      .from(users)
      .where(eq(users.id, user.id));
    expect(after?.cp).toBe(before?.cp);
  });

  it("rejecting a pending query moves no credits; rejecting a resolved one returns 409", async () => {
    const queryId = await raiseQueryAs(userCookie);
    const [before] = await db
      .select({ cp: users.creditPoints })
      .from(users)
      .where(eq(users.id, user.id));

    const reject1 = await request(app)
      .post(`/api/admin/queries/${queryId}/reject`)
      .set("Cookie", adminCookie);
    expect(reject1.status).toBe(200);
    expect((reject1.body as AdminQueryRowBody).status).toBe("rejected");

    const [after] = await db
      .select({ cp: users.creditPoints })
      .from(users)
      .where(eq(users.id, user.id));
    expect(after?.cp).toBe(before?.cp);

    const reject2 = await request(app)
      .post(`/api/admin/queries/${queryId}/reject`)
      .set("Cookie", adminCookie);
    expect(reject2.status).toBe(409);
    expect((reject2.body as ErrorBody).error.code).toBe("ALREADY_RESOLVED");
  });

  it("crossing a milestone threshold inserts exactly one user_milestones row with seenAt null", async () => {
    const queryId = await raiseQueryAs(milestoneUserCookie);
    const res = await request(app)
      .post(`/api/admin/queries/${queryId}/approve`)
      .set("Cookie", adminCookie);
    expect(res.status).toBe(200);

    const rows = await db
      .select()
      .from(userMilestones)
      .where(
        and(
          eq(userMilestones.userId, milestoneUser.id),
          eq(userMilestones.milestoneId, milestoneId),
        ),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.seenAt).toBeNull();
  });

  it("GET /:id returns the query with snapshot names and raw raisedBy/resolvedBy ids", async () => {
    const queryId = await raiseQueryAs(userCookie);
    const res = await request(app).get(`/api/admin/queries/${queryId}`).set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    const body = res.body as AdminQueryRowBody;
    expect(body.id).toBe(queryId);
    expect(body.raisedBy).toBe(user.id);
    expect(body.status).toBe("pending");
    expect(body.resolvedBy).toBeNull();
  });

  it("GET / filters by status", async () => {
    const queryId = await raiseQueryAs(userCookie);
    await request(app).post(`/api/admin/queries/${queryId}/reject`).set("Cookie", adminCookie);

    const res = await request(app)
      .get(`/api/admin/queries?status=rejected&userId=${user.id}`)
      .set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    const body = res.body as { items: AdminQueryRowBody[] };
    expect(body.items.some((q) => q.id === queryId)).toBe(true);
    expect(body.items.every((q) => q.status === "rejected")).toBe(true);
  });

  it("GET / defaults to newest-first, and sort=asc reverses it — the dashboard's only real use is this unpaginated first page", async () => {
    // A dedicated user, not the describe block's shared `user` — earlier
    // tests in this file already raised queries for that one, which would
    // make an unpaginated limit=3 read pick up rows from those other
    // tests instead of exactly these three.
    const sortUser = await createTestUser(admin.id);
    const sortUserCookie = await loginAs(app, sortUser.userId);

    // `raisedAt` is `defaultNow()` — stamped by Postgres's own real clock,
    // not affected by this file's `vi.useFakeTimers({ toFake: ["Date"] })`
    // (that only fakes the Node process's `Date`) — but the row *id* is a
    // UUIDv7 generated in this now-frozen-`Date` Node process, so unlike
    // in a real, unfrozen run, three ids minted here can share the same
    // millisecond prefix with no reliable relative order. Assert only on
    // `raisedAt`-driven ordering here — a real small delay between raises
    // so Postgres's own clock (unaffected by the freeze) actually
    // separates them — not on id order, which this test environment
    // can't make trustworthy the way a real deployment's clock would.
    const ids: string[] = [];
    try {
      for (let i = 0; i < 3; i++) {
        ids.push(await raiseQueryAs(sortUserCookie));
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      const desc = await request(app)
        .get(`/api/admin/queries?userId=${sortUser.id}&limit=3`)
        .set("Cookie", adminCookie);
      expect((desc.body as { items: AdminQueryRowBody[] }).items.map((q) => q.id)).toEqual(
        [...ids].reverse(),
      );

      const asc = await request(app)
        .get(`/api/admin/queries?userId=${sortUser.id}&limit=3&sort=asc`)
        .set("Cookie", adminCookie);
      expect((asc.body as { items: AdminQueryRowBody[] }).items.map((q) => q.id)).toEqual(ids);
    } finally {
      await db.delete(queries).where(eq(queries.raisedBy, sortUser.id));
      await deleteTestUser(sortUser.id);
    }
  });
});
