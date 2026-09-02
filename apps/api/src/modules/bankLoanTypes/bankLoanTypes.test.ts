import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { db } from "../../db/client.js";
import {
  auditLog,
  bankLoanTypes,
  banks,
  descriptions,
  loanTypes,
  statuses,
} from "../../db/schema/index.js";
import { createTestAdmin, deleteTestAdmin, loginAs, type TestAdmin } from "../../lib/testAuth.js";

const app = createApp();

describe("bank-loan-type wiring admin API", () => {
  let admin: TestAdmin;
  let cookie: string;
  let bankId: string;
  let loanTypeId: string;

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
    if (!bank || !loanType) throw new Error("fixture insert failed");
    bankId = bank.id;
    loanTypeId = loanType.id;
  });

  afterAll(async () => {
    await db
      .delete(bankLoanTypes)
      .where(and(eq(bankLoanTypes.bankId, bankId), eq(bankLoanTypes.loanTypeId, loanTypeId)));
    await db.delete(auditLog).where(eq(auditLog.actorId, admin.id));
    await db.delete(banks).where(eq(banks.id, bankId));
    await db.delete(loanTypes).where(eq(loanTypes.id, loanTypeId));
    await deleteTestAdmin(admin.id);
  });

  it("attaches, rejects a duplicate attach with 409, then detaches", async () => {
    const attach = await request(app)
      .post(`/api/admin/banks/${bankId}/loan-types/${loanTypeId}`)
      .set("Cookie", cookie);
    expect(attach.status).toBe(201);

    const duplicate = await request(app)
      .post(`/api/admin/banks/${bankId}/loan-types/${loanTypeId}`)
      .set("Cookie", cookie);
    expect(duplicate.status).toBe(409);
    expect((duplicate.body as { error: { code: string } }).error.code).toBe("ALREADY_ATTACHED");

    // Two audit rows per attach — one keyed by bankId, one by loanTypeId.
    const bankAudits = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, bankId), eq(auditLog.action, "attach")));
    const loanTypeAudits = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, loanTypeId), eq(auditLog.action, "attach")));
    expect(bankAudits.length).toBeGreaterThanOrEqual(1);
    expect(loanTypeAudits.length).toBeGreaterThanOrEqual(1);

    const detach = await request(app)
      .delete(`/api/admin/banks/${bankId}/loan-types/${loanTypeId}`)
      .set("Cookie", cookie);
    expect(detach.status).toBe(200);
  });

  it("blocks detach with 409 while live descriptions exist for the pair, then succeeds once removed", async () => {
    await request(app)
      .post(`/api/admin/banks/${bankId}/loan-types/${loanTypeId}`)
      .set("Cookie", cookie);

    const [status] = await db
      .insert(statuses)
      .values({ name: `Test Status ${randomUUID()}`, sortOrder: 1 })
      .returning();
    if (!status) throw new Error("fixture insert failed");

    await db.insert(descriptions).values({
      bankId,
      loanTypeId,
      statusId: status.id,
      updatedBy: admin.id,
    });

    const blocked = await request(app)
      .delete(`/api/admin/banks/${bankId}/loan-types/${loanTypeId}`)
      .set("Cookie", cookie);
    expect(blocked.status).toBe(409);
    expect((blocked.body as { error: { code: string } }).error.code).toBe(
      "HAS_DEPENDENT_DESCRIPTIONS",
    );

    await db
      .delete(descriptions)
      .where(and(eq(descriptions.bankId, bankId), eq(descriptions.loanTypeId, loanTypeId)));

    const succeeds = await request(app)
      .delete(`/api/admin/banks/${bankId}/loan-types/${loanTypeId}`)
      .set("Cookie", cookie);
    expect(succeeds.status).toBe(200);

    await db.delete(statuses).where(eq(statuses.id, status.id));
  });

  it("lists only active, attached loan types for a bank — excluding unattached and soft-deleted ones — and 404s for a missing bank", async () => {
    const [unattached] = await db
      .insert(loanTypes)
      .values({ name: `Unattached Loan Type ${randomUUID()}` })
      .returning();
    const [deletedButAttached] = await db
      .insert(loanTypes)
      .values({ name: `Deleted Loan Type ${randomUUID()}` })
      .returning();
    if (!unattached || !deletedButAttached) throw new Error("fixture insert failed");

    await request(app)
      .post(`/api/admin/banks/${bankId}/loan-types/${loanTypeId}`)
      .set("Cookie", cookie);
    await db.insert(bankLoanTypes).values({ bankId, loanTypeId: deletedButAttached.id });
    await db
      .update(loanTypes)
      .set({ deletedAt: new Date() })
      .where(eq(loanTypes.id, deletedButAttached.id));

    try {
      const res = await request(app)
        .get(`/api/admin/banks/${bankId}/loan-types`)
        .set("Cookie", cookie);
      expect(res.status).toBe(200);
      const ids = (res.body as { id: string }[]).map((row) => row.id);
      expect(ids).toContain(loanTypeId);
      expect(ids).not.toContain(unattached.id);
      expect(ids).not.toContain(deletedButAttached.id);

      const missingBank = await request(app)
        .get(`/api/admin/banks/${randomUUID()}/loan-types`)
        .set("Cookie", cookie);
      expect(missingBank.status).toBe(404);
    } finally {
      await db
        .delete(bankLoanTypes)
        .where(
          and(
            eq(bankLoanTypes.bankId, bankId),
            eq(bankLoanTypes.loanTypeId, deletedButAttached.id),
          ),
        );
      await db.delete(loanTypes).where(eq(loanTypes.id, unattached.id));
      await db.delete(loanTypes).where(eq(loanTypes.id, deletedButAttached.id));
    }
  });
});
