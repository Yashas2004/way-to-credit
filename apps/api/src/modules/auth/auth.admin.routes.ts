import { ChangePasswordRequestSchema } from "@way-to-credit/shared";
import type { Request } from "express";
import { Router } from "express";
import { UnauthorizedError, ValidationError } from "../../lib/errors.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import * as authService from "./auth.service.js";

export const authAdminRouter: Router = Router();

authAdminRouter.use(requireAuth, requireRole("admin"));

function normalizeUserAgent(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function requestContext(req: Request): authService.RequestContext {
  return { ip: req.ip, userAgent: normalizeUserAgent(req.headers["user-agent"]) };
}

authAdminRouter.post("/password", async (req, res, next) => {
  try {
    if (!req.auth) {
      throw new UnauthorizedError("Not authenticated.");
    }
    const parsed = ChangePasswordRequestSchema.safeParse(req.body as unknown);
    if (!parsed.success) {
      throw new ValidationError(
        "currentPassword and a newPassword (min 8 characters) are required.",
      );
    }
    await authService.changeAdminPassword(
      req.auth.sub,
      req.auth.sessionId,
      parsed.data,
      requestContext(req),
    );
    res.status(200).json({ status: "ok" });
  } catch (error) {
    next(error);
  }
});
