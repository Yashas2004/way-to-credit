import type { IncomingMessage, ServerResponse } from "node:http";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { requestId } from "./middleware/requestId.js";
import { healthRouter } from "./routes/health.js";

export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");

  app.use(requestId);

  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.id,
      // Headers (cookies, auth tokens) must never end up in logs. Serializers
      // strip them outright; redact is a second layer in case someone widens
      // these serializers back to the pino-http defaults later.
      serializers: {
        req: (req: IncomingMessage) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
        res: (res: ServerResponse) => ({
          statusCode: res.statusCode,
        }),
      },
      redact: ["req.headers.cookie", "req.headers.authorization", 'res.headers["set-cookie"]'],
      customSuccessMessage: (req, res, responseTime) =>
        `${req.method} ${req.url} ${String(res.statusCode)} ${String(Math.round(responseTime))}ms`,
      customErrorMessage: (req, res, error) =>
        `${req.method} ${req.url} ${String(res.statusCode)} — ${error.message}`,
    }),
  );

  app.use(helmet());

  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    }),
  );

  app.use(express.json({ limit: "100kb" }));

  app.use(cookieParser());

  app.use(healthRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
