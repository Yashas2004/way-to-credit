import type { NextFunction, Request, RequestHandler, Response } from "express";
import { currentInstant } from "../lib/clock.js";
import { OutsideAccessWindowError } from "../lib/errors.js";
import { isWithinUserAccessWindow, USER_ACCESS_WINDOW_DESCRIPTION } from "../lib/time.js";

/**
 * Blocks role="user" requests outside Mon-Sat 09:00-18:00 IST. Never applies
 * to admins. `clock` is injectable for tests; defaults to `currentInstant`
 * (real time, or FAKE_NOW in a gated local-dev-only case — see lib/clock.ts).
 */
export function timeWindow(clock: () => Date = currentInstant): RequestHandler {
  return function timeWindowMiddleware(req: Request, _res: Response, next: NextFunction): void {
    if (req.auth?.role !== "user") {
      next();
      return;
    }

    if (!isWithinUserAccessWindow(clock())) {
      next(
        new OutsideAccessWindowError(
          `The portal is only available ${USER_ACCESS_WINDOW_DESCRIPTION}.`,
        ),
      );
      return;
    }

    next();
  };
}
