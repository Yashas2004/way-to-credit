import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Express } from "express";
import request from "supertest";
import { db } from "../db/client.js";
import { admins, sessions, users } from "../db/schema/index.js";
import { hashPassword } from "./password.js";

export const TEST_PASSWORD = "Test-Password-123!";

/**
 * A fixed instant safely inside the Mon-Sat 09:00-18:00 IST access window
 * (Mon 2024-01-08, 12:00 IST) — every test that hits a `timeWindow`-gated
 * route with a user-role token needs `vi.useFakeTimers({toFake:["Date"]});
 * vi.setSystemTime(WITHIN_WINDOW_INSTANT)` in `beforeAll`, or the test is
 * flaky depending on when `pnpm test` actually runs in real wall-clock
 * time. Centralized here as the one source of truth instead of each test
 * file redeclaring the same literal.
 */
export const WITHIN_WINDOW_INSTANT = new Date(Date.UTC(2024, 0, 8, 6, 30, 0)); // Mon 2024-01-08, 12:00 IST

export interface TestAdmin {
  id: string;
  adminId: string;
}

export interface TestUser {
  id: string;
  userId: string;
}

export async function createTestAdmin(): Promise<TestAdmin> {
  const passwordHash = await hashPassword(TEST_PASSWORD);
  const adminId = `test-admin-${randomUUID()}`;
  const [admin] = await db
    .insert(admins)
    .values({
      adminId,
      passwordHash,
      displayName: "Test Admin",
      mobileNumber: "9000000000",
    })
    .returning();
  if (!admin) {
    throw new Error("Failed to insert test admin");
  }
  return { id: admin.id, adminId };
}

export async function deleteTestAdmin(id: string): Promise<void> {
  // loginAs() creates a real session row; sessions.admin_id -> admins is
  // ON DELETE RESTRICT, so it has to go first.
  await db.delete(sessions).where(eq(sessions.adminId, id));
  await db.delete(admins).where(eq(admins.id, id));
}

export async function createTestUser(createdBy: string): Promise<TestUser> {
  const passwordHash = await hashPassword(TEST_PASSWORD);
  const userId = `test-user-${randomUUID()}`;
  const [user] = await db
    .insert(users)
    .values({
      userId,
      passwordHash,
      displayName: "Test User",
      createdBy,
    })
    .returning();
  if (!user) {
    throw new Error("Failed to insert test user");
  }
  return { id: user.id, userId };
}

export async function deleteTestUser(id: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, id));
  await db.delete(users).where(eq(users.id, id));
}

function extractAccessTokenCookie(res: request.Response): string {
  const raw: unknown = res.headers["set-cookie"];
  const cookies = Array.isArray(raw) ? (raw as string[]) : typeof raw === "string" ? [raw] : [];
  const match = cookies.find((c) => c.startsWith("access_token="));
  if (!match) {
    throw new Error("No access_token cookie in login response");
  }
  return match.split(";")[0] ?? match;
}

/** Logs in via the real HTTP endpoint and returns the `access_token` cookie string. */
export async function loginAs(app: Express, identifier: string): Promise<string> {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ identifier, password: TEST_PASSWORD });
  if (res.status !== 200) {
    throw new Error(`Test login failed: ${String(res.status)} ${JSON.stringify(res.body)}`);
  }
  return extractAccessTokenCookie(res);
}
