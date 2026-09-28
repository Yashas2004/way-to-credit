import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../app.js";
import { db } from "../../db/client.js";
import { auditLog, issues } from "../../db/schema/index.js";
import { redis } from "../../lib/redis.js";
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
import * as issuesRepo from "./issues.repo.js";

const app = createApp();

interface Entry {
  id: string;
  kind: "message" | "resolved" | "reopened";
  authorType: "user" | "admin";
  authorName: string;
  body: string;
  sentAt: string;
}
interface Summary {
  id: string;
  subject: string;
  status: "awaiting_admin" | "awaiting_user" | "resolved";
  lastActivityAt: string;
  resolvedAt: string | null;
  unread: boolean;
}
interface Thread {
  issue: Summary;
  entries: Entry[];
}
interface Page {
  items: Summary[];
  nextCursor: string | null;
}
interface ErrorBody {
  error: { code: string; message: string };
}

describe("help requests", () => {
  let admin1: TestAdmin;
  let admin2: TestAdmin;
  let userA: TestUser;
  let userB: TestUser;
  let admin1Cookie: string;
  let admin2Cookie: string;
  let userACookie: string;
  let userBCookie: string;
  const extraUsers: TestUser[] = [];

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(WITHIN_WINDOW_INSTANT);
    admin1 = await createTestAdmin();
    admin2 = await createTestAdmin();
    userA = await createTestUser(admin1.id);
    userB = await createTestUser(admin1.id);
    admin1Cookie = await loginAs(app, admin1.adminId);
    admin2Cookie = await loginAs(app, admin2.adminId);
    userACookie = await loginAs(app, userA.userId);
    userBCookie = await loginAs(app, userB.userId);
  });

  afterAll(async () => {
    vi.useRealTimers();
    // deleteTestUser purges each user's requests (test-only bypass of the
    // append-only triggers) — including the admins' messages and read
    // markers in them, which is what lets the admins be deleted after.
    for (const u of [userA, userB, ...extraUsers]) await deleteTestUser(u.id);
    await deleteTestAdmin(admin1.id);
    await deleteTestAdmin(admin2.id);
  });

  // Users A and B raise many requests across this file, more than the 5/hour
  // create limit. Each test starts with their create budget cleared: an
  // explicit precondition, not something inherited from earlier tests. The
  // rate-limit tests use their own fresh users and preset counters.
  beforeEach(async () => {
    await redis.del(`issue:create:${userA.id}`, `issue:create:${userB.id}`);
  });

  async function freshUser(): Promise<{ user: TestUser; cookie: string }> {
    const user = await createTestUser(admin1.id);
    extraUsers.push(user);
    return { user, cookie: await loginAs(app, user.userId) };
  }

  async function raise(
    cookie: string,
    subject = `Help ${randomUUID()}`,
    body = "Something is wrong.",
  ) {
    const res = await request(app)
      .post("/api/user/issues")
      .set("Cookie", cookie)
      .send({ subject, body });
    expect(res.status).toBe(201);
    return res.body as Thread;
  }

  const adminReply = (cookie: string, id: string, body = "Looking into it.") =>
    request(app).post(`/api/admin/issues/${id}/messages`).set("Cookie", cookie).send({ body });
  const userReply = (cookie: string, id: string, body = "Still broken.") =>
    request(app).post(`/api/user/issues/${id}/messages`).set("Cookie", cookie).send({ body });
  const unread = async (path: string, cookie: string) =>
    ((await request(app).get(path).set("Cookie", cookie)).body as { count: number }).count;
  const userUnread = (cookie: string) => unread("/api/user/issues/unread-count", cookie);
  const adminUnread = (cookie: string) => unread("/api/admin/issues/unread-count", cookie);

  // ---- isolation --------------------------------------------------------------

  describe("isolation between users", () => {
    it("another user's request is indistinguishable from a nonexistent one", async () => {
      const mine = await raise(userACookie);
      const missing = randomUUID();

      for (const [method, suffix, body] of [
        ["get", "", undefined],
        ["post", "/messages", { body: "Let me in" }],
        ["post", "/read", { upTo: new Date().toISOString() }],
      ] as const) {
        const theirs = await request(app)
          [method](`/api/user/issues/${mine.issue.id}${suffix}`)
          .set("Cookie", userBCookie)
          .send(body);
        const nonexistent = await request(app)
          [method](`/api/user/issues/${missing}${suffix}`)
          .set("Cookie", userBCookie)
          .send(body);
        expect(theirs.status).toBe(404);
        expect(theirs.body).toEqual(nonexistent.body);
      }

      // And B's attempted reply left no trace in A's thread.
      const thread = (
        await request(app).get(`/api/user/issues/${mine.issue.id}`).set("Cookie", userACookie)
      ).body as Thread;
      expect(thread.entries).toHaveLength(1);
    });

    it("never leaks another user's requests into a list or an unread count", async () => {
      const aIssue = await raise(userACookie);
      expect((await adminReply(admin1Cookie, aIssue.issue.id)).status).toBe(201);

      const bList = (await request(app).get("/api/user/issues?limit=50").set("Cookie", userBCookie))
        .body as Page;
      expect(bList.items.some((i) => i.id === aIssue.issue.id)).toBe(false);
      expect(await userUnread(userBCookie)).toBe(0);

      const aList = (await request(app).get("/api/user/issues?limit=50").set("Cookie", userACookie))
        .body as Page;
      expect(aList.items.find((i) => i.id === aIssue.issue.id)?.unread).toBe(true);
    });
  });

  // ---- lifecycle --------------------------------------------------------------

  describe("status lifecycle", () => {
    it("create -> admin reply -> user reply -> resolve (idempotent) -> user reply reopens", async () => {
      const created = await raise(userACookie);
      const id = created.issue.id;
      expect(created.issue.status).toBe("awaiting_admin");
      expect(created.entries.map((e) => e.kind)).toEqual(["message"]);

      expect(((await adminReply(admin1Cookie, id)).body as Thread).issue.status).toBe(
        "awaiting_user",
      );
      expect(((await userReply(userACookie, id)).body as Thread).issue.status).toBe(
        "awaiting_admin",
      );

      const resolved = (
        await request(app).post(`/api/admin/issues/${id}/resolve`).set("Cookie", admin1Cookie)
      ).body as Thread;
      expect(resolved.issue.status).toBe("resolved");
      expect(resolved.issue.resolvedAt).not.toBeNull();
      const again = (
        await request(app).post(`/api/admin/issues/${id}/resolve`).set("Cookie", admin2Cookie)
      ).body as Thread;
      expect(again.entries).toHaveLength(resolved.entries.length); // nothing recorded twice

      // Replying to a resolved request reopens it rather than failing.
      const reopened = await userReply(userACookie, id, "It's back.");
      expect(reopened.status).toBe(201);
      const thread = reopened.body as Thread;
      expect(thread.issue.status).toBe("awaiting_admin");
      expect(thread.issue.resolvedAt).toBeNull();
      expect(thread.entries.map((e) => `${e.kind}:${e.authorType}`)).toEqual([
        "message:user",
        "message:admin",
        "message:user",
        "resolved:admin",
        "reopened:user",
        "message:user",
      ]);
    });

    it("an admin reply to a resolved request also reopens it, awaiting the user", async () => {
      const { issue } = await raise(userACookie);
      await request(app).post(`/api/admin/issues/${issue.id}/resolve`).set("Cookie", admin1Cookie);
      const thread = (await adminReply(admin1Cookie, issue.id, "One more thing.")).body as Thread;
      expect(thread.issue.status).toBe("awaiting_user");
      expect(thread.entries.slice(-2).map((e) => e.kind)).toEqual(["reopened", "message"]);
    });

    it("an explicit reopen hands the request to whichever side owes the next move", async () => {
      const userLast = await raise(userACookie); // the user spoke last
      await request(app)
        .post(`/api/admin/issues/${userLast.issue.id}/resolve`)
        .set("Cookie", admin1Cookie);
      const r1 = (
        await request(app)
          .post(`/api/admin/issues/${userLast.issue.id}/reopen`)
          .set("Cookie", admin1Cookie)
      ).body as Thread;
      expect(r1.issue.status).toBe("awaiting_admin");

      const adminLast = await raise(userACookie);
      await adminReply(admin1Cookie, adminLast.issue.id);
      await request(app)
        .post(`/api/admin/issues/${adminLast.issue.id}/resolve`)
        .set("Cookie", admin1Cookie);
      const r2 = (
        await request(app)
          .post(`/api/admin/issues/${adminLast.issue.id}/reopen`)
          .set("Cookie", admin1Cookie)
      ).body as Thread;
      expect(r2.issue.status).toBe("awaiting_user");

      // Reopening an open request is a no-op.
      const r3 = (
        await request(app)
          .post(`/api/admin/issues/${adminLast.issue.id}/reopen`)
          .set("Cookie", admin1Cookie)
      ).body as Thread;
      expect(r3.entries).toHaveLength(r2.entries.length);
    });

    it("audits admin replies, resolves and reopens", async () => {
      const { issue } = await raise(userACookie);
      await adminReply(admin2Cookie, issue.id);
      await request(app).post(`/api/admin/issues/${issue.id}/resolve`).set("Cookie", admin2Cookie);
      await request(app).post(`/api/admin/issues/${issue.id}/reopen`).set("Cookie", admin2Cookie);
      const rows = await db
        .select({ action: auditLog.action })
        .from(auditLog)
        .where(and(eq(auditLog.entityId, issue.id), eq(auditLog.actorId, admin2.id)));
      expect(rows.map((r) => r.action).sort()).toEqual([
        "issue_reopen",
        "issue_reply",
        "issue_resolve",
      ]);
    });
  });

  // ---- unread -------------------------------------------------------------------

  describe("unread tracking", () => {
    it("user side: an admin entry is unread until marked read; markers never move back or run ahead", async () => {
      const { user, cookie } = await freshUser();
      const { issue } = await raise(cookie);
      expect(await userUnread(cookie)).toBe(0); // their own message

      const afterReply = (await adminReply(admin1Cookie, issue.id)).body as Thread;
      expect(await userUnread(cookie)).toBe(1);

      const lastSeen = afterReply.entries[afterReply.entries.length - 1]?.sentAt ?? "";
      expect(
        (
          await request(app)
            .post(`/api/user/issues/${issue.id}/read`)
            .set("Cookie", cookie)
            .send({ upTo: lastSeen })
        ).status,
      ).toBe(204);
      expect(await userUnread(cookie)).toBe(0);

      // An older upTo never moves the marker backwards.
      await request(app)
        .post(`/api/user/issues/${issue.id}/read`)
        .set("Cookie", cookie)
        .send({ upTo: "2000-01-01T00:00:00.000Z" });
      expect(await userUnread(cookie)).toBe(0);

      // A far-future upTo is clamped to the request's activity: a later reply is still unread.
      await request(app)
        .post(`/api/user/issues/${issue.id}/read`)
        .set("Cookie", cookie)
        .send({ upTo: "2100-01-01T00:00:00.000Z" });
      await adminReply(admin1Cookie, issue.id, "Another update.");
      expect(await userUnread(cookie)).toBe(1);
      expect(user.id).toBeTruthy();
    });

    it("admin side: per admin, only user entries count, and an admin's own reply marks it read for them", async () => {
      const before1 = await adminUnread(admin1Cookie);
      const before2 = await adminUnread(admin2Cookie);
      const { issue } = await raise(userACookie);
      expect(await adminUnread(admin1Cookie)).toBe(before1 + 1);
      expect(await adminUnread(admin2Cookie)).toBe(before2 + 1);

      // Admin 1 reads it: clears for admin 1 only.
      const thread = (
        await request(app).get(`/api/admin/issues/${issue.id}`).set("Cookie", admin1Cookie)
      ).body as Thread;
      const upTo = thread.entries[thread.entries.length - 1]?.sentAt ?? "";
      await request(app)
        .post(`/api/admin/issues/${issue.id}/read`)
        .set("Cookie", admin1Cookie)
        .send({ upTo });
      expect(await adminUnread(admin1Cookie)).toBe(before1);
      expect(await adminUnread(admin2Cookie)).toBe(before2 + 1);

      // Admin 2 replies: their own reply isn't unread for them, and replying means they've read it.
      await adminReply(admin2Cookie, issue.id);
      expect(await adminUnread(admin2Cookie)).toBe(before2);

      // The user answers: unread again for both admins.
      await userReply(userACookie, issue.id);
      expect(await adminUnread(admin1Cookie)).toBe(before1 + 1);
      expect(await adminUnread(admin2Cookie)).toBe(before2 + 1);
    });
  });

  // ---- rate limits ---------------------------------------------------------------

  describe("rate limits", () => {
    it("allows 5 new requests per hour, then 429 with Retry-After", async () => {
      const { user, cookie } = await freshUser();
      await redis.set(`issue:create:${user.id}`, "4", "EX", 3600); // 4 already used
      await raise(cookie); // the 5th
      const sixth = await request(app)
        .post("/api/user/issues")
        .set("Cookie", cookie)
        .send({ subject: "Sixth", body: "x" });
      expect(sixth.status).toBe(429);
      expect(Number(sixth.headers["retry-after"])).toBeGreaterThan(0);
    });

    it("allows 300 messages per hour, then 429 — and doesn't limit admins", async () => {
      const { user, cookie } = await freshUser();
      const { issue } = await raise(cookie);
      await redis.set(`issue:message:${user.id}`, "299", "EX", 3600);
      expect((await userReply(cookie, issue.id)).status).toBe(201); // the 300th
      const over = await userReply(cookie, issue.id);
      expect(over.status).toBe(429);
      expect((over.body as ErrorBody).error.code).toBe("TOO_MANY_REQUESTS");

      // Admin routes don't consult the limiter at all.
      await redis.set(`issue:message:${admin1.id}`, "100000", "EX", 3600);
      expect((await adminReply(admin1Cookie, issue.id)).status).toBe(201);
    });
  });

  // ---- concurrency -----------------------------------------------------------------

  describe("concurrent writes", () => {
    it("ten simultaneous admin replies: none lost, consistent status and ordering", async () => {
      const { issue } = await raise(userACookie);
      const replies = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          adminReply(i % 2 ? admin1Cookie : admin2Cookie, issue.id, `Reply ${String(i)}`),
        ),
      );
      expect(replies.every((r) => r.status === 201)).toBe(true);

      const thread = (
        await request(app).get(`/api/admin/issues/${issue.id}`).set("Cookie", admin1Cookie)
      ).body as Thread;
      const messages = thread.entries.filter((e) => e.authorType === "admin");
      expect(messages).toHaveLength(10);
      expect(new Set(messages.map((m) => m.body)).size).toBe(10);
      expect(thread.issue.status).toBe("awaiting_user");
      const times = thread.entries.map((e) => e.sentAt);
      expect([...times].sort()).toEqual(times);
      expect(thread.issue.lastActivityAt).toBe(times[times.length - 1]);
    });

    it("a reply queued behind a resolve sees it: the reply reopens the request (deterministic, via a held row lock)", async () => {
      const { issue } = await raise(userACookie);

      // Hold the request's row lock, queue a resolve then a reply behind it,
      // release. With per-request locking the reply decides its transition
      // only after the resolve commits, so it must record a reopen. Without
      // the lock, the reply would read the pre-resolve status and just
      // append a message — no "reopened" entry.
      let release!: () => void;
      const released = new Promise<void>((r) => {
        release = r;
      });
      const holder = db.transaction(async (tx) => {
        await tx.select().from(issues).where(eq(issues.id, issue.id)).for("update");
        await released;
      });
      await new Promise((r) => setTimeout(r, 100));
      const resolving = request(app)
        .post(`/api/admin/issues/${issue.id}/resolve`)
        .set("Cookie", admin1Cookie);
      const resolveDone = resolving.then((r) => r);
      await new Promise((r) => setTimeout(r, 200));
      const replyDone = adminReply(admin2Cookie, issue.id, "Queued reply").then((r) => r);
      await new Promise((r) => setTimeout(r, 200));
      release();
      await holder;
      expect((await resolveDone).status).toBe(200);
      expect((await replyDone).status).toBe(201);

      const thread = (
        await request(app).get(`/api/admin/issues/${issue.id}`).set("Cookie", admin1Cookie)
      ).body as Thread;
      expect(thread.entries.slice(-3).map((e) => e.kind)).toEqual([
        "resolved",
        "reopened",
        "message",
      ]);
      expect(thread.issue.status).toBe("awaiting_user");
    });

    it("a resolve racing a reply: both recorded, and the status follows whichever committed last", async () => {
      for (let i = 0; i < 3; i++) {
        const { issue } = await raise(userACookie);
        await Promise.all([
          request(app).post(`/api/admin/issues/${issue.id}/resolve`).set("Cookie", admin1Cookie),
          adminReply(admin2Cookie, issue.id, "Racing reply"),
        ]);
        const thread = (
          await request(app).get(`/api/admin/issues/${issue.id}`).set("Cookie", admin1Cookie)
        ).body as Thread;
        const kinds = thread.entries.map((e) => e.kind);
        expect(kinds).toContain("resolved");
        expect(thread.entries.some((e) => e.body === "Racing reply")).toBe(true);
        const last = thread.entries[thread.entries.length - 1];
        expect(thread.issue.status).toBe(last?.kind === "resolved" ? "resolved" : "awaiting_user");
      }
    });
  });

  // ---- pagination --------------------------------------------------------------------

  describe("admin inbox pagination by last activity", () => {
    it("a request that gets activity mid-pagination jumps to the top: skipped by later pages, never repeated", async () => {
      const { user, cookie } = await freshUser();
      const oldest = await raise(cookie, "oldest");
      const middle = await raise(cookie, "middle");
      const newest = await raise(cookie, "newest");
      const pageOf = async (cursor?: string) =>
        (
          await request(app)
            .get(`/api/admin/issues?userId=${user.id}&limit=1${cursor ? `&cursor=${cursor}` : ""}`)
            .set("Cookie", admin1Cookie)
        ).body as Page;

      const p1 = await pageOf();
      expect(p1.items.map((i) => i.id)).toEqual([newest.issue.id]);
      const p2 = await pageOf(p1.nextCursor ?? undefined);
      expect(p2.items.map((i) => i.id)).toEqual([middle.issue.id]);

      // "oldest" gets new activity before page 3 is loaded.
      await adminReply(admin1Cookie, oldest.issue.id);
      const p3 = await pageOf(p2.nextCursor ?? undefined);
      expect(p3.items).toEqual([]); // skipped, not duplicated

      // A fresh first page surfaces it at the top.
      const fresh = await pageOf();
      expect(fresh.items.map((i) => i.id)).toEqual([oldest.issue.id]);
      const seen = [...p1.items, ...p2.items, ...p3.items].map((i) => i.id);
      expect(new Set(seen).size).toBe(seen.length);
    });

    it("last_activity_at never moves backwards", async () => {
      const { issue } = await raise(userACookie);
      const [before] = await db.select().from(issues).where(eq(issues.id, issue.id));
      await issuesRepo.applyIssueUpdate(db, issue.id, {
        status: "awaiting_admin",
        activityAt: new Date("2000-01-01T00:00:00.000Z"),
        authorType: "user",
        markAuthorRead: false,
      });
      const [after] = await db.select().from(issues).where(eq(issues.id, issue.id));
      expect(after?.lastActivityAt.getTime()).toBe(before?.lastActivityAt.getTime());
    });

    it("filters by status, including 'open' for both awaiting states", async () => {
      const { user, cookie } = await freshUser();
      const awaitingAdmin = await raise(cookie);
      const awaitingUser = await raise(cookie);
      await adminReply(admin1Cookie, awaitingUser.issue.id);
      const resolved = await raise(cookie);
      await request(app)
        .post(`/api/admin/issues/${resolved.issue.id}/resolve`)
        .set("Cookie", admin1Cookie);

      const ids = async (status: string) =>
        (
          (
            await request(app)
              .get(`/api/admin/issues?userId=${user.id}&status=${status}`)
              .set("Cookie", admin1Cookie)
          ).body as Page
        ).items
          .map((i) => i.id)
          .sort();
      expect(await ids("awaiting_admin")).toEqual([awaitingAdmin.issue.id]);
      expect(await ids("resolved")).toEqual([resolved.issue.id]);
      expect(await ids("open")).toEqual([awaitingAdmin.issue.id, awaitingUser.issue.id].sort());
    });
  });

  // ---- validation, content, dashboard, time window ---------------------------------------

  describe("validation and content", () => {
    it.each([
      [{ subject: "ab", body: "ok" }, "subject too short"],
      [{ subject: "x".repeat(151), body: "ok" }, "subject too long"],
      [{ subject: "Fine subject", body: "   \n  " }, "whitespace-only body"],
      [{ subject: "Fine subject", body: "x".repeat(5001) }, "body too long"],
    ])("rejects %j (%s) with 400", async (payload) => {
      const { cookie } = await freshUser();
      const res = await request(app).post("/api/user/issues").set("Cookie", cookie).send(payload);
      expect(res.status).toBe(400);
    });

    it("stores and returns markup exactly as typed — it's text, never interpreted", async () => {
      const body = '<img src=x onerror="alert(1)"> & <script>alert(2)</script>';
      const thread = await raise(userACookie, "Markup test", body);
      expect(thread.entries[0]?.body).toBe(body);
    });

    it("normalises Windows line endings", async () => {
      const thread = await raise(userACookie, "Line endings", "one\r\ntwo\rthree");
      expect(thread.entries[0]?.body).toBe("one\ntwo\nthree");
    });
  });

  it("the dashboard counts requests awaiting an admin reply", async () => {
    const stats = async () =>
      (
        (await request(app).get("/api/admin/stats").set("Cookie", admin1Cookie)).body as {
          awaitingAdminIssueCount: number;
        }
      ).awaitingAdminIssueCount;
    const before = await stats();
    const { issue } = await raise(userACookie);
    expect(await stats()).toBe(before + 1);
    await adminReply(admin1Cookie, issue.id);
    expect(await stats()).toBe(before);
  });

  it("admins reach the inbox outside the user access window", async () => {
    vi.setSystemTime(new Date(Date.UTC(2024, 0, 7, 6, 30, 0))); // Sunday, noon IST
    try {
      const cookie = await loginAs(app, admin1.adminId);
      expect((await request(app).get("/api/admin/issues").set("Cookie", cookie)).status).toBe(200);
    } finally {
      vi.setSystemTime(WITHIN_WINDOW_INSTANT);
    }
  });
});
