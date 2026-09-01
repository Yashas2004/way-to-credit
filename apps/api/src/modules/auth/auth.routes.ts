import { LoginRequestSchema } from "@way-to-credit/shared";
import type { Request } from "express";
import { Router } from "express";
import {
  clearAuthCookies,
  REFRESH_TOKEN_COOKIE_NAME,
  setAccessTokenCookie,
  setRefreshTokenCookie,
} from "../../lib/cookies.js";
import { UnauthorizedError, ValidationError } from "../../lib/errors.js";
import { loginRateLimit } from "../../middleware/rateLimit.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { timeWindow } from "../../middleware/timeWindow.js";
import * as authService from "./auth.service.js";

export const authRouter: Router = Router();

function normalizeUserAgent(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function requestContext(req: Request): authService.RequestContext {
  return { ip: req.ip, userAgent: normalizeUserAgent(req.headers["user-agent"]) };
}

function readCookie(req: Request, name: string): string | undefined {
  const raw: unknown = req.cookies[name];
  return typeof raw === "string" ? raw : undefined;
}

authRouter.post("/login", loginRateLimit, async (req, res, next) => {
  try {
    const body: unknown = req.body;
    const parsed = LoginRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("A valid identifier and password are required.");
    }

    const result = await authService.login(parsed.data, requestContext(req));
    setAccessTokenCookie(res, result.accessToken);
    setRefreshTokenCookie(res, result.refreshToken);
    res.status(200).json(result.identity);
  } catch (error) {
    next(error);
  }
});

authRouter.post("/refresh", async (req, res, next) => {
  try {
    const refreshToken = readCookie(req, REFRESH_TOKEN_COOKIE_NAME);
    if (!refreshToken) {
      throw new UnauthorizedError("Not authenticated.");
    }

    const result = await authService.refresh(refreshToken, requestContext(req));
    setAccessTokenCookie(res, result.accessToken);
    setRefreshTokenCookie(res, result.refreshToken);
    res.status(200).json(result.identity);
  } catch (error) {
    next(error);
  }
});

authRouter.post("/logout", requireAuth, timeWindow(), async (req, res, next) => {
  try {
    if (!req.auth) {
      throw new UnauthorizedError("Not authenticated.");
    }

    await authService.logout(req.auth.sessionId, req.auth.sub, req.auth.role, requestContext(req));
    clearAuthCookies(res);
    res.status(200).json({ status: "ok" });
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", requireAuth, timeWindow(), async (req, res, next) => {
  try {
    if (!req.auth) {
      throw new UnauthorizedError("Not authenticated.");
    }

    const identity = await authService.getIdentity(req.auth.sub, req.auth.role);
    res.status(200).json(identity);
  } catch (error) {
    next(error);
  }
});
