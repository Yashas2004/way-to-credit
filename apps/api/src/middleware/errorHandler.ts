import type { NextFunction, Request, Response } from "express";
import { AppError, ServiceBusyError, TooManyRequestsError } from "../lib/errors.js";
import { isDatabaseBusyError } from "../lib/pgErrors.js";

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `Route not found: ${req.method} ${req.originalUrl}`,
    },
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Express requires 4 args to recognize an error handler
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  if (isDatabaseBusyError(err)) {
    // Fail fast and visibly: a clear 503 the client can retry, never a hang
    // or a generic 500. Logged at warn with the cause — a run of these means
    // the pool or the database needs attention.
    req.log.warn({ err, requestId: req.id }, "Database busy: pool or statement timeout");
    const busy = new ServiceBusyError(
      "The service is busy right now. Please try again in a moment.",
    );
    res.setHeader("Retry-After", String(busy.retryAfterSeconds));
    res.status(busy.statusCode).json({ error: { code: busy.code, message: busy.message } });
    return;
  }

  if (err instanceof AppError) {
    if (err instanceof TooManyRequestsError) {
      res.setHeader("Retry-After", String(err.retryAfterSeconds));
      res.status(err.statusCode).json({
        error: {
          code: err.code,
          message: err.message,
          retryAfterSeconds: err.retryAfterSeconds,
        },
      });
      return;
    }

    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
      },
    });
    return;
  }

  req.log.error({ err, requestId: req.id }, "Unhandled error");

  res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Something went wrong. Please try again later.",
    },
  });
}
