import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../../app.js";
import { db } from "../../db/client.js";
import { auditLog, sessions, users } from "../../db/schema/index.js";
import {
  createTestAdmin,
  deleteTestAdmin,
  loginAs,
  TEST_PASSWORD,
  type TestAdmin,
  WITHIN_WINDOW_INSTANT,
} from "../../lib/testAuth.js";

const app = createApp();

describe("users admin API", () => {
  let admin: TestAdmin;
  let cookie: string;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(WITHIN_WINDOW_INSTANT);

    admin = await createTestAdmin();
    cookie = await loginAs(app, admin.adminId);
  });

  afterAll(async () => {
    vi.useRealTimers();
    for (const id of createdUserIds) {
      await db.delete(sessions).where(eq(sessions.userId, id));
      await db.delete(auditLog).where(eq(auditLog.entityId, id));
      await db.delete(users).where(eq(users.id, id));
    }
    await db.delete(auditLog).where(eq(auditLog.actorId, admin.id));
    await deleteTestAdmin(admin.id);
  });

  async function createUser(userId: string) {
    const res = await request(app)
      .post("/api/admin/users")
      .set("Cookie", cookie)
      .send({ userId, displayName: "Test User", password: TEST_PASSWORD });
    expect(res.status).toBe(201);
    createdUserIds.push((res.body as { id: string }).id);
    return res.body as { id: string; userId: string; isActive: boolean };
  }

  it("creates a user, never returns a password hash, and rejects a duplicate userId with 409", async () => {
    const userId = `test-user-${randomUUID()}`;
    const user = await createUser(userId);

    expect(user.isActive).toBe(true);
    expect(JSON.stringify(user)).not.toMatch(/passwordHash/i);
    expect(JSON.stringify(user)).not.toContain("$argon2id$");

    const duplicate = await request(app)
      .post("/api/admin/users")
      .set("Cookie", cookie)
      .send({ userId, displayName: "Another Name", password: TEST_PASSWORD });
    expect(duplicate.status).toBe(409);
  });

  it("lists users with credit_points, is_active, last_seen_at, never a password hash", async () => {
    await createUser(`test-user-${randomUUID()}`);

    const res = await request(app).get("/api/admin/users").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/i);

    const first = (
      res.body as { creditPoints: number; isActive: boolean; lastSeenAt: unknown }[]
    )[0];
    expect(first).toHaveProperty("creditPoints");
    expect(first).toHaveProperty("isActive");
    expect(first).toHaveProperty("lastSeenAt");
  });

  it("deactivating a user revokes their sessions, and their existing access token stops working", async () => {
    const userId = `test-user-${randomUUID()}`;
    const user = await createUser(userId);

    const userCookie = await loginAs(app, userId);
    const meBefore = await request(app).get("/api/auth/me").set("Cookie", userCookie);
    expect(meBefore.status).toBe(200);

    const deactivate = await request(app)
      .post(`/api/admin/users/${user.id}/deactivate`)
      .set("Cookie", cookie);
    expect(deactivate.status).toBe(200);
    expect((deactivate.body as { isActive: boolean }).isActive).toBe(false);

    const meAfter = await request(app).get("/api/auth/me").set("Cookie", userCookie);
    expect(meAfter.status).toBe(401);

    const [session] = await db.select().from(sessions).where(eq(sessions.userId, user.id));
    expect(session?.revokedAt).not.toBeNull();
  });

  it("reactivates a user", async () => {
    const userId = `test-user-${randomUUID()}`;
    const user = await createUser(userId);

    await request(app).post(`/api/admin/users/${user.id}/deactivate`).set("Cookie", cookie);
    const res = await request(app)
      .post(`/api/admin/users/${user.id}/reactivate`)
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect((res.body as { isActive: boolean }).isActive).toBe(true);
  });

  it("resets a user's password, with no password material in the audit entry", async () => {
    const userId = `test-user-${randomUUID()}`;
    const user = await createUser(userId);

    const res = await request(app)
      .post(`/api/admin/users/${user.id}/reset-password`)
      .set("Cookie", cookie)
      .send({ password: "A-New-Password-456!" });
    expect(res.status).toBe(200);

    const loginWithNewPassword = await request(app)
      .post("/api/auth/login")
      .send({ identifier: userId, password: "A-New-Password-456!" });
    expect(loginWithNewPassword.status).toBe(200);

    const audits = await db.select().from(auditLog).where(eq(auditLog.entityId, user.id));
    const resetAudit = audits.find((a) => a.action === "password_reset");
    expect(resetAudit).toBeDefined();
    expect(JSON.stringify(resetAudit)).not.toMatch(/passwordHash/i);
    expect(JSON.stringify(resetAudit)).not.toContain("$argon2id$");
    expect(JSON.stringify(resetAudit)).not.toContain("A-New-Password-456!");
  });
});
