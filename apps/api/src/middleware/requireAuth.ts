import { eq } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { db } from "../db/client.js";
import { admins, sessions, users } from "../db/schema/index.js";
import { ACCESS_TOKEN_COOKIE_NAME } from "../lib/cookies.js";
import { AccountInactiveError, UnauthorizedError } from "../lib/errors.js";
import { type Role, verifyAccessToken } from "../lib/jwt.js";
import { logger } from "../lib/logger.js";
import { redis } from "../lib/redis.js";

export interface AuthContext {
  sub: string;
  role: Role;
  sessionId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Express augmentation requires a namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

const LAST_SEEN_THROTTLE_SECONDS = 60;

function touchLastSeen(userId: string): Promise<void> {
  return redis
    .set(`lastSeen:${userId}`, "1", "EX", LAST_SEEN_THROTTLE_SECONDS, "NX")
    .then(async (acquired) => {
      if (acquired !== "OK") {
        return;
      }
      await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, userId));
    })
    .catch((error: unknown) => {
      logger.warn({ err: error }, "Skipping users.last_seen_at update (non-critical)");
    });
}

function readCookie(req: Request, name: string): string | undefined {
  const raw: unknown = req.cookies[name];
  return typeof raw === "string" ? raw : undefined;
}

/**
 * Verifies the access token, loads the session and account fresh from the
 * DB on every call (never trusting JWT claims alone), and attaches
 * `req.auth`. A revoked session or a deactivated user is rejected even
 * against a cryptographically valid, unexpired token.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = readCookie(req, ACCESS_TOKEN_COOKIE_NAME);
    if (!token) {
      throw new UnauthorizedError("Not authenticated.");
    }

    const payload = await verifyAccessToken(token);
    if (!payload) {
      throw new UnauthorizedError("Invalid or expired session.");
    }

    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, payload.sessionId))
      .limit(1);

    if (session?.revokedAt !== null) {
      throw new UnauthorizedError("Invalid or expired session.");
    }

    if (payload.role === "admin") {
      const [admin] = await db.select().from(admins).where(eq(admins.id, payload.sub)).limit(1);
      if (!admin) {
        throw new UnauthorizedError("Invalid or expired session.");
      }
    } else {
      const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
      if (!user) {
        throw new UnauthorizedError("Invalid or expired session.");
      }
      if (!user.isActive) {
        throw new AccountInactiveError("This account has been deactivated.");
      }
      void touchLastSeen(user.id);
    }

    req.auth = { sub: payload.sub, role: payload.role, sessionId: payload.sessionId };
    next();
  } catch (error) {
    next(error);
  }
}
