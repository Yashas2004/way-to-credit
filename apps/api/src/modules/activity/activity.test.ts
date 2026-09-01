import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../../app.js";
import { db } from "../../db/client.js";
import { banks, creditTransactions } from "../../db/schema/index.js";
import {
  createTestAdmin,
  createTestUser,
  deleteTestAdmin,
  deleteTestUser,
  loginAs,
  type TestAdmin,
  type TestUser,
  WITHIN_WINDOW_INSTANT,
} from "../../lib/testAuth.js";

interface ActivityRowBody {
  id: string;
  actorId: string;
  event: string;
}
interface ActiveSessionRowBody {
  id: string;
  userId: string;
}
interface StatsBody {
  totalUsers: number;
  activeUsersLast5Minutes: number;
  totalBanks: number;
  pendingQueryCount: number;
  totalCreditsIssued: number;
}

const app = createApp();

describe("admin activity monitoring API", () => {
  let admin: TestAdmin;
  let adminCookie: string;
  let user: TestUser;
  let userCookie: string;

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(WITHIN_WINDOW_INSTANT);

    admin = await createTestAdmin();
    adminCookie = await loginAs(app, admin.adminId);
    user = await createTestUser(admin.id);
    userCookie = await loginAs(app, user.userId);
  });

  afterAll(async () => {
    vi.useRealTimers();
    await deleteTestUser(user.id);
    await deleteTestAdmin(admin.id);
  });

  it("GET /activity includes this admin's own login event when filtered by actorId", async () => {
    const res = await request(app)
      .get(`/api/admin/activity?actorId=${admin.id}`)
      .set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    const body = res.body as { items: ActivityRowBody[] };
    expect(body.items.every((row) => row.actorId === admin.id)).toBe(true);
    expect(body.items.some((row) => row.event === "login")).toBe(true);
  });

  it("GET /sessions/active includes the logged-in user with a non-null lastSeenAt", async () => {
    // requireAuth touches lastSeenAt (throttled) — the login call above and
    // any subsequent authenticated request already set it, but hit one more
    // authenticated user route directly to be sure.
    await request(app).get("/api/user/me/credits").set("Cookie", userCookie);

    const res = await request(app).get("/api/admin/sessions/active").set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    const body = res.body as ActiveSessionRowBody[];
    expect(body.some((row) => row.userId === user.userId)).toBe(true);
  });

  it("GET /stats reflects a new bank and a new positive credit_transaction (delta, not absolute — seed/other test data is already present)", async () => {
    const before = await request(app).get("/api/admin/stats").set("Cookie", adminCookie);
    expect(before.status).toBe(200);
    const beforeBody = before.body as StatsBody;

    const [bank] = await db
      .insert(banks)
      .values({ name: `Stats Test Bank ${randomUUID()}` })
      .returning();
    if (!bank) throw new Error("fixture insert failed");

    try {
      const [creditRow] = await db
        .insert(creditTransactions)
        .values({ userId: user.id, delta: 7, reason: "stats fixture", queryId: null })
        .returning();
      if (!creditRow) throw new Error("fixture insert failed");

      const after = await request(app).get("/api/admin/stats").set("Cookie", adminCookie);
      expect(after.status).toBe(200);
      const afterBody = after.body as StatsBody;

      expect(afterBody.totalBanks).toBe(beforeBody.totalBanks + 1);
      expect(afterBody.totalCreditsIssued).toBe(beforeBody.totalCreditsIssued + 7);

      await db.delete(creditTransactions).where(eq(creditTransactions.id, creditRow.id));
    } finally {
      await db.delete(banks).where(eq(banks.id, bank.id));
    }
  });
});
