import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { db } from "../../db/client.js";
import { auditLog, banks, descriptions, loanTypes, statuses } from "../../db/schema/index.js";
import { createTestAdmin, deleteTestAdmin, loginAs, type TestAdmin } from "../../lib/testAuth.js";

const app = createApp();

describe("statuses admin API", () => {
  let admin: TestAdmin;
  let cookie: string;
  const createdIds: string[] = [];

  beforeAll(async () => {
    admin = await createTestAdmin();
    cookie = await loginAs(app, admin.adminId);
  });

  afterAll(async () => {
    for (const id of createdIds) {
      await db.delete(descriptions).where(eq(descriptions.statusId, id));
      await db.delete(auditLog).where(eq(auditLog.entityId, id));
      await db.delete(statuses).where(eq(statuses.id, id));
    }
    await db.delete(auditLog).where(eq(auditLog.actorId, admin.id));
    await deleteTestAdmin(admin.id);
  });

  async function createStatus(name: string, sortOrder = 1) {
    const res = await request(app)
      .post("/api/admin/statuses")
      .set("Cookie", cookie)
      .send({ name, sortOrder });
    expect(res.status).toBe(201);
    createdIds.push((res.body as { id: string }).id);
    return res.body as { id: string; name: string; sortOrder: number; deletedAt: string | null };
  }

  it("creates a status and writes an audit_log row", async () => {
    const status = await createStatus(`Test Status ${randomUUID()}`, 5);
    expect(status.sortOrder).toBe(5);
    expect(status.deletedAt).toBeNull();

    const [audit] = await db.select().from(auditLog).where(eq(auditLog.entityId, status.id));
    expect(audit?.action).toBe("create");
    expect(audit?.entityType).toBe("statuses");
  });

  it("lists statuses, excluding soft-deleted by default", async () => {
    const status = await createStatus(`Test Status ${randomUUID()}`);
    await request(app).delete(`/api/admin/statuses/${status.id}`).set("Cookie", cookie);

    const defaultList = await request(app).get("/api/admin/statuses").set("Cookie", cookie);
    expect((defaultList.body as { id: string }[]).some((s) => s.id === status.id)).toBe(false);

    const withDeleted = await request(app)
      .get("/api/admin/statuses?includeDeleted=true")
      .set("Cookie", cookie);
    expect((withDeleted.body as { id: string }[]).some((s) => s.id === status.id)).toBe(true);
  });

  it("partially updates a status (name and/or sortOrder)", async () => {
    const status = await createStatus(`Test Status ${randomUUID()}`, 1);

    const sortOnly = await request(app)
      .patch(`/api/admin/statuses/${status.id}`)
      .set("Cookie", cookie)
      .send({ sortOrder: 9 });
    expect(sortOnly.status).toBe(200);
    expect((sortOnly.body as { sortOrder: number; name: string }).sortOrder).toBe(9);
    expect((sortOnly.body as { name: string }).name).toBe(status.name);
  });

  it("soft-deletes and undeletes a status", async () => {
    const status = await createStatus(`Test Status ${randomUUID()}`);

    const deleteRes = await request(app)
      .delete(`/api/admin/statuses/${status.id}`)
      .set("Cookie", cookie);
    expect(deleteRes.status).toBe(200);
    expect((deleteRes.body as { deletedAt: string | null }).deletedAt).not.toBeNull();

    const undeleteRes = await request(app)
      .post(`/api/admin/statuses/${status.id}/undelete`)
      .set("Cookie", cookie);
    expect(undeleteRes.status).toBe(200);
    expect((undeleteRes.body as { deletedAt: string | null }).deletedAt).toBeNull();
  });

  it("blocks soft-delete with 409 while live descriptions exist, then succeeds once they're removed", async () => {
    const status = await createStatus(`Test Status ${randomUUID()}`);

    const [bank] = await db
      .insert(banks)
      .values({ name: `Test Bank ${randomUUID()}` })
      .returning();
    const [loanType] = await db
      .insert(loanTypes)
      .values({ name: `Test Loan Type ${randomUUID()}` })
      .returning();
    if (!bank || !loanType) throw new Error("fixture insert failed");

    await db.insert(descriptions).values({
      bankId: bank.id,
      loanTypeId: loanType.id,
      statusId: status.id,
      updatedBy: admin.id,
    });

    const blocked = await request(app)
      .delete(`/api/admin/statuses/${status.id}`)
      .set("Cookie", cookie);
    expect(blocked.status).toBe(409);
    expect((blocked.body as { error: { code: string } }).error.code).toBe(
      "HAS_DEPENDENT_DESCRIPTIONS",
    );

    await db.delete(descriptions).where(eq(descriptions.statusId, status.id));

    const succeeds = await request(app)
      .delete(`/api/admin/statuses/${status.id}`)
      .set("Cookie", cookie);
    expect(succeeds.status).toBe(200);

    await db.delete(banks).where(eq(banks.id, bank.id));
    await db.delete(loanTypes).where(eq(loanTypes.id, loanType.id));
  });
});
