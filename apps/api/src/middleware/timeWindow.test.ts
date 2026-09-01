import express, { type Express } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { readErrorBody } from "../lib/errorEnvelope.js";
import type { AuthContext } from "./requireAuth.js";
import { errorHandler } from "./errorHandler.js";
import { timeWindow } from "./timeWindow.js";

// Sunday 2024-01-07 — outside the window for any time of day.
const BLOCKED_INSTANT = new Date(Date.UTC(2024, 0, 7, 6, 30, 0));

function buildApp(auth: AuthContext, clock: () => Date): Express {
  const app = express();
  app.use((req, _res, next) => {
    req.auth = auth;
    next();
  });
  app.get("/protected", timeWindow(clock), (_req, res) => {
    res.json({ ok: true });
  });
  app.use(errorHandler);
  return app;
}

describe("timeWindow", () => {
  it("blocks a user outside the access window with 403 OUTSIDE_ACCESS_WINDOW", async () => {
    const app = buildApp({ sub: "u1", role: "user", sessionId: "s1" }, () => BLOCKED_INSTANT);

    const res = await request(app).get("/protected");

    expect(res.status).toBe(403);
    expect(readErrorBody(res.body).error.code).toBe("OUTSIDE_ACCESS_WINDOW");
  });

  it("never blocks an admin, even at the same blocked instant", async () => {
    const app = buildApp({ sub: "a1", role: "admin", sessionId: "s1" }, () => BLOCKED_INSTANT);

    const res = await request(app).get("/protected");

    expect(res.status).toBe(200);
  });
});
