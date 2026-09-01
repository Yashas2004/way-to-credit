import express, { type Express } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { readErrorBody } from "../lib/errorEnvelope.js";
import type { AuthContext } from "./requireAuth.js";
import { errorHandler } from "./errorHandler.js";
import { requireRole } from "./requireRole.js";

function buildApp(auth: AuthContext): Express {
  const app = express();
  app.use((req, _res, next) => {
    req.auth = auth;
    next();
  });
  app.get("/admin-only", requireRole("admin"), (_req, res) => {
    res.json({ ok: true });
  });
  app.use(errorHandler);
  return app;
}

describe("requireRole", () => {
  it("rejects a mismatched role with 403 FORBIDDEN", async () => {
    const app = buildApp({ sub: "u1", role: "user", sessionId: "s1" });

    const res = await request(app).get("/admin-only");

    expect(res.status).toBe(403);
    expect(readErrorBody(res.body).error.code).toBe("FORBIDDEN");
  });

  it("allows a matching role through", async () => {
    const app = buildApp({ sub: "a1", role: "admin", sessionId: "s1" });

    const res = await request(app).get("/admin-only");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
