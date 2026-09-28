import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestAdmin,
  createTestUser,
  deleteTestAdmin,
  deleteTestUser,
  type TestAdmin,
  type TestUser,
} from "../lib/testAuth.js";
import { db } from "./client.js";
import { auditLog, issueMessages, issues } from "./schema/index.js";

/**
 * forbid_change() (migration 0006) makes these append-only in the database
 * itself, for every role — including the superuser dev/CI connects as, which
 * production grants alone can't bind. Every destructive attempt runs inside
 * a transaction that is always rolled back, so if a trigger were ever
 * missing, this test fails without having wiped anything.
 */
async function attempt(statement: ReturnType<typeof sql>): Promise<unknown> {
  const ROLLBACK = new Error("rollback");
  try {
    await db.transaction(async (tx) => {
      await tx.execute(statement);
      throw ROLLBACK;
    });
  } catch (error) {
    if (error === ROLLBACK) return null; // the statement succeeded: not protected
    return error;
  }
  return null;
}

function isForbidden(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string; message?: string } } | null)?.cause;
  return cause?.code === "23001" && (cause.message ?? "").includes("append-only");
}

describe("append-only tables (forbid_change)", () => {
  let admin: TestAdmin;
  let user: TestUser;
  let issueId: string;
  let messageId: string;
  let auditId: string;

  beforeAll(async () => {
    admin = await createTestAdmin();
    user = await createTestUser(admin.id);
    const [issue] = await db
      .insert(issues)
      .values({ raisedBy: user.id, subject: "Immutability test" })
      .returning();
    if (!issue) throw new Error("fixture insert failed");
    issueId = issue.id;
    const [message] = await db
      .insert(issueMessages)
      .values({ issueId, authorType: "user", authorUserId: user.id, body: "Original text" })
      .returning();
    if (!message) throw new Error("fixture insert failed");
    messageId = message.id;
    const [audit] = await db
      .insert(auditLog)
      .values({
        actorId: admin.id,
        actorType: "admin",
        action: "test",
        entityType: "immutability_test",
        entityId: randomUUID(),
      })
      .returning();
    if (!audit) throw new Error("fixture insert failed");
    auditId = audit.id;
  });

  afterAll(async () => {
    await deleteTestUser(user.id); // purges the test issue via the test-only helper
    await deleteTestAdmin(admin.id);
  });

  it("rejects UPDATE, DELETE and TRUNCATE on issue_messages", async () => {
    expect(
      isForbidden(
        await attempt(sql`UPDATE issue_messages SET body = 'edited' WHERE id = ${messageId}`),
      ),
    ).toBe(true);
    expect(
      isForbidden(await attempt(sql`DELETE FROM issue_messages WHERE id = ${messageId}`)),
    ).toBe(true);
    expect(isForbidden(await attempt(sql`TRUNCATE issue_messages CASCADE`))).toBe(true);

    const [still] = await db.select().from(issueMessages).where(eq(issueMessages.id, messageId));
    expect(still?.body).toBe("Original text");
  });

  it("rejects DELETE and TRUNCATE on issues, but allows status updates", async () => {
    expect(isForbidden(await attempt(sql`DELETE FROM issues WHERE id = ${issueId}`))).toBe(true);
    expect(isForbidden(await attempt(sql`TRUNCATE issues CASCADE`))).toBe(true);

    await db.update(issues).set({ status: "awaiting_user" }).where(eq(issues.id, issueId));
    const [updated] = await db.select().from(issues).where(eq(issues.id, issueId));
    expect(updated?.status).toBe("awaiting_user");
  });

  it("rejects UPDATE, DELETE and TRUNCATE on audit_log (CLAUDE.md invariant 15)", async () => {
    expect(
      isForbidden(
        await attempt(sql`UPDATE audit_log SET action = 'tampered' WHERE id = ${auditId}`),
      ),
    ).toBe(true);
    expect(isForbidden(await attempt(sql`DELETE FROM audit_log WHERE id = ${auditId}`))).toBe(true);
    expect(isForbidden(await attempt(sql`TRUNCATE audit_log`))).toBe(true);

    const [still] = await db.select().from(auditLog).where(eq(auditLog.id, auditId));
    expect(still?.action).toBe("test");
  });
});
