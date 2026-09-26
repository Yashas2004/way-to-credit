import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { db } from "../db/client.js";
import { activityLog, banks, loanTypes, queries, statuses } from "../db/schema/index.js";
import {
  createTestAdmin,
  createTestUser,
  deleteTestAdmin,
  deleteTestUser,
  loginAs,
  type TestAdmin,
  type TestUser,
} from "../lib/testAuth.js";

const app = createApp();

/**
 * Regression for keyset pagination across a page boundary where rows fall
 * within the same millisecond. Cursors round-trip the boundary timestamp
 * through a JS Date (millisecond precision); while these columns were
 * microsecond-precision timestamptz, the next page's `ts < cursor.ts`
 * comparison ran against a truncated value and silently skipped rows
 * (descending) or re-included the boundary row (ascending). The literal
 * microsecond timestamps inserted below are exactly that case.
 */
const TIMESTAMPS = [
  "2026-01-05T06:00:00.122000Z",
  "2026-01-05T06:00:00.123456Z",
  "2026-01-05T06:00:00.123789Z",
  "2026-01-05T06:00:00.124000Z",
];

interface Page {
  items: { id: string }[];
  nextCursor: string | null;
}

async function collectAllPages(path: string, cookie: string): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 20; guard++) {
    const url: string = cursor ? `${path}&cursor=${encodeURIComponent(cursor)}` : path;
    const res = await request(app).get(url).set("Cookie", cookie);
    expect(res.status).toBe(200);
    const page = res.body as Page;
    ids.push(...page.items.map((i) => i.id));
    cursor = page.nextCursor;
    if (!cursor) return ids;
  }
  throw new Error("pagination did not terminate");
}

describe("keyset pagination at a sub-millisecond page boundary", () => {
  let admin: TestAdmin;
  let adminCookie: string;
  let user: TestUser;
  let bankId: string;
  let loanTypeId: string;
  let statusId: string;
  const actorId = randomUUID();
  let queryIds: string[] = [];
  let activityIds: string[] = [];

  beforeAll(async () => {
    admin = await createTestAdmin();
    adminCookie = await loginAs(app, admin.adminId);
    user = await createTestUser(admin.id);

    const [bank] = await db
      .insert(banks)
      .values({ name: `Paging Bank ${randomUUID()}` })
      .returning();
    const [loanType] = await db
      .insert(loanTypes)
      .values({ name: `Paging Loan Type ${randomUUID()}` })
      .returning();
    const [status] = await db
      .insert(statuses)
      .values({ name: `Paging Status ${randomUUID()}`, sortOrder: 1 })
      .returning();
    if (!bank || !loanType || !status) throw new Error("fixture insert failed");
    bankId = bank.id;
    loanTypeId = loanType.id;
    statusId = status.id;

    for (const ts of TIMESTAMPS) {
      const [q] = await db
        .insert(queries)
        .values({
          raisedBy: user.id,
          bankId,
          loanTypeId,
          statusId,
          bankNameSnapshot: bank.name,
          loanTypeNameSnapshot: loanType.name,
          statusNameSnapshot: status.name,
          message: `paging ${ts}`,
          raisedAt: sql`${ts}::timestamptz`,
        })
        .returning();
      const [a] = await db
        .insert(activityLog)
        .values({
          actorId,
          actorType: "user",
          event: "login",
          occurredAt: sql`${ts}::timestamptz`,
        })
        .returning();
      if (!q || !a) throw new Error("fixture insert failed");
      queryIds.push(q.id);
      activityIds.push(a.id);
    }
  });

  afterAll(async () => {
    await db.delete(queries).where(eq(queries.raisedBy, user.id));
    await db.delete(activityLog).where(eq(activityLog.actorId, actorId));
    await db.delete(banks).where(eq(banks.id, bankId));
    await db.delete(loanTypes).where(eq(loanTypes.id, loanTypeId));
    await db.delete(statuses).where(eq(statuses.id, statusId));
    await deleteTestUser(user.id);
    await deleteTestAdmin(admin.id);
    queryIds = [];
    activityIds = [];
  });

  it("admin queries, newest first, one per page: every row exactly once", async () => {
    const seen = await collectAllPages(`/api/admin/queries?userId=${user.id}&limit=1`, adminCookie);
    expect(seen).toHaveLength(queryIds.length);
    expect(new Set(seen)).toEqual(new Set(queryIds));
  });

  it("admin queries, oldest first, one per page: every row exactly once", async () => {
    const seen = await collectAllPages(
      `/api/admin/queries?userId=${user.id}&limit=1&sort=asc`,
      adminCookie,
    );
    expect(seen).toHaveLength(queryIds.length);
    expect(new Set(seen)).toEqual(new Set(queryIds));
  });

  it("activity log, one per page: every row exactly once", async () => {
    const seen = await collectAllPages(
      `/api/admin/activity?actorId=${actorId}&limit=1`,
      adminCookie,
    );
    expect(seen).toHaveLength(activityIds.length);
    expect(new Set(seen)).toEqual(new Set(activityIds));
  });
});
