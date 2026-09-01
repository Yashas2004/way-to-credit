import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../../app.js";
import { db } from "../../db/client.js";
import { activityLog, admins, sessions } from "../../db/schema/index.js";
import { readErrorBody } from "../../lib/errorEnvelope.js";
import { hashPassword } from "../../lib/password.js";
import { WITHIN_WINDOW_INSTANT } from "../../lib/testAuth.js";

const app = createApp();
const PASSWORD = "Original-Password-1";

function setCookieHeaders(res: request.Response): string[] {
  const raw: unknown = res.headers["set-cookie"];
  if (Array.isArray(raw)) return raw as string[];
  return typeof raw === "string" ? [raw] : [];
}
function extractCookie(res: request.Response, name: string): string {
  const match = setCookieHeaders(res).find((c) => c.startsWith(`${name}=`));
  if (!match) throw new Error(`Cookie ${name} not found in Set-Cookie header`);
  return match.split(";")[0] ?? match;
}

describe("admin self password change", () => {
  let adminId: string;
  let adminLoginId: string;

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(WITHIN_WINDOW_INSTANT);

    adminLoginId = `test-admin-${randomUUID()}`;
    const [admin] = await db
      .insert(admins)
      .values({
        adminId: adminLoginId,
        passwordHash: await hashPassword(PASSWORD),
        displayName: "Password Change Test Admin",
        mobileNumber: "9000000002",
      })
      .returning();
    if (!admin) throw new Error("failed to insert test admin");
    adminId = admin.id;
  });

  afterAll(async () => {
    vi.useRealTimers();
    await db.delete(activityLog).where(eq(activityLog.actorId, adminId));
    await db.delete(sessions).where(eq(sessions.adminId, adminId));
    await db.delete(admins).where(eq(admins.id, adminId));
  });

  it("keeps the current session alive but kills every other session for this admin", async () => {
    const login1 = await request(app)
      .post("/api/auth/login")
      .send({ identifier: adminLoginId, password: PASSWORD });
    const cookie1 = extractCookie(login1, "access_token");

    const login2 = await request(app)
      .post("/api/auth/login")
      .send({ identifier: adminLoginId, password: PASSWORD });
    const cookie2 = extractCookie(login2, "access_token");

    const newPassword = "Rotated-Password-1";
    const change = await request(app)
      .post("/api/admin/me/password")
      .set("Cookie", cookie1)
      .send({ currentPassword: PASSWORD, newPassword });
    expect(change.status).toBe(200);

    // Session 1 (the one that made the request) is still alive.
    const stillWorks = await request(app).get("/api/auth/me").set("Cookie", cookie1);
    expect(stillWorks.status).toBe(200);

    // Session 2 is dead — requireAuth re-checks revokedAt from the DB on
    // every request, so this fails even though the JWT itself hasn't expired.
    const nowDead = await request(app).get("/api/auth/me").set("Cookie", cookie2);
    expect(nowDead.status).toBe(401);

    // The new password actually works for a fresh login.
    const reLogin = await request(app)
      .post("/api/auth/login")
      .send({ identifier: adminLoginId, password: newPassword });
    expect(reLogin.status).toBe(200);

    // The old password no longer works.
    const oldPasswordFails = await request(app)
      .post("/api/auth/login")
      .send({ identifier: adminLoginId, password: PASSWORD });
    expect(oldPasswordFails.status).toBe(401);
  });

  it("rejects the wrong current password and leaves the password unchanged", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ identifier: adminLoginId, password: "Rotated-Password-1" });
    const cookie = extractCookie(login, "access_token");

    const res = await request(app)
      .post("/api/admin/me/password")
      .set("Cookie", cookie)
      .send({ currentPassword: "totally-wrong", newPassword: "Another-New-Password-1" });
    expect(res.status).toBe(401);
    expect(readErrorBody(res.body).error.code).toBe("INVALID_CREDENTIALS");

    // The current session is still fine — only the wrong-password attempt failed.
    const stillWorks = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expect(stillWorks.status).toBe(200);
  });

  it("rejects a new password shorter than 8 characters", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ identifier: adminLoginId, password: "Rotated-Password-1" });
    const cookie = extractCookie(login, "access_token");

    const res = await request(app)
      .post("/api/admin/me/password")
      .set("Cookie", cookie)
      .send({ currentPassword: "Rotated-Password-1", newPassword: "short" });
    expect(res.status).toBe(400);
  });
});
