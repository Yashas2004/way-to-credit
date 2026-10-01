import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../../app.js";
import { db } from "../../db/client.js";
import { bankLoanTypes, banks, descriptions, loanTypes, statuses } from "../../db/schema/index.js";
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

const app = createApp();

interface CoverageBody {
  totalStatuses: number;
  pairCount: number;
  missingTotal: number;
  pairs: { loanTypeId: string; loanTypeName: string; filled: number; missing: number }[];
}

describe("GET /api/admin/descriptions/coverage", () => {
  let admin: TestAdmin;
  let adminCookie: string;
  let user: TestUser;
  let userCookie: string;
  let bankId: string;
  const loanTypeIds: string[] = [];
  const statusIds: string[] = [];
  let partly: string; // one real description, one "NA" row
  let empty: string; // nothing, apart from a description for a withdrawn status
  let withdrawnLoanType: string;

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(WITHIN_WINDOW_INSTANT);
    admin = await createTestAdmin();
    adminCookie = await loginAs(app, admin.adminId);
    user = await createTestUser(admin.id);
    userCookie = await loginAs(app, user.userId);

    const [bank] = await db
      .insert(banks)
      .values({ name: `Coverage Bank ${randomUUID()}` })
      .returning();
    if (!bank) throw new Error("bank insert failed");
    bankId = bank.id;

    const lts = await db
      .insert(loanTypes)
      .values([
        { name: `Coverage partly ${randomUUID()}` },
        { name: `Coverage empty ${randomUUID()}` },
        { name: `Coverage withdrawn ${randomUUID()}`, deletedAt: new Date() },
      ])
      .returning();
    [partly, empty, withdrawnLoanType] = lts.map((lt) => lt.id) as [string, string, string];
    loanTypeIds.push(...lts.map((lt) => lt.id));
    await db.insert(bankLoanTypes).values(lts.map((lt) => ({ bankId, loanTypeId: lt.id })));

    const sts = await db
      .insert(statuses)
      .values([
        { name: `Coverage S1 ${randomUUID()}`, sortOrder: 1 },
        { name: `Coverage S2 ${randomUUID()}`, sortOrder: 2 },
        { name: `Coverage withdrawn ${randomUUID()}`, sortOrder: 3, deletedAt: new Date() },
      ])
      .returning();
    const [s1, s2, withdrawnStatus] = sts.map((s) => s.id) as [string, string, string];
    statusIds.push(...sts.map((s) => s.id));

    await db.insert(descriptions).values([
      { bankId, loanTypeId: partly, statusId: s1, body: "Filled in.", updatedBy: admin.id },
      { bankId, loanTypeId: partly, statusId: s2, body: "NA", updatedBy: admin.id },
      // The status is withdrawn, so this doesn't count toward `empty`.
      {
        bankId,
        loanTypeId: empty,
        statusId: withdrawnStatus,
        body: "Old text.",
        updatedBy: admin.id,
      },
    ]);
  });

  afterAll(async () => {
    vi.useRealTimers();
    await db.delete(descriptions).where(eq(descriptions.bankId, bankId));
    await db.delete(bankLoanTypes).where(eq(bankLoanTypes.bankId, bankId));
    await db.delete(banks).where(eq(banks.id, bankId));
    await db.delete(loanTypes).where(inArray(loanTypes.id, loanTypeIds));
    await db.delete(statuses).where(inArray(statuses.id, statusIds));
    await deleteTestUser(user.id);
    await deleteTestAdmin(admin.id);
  });

  it("ranks a bank's live pairs by missing descriptions; NA and withdrawn statuses don't count as filled", async () => {
    const res = await request(app)
      .get(`/api/admin/descriptions/coverage?bankId=${bankId}`)
      .set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    const body = res.body as CoverageBody;

    // Statuses are global, so other files' live statuses count too: assert
    // relative to the total rather than a fixed number.
    const total = body.totalStatuses;
    expect(total).toBeGreaterThanOrEqual(2);
    expect(body.pairCount).toBe(2); // the withdrawn loan type's pair is left out
    expect(body.pairs.map((p) => p.loanTypeId)).toEqual([empty, partly]);
    expect(body.pairs.map((p) => p.loanTypeId)).not.toContain(withdrawnLoanType);
    expect(body.pairs[0]).toMatchObject({ filled: 0, missing: total });
    expect(body.pairs[1]).toMatchObject({ filled: 1, missing: total - 1 });
    expect(body.missingTotal).toBe(2 * total - 1);
  });

  it("limits the rows but not the totals", async () => {
    const res = await request(app)
      .get(`/api/admin/descriptions/coverage?bankId=${bankId}&limit=1`)
      .set("Cookie", adminCookie);
    const body = res.body as CoverageBody;
    expect(body.pairs).toHaveLength(1);
    expect(body.pairCount).toBe(2);
    expect(body.missingTotal).toBe(2 * body.totalStatuses - 1);
  });

  it("is admin-only: a user gets 403", async () => {
    const res = await request(app)
      .get(`/api/admin/descriptions/coverage?bankId=${bankId}`)
      .set("Cookie", userCookie);
    expect(res.status).toBe(403);
  });

  it.each([
    ["limit 0", "limit=0"],
    ["limit over 50", "limit=51"],
    ["a malformed bankId", "bankId=not-a-uuid"],
  ])("rejects %s with 400", async (_, qs) => {
    const res = await request(app)
      .get(`/api/admin/descriptions/coverage?${qs}`)
      .set("Cookie", adminCookie);
    expect(res.status).toBe(400);
  });
});
