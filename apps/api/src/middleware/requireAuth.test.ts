import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import express, { type Express } from "express";
import request from "supertest";
import { uuidv7 } from "uuidv7";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../db/client.js";
import { admins, sessions, users } from "../db/schema/index.js";
import { ACCESS_TOKEN_COOKIE_NAME } from "../lib/cookies.js";
import { readErrorBody } from "../lib/errorEnvelope.js";
import { signAccessToken } from "../lib/jwt.js";
import { errorHandler } from "./errorHandler.js";
import { requireAuth } from "./requireAuth.js";

function buildApp(): Express {
  const app = express();
  app.use((req, _res, next) => {
    // requireAuth reads req.cookies, which cookie-parser normally populates;
    // tests set it directly instead of pulling in the whole middleware.
    const header = req.headers.cookie ?? "";
    const parsed: Record<string, string> = {};
    for (const part of header.split(";")) {
      const [key, ...rest] = part.trim().split("=");
      if (key) {
        parsed[key] = decodeURIComponent(rest.join("="));
      }
    }
    req.cookies = parsed;
    next();
  });
  app.get("/protected", requireAuth, (req, res) => {
    res.json({ auth: req.auth });
  });
  app.use(errorHandler);
  return app;
}

const app = buildApp();

describe("requireAuth", () => {
  let adminId: string;
  let userId: string;
  const createdSessionIds: string[] = [];

  beforeAll(async () => {
    const [admin] = await db
      .insert(admins)
      .values({
        adminId: `test-admin-${randomUUID()}`,
        passwordHash: "unused-in-this-test",
        displayName: "Test Admin",
        mobileNumber: "9000000000",
      })
      .returning();
    if (!admin) throw new Error("failed to insert test admin");
    adminId = admin.id;

    const [user] = await db
      .insert(users)
      .values({
        userId: `test-user-${randomUUID()}`,
        passwordHash: "unused-in-this-test",
        displayName: "Test User",
        createdBy: adminId,
      })
      .returning();
    if (!user) throw new Error("failed to insert test user");
    userId = user.id;
  });

  afterAll(async () => {
    if (createdSessionIds.length > 0) {
      for (const id of createdSessionIds) {
        await db.delete(sessions).where(eq(sessions.id, id));
      }
    }
    await db.delete(users).where(eq(users.id, userId));
    await db.delete(admins).where(eq(admins.id, adminId));
  });

  async function createSession(options: { revoked?: boolean } = {}) {
    const sessionId = uuidv7();
    const now = new Date();
    await db.insert(sessions).values({
      id: sessionId,
      familyId: sessionId,
      userId,
      refreshTokenHash: `unused-${sessionId}`,
      lastUsedAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
      revokedAt: options.revoked ? now : undefined,
    });
    createdSessionIds.push(sessionId);
    return sessionId;
  }

  it("attaches req.auth for a valid token and an active session", async () => {
    const sessionId = await createSession();
    const token = await signAccessToken({ sub: userId, role: "user", sessionId });

    const res = await request(app)
      .get("/protected")
      .set("Cookie", `${ACCESS_TOKEN_COOKIE_NAME}=${token}`);

    expect(res.status).toBe(200);
    expect((res.body as { auth: unknown }).auth).toEqual({ sub: userId, role: "user", sessionId });
  });

  it("rejects a token whose session has been revoked", async () => {
    const sessionId = await createSession({ revoked: true });
    const token = await signAccessToken({ sub: userId, role: "user", sessionId });

    const res = await request(app)
      .get("/protected")
      .set("Cookie", `${ACCESS_TOKEN_COOKIE_NAME}=${token}`);

    expect(res.status).toBe(401);
  });

  it("rejects a cryptographically valid token for a now-inactive user", async () => {
    const sessionId = await createSession();
    const token = await signAccessToken({ sub: userId, role: "user", sessionId });

    await db.update(users).set({ isActive: false }).where(eq(users.id, userId));
    try {
      const res = await request(app)
        .get("/protected")
        .set("Cookie", `${ACCESS_TOKEN_COOKIE_NAME}=${token}`);

      expect(res.status).toBe(401);
      expect(readErrorBody(res.body).error.code).toBe("ACCOUNT_INACTIVE");
    } finally {
      await db.update(users).set({ isActive: true }).where(eq(users.id, userId));
    }
  });

  it("rejects a missing token", async () => {
    const res = await request(app).get("/protected");
    expect(res.status).toBe(401);
  });
});
