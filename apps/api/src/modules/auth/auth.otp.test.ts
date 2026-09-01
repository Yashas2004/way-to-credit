import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../../app.js";
import { db } from "../../db/client.js";
import { activityLog, admins, sessions } from "../../db/schema/index.js";
import { readErrorBody } from "../../lib/errorEnvelope.js";
import { hashPassword } from "../../lib/password.js";
import { redis } from "../../lib/redis.js";
import { smsProvider } from "../../lib/sms/index.js";
import { WITHIN_WINDOW_INSTANT } from "../../lib/testAuth.js";

const app = createApp();
const PASSWORD = "Original-Otp-Password-1";

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

async function requestOtp(adminId: string): Promise<string> {
  const sendSpy = vi.spyOn(smsProvider, "send").mockResolvedValue(undefined);
  try {
    const res = await request(app).post("/api/auth/forgot-password").send({ adminId });
    expect(res.status).toBe(200);
    const call = sendSpy.mock.calls[0];
    if (!call) throw new Error("smsProvider.send was never called");
    const message = call[1];
    const match = /(\d{6})/.exec(message);
    if (!match?.[1]) throw new Error(`No 6-digit OTP found in message: ${message}`);
    return match[1];
  } finally {
    sendSpy.mockRestore();
  }
}

describe("admin OTP password reset", () => {
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
        displayName: "OTP Test Admin",
        mobileNumber: "9000000003",
      })
      .returning();
    if (!admin) throw new Error("failed to insert test admin");
    adminId = admin.id;
  });

  afterEach(async () => {
    // Fully clear any leftover OTP/attempts state, and the forgot-password
    // rate-limit counters (3/admin/hour, 5/IP/hour) — several tests in this
    // file call forgot-password back to back, well past those caps, unless
    // each test starts with a clean slate.
    await redis.del(`otp:${adminId}`, `otp:attempts:${adminId}`);
    const rateLimitKeys = await redis.keys("forgot-password:*");
    if (rateLimitKeys.length > 0) {
      await redis.del(...rateLimitKeys);
    }
  });

  afterAll(async () => {
    vi.useRealTimers();
    await db.delete(activityLog).where(eq(activityLog.actorId, adminId));
    await db.delete(sessions).where(eq(sessions.adminId, adminId));
    await db.delete(admins).where(eq(admins.id, adminId));
  });

  describe("POST /api/auth/forgot-password", () => {
    it("returns an identical response for a real and a fake adminId, without calling the SMS provider for the fake one", async () => {
      const sendSpy = vi.spyOn(smsProvider, "send").mockResolvedValue(undefined);
      try {
        const real = await request(app)
          .post("/api/auth/forgot-password")
          .send({ adminId: adminLoginId });
        const fake = await request(app)
          .post("/api/auth/forgot-password")
          .send({ adminId: `nonexistent-${randomUUID()}` });

        expect(real.status).toBe(fake.status);
        expect(real.body).toEqual(fake.body);
        expect(sendSpy).toHaveBeenCalledTimes(1); // only for the real admin
      } finally {
        sendSpy.mockRestore();
      }
    });
  });

  describe("POST /api/auth/reset-password", () => {
    it("a wrong OTP fails", async () => {
      await requestOtp(adminLoginId);
      const res = await request(app)
        .post("/api/auth/reset-password")
        .send({ adminId: adminLoginId, otp: "000000", newPassword: "Should-Not-Apply-1" });
      expect(res.status).toBe(400);
      expect(readErrorBody(res.body).error.code).toBe("INVALID_OTP");
    });

    it("six attempts invalidate it, even a correct one on the sixth try", async () => {
      const otp = await requestOtp(adminLoginId);

      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post("/api/auth/reset-password")
          .send({ adminId: adminLoginId, otp: "111111", newPassword: "Irrelevant-Pass-1" });
        expect(res.status).toBe(400);
      }

      // The 6th attempt, even with the CORRECT otp, must fail — the cap already tripped.
      const sixth = await request(app)
        .post("/api/auth/reset-password")
        .send({ adminId: adminLoginId, otp, newPassword: "Irrelevant-Pass-1" });
      expect(sixth.status).toBe(400);
      expect(readErrorBody(sixth.body).error.code).toBe("INVALID_OTP");
    });

    it("a correct OTP after expiry fails", async () => {
      const otp = await requestOtp(adminLoginId);
      // Simulate expiry directly rather than waiting 5 real minutes.
      await redis.del(`otp:${adminId}`, `otp:attempts:${adminId}`);

      const res = await request(app)
        .post("/api/auth/reset-password")
        .send({ adminId: adminLoginId, otp, newPassword: "Irrelevant-Pass-1" });
      expect(res.status).toBe(400);
      expect(readErrorBody(res.body).error.code).toBe("INVALID_OTP");
    });

    it("a correct OTP resets the password and revokes every session for that admin", async () => {
      const login1 = await request(app)
        .post("/api/auth/login")
        .send({ identifier: adminLoginId, password: PASSWORD });
      const cookie1 = extractCookie(login1, "access_token");
      const stillWorksBefore = await request(app).get("/api/auth/me").set("Cookie", cookie1);
      expect(stillWorksBefore.status).toBe(200);

      const otp = await requestOtp(adminLoginId);
      const newPassword = "Post-Reset-Password-1";
      const reset = await request(app)
        .post("/api/auth/reset-password")
        .send({ adminId: adminLoginId, otp, newPassword });
      expect(reset.status).toBe(200);

      // The session that existed before the reset is dead now — resetPassword
      // has no "current session" to spare, unlike changeAdminPassword.
      const deadAfterReset = await request(app).get("/api/auth/me").set("Cookie", cookie1);
      expect(deadAfterReset.status).toBe(401);

      const reLogin = await request(app)
        .post("/api/auth/login")
        .send({ identifier: adminLoginId, password: newPassword });
      expect(reLogin.status).toBe(200);
    });
  });
});
