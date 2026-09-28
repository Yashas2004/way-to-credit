import { randomUUID } from "node:crypto";
import express, { type Express, type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { redis } from "../lib/redis.js";
import { errorHandler } from "./errorHandler.js";
import { userRateLimit } from "./rateLimit.js";

/** A route behind `limiter`, with req.auth faked from a header (or absent). */
function buildApp(...limiters: RequestHandler[]): Express {
  const app = express();
  app.use((req, _res, next) => {
    const sub = req.header("x-test-user");
    if (sub) req.auth = { sub, role: "user", sessionId: "s" };
    next();
  });
  limiters.forEach((limiter, i) => {
    app.post(`/r${String(i)}`, limiter, (_req, res) => {
      res.json({ ok: true });
    });
  });
  app.use(errorHandler);
  return app;
}

const limiter = (prefix: string, max: number) =>
  userRateLimit({
    keyPrefix: prefix,
    max,
    windowSeconds: 60,
    message: `Too many ${prefix}.`,
    label: prefix,
  });

describe("userRateLimit", () => {
  it("allows max requests per window, then 429 with Retry-After and the configured message", async () => {
    const app = buildApp(limiter(`test:a:${randomUUID()}`, 3));
    const user = randomUUID();
    for (let i = 0; i < 3; i++) {
      expect((await request(app).post("/r0").set("x-test-user", user)).status).toBe(200);
    }
    const blocked = await request(app).post("/r0").set("x-test-user", user);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    expect((blocked.body as { error: { message: string } }).error.message).toMatch(
      /^Too many test:a:/,
    );
  });

  it("keeps separate budgets per user and per limiter", async () => {
    const app = buildApp(
      limiter(`test:b:${randomUUID()}`, 1),
      limiter(`test:c:${randomUUID()}`, 1),
    );
    const alice = randomUUID();
    expect((await request(app).post("/r0").set("x-test-user", alice)).status).toBe(200);
    expect((await request(app).post("/r0").set("x-test-user", alice)).status).toBe(429);
    // Another limiter's budget is untouched, and so is another user's.
    expect((await request(app).post("/r1").set("x-test-user", alice)).status).toBe(200);
    expect((await request(app).post("/r0").set("x-test-user", randomUUID())).status).toBe(200);
  });

  it("fails open when Redis is unreachable", async () => {
    const app = buildApp(limiter(`test:d:${randomUUID()}`, 1));
    const spy = vi.spyOn(redis, "incr").mockRejectedValue(new Error("simulated redis outage"));
    try {
      const user = randomUUID();
      expect((await request(app).post("/r0").set("x-test-user", user)).status).toBe(200);
      expect((await request(app).post("/r0").set("x-test-user", user)).status).toBe(200);
    } finally {
      spy.mockRestore();
    }
  });
});
