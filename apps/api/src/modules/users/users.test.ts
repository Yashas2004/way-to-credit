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
      await db.delete(users).where(eq(users.id, id));
    }
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

  describe("archiving", () => {
    interface UserBody {
      id: string;
      isActive: boolean;
      archivedAt: string | null;
    }
    const list = async (archived?: string) =>
      (
        await request(app)
          .get(`/api/admin/users${archived ? `?archived=${archived}` : ""}`)
          .set("Cookie", cookie)
      ).body as UserBody[];

    it("hides archived users by default and shows them under the filter", async () => {
      const user = await createUser(`test-user-${randomUUID()}`);
      const archived = await request(app)
        .post(`/api/admin/users/${user.id}/archive`)
        .set("Cookie", cookie);
      expect(archived.status).toBe(200);
      expect((archived.body as UserBody).archivedAt).not.toBeNull();
      expect((archived.body as UserBody).isActive).toBe(false); // archiving implies deactivation

      expect((await list()).some((u) => u.id === user.id)).toBe(false);
      expect((await list("include")).some((u) => u.id === user.id)).toBe(true);
      const only = await list("only");
      expect(only.some((u) => u.id === user.id)).toBe(true);
      expect(only.every((u) => u.archivedAt !== null)).toBe(true);

      expect(
        (await request(app).get("/api/admin/users?archived=bogus").set("Cookie", cookie)).status,
      ).toBe(400);
    });

    it("an archived user is signed out and cannot sign in or refresh", async () => {
      const userId = `test-user-${randomUUID()}`;
      const user = await createUser(userId);
      const login = await request(app)
        .post("/api/auth/login")
        .send({ identifier: userId, password: TEST_PASSWORD });
      expect(login.status).toBe(200);
      const cookies = ([] as string[])
        .concat(login.headers["set-cookie"] ?? [])
        .map((c) => c.split(";")[0])
        .join("; ");

      await request(app).post(`/api/admin/users/${user.id}/archive`).set("Cookie", cookie);

      expect((await request(app).get("/api/auth/me").set("Cookie", cookies)).status).toBe(401);
      expect((await request(app).post("/api/auth/refresh").set("Cookie", cookies)).status).toBe(
        401,
      );
      const again = await request(app)
        .post("/api/auth/login")
        .send({ identifier: userId, password: TEST_PASSWORD });
      expect(again.status).toBe(401);
    });

    it("unarchiving leaves the user deactivated; reactivating an archived user is refused", async () => {
      const user = await createUser(`test-user-${randomUUID()}`);
      await request(app).post(`/api/admin/users/${user.id}/archive`).set("Cookie", cookie);

      const refused = await request(app)
        .post(`/api/admin/users/${user.id}/reactivate`)
        .set("Cookie", cookie);
      expect(refused.status).toBe(409);

      const unarchived = await request(app)
        .post(`/api/admin/users/${user.id}/unarchive`)
        .set("Cookie", cookie);
      expect(unarchived.status).toBe(200);
      expect((unarchived.body as UserBody).archivedAt).toBeNull();
      expect((unarchived.body as UserBody).isActive).toBe(false); // access never comes back silently

      const reactivated = await request(app)
        .post(`/api/admin/users/${user.id}/reactivate`)
        .set("Cookie", cookie);
      expect(reactivated.status).toBe(200);
      expect((reactivated.body as UserBody).isActive).toBe(true);
    });

    it("writes an audit row for archive and unarchive, and repeating either is a no-op", async () => {
      const user = await createUser(`test-user-${randomUUID()}`);
      await request(app).post(`/api/admin/users/${user.id}/archive`).set("Cookie", cookie);
      await request(app).post(`/api/admin/users/${user.id}/archive`).set("Cookie", cookie);
      await request(app).post(`/api/admin/users/${user.id}/unarchive`).set("Cookie", cookie);
      await request(app).post(`/api/admin/users/${user.id}/unarchive`).set("Cookie", cookie);
      const actions = (await db.select().from(auditLog).where(eq(auditLog.entityId, user.id)))
        .map((a) => a.action)
        .filter((a) => a === "archive" || a === "unarchive")
        .sort();
      expect(actions).toEqual(["archive", "unarchive"]);
    });

    it("the database refuses an archived user who is active", async () => {
      const user = await createUser(`test-user-${randomUUID()}`);
      await expect(
        db
          .update(users)
          .set({ archivedAt: new Date(), isActive: true })
          .where(eq(users.id, user.id)),
      ).rejects.toThrow();
    });

    it("archived users are not counted on the dashboard", async () => {
      const stats = async () =>
        (await request(app).get("/api/admin/stats").set("Cookie", cookie)).body as {
          totalUsers: number;
        };
      const user = await createUser(`test-user-${randomUUID()}`);
      const before = (await stats()).totalUsers;
      await request(app).post(`/api/admin/users/${user.id}/archive`).set("Cookie", cookie);
      expect((await stats()).totalUsers).toBe(before - 1);
    });
  });
});
