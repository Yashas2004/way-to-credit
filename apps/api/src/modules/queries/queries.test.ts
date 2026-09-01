import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../../app.js";
import { db } from "../../db/client.js";
import { bankLoanTypes, banks, loanTypes, queries, statuses } from "../../db/schema/index.js";
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

interface QueryRowBody {
  id: string;
  bankId: string;
  loanTypeId: string;
  statusId: string;
  bankNameSnapshot: string;
  loanTypeNameSnapshot: string;
  statusNameSnapshot: string;
  message: string;
  status: string;
  raisedAt: string;
  resolvedAt: string | null;
}

interface ListQueriesBody {
  items: QueryRowBody[];
  nextCursor: string | null;
}

const app = createApp();

describe("user queries API", () => {
  let admin: TestAdmin;
  let userA: TestUser;
  let userB: TestUser;
  let userACookie: string;
  let userBCookie: string;
  let adminCookie: string;

  let bankId: string;
  let bankName: string;
  let loanTypeId: string;
  let loanTypeName: string;
  let statusId: string;
  let statusName: string;
  let unwiredLoanTypeId: string;

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(WITHIN_WINDOW_INSTANT);

    admin = await createTestAdmin();
    userA = await createTestUser(admin.id);
    userB = await createTestUser(admin.id);
    adminCookie = await loginAs(app, admin.adminId);
    userACookie = await loginAs(app, userA.userId);
    userBCookie = await loginAs(app, userB.userId);

    bankName = `Query Test Bank ${randomUUID()}`;
    loanTypeName = `Query Test Loan Type ${randomUUID()}`;
    statusName = `Query Test Status ${randomUUID()}`;

    const [bank] = await db.insert(banks).values({ name: bankName }).returning();
    const [loanType] = await db.insert(loanTypes).values({ name: loanTypeName }).returning();
    const [status] = await db
      .insert(statuses)
      .values({ name: statusName, sortOrder: 1 })
      .returning();
    const [unwiredLoanType] = await db
      .insert(loanTypes)
      .values({ name: `Query Unwired Loan Type ${randomUUID()}` })
      .returning();
    if (!bank || !loanType || !status || !unwiredLoanType) {
      throw new Error("fixture insert failed");
    }
    bankId = bank.id;
    loanTypeId = loanType.id;
    statusId = status.id;
    unwiredLoanTypeId = unwiredLoanType.id;

    await db.insert(bankLoanTypes).values({ bankId, loanTypeId });
  });

  afterAll(async () => {
    vi.useRealTimers();

    await db.delete(queries).where(eq(queries.bankId, bankId));
    await db
      .delete(bankLoanTypes)
      .where(and(eq(bankLoanTypes.bankId, bankId), eq(bankLoanTypes.loanTypeId, loanTypeId)));
    await db.delete(banks).where(eq(banks.id, bankId));
    await db.delete(loanTypes).where(eq(loanTypes.id, loanTypeId));
    await db.delete(loanTypes).where(eq(loanTypes.id, unwiredLoanTypeId));
    await db.delete(statuses).where(eq(statuses.id, statusId));
    await deleteTestUser(userA.id);
    await deleteTestUser(userB.id);
    await deleteTestAdmin(admin.id);
  });

  it("raises a query and stores all three snapshot names correctly", async () => {
    const res = await request(app)
      .post("/api/user/queries")
      .set("Cookie", userACookie)
      .send({ bankId, loanTypeId, statusId, message: "What is the current status?" });

    expect(res.status).toBe(201);
    const body = res.body as QueryRowBody;
    expect(body.bankNameSnapshot).toBe(bankName);
    expect(body.loanTypeNameSnapshot).toBe(loanTypeName);
    expect(body.statusNameSnapshot).toBe(statusName);
    expect(body.status).toBe("pending");
    expect(body.resolvedAt).toBeNull();
  });

  it("renaming a status afterward does not change the snapshot on an already-raised query", async () => {
    const raised = await request(app)
      .post("/api/user/queries")
      .set("Cookie", userACookie)
      .send({ bankId, loanTypeId, statusId, message: "Snapshot should survive a rename." });
    expect(raised.status).toBe(201);
    const queryId = (raised.body as QueryRowBody).id;

    const renamedTo = `Renamed Status ${randomUUID()}`;
    const rename = await request(app)
      .patch(`/api/admin/statuses/${statusId}`)
      .set("Cookie", adminCookie)
      .send({ name: renamedTo });
    expect(rename.status).toBe(200);

    const list = await request(app).get("/api/user/queries").set("Cookie", userACookie);
    expect(list.status).toBe(200);
    const found = (list.body as ListQueriesBody).items.find((q) => q.id === queryId);
    expect(found?.statusNameSnapshot).toBe(statusName); // unchanged, not renamedTo
    expect(found?.statusNameSnapshot).not.toBe(renamedTo);
  });

  it("raising against an unwired pair returns 404", async () => {
    const res = await request(app)
      .post("/api/user/queries")
      .set("Cookie", userACookie)
      .send({ bankId, loanTypeId: unwiredLoanTypeId, statusId, message: "Should be rejected." });
    expect(res.status).toBe(404);
  });

  it("ignores a body-supplied raisedBy — it always comes from the token", async () => {
    const res = await request(app)
      .post("/api/user/queries")
      .set("Cookie", userACookie)
      .send({
        bankId,
        loanTypeId,
        statusId,
        message: "Trying to spoof raisedBy.",
        raisedBy: userB.id,
      });
    expect(res.status).toBe(201);

    const [row] = await db
      .select()
      .from(queries)
      .where(eq(queries.id, (res.body as QueryRowBody).id));
    expect(row?.raisedBy).toBe(userA.id);
    expect(row?.raisedBy).not.toBe(userB.id);
  });

  it("returns 400 VALIDATION_ERROR for a malformed (non-UUID) id in the body", async () => {
    const res = await request(app)
      .post("/api/user/queries")
      .set("Cookie", userACookie)
      .send({ bankId: "not-a-uuid", loanTypeId, statusId, message: "Bad id." });
    expect(res.status).toBe(400);
    expect((res.body as { error: { code: string } }).error.code).toBe("VALIDATION_ERROR");
  });

  it("a user never sees another user's queries", async () => {
    const bRaise = await request(app)
      .post("/api/user/queries")
      .set("Cookie", userBCookie)
      .send({ bankId, loanTypeId, statusId, message: "userB's own query." });
    expect(bRaise.status).toBe(201);
    const bQueryId = (bRaise.body as QueryRowBody).id;

    const aList = await request(app).get("/api/user/queries").set("Cookie", userACookie);
    expect(aList.status).toBe(200);
    expect((aList.body as ListQueriesBody).items.some((q) => q.id === bQueryId)).toBe(false);

    const bList = await request(app).get("/api/user/queries").set("Cookie", userBCookie);
    expect(bList.status).toBe(200);
    expect((bList.body as ListQueriesBody).items.every((q) => q.bankId === bankId)).toBe(true);
    expect((bList.body as ListQueriesBody).items.some((q) => q.id === bQueryId)).toBe(true);
  });

  it("paginates with a cursor: returns nextCursor when more rows exist, null on the last page", async () => {
    const paginationUser = await createTestUser(admin.id);
    const paginationCookie = await loginAs(app, paginationUser.userId);
    try {
      for (let i = 0; i < 3; i++) {
        const res = await request(app)
          .post("/api/user/queries")
          .set("Cookie", paginationCookie)
          .send({ bankId, loanTypeId, statusId, message: `Pagination message ${String(i)}` });
        expect(res.status).toBe(201);
      }

      const firstPage = await request(app)
        .get("/api/user/queries?limit=2")
        .set("Cookie", paginationCookie);
      expect(firstPage.status).toBe(200);
      const firstBody = firstPage.body as ListQueriesBody;
      expect(firstBody.items).toHaveLength(2);
      expect(firstBody.nextCursor).not.toBeNull();

      const secondPage = await request(app)
        .get(`/api/user/queries?limit=2&cursor=${encodeURIComponent(firstBody.nextCursor ?? "")}`)
        .set("Cookie", paginationCookie);
      expect(secondPage.status).toBe(200);
      const secondBody = secondPage.body as ListQueriesBody;
      expect(secondBody.items).toHaveLength(1);
      expect(secondBody.nextCursor).toBeNull();

      const firstIds = new Set(firstBody.items.map((q) => q.id));
      expect(secondBody.items.some((q) => firstIds.has(q.id))).toBe(false);
    } finally {
      await db.delete(queries).where(eq(queries.raisedBy, paginationUser.id));
      await deleteTestUser(paginationUser.id);
    }
  });

  it("rate-limits query submission to 10 per user per hour, returning 429 with retryAfterSeconds on the 11th", async () => {
    const rateLimitUser = await createTestUser(admin.id);
    const rateLimitCookie = await loginAs(app, rateLimitUser.userId);
    try {
      for (let i = 0; i < 10; i++) {
        const res = await request(app)
          .post("/api/user/queries")
          .set("Cookie", rateLimitCookie)
          .send({ bankId, loanTypeId, statusId, message: `Rate limit message ${String(i)}` });
        expect(res.status).toBe(201);
      }

      const eleventh = await request(app)
        .post("/api/user/queries")
        .set("Cookie", rateLimitCookie)
        .send({ bankId, loanTypeId, statusId, message: "One too many." });
      expect(eleventh.status).toBe(429);
      const body = eleventh.body as { error: { code: string; retryAfterSeconds: number } };
      expect(body.error.code).toBe("TOO_MANY_REQUESTS");
      expect(body.error.retryAfterSeconds).toBeGreaterThan(0);
    } finally {
      await db.delete(queries).where(eq(queries.raisedBy, rateLimitUser.id));
      await deleteTestUser(rateLimitUser.id);
    }
  });
});
