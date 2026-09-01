import { ListQueriesQuerySchema, RaiseQueryRequestSchema } from "@way-to-credit/shared";
import { Router } from "express";
import { requireActorId } from "../../lib/authContext.js";
import { ValidationError } from "../../lib/errors.js";
import { queryRateLimit } from "../../middleware/rateLimit.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import { timeWindow } from "../../middleware/timeWindow.js";
import * as queriesService from "./queries.service.js";

export const queriesRouter: Router = Router();

queriesRouter.use(requireAuth, timeWindow(), requireRole("user"));

// queryRateLimit runs before body validation, so a malformed attempt still
// counts against the 10/hour budget — matches how loginRateLimit runs
// first in auth.routes.ts.
queriesRouter.post("/", queryRateLimit, async (req, res, next) => {
  try {
    const parsed = RaiseQueryRequestSchema.safeParse(req.body as unknown);
    if (!parsed.success) {
      throw new ValidationError(
        "bankId, loanTypeId, statusId, and a non-empty message (max 1000 characters) are required.",
      );
    }
    const row = await queriesService.raiseQuery(requireActorId(req), parsed.data);
    res.status(201).json(row);
  } catch (error) {
    next(error);
  }
});

queriesRouter.get("/", async (req, res, next) => {
  try {
    const parsed = ListQueriesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationError("Invalid pagination parameters.");
    }
    const result = await queriesService.listOwnQueries(
      requireActorId(req),
      parsed.data.limit,
      parsed.data.cursor,
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});
