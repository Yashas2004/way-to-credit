import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import type { Express } from "express";
import request from "supertest";
import { db } from "../db/client.js";
import {
  admins,
  issueAdminReads,
  issueMessages,
  issues,
  sessions,
  users,
} from "../db/schema/index.js";
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

/**
 * TEST-ONLY. Deletes every help request raised by these users, with its
 * thread and admin read markers. `issues` and `issue_messages` are
 * append-only by database trigger (forbid_change(), migration 0006), so the
 * only way to delete them is `session_replication_role = replica`, which
 * skips triggers for this one transaction. That setting needs superuser —
 * true for the dev/CI database role, never for the production app role —
 * so this cannot be turned into a production delete path.
 */
export async function purgeTestIssues(raisedBy: string[]): Promise<void> {
  if (raisedBy.length === 0) return;
  await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL session_replication_role = replica`);
    const ids = tx.select({ id: issues.id }).from(issues).where(inArray(issues.raisedBy, raisedBy));
    await tx.delete(issueAdminReads).where(inArray(issueAdminReads.issueId, ids));
    await tx.delete(issueMessages).where(inArray(issueMessages.issueId, ids));
    await tx.delete(issues).where(inArray(issues.raisedBy, raisedBy));
  });
}

export async function deleteTestUser(id: string): Promise<void> {
  await purgeTestIssues([id]);
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
