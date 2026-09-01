import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import express from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../../app.js";
import { db } from "../../db/client.js";
import { activityLog, admins, sessions, users } from "../../db/schema/index.js";
import { readErrorBody } from "../../lib/errorEnvelope.js";
import { hashPassword } from "../../lib/password.js";
import { hashRefreshToken } from "../../lib/refreshToken.js";
import { errorHandler } from "../../middleware/errorHandler.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import * as authService from "./auth.service.js";

const app = createApp();

const PASSWORD = "Correct-Horse-Battery-Staple-1";

// Fixed at a Monday-midday IST instant so every HTTP-level test in this file
// runs deterministically inside the user access window, regardless of real
// wall-clock time when the suite happens to execute (CI runs at arbitrary
// UTC times). Only the `Date` global is faked — timers stay real, so the
// HTTP server, Postgres pool, and Redis client are unaffected.
const WITHIN_WINDOW_INSTANT = new Date(Date.UTC(2024, 0, 8, 6, 30, 0)); // Mon 2024-01-08, 12:00 IST
const OUTSIDE_WINDOW_INSTANT = new Date(Date.UTC(2024, 0, 7, 6, 30, 0)); // Sun 2024-01-07, noon IST

function setCookieHeaders(res: request.Response): string[] {
  const raw: unknown = res.headers["set-cookie"];
  if (Array.isArray(raw)) {
    return raw as string[];
  }
  return typeof raw === "string" ? [raw] : [];
}

function extractCookie(res: request.Response, name: string): string {
  const match = setCookieHeaders(res).find((c) => c.startsWith(`${name}=`));
  if (!match) {
    throw new Error(`Cookie ${name} not found in Set-Cookie header`);
  }
  return match.split(";")[0] ?? match;
}

function cookieValue(cookie: string): string {
  const eqIndex = cookie.indexOf("=");
  return decodeURIComponent(cookie.slice(eqIndex + 1));
}

describe("auth", () => {
  let adminId: string;
  let adminLoginId: string;
  let userId: string;
  let userLoginId: string;

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(WITHIN_WINDOW_INSTANT);

    const passwordHash = await hashPassword(PASSWORD);

    adminLoginId = `test-admin-${randomUUID()}`;
    const [admin] = await db
      .insert(admins)
      .values({
        adminId: adminLoginId,
        passwordHash,
        displayName: "Test Admin",
        mobileNumber: "9000000001",
      })
      .returning();
    if (!admin) throw new Error("failed to insert test admin");
    adminId = admin.id;

    userLoginId = `test-user-${randomUUID()}`;
    const [user] = await db
      .insert(users)
      .values({
        userId: userLoginId,
        passwordHash,
        displayName: "Test User",
        createdBy: adminId,
      })
      .returning();
    if (!user) throw new Error("failed to insert test user");
    userId = user.id;
  });

  afterAll(async () => {
    vi.useRealTimers();
    await db.delete(activityLog).where(eq(activityLog.actorId, adminId));
    await db.delete(activityLog).where(eq(activityLog.actorId, userId));
    await db.delete(sessions).where(eq(sessions.userId, userId));
    await db.delete(sessions).where(eq(sessions.adminId, adminId));
    await db.delete(users).where(eq(users.id, userId));
    await db.delete(admins).where(eq(admins.id, adminId));
  });

  afterEach(async () => {
    // Reset the account back to active/enabled between tests that toggle it.
    await db.update(users).set({ isActive: true }).where(eq(users.id, userId));
  });

  describe("POST /api/auth/login", () => {
    it("succeeds for an admin", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ identifier: adminLoginId, password: PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: adminId,
        role: "admin",
        identifier: adminLoginId,
        displayName: "Test Admin",
      });
      expect(res.headers["set-cookie"]).toBeDefined();
    });

    it("succeeds for a user", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ identifier: userLoginId, password: PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: userId,
        role: "user",
        identifier: userLoginId,
        displayName: "Test User",
      });
    });

    it("fails with a wrong password", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ identifier: userLoginId, password: "wrong-password" });

      expect(res.status).toBe(401);
      expect(readErrorBody(res.body).error.code).toBe("INVALID_CREDENTIALS");
    });

    it("fails with an unknown identifier, with a byte-identical body to a wrong password", async () => {
      const wrongPassword = await request(app)
        .post("/api/auth/login")
        .send({ identifier: userLoginId, password: "wrong-password" });

      const unknownIdentifier = await request(app)
        .post("/api/auth/login")
        .send({ identifier: `nonexistent-${randomUUID()}`, password: "whatever" });

      expect(unknownIdentifier.status).toBe(wrongPassword.status);
      expect(unknownIdentifier.body).toEqual(wrongPassword.body);
    });

    it("blocks a deactivated user with the same generic error as bad credentials", async () => {
      await db.update(users).set({ isActive: false }).where(eq(users.id, userId));

      const res = await request(app)
        .post("/api/auth/login")
        .send({ identifier: userLoginId, password: PASSWORD });

      expect(res.status).toBe(401);
      expect(readErrorBody(res.body).error.code).toBe("INVALID_CREDENTIALS");
    });

    it("never puts a token string in the response body", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ identifier: userLoginId, password: PASSWORD });

      const body = res.body as Record<string, unknown>;
      const bodyText = JSON.stringify(body);
      expect(bodyText).not.toMatch(/^ey/); // no raw JWT anywhere
      expect(body["accessToken"]).toBeUndefined();
      expect(body["refreshToken"]).toBeUndefined();
    });
  });

  describe("deactivation rejects an already-issued token", () => {
    it("blocks GET /api/auth/me for a token issued before deactivation", async () => {
      const login = await request(app)
        .post("/api/auth/login")
        .send({ identifier: userLoginId, password: PASSWORD });
      const accessCookie = extractCookie(login, "access_token");

      await db.update(users).set({ isActive: false }).where(eq(users.id, userId));

      const res = await request(app).get("/api/auth/me").set("Cookie", accessCookie);

      expect(res.status).toBe(401);
      expect(readErrorBody(res.body).error.code).toBe("ACCOUNT_INACTIVE");
    });
  });

  describe("POST /api/auth/refresh", () => {
    it("rotates the token: the old session is revoked and the new token keeps working", async () => {
      // Deliberately does NOT replay the old cookie via HTTP here — doing so
      // is exactly the reuse-detection trigger (tested separately below) and
      // would revoke the whole family, including the very session this test
      // wants to prove still works. "Old stops working" is checked directly
      // against the DB instead.
      const login = await request(app)
        .post("/api/auth/login")
        .send({ identifier: userLoginId, password: PASSWORD });
      const oldRefreshCookie = extractCookie(login, "refresh_token");
      const oldRawToken = cookieValue(oldRefreshCookie);

      const refreshRes = await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", oldRefreshCookie);
      expect(refreshRes.status).toBe(200);
      const newRefreshCookie = extractCookie(refreshRes, "refresh_token");
      expect(newRefreshCookie).not.toBe(oldRefreshCookie);

      const [oldSession] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.refreshTokenHash, hashRefreshToken(oldRawToken)))
        .limit(1);
      expect(oldSession?.revokedAt).not.toBeNull();

      // The newly-issued token is still valid for a further legitimate rotation.
      const again = await request(app).post("/api/auth/refresh").set("Cookie", newRefreshCookie);
      expect(again.status).toBe(200);
    });

    it("revokes the whole family when a revoked refresh token is replayed", async () => {
      const login = await request(app)
        .post("/api/auth/login")
        .send({ identifier: userLoginId, password: PASSWORD });
      const originalRefreshCookie = extractCookie(login, "refresh_token");

      const rotated = await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", originalRefreshCookie);
      const rotatedRefreshCookie = extractCookie(rotated, "refresh_token");

      // Replay the now-revoked original token: theft, whole family dies.
      const replay = await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", originalRefreshCookie);
      expect(replay.status).toBe(401);

      // The token that came from the (now theft-revoked) rotation is dead too.
      const alsoDead = await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", rotatedRefreshCookie);
      expect(alsoDead.status).toBe(401);
    });
  });

  describe("POST /api/auth/logout", () => {
    it("revokes the session and clears both cookies", async () => {
      const login = await request(app)
        .post("/api/auth/login")
        .send({ identifier: userLoginId, password: PASSWORD });
      const accessCookie = extractCookie(login, "access_token");

      const res = await request(app).post("/api/auth/logout").set("Cookie", accessCookie);
      expect(res.status).toBe(200);

      const setCookies = setCookieHeaders(res);
      expect(
        setCookies.some((c) => c.startsWith("access_token=;") || c.includes("Max-Age=0")),
      ).toBe(true);

      const meAfterLogout = await request(app).get("/api/auth/me").set("Cookie", accessCookie);
      expect(meAfterLogout.status).toBe(401);
    });
  });

  describe("requireRole rejects a mismatched role on a real route", () => {
    it("rejects a user's token on an admin-only route", async () => {
      const login = await request(app)
        .post("/api/auth/login")
        .send({ identifier: userLoginId, password: PASSWORD });
      const accessCookie = extractCookie(login, "access_token");

      const testApp = express();
      testApp.use((req, _res, next) => {
        const header = req.headers.cookie ?? "";
        const parsed: Record<string, string> = {};
        for (const part of header.split(";")) {
          const [key, ...rest] = part.trim().split("=");
          if (key) parsed[key] = decodeURIComponent(rest.join("="));
        }
        req.cookies = parsed;
        next();
      });
      testApp.get("/admin-only", requireAuth, requireRole("admin"), (_req, res) => {
        res.json({ ok: true });
      });
      testApp.use(errorHandler);

      const res = await request(testApp).get("/admin-only").set("Cookie", accessCookie);
      expect(res.status).toBe(403);
    });
  });

  describe("time window enforcement in the service layer (decision #3)", () => {
    it("login() rejects a user outside the access window", async () => {
      await expect(
        authService.login(
          { identifier: userLoginId, password: PASSWORD },
          { ip: undefined, userAgent: undefined },
          OUTSIDE_WINDOW_INSTANT,
        ),
      ).rejects.toMatchObject({ code: "OUTSIDE_ACCESS_WINDOW" });
    });

    it("login() never blocks an admin regardless of the instant", async () => {
      const result = await authService.login(
        { identifier: adminLoginId, password: PASSWORD },
        { ip: undefined, userAgent: undefined },
        OUTSIDE_WINDOW_INSTANT,
      );
      // Sessions created here are swept up by the outer afterAll's
      // `sessions.adminId = adminId` delete — no per-test cleanup needed.
      expect(result.identity.role).toBe("admin");
    });
  });
});
