import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { db } from "../../db/client.js";
import { auditLog, banks, descriptions, loanTypes, statuses } from "../../db/schema/index.js";
import { createTestAdmin, deleteTestAdmin, loginAs, type TestAdmin } from "../../lib/testAuth.js";

const app = createApp();

describe("descriptions admin API", () => {
  let admin: TestAdmin;
  let cookie: string;
  let bankId: string;
  let loanTypeId: string;
  let statusId: string;

  beforeAll(async () => {
    admin = await createTestAdmin();
    cookie = await loginAs(app, admin.adminId);

    const [bank] = await db
      .insert(banks)
      .values({ name: `Test Bank ${randomUUID()}` })
      .returning();
    const [loanType] = await db
      .insert(loanTypes)
      .values({ name: `Test Loan Type ${randomUUID()}` })
      .returning();
    const [status] = await db
      .insert(statuses)
      .values({ name: `Test Status ${randomUUID()}`, sortOrder: 1 })
      .returning();
    if (!bank || !loanType || !status) throw new Error("fixture insert failed");
    bankId = bank.id;
    loanTypeId = loanType.id;
    statusId = status.id;
  });

  afterAll(async () => {
    await db
      .delete(descriptions)
      .where(and(eq(descriptions.bankId, bankId), eq(descriptions.loanTypeId, loanTypeId)));
    await db.delete(auditLog).where(eq(auditLog.actorId, admin.id));
    await db.delete(banks).where(eq(banks.id, bankId));
    await db.delete(loanTypes).where(eq(loanTypes.id, loanTypeId));
    await db.delete(statuses).where(eq(statuses.id, statusId));
    await deleteTestAdmin(admin.id);
  });

  it("creates on first PUT and updates (no duplicate triple) on second", async () => {
    const first = await request(app)
      .put("/api/admin/descriptions")
      .set("Cookie", cookie)
      .send({ bankId, loanTypeId, statusId, body: "First text" });

    expect(first.status).toBe(200);
    expect((first.body as { body: string }).body).toBe("First text");
    const firstId = (first.body as { id: string }).id;

    const second = await request(app)
      .put("/api/admin/descriptions")
      .set("Cookie", cookie)
      .send({ bankId, loanTypeId, statusId, body: "Updated text" });

    expect(second.status).toBe(200);
    expect((second.body as { body: string }).body).toBe("Updated text");
    expect((second.body as { id: string }).id).toBe(firstId); // same row, not a duplicate

    const rows = await db
      .select()
      .from(descriptions)
      .where(
        and(
          eq(descriptions.bankId, bankId),
          eq(descriptions.loanTypeId, loanTypeId),
          eq(descriptions.statusId, statusId),
        ),
      );
    expect(rows).toHaveLength(1);

    const audits = await db.select().from(auditLog).where(eq(auditLog.entityId, firstId));
    expect(audits.some((a) => a.action === "create")).toBe(true);
    expect(audits.some((a) => a.action === "update")).toBe(true);
  });

  it("GET returns the full status grid, including synthesized 'NA' rows, plus the wired flag", async () => {
    const [otherStatus] = await db
      .insert(statuses)
      .values({ name: `Test Status ${randomUUID()}`, sortOrder: 2 })
      .returning();
    if (!otherStatus) throw new Error("fixture insert failed");

    await request(app)
      .put("/api/admin/descriptions")
      .set("Cookie", cookie)
      .send({ bankId, loanTypeId, statusId, body: "Has text" });

    const res = await request(app)
      .get(`/api/admin/descriptions?bankId=${bankId}&loanTypeId=${loanTypeId}`)
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    const body = res.body as { wired: boolean; rows: { statusId: string; body: string }[] };
    expect(body.wired).toBe(false); // fixture bank/loanType were never attached via bank_loan_types

    const describedRow = body.rows.find((r) => r.statusId === statusId);
    expect(describedRow?.body).toBe("Has text");

    const naRow = body.rows.find((r) => r.statusId === otherStatus.id);
    expect(naRow?.body).toBe("NA");

    await db.delete(statuses).where(eq(statuses.id, otherStatus.id));
  });
});
