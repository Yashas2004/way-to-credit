import type { Request } from "express";
import { UnauthorizedError } from "./errors.js";

/**
 * Every route that uses this has already run `requireAuth`, so `req.auth`
 * is always set in practice — this exists to satisfy strict null-checking
 * without every route re-deriving the same guard.
 */
export function requireActorId(req: Request): string {
  if (!req.auth) {
    throw new UnauthorizedError("Not authenticated.");
  }
  return req.auth.sub;
}
