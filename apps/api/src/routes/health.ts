import { Router } from "express";
import type { HealthResponse } from "@way-to-credit/shared";
import { pingDb } from "../lib/db.js";
import { pingRedis } from "../lib/redis.js";

const startedAt = Date.now();

// Not read from package.json to avoid an fs read on every deploy's boot path;
// bump manually or wire to a build-time env var when releases start shipping.
const VERSION = "0.0.0";

export const healthRouter: Router = Router();

healthRouter.get("/health", (_req, res) => {
  const body: HealthResponse = {
    status: "ok",
    uptime: (Date.now() - startedAt) / 1000,
    version: VERSION,
  };
  res.status(200).json(body);
});

healthRouter.get("/health/ready", async (_req, res) => {
  const [dbOk, redisOk] = await Promise.all([pingDb(), pingRedis()]);

  if (!dbOk || !redisOk) {
    res.status(503).json({
      status: "unavailable",
      checks: { db: dbOk, redis: redisOk },
    });
    return;
  }

  res.status(200).json({
    status: "ok",
    checks: { db: dbOk, redis: redisOk },
  });
});
