import type { NextFunction, Request, Response } from "express";
import { TooManyRequestsError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { redis } from "../lib/redis.js";

const IP_WINDOW_SECONDS = 60;
// Not specified anywhere in the source material — a placeholder guarding
// against low-and-slow attacks spread across many identifiers from one IP.
// Set high enough that a full serialized test run (many admin/user logins
// from the one shared loopback address across many test files) doesn't trip
// it — 100/min from a single IP is still a meaningful brute-force guard.
const IP_MAX_ATTEMPTS = 100;

const LOCK_THRESHOLD = 5; // failures 1-4 don't lock; the 5th does
const LOCK_TIER_SECONDS = [60, 300, 900, 3600]; // 1m, 5m, 15m, 1h (capped)

const FAILURE_COUNTER_TTL_SECONDS = 24 * 60 * 60;

// Only used when Redis itself is unreachable (see below) — never during
// normal operation, which uses Redis exclusively for both limiters.
const REDIS_DOWN_FALLBACK_MAX_PER_MINUTE = 5;
const REDIS_DOWN_FALLBACK_WINDOW_MS = 60_000;
const REDIS_DOWN_FALLBACK_RETRY_AFTER_SECONDS = 60;
const fallbackIpAttempts = new Map<string, { count: number; windowStart: number }>();

function checkFallbackLimit(ip: string): boolean {
  const now = Date.now();
  const existing = fallbackIpAttempts.get(ip);

  if (!existing || now - existing.windowStart > REDIS_DOWN_FALLBACK_WINDOW_MS) {
    fallbackIpAttempts.set(ip, { count: 1, windowStart: now });
    return true;
  }

  existing.count += 1;
  return existing.count <= REDIS_DOWN_FALLBACK_MAX_PER_MINUTE;
}

function lockDurationSeconds(failureCount: number): number {
  const tiers = LOCK_TIER_SECONDS;
  const index = Math.min(Math.max(failureCount - LOCK_THRESHOLD, 0), tiers.length - 1);
  return tiers[index] ?? tiers[tiers.length - 1] ?? 3600;
}

function identifierLockKey(identifier: string): string {
  return `login:lock:${identifier}`;
}
function identifierCountKey(identifier: string): string {
  return `login:count:${identifier}`;
}
function ipCountKey(ip: string): string {
  return `login:ip:${ip}`;
}

function extractIdentifier(req: Request): string | undefined {
  const body: unknown = req.body;
  if (body !== null && typeof body === "object" && "identifier" in body) {
    const value = (body as Record<string, unknown>)["identifier"];
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

/**
 * Rejects with 429 if this IP or identifier is currently locked out. Must
 * run before any password verification or failure-counting — a request
 * arriving while already locked never touches, let alone advances, the
 * failure counter.
 */
export async function loginRateLimit(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const ip = req.ip ?? "unknown";
  const identifier = extractIdentifier(req);

  try {
    const ipCount = await redis.incr(ipCountKey(ip));
    if (ipCount === 1) {
      await redis.expire(ipCountKey(ip), IP_WINDOW_SECONDS);
    }
    if (ipCount > IP_MAX_ATTEMPTS) {
      next(
        new TooManyRequestsError("Too many login attempts from this address.", IP_WINDOW_SECONDS),
      );
      return;
    }

    if (identifier) {
      const lockTtl = await redis.ttl(identifierLockKey(identifier));
      if (lockTtl > 0) {
        next(new TooManyRequestsError("Too many failed attempts. Try again later.", lockTtl));
        return;
      }
    }

    next();
  } catch (error) {
    // Fail OPEN with a hard per-instance cap, not closed: rejecting every
    // login while Redis is down would turn a cache-layer outage into a
    // total application outage. This in-process fallback is deliberately
    // scoped to this path only — normal operation never reaches here.
    logger.error(
      { err: error, ip },
      "Redis unreachable during login rate-limit check — failing open with an in-process per-IP cap",
    );

    if (!checkFallbackLimit(ip)) {
      next(
        new TooManyRequestsError(
          "Too many login attempts. Try again shortly.",
          REDIS_DOWN_FALLBACK_RETRY_AFTER_SECONDS,
        ),
      );
      return;
    }

    next();
  }
}

/** Call after a failed login attempt (wrong password, inactive account). */
export async function recordLoginFailure(identifier: string): Promise<void> {
  try {
    const count = await redis.incr(identifierCountKey(identifier));
    await redis.expire(identifierCountKey(identifier), FAILURE_COUNTER_TTL_SECONDS);

    if (count >= LOCK_THRESHOLD) {
      await redis.set(identifierLockKey(identifier), "1", "EX", lockDurationSeconds(count));
    }
  } catch (error) {
    logger.error({ err: error, identifier }, "Redis unreachable while recording a login failure");
  }
}

/** Call after a successful login to clear any accumulated failure count. */
export async function clearLoginAttempts(identifier: string): Promise<void> {
  try {
    await redis.del(identifierCountKey(identifier), identifierLockKey(identifier));
  } catch (error) {
    logger.warn({ err: error, identifier }, "Failed to clear login attempt counters");
  }
}
