import { randomUUID } from "node:crypto";
import express, { type Express } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { readErrorBody } from "../lib/errorEnvelope.js";
import { errorHandler } from "./errorHandler.js";
import { clearLoginAttempts, loginRateLimit, recordLoginFailure } from "./rateLimit.js";

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.post("/login", loginRateLimit, (_req, res) => {
    res.json({ ok: true });
  });
  app.use(errorHandler);
  return app;
}

const app = buildApp();

describe("rateLimit", () => {
  it("locks out an identifier after the 5th consecutive failure", async () => {
    const identifier = `test-${randomUUID()}`;

    for (let i = 0; i < 5; i++) {
      await recordLoginFailure(identifier);
    }

    const res = await request(app).post("/login").send({ identifier, password: "x" });

    expect(res.status).toBe(429);
    const body = readErrorBody(res.body);
    expect(body.error.code).toBe("TOO_MANY_REQUESTS");
    expect(typeof body.error.retryAfterSeconds).toBe("number");
    expect(res.headers["retry-after"]).toBeDefined();

    await clearLoginAttempts(identifier);
  });

  it("does not lock out before the 5th failure", async () => {
    const identifier = `test-${randomUUID()}`;

    for (let i = 0; i < 4; i++) {
      await recordLoginFailure(identifier);
    }

    const res = await request(app).post("/login").send({ identifier, password: "x" });

    expect(res.status).toBe(200);

    await clearLoginAttempts(identifier);
  });

  it("clearLoginAttempts resets a locked-out identifier", async () => {
    const identifier = `test-${randomUUID()}`;

    for (let i = 0; i < 5; i++) {
      await recordLoginFailure(identifier);
    }
    await clearLoginAttempts(identifier);

    const res = await request(app).post("/login").send({ identifier, password: "x" });

    expect(res.status).toBe(200);
  });
});
