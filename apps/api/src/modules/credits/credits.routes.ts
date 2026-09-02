import { CreditHistoryQuerySchema, uuidParam } from "@way-to-credit/shared";
import { Router } from "express";
import { requireActorId } from "../../lib/authContext.js";
import { ValidationError } from "../../lib/errors.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import { timeWindow } from "../../middleware/timeWindow.js";
import * as creditsService from "./credits.service.js";

export const creditsRouter: Router = Router();

creditsRouter.use(requireAuth, timeWindow(), requireRole("user"));

creditsRouter.get("/credits", async (req, res, next) => {
  try {
    const result = await creditsService.getMyCredits(requireActorId(req));
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

creditsRouter.get("/rewards", async (req, res, next) => {
  try {
    const result = await creditsService.getRewardsMap(requireActorId(req));
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

creditsRouter.get("/credits/history", async (req, res, next) => {
  try {
    const parsed = CreditHistoryQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationError("Invalid pagination parameters.");
    }
    const result = await creditsService.getCreditHistory(
      requireActorId(req),
      parsed.data.limit,
      parsed.data.cursor,
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

creditsRouter.post("/milestones/:id/seen", async (req, res, next) => {
  try {
    const idResult = uuidParam.safeParse(req.params.id);
    if (!idResult.success) {
      throw new ValidationError("Invalid milestone id.");
    }
    const result = await creditsService.markMilestoneSeen(requireActorId(req), idResult.data);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});
