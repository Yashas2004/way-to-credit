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

// Any syntactically valid UUID works — requireRole rejects before the route
// handler ever tries to resolve it.
const ID = "00000000-0000-0000-0000-000000000000";

const ROUTES: { method: "get" | "post" | "patch" | "delete" | "put"; path: string }[] = [
  { method: "post", path: "/api/admin/banks" },
  { method: "get", path: "/api/admin/banks" },
  { method: "patch", path: `/api/admin/banks/${ID}` },
  { method: "delete", path: `/api/admin/banks/${ID}` },
  { method: "post", path: `/api/admin/banks/${ID}/undelete` },

  { method: "post", path: "/api/admin/loan-types" },
  { method: "get", path: "/api/admin/loan-types" },
  { method: "patch", path: `/api/admin/loan-types/${ID}` },
  { method: "delete", path: `/api/admin/loan-types/${ID}` },
  { method: "post", path: `/api/admin/loan-types/${ID}/undelete` },

  { method: "post", path: "/api/admin/statuses" },
  { method: "get", path: "/api/admin/statuses" },
  { method: "patch", path: `/api/admin/statuses/${ID}` },
  { method: "delete", path: `/api/admin/statuses/${ID}` },
  { method: "post", path: `/api/admin/statuses/${ID}/undelete` },

  { method: "post", path: `/api/admin/banks/${ID}/loan-types/${ID}` },
  { method: "delete", path: `/api/admin/banks/${ID}/loan-types/${ID}` },

  { method: "put", path: "/api/admin/descriptions" },
  { method: "get", path: `/api/admin/descriptions?bankId=${ID}&loanTypeId=${ID}` },

  { method: "post", path: "/api/admin/users" },
  { method: "get", path: "/api/admin/users" },
  { method: "post", path: `/api/admin/users/${ID}/deactivate` },
  { method: "post", path: `/api/admin/users/${ID}/reactivate` },
  { method: "post", path: `/api/admin/users/${ID}/reset-password` },
  { method: "post", path: `/api/admin/users/${ID}/credits` },

  { method: "get", path: "/api/admin/export" },

  { method: "post", path: `/api/admin/queries/${ID}/approve` },
  { method: "post", path: `/api/admin/queries/${ID}/reject` },
  { method: "get", path: "/api/admin/queries" },
  { method: "get", path: `/api/admin/queries/${ID}` },

  { method: "post", path: "/api/admin/milestones" },
  { method: "get", path: "/api/admin/milestones" },
  { method: "patch", path: `/api/admin/milestones/${ID}` },
  { method: "post", path: `/api/admin/milestones/${ID}/deactivate` },
  { method: "post", path: `/api/admin/milestones/${ID}/reactivate` },

  { method: "get", path: "/api/admin/activity" },
  { method: "get", path: "/api/admin/sessions/active" },
  { method: "get", path: "/api/admin/stats" },

  { method: "post", path: "/api/admin/me/password" },
];

describe("every admin route rejects a non-admin (user) token", () => {
  let adminId: string;
  let userId: string;
  let userCookie: string;

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(WITHIN_WINDOW_INSTANT);

    const admin = await createTestAdmin();
    adminId = admin.id;
    const user = await createTestUser(adminId);
    userId = user.id;
    userCookie = await loginAs(app, user.userId);
  });

  afterAll(async () => {
    vi.useRealTimers();
    await deleteTestUser(userId);
    await deleteTestAdmin(adminId);
  });

  it.each(ROUTES)("$method $path -> 403", async ({ method, path }) => {
    const res = await request(app)[method](path).set("Cookie", userCookie).send({});
    expect(res.status).toBe(403);
  });
});
