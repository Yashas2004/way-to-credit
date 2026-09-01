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

const QUERY_RATE_WINDOW_SECONDS = 60 * 60;
const QUERY_RATE_MAX_PER_WINDOW = 10;

function queryRateKey(userId: string): string {
  return `query:rate:${userId}`;
}

/**
 * 10 queries per user per hour, window anchored at each user's first
 * request in it (not wall-clock-aligned) — same INCR+EXPIRE-on-first-hit
 * shape as the login IP counter above. Runs before body validation, so a
 * malformed/invalid attempt still consumes budget, matching how
 * `loginRateLimit` runs first in `auth.routes.ts`. On Redis error: fail
 * open with a warning log and no secondary in-process fallback — unlike
 * login, this route is already behind `requireAuth`+`timeWindow`+
 * `requireRole`, so the unauthenticated brute-force risk that justifies
 * login's extra fallback layer doesn't apply here.
 */
export async function queryRateLimit(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = req.auth?.sub;
  if (!userId) {
    next();
    return;
  }

  try {
    const key = queryRateKey(userId);
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, QUERY_RATE_WINDOW_SECONDS);
    }
    if (count > QUERY_RATE_MAX_PER_WINDOW) {
      const ttl = await redis.ttl(key);
      next(
        new TooManyRequestsError(
          "Too many queries raised. Try again later.",
          ttl > 0 ? ttl : QUERY_RATE_WINDOW_SECONDS,
        ),
      );
      return;
    }
    next();
  } catch (error) {
    logger.warn(
      { err: error, userId },
      "Redis unreachable during query rate-limit check — failing open",
    );
    next();
  }
}

const FORGOT_PASSWORD_IP_WINDOW_SECONDS = 60 * 60;
const FORGOT_PASSWORD_IP_MAX = 5; // "5 per IP per hour"
const FORGOT_PASSWORD_ADMIN_WINDOW_SECONDS = 60 * 60;
const FORGOT_PASSWORD_ADMIN_MAX = 3; // CLAUDE.md invariant #10's "max 3 sends per number per hour" — keyed by adminId, 1:1 with mobileNumber

// Same reasoning as loginRateLimit's fallback: this is a public,
// unauthenticated endpoint, so Redis being down must not turn into "anyone
// can send unlimited OTP SMS" — fail open with a hard per-instance IP cap,
// a dedicated Map (not shared with loginRateLimit's) so each limiter's
// blast radius and tuning stay independent.
const FORGOT_PASSWORD_FALLBACK_MAX_PER_MINUTE = 5;
const FORGOT_PASSWORD_FALLBACK_WINDOW_MS = 60_000;
const FORGOT_PASSWORD_FALLBACK_RETRY_AFTER_SECONDS = 60;
const forgotPasswordFallbackIpAttempts = new Map<string, { count: number; windowStart: number }>();

function checkForgotPasswordFallbackLimit(ip: string): boolean {
  const now = Date.now();
  const existing = forgotPasswordFallbackIpAttempts.get(ip);
  if (!existing || now - existing.windowStart > FORGOT_PASSWORD_FALLBACK_WINDOW_MS) {
    forgotPasswordFallbackIpAttempts.set(ip, { count: 1, windowStart: now });
    return true;
  }
  existing.count += 1;
  return existing.count <= FORGOT_PASSWORD_FALLBACK_MAX_PER_MINUTE;
}

function forgotPasswordIpKey(ip: string): string {
  return `forgot-password:ip:${ip}`;
}
function forgotPasswordAdminKey(adminId: string): string {
  return `forgot-password:admin:${adminId}`;
}

function extractAdminId(req: Request): string | undefined {
  const body: unknown = req.body;
  if (body !== null && typeof body === "object" && "adminId" in body) {
    const value = (body as Record<string, unknown>)["adminId"];
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

/**
 * 5/IP/hour and 3/admin/hour (both windows anchored at first hit). The
 * per-admin counter is keyed by the raw request-body string, existence-blind
 * — it increments identically whether or not that string resolves to a real
 * admin, so it introduces no differential response between a real and a
 * fake adminId (forgot-password's "always 200" no-enumeration guarantee
 * stays intact).
 */
export async function forgotPasswordRateLimit(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const ip = req.ip ?? "unknown";
  const adminId = extractAdminId(req);

  try {
    const ipCount = await redis.incr(forgotPasswordIpKey(ip));
    if (ipCount === 1) {
      await redis.expire(forgotPasswordIpKey(ip), FORGOT_PASSWORD_IP_WINDOW_SECONDS);
    }
    if (ipCount > FORGOT_PASSWORD_IP_MAX) {
      next(
        new TooManyRequestsError(
          "Too many password reset requests from this address.",
          FORGOT_PASSWORD_IP_WINDOW_SECONDS,
        ),
      );
      return;
    }

    if (adminId) {
      const adminCount = await redis.incr(forgotPasswordAdminKey(adminId));
      if (adminCount === 1) {
        await redis.expire(forgotPasswordAdminKey(adminId), FORGOT_PASSWORD_ADMIN_WINDOW_SECONDS);
      }
      if (adminCount > FORGOT_PASSWORD_ADMIN_MAX) {
        next(
          new TooManyRequestsError(
            "Too many password reset requests. Please try again later.",
            FORGOT_PASSWORD_ADMIN_WINDOW_SECONDS,
          ),
        );
        return;
      }
    }

    next();
  } catch (error) {
    logger.error(
      { err: error, ip },
      "Redis unreachable during forgot-password rate-limit check — failing open with an in-process per-IP cap",
    );
    if (!checkForgotPasswordFallbackLimit(ip)) {
      next(
        new TooManyRequestsError(
          "Too many password reset requests. Try again shortly.",
          FORGOT_PASSWORD_FALLBACK_RETRY_AFTER_SECONDS,
        ),
      );
      return;
    }
    next();
  }
}

const RESET_PASSWORD_IP_WINDOW_SECONDS = 60;
const RESET_PASSWORD_IP_MAX = 20;

function resetPasswordIpKey(ip: string): string {
  return `reset-password:ip:${ip}`;
}

/**
 * A lighter IP-only limiter for POST /api/auth/reset-password. Brute-forcing
 * the OTP itself is already bounded by `lib/otp.ts`'s 5-attempts-per-OTP
 * cap (forcing a fresh `forgot-password` call, itself capped at 3/hour);
 * this just protects the endpoint itself from being hammered, matching
 * "both routes are public and rate-limited." Fails open on Redis error —
 * this route's real brute-force resistance comes from the OTP-attempt cap,
 * not this counter, so a fallback layer isn't warranted here.
 */
export async function resetPasswordRateLimit(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const ip = req.ip ?? "unknown";
  try {
    const count = await redis.incr(resetPasswordIpKey(ip));
    if (count === 1) {
      await redis.expire(resetPasswordIpKey(ip), RESET_PASSWORD_IP_WINDOW_SECONDS);
    }
    if (count > RESET_PASSWORD_IP_MAX) {
      next(
        new TooManyRequestsError(
          "Too many password reset attempts from this address.",
          RESET_PASSWORD_IP_WINDOW_SECONDS,
        ),
      );
      return;
    }
    next();
  } catch (error) {
    logger.warn(
      { err: error, ip },
      "Redis unreachable during reset-password rate-limit check — failing open",
    );
    next();
  }
}
