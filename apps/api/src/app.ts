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
import { authRouter } from "./modules/auth/auth.routes.js";
import { bankLoanTypesRouter } from "./modules/bankLoanTypes/bankLoanTypes.routes.js";
import { banksRouter } from "./modules/banks/banks.routes.js";
import { creditsRouter } from "./modules/credits/credits.routes.js";
import { descriptionsRouter } from "./modules/descriptions/descriptions.routes.js";
import { exportRouter } from "./modules/export/export.routes.js";
import { loanTypesRouter } from "./modules/loanTypes/loanTypes.routes.js";
import { lookupRouter } from "./modules/lookup/lookup.routes.js";
import { queriesRouter } from "./modules/queries/queries.routes.js";
import { statusesRouter } from "./modules/statuses/statuses.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";
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
  app.use("/api/auth", authRouter);
  app.use("/api/admin/banks", banksRouter);
  app.use("/api/admin/banks", bankLoanTypesRouter);
  app.use("/api/admin/loan-types", loanTypesRouter);
  app.use("/api/admin/statuses", statusesRouter);
  app.use("/api/admin/descriptions", descriptionsRouter);
  app.use("/api/admin/users", usersRouter);
  app.use("/api/admin", exportRouter);
  app.use("/api/user", lookupRouter);
  app.use("/api/user/queries", queriesRouter);
  app.use("/api/user/me", creditsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
