import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { db } from "../../db/client.js";
import { auditLog, banks, descriptions, loanTypes, statuses } from "../../db/schema/index.js";
import { createTestAdmin, deleteTestAdmin, loginAs, type TestAdmin } from "../../lib/testAuth.js";

const app = createApp();

describe("banks admin API", () => {
  let admin: TestAdmin;
  let cookie: string;
  const createdBankIds: string[] = [];

  beforeAll(async () => {
    admin = await createTestAdmin();
    cookie = await loginAs(app, admin.adminId);
  });

  afterAll(async () => {
    for (const id of createdBankIds) {
      await db.delete(descriptions).where(eq(descriptions.bankId, id));
      await db.delete(auditLog).where(eq(auditLog.entityId, id));
      await db.delete(banks).where(eq(banks.id, id));
    }
    await db.delete(auditLog).where(eq(auditLog.actorId, admin.id));
    await deleteTestAdmin(admin.id);
  });

  async function createBank(name: string) {
    const res = await request(app).post("/api/admin/banks").set("Cookie", cookie).send({ name });
    expect(res.status).toBe(201);
    createdBankIds.push((res.body as { id: string }).id);
    return res.body as { id: string; name: string; deletedAt: string | null };
  }

  it("creates a bank and writes an audit_log row", async () => {
    const bank = await createBank(`Test Bank ${randomUUID()}`);
    expect(bank.deletedAt).toBeNull();

    const [audit] = await db.select().from(auditLog).where(eq(auditLog.entityId, bank.id));
    expect(audit?.action).toBe("create");
    expect(audit?.entityType).toBe("banks");
    expect(audit?.actorId).toBe(admin.id);
  });

  it("lists banks, excluding soft-deleted by default", async () => {
    const bank = await createBank(`Test Bank ${randomUUID()}`);
    await request(app).delete(`/api/admin/banks/${bank.id}`).set("Cookie", cookie);

    const defaultList = await request(app).get("/api/admin/banks").set("Cookie", cookie);
    expect((defaultList.body as { id: string }[]).some((b) => b.id === bank.id)).toBe(false);

    const withDeleted = await request(app)
      .get("/api/admin/banks?includeDeleted=true")
      .set("Cookie", cookie);
    expect((withDeleted.body as { id: string }[]).some((b) => b.id === bank.id)).toBe(true);
  });

  it("updates a bank", async () => {
    const bank = await createBank(`Test Bank ${randomUUID()}`);
    const newName = `Renamed ${randomUUID()}`;

    const res = await request(app)
      .patch(`/api/admin/banks/${bank.id}`)
      .set("Cookie", cookie)
      .send({ name: newName });

    expect(res.status).toBe(200);
    expect((res.body as { name: string }).name).toBe(newName);
  });

  it("soft-deletes and undeletes a bank", async () => {
    const bank = await createBank(`Test Bank ${randomUUID()}`);

    const deleteRes = await request(app)
      .delete(`/api/admin/banks/${bank.id}`)
      .set("Cookie", cookie);
    expect(deleteRes.status).toBe(200);
    expect((deleteRes.body as { deletedAt: string | null }).deletedAt).not.toBeNull();

    const undeleteRes = await request(app)
      .post(`/api/admin/banks/${bank.id}/undelete`)
      .set("Cookie", cookie);
    expect(undeleteRes.status).toBe(200);
    expect((undeleteRes.body as { deletedAt: string | null }).deletedAt).toBeNull();
  });

  it("blocks soft-delete with 409 while live descriptions exist, then succeeds once they're removed", async () => {
    const bank = await createBank(`Test Bank ${randomUUID()}`);

    const [loanType] = await db
      .insert(loanTypes)
      .values({ name: `Test Loan Type ${randomUUID()}` })
      .returning();
    const [status] = await db
      .insert(statuses)
      .values({ name: `Test Status ${randomUUID()}`, sortOrder: 1 })
      .returning();
    if (!loanType || !status) throw new Error("fixture insert failed");

    await db.insert(descriptions).values({
      bankId: bank.id,
      loanTypeId: loanType.id,
      statusId: status.id,
      updatedBy: admin.id,
    });

    const blocked = await request(app).delete(`/api/admin/banks/${bank.id}`).set("Cookie", cookie);
    expect(blocked.status).toBe(409);
    expect((blocked.body as { error: { code: string } }).error.code).toBe(
      "HAS_DEPENDENT_DESCRIPTIONS",
    );

    await db.delete(descriptions).where(eq(descriptions.bankId, bank.id));

    const succeeds = await request(app).delete(`/api/admin/banks/${bank.id}`).set("Cookie", cookie);
    expect(succeeds.status).toBe(200);

    await db.delete(loanTypes).where(eq(loanTypes.id, loanType.id));
    await db.delete(statuses).where(eq(statuses.id, status.id));
  });
});
