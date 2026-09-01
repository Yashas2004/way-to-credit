import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { db } from "../../db/client.js";
import { auditLog, banks, descriptions, loanTypes, statuses } from "../../db/schema/index.js";
import { createTestAdmin, deleteTestAdmin, loginAs, type TestAdmin } from "../../lib/testAuth.js";

const app = createApp();

describe("loan types admin API", () => {
  let admin: TestAdmin;
  let cookie: string;
  const createdIds: string[] = [];

  beforeAll(async () => {
    admin = await createTestAdmin();
    cookie = await loginAs(app, admin.adminId);
  });

  afterAll(async () => {
    for (const id of createdIds) {
      await db.delete(descriptions).where(eq(descriptions.loanTypeId, id));
      await db.delete(auditLog).where(eq(auditLog.entityId, id));
      await db.delete(loanTypes).where(eq(loanTypes.id, id));
    }
    await db.delete(auditLog).where(eq(auditLog.actorId, admin.id));
    await deleteTestAdmin(admin.id);
  });

  async function createLoanType(name: string) {
    const res = await request(app)
      .post("/api/admin/loan-types")
      .set("Cookie", cookie)
      .send({ name });
    expect(res.status).toBe(201);
    createdIds.push((res.body as { id: string }).id);
    return res.body as { id: string; name: string; deletedAt: string | null };
  }

  it("creates a loan type and writes an audit_log row", async () => {
    const loanType = await createLoanType(`Test Loan Type ${randomUUID()}`);
    expect(loanType.deletedAt).toBeNull();

    const [audit] = await db.select().from(auditLog).where(eq(auditLog.entityId, loanType.id));
    expect(audit?.action).toBe("create");
    expect(audit?.entityType).toBe("loan_types");
  });

  it("lists loan types, excluding soft-deleted by default", async () => {
    const loanType = await createLoanType(`Test Loan Type ${randomUUID()}`);
    await request(app).delete(`/api/admin/loan-types/${loanType.id}`).set("Cookie", cookie);

    const defaultList = await request(app).get("/api/admin/loan-types").set("Cookie", cookie);
    expect((defaultList.body as { id: string }[]).some((lt) => lt.id === loanType.id)).toBe(false);

    const withDeleted = await request(app)
      .get("/api/admin/loan-types?includeDeleted=true")
      .set("Cookie", cookie);
    expect((withDeleted.body as { id: string }[]).some((lt) => lt.id === loanType.id)).toBe(true);
  });

  it("updates a loan type", async () => {
    const loanType = await createLoanType(`Test Loan Type ${randomUUID()}`);
    const newName = `Renamed ${randomUUID()}`;

    const res = await request(app)
      .patch(`/api/admin/loan-types/${loanType.id}`)
      .set("Cookie", cookie)
      .send({ name: newName });

    expect(res.status).toBe(200);
    expect((res.body as { name: string }).name).toBe(newName);
  });

  it("soft-deletes and undeletes a loan type", async () => {
    const loanType = await createLoanType(`Test Loan Type ${randomUUID()}`);

    const deleteRes = await request(app)
      .delete(`/api/admin/loan-types/${loanType.id}`)
      .set("Cookie", cookie);
    expect(deleteRes.status).toBe(200);
    expect((deleteRes.body as { deletedAt: string | null }).deletedAt).not.toBeNull();

    const undeleteRes = await request(app)
      .post(`/api/admin/loan-types/${loanType.id}/undelete`)
      .set("Cookie", cookie);
    expect(undeleteRes.status).toBe(200);
    expect((undeleteRes.body as { deletedAt: string | null }).deletedAt).toBeNull();
  });

  it("blocks soft-delete with 409 while live descriptions exist, then succeeds once they're removed", async () => {
    const loanType = await createLoanType(`Test Loan Type ${randomUUID()}`);

    const [bank] = await db
      .insert(banks)
      .values({ name: `Test Bank ${randomUUID()}` })
      .returning();
    const [status] = await db
      .insert(statuses)
      .values({ name: `Test Status ${randomUUID()}`, sortOrder: 1 })
      .returning();
    if (!bank || !status) throw new Error("fixture insert failed");

    await db.insert(descriptions).values({
      bankId: bank.id,
      loanTypeId: loanType.id,
      statusId: status.id,
      updatedBy: admin.id,
    });

    const blocked = await request(app)
      .delete(`/api/admin/loan-types/${loanType.id}`)
      .set("Cookie", cookie);
    expect(blocked.status).toBe(409);
    expect((blocked.body as { error: { code: string } }).error.code).toBe(
      "HAS_DEPENDENT_DESCRIPTIONS",
    );

    await db.delete(descriptions).where(eq(descriptions.loanTypeId, loanType.id));

    const succeeds = await request(app)
      .delete(`/api/admin/loan-types/${loanType.id}`)
      .set("Cookie", cookie);
    expect(succeeds.status).toBe(200);

    await db.delete(banks).where(eq(banks.id, bank.id));
    await db.delete(statuses).where(eq(statuses.id, status.id));
  });
});
