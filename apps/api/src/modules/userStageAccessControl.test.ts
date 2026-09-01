import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import {
  createTestAdmin,
  createTestUser,
  deleteTestAdmin,
  deleteTestUser,
  loginAs,
  WITHIN_WINDOW_INSTANT,
} from "../lib/testAuth.js";

const app = createApp();

// Any syntactically valid UUID works — requireRole/timeWindow reject before
// any route handler ever tries to resolve it.
const ID = "00000000-0000-0000-0000-000000000000";

const ROUTES: { method: "get" | "post"; path: string }[] = [
  { method: "get", path: "/api/user/tree" },
  { method: "get", path: `/api/user/description?bankId=${ID}&loanTypeId=${ID}&statusId=${ID}` },
  { method: "post", path: "/api/user/queries" },
  { method: "get", path: "/api/user/queries" },
  { method: "get", path: "/api/user/me/credits" },
];

describe("every user-stage route rejects an admin token with 403 FORBIDDEN", () => {
  let adminId: string;
  let adminCookie: string;

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(WITHIN_WINDOW_INSTANT);

    const admin = await createTestAdmin();
    adminId = admin.id;
    adminCookie = await loginAs(app, admin.adminId);
  });

  afterAll(async () => {
    vi.useRealTimers();
    await deleteTestAdmin(adminId);
  });

  // timeWindow no-ops for any non-"user" role, so requireRole('user') is
  // what actually rejects an admin here, at any hour — see stage decision #9.
  it.each(ROUTES)("$method $path -> 403 FORBIDDEN", async ({ method, path }) => {
    const res = await request(app)[method](path).set("Cookie", adminCookie).send({});
    expect(res.status).toBe(403);
    expect((res.body as { error: { code: string } }).error.code).toBe("FORBIDDEN");
  });
});

describe("every user-stage route blocks a user token outside the Mon-Sat 09:00-18:00 IST window", () => {
  // Login itself is time-gated for a "user" role account (auth.service.ts's
  // login() checks the window too), and access tokens have only a 10-minute
  // TTL — so logging in at a different *day* and then jumping the clock
  // would either fail the login outright or hand back an already-expired
  // token, masking OUTSIDE_ACCESS_WINDOW behind a 401 instead. Login just
  // inside the window, then move 6 minutes past its close on the same day —
  // comfortably inside the token's 10-minute TTL, so the token itself is
  // still valid and only timeWindow rejects the request. Same boundary
  // pair CLAUDE.md's testing expectations call out (Sat 17:59 -> 18:01 IST).
  const LOGIN_INSTANT = new Date(Date.UTC(2024, 0, 8, 12, 25, 0)); // Mon 2024-01-08, 17:55 IST
  const OUTSIDE_INSTANT = new Date(Date.UTC(2024, 0, 8, 12, 31, 0)); // Mon 2024-01-08, 18:01 IST

  let adminId: string;
  let userId: string;
  let userCookie: string;

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(LOGIN_INSTANT);

    const admin = await createTestAdmin();
    adminId = admin.id;
    const user = await createTestUser(adminId);
    userId = user.id;
    userCookie = await loginAs(app, user.userId);

    vi.setSystemTime(OUTSIDE_INSTANT);
  });

  afterAll(async () => {
    vi.useRealTimers();
    await deleteTestUser(userId);
    await deleteTestAdmin(adminId);
  });

  it.each(ROUTES)("$method $path -> 403 OUTSIDE_ACCESS_WINDOW", async ({ method, path }) => {
    const res = await request(app)[method](path).set("Cookie", userCookie).send({});
    expect(res.status).toBe(403);
    expect((res.body as { error: { code: string } }).error.code).toBe("OUTSIDE_ACCESS_WINDOW");
  });
});
