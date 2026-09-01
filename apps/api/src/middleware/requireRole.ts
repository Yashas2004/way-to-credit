import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ForbiddenError } from "../lib/errors.js";
import type { Role } from "../lib/jwt.js";

export function requireRole(role: Role): RequestHandler {
  return function requireRoleMiddleware(req: Request, _res: Response, next: NextFunction): void {
    if (req.auth?.role !== role) {
      next(new ForbiddenError(`This action requires the '${role}' role.`));
      return;
    }
    next();
  };
}
