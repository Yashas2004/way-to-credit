import { ActivityLogQuerySchema } from "@way-to-credit/shared";
import { Router } from "express";
import { ValidationError } from "../../lib/errors.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import * as activityService from "./activity.service.js";

export const activityRouter: Router = Router();

activityRouter.use(requireAuth, requireRole("admin"));

activityRouter.get("/activity", async (req, res, next) => {
  try {
    const parsed = ActivityLogQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationError("Invalid query filters or pagination parameters.");
    }
    const result = await activityService.listActivity(parsed.data);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

activityRouter.get("/sessions/active", async (_req, res, next) => {
  try {
    const result = await activityService.listActiveSessions();
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

activityRouter.get("/stats", async (_req, res, next) => {
  try {
    const result = await activityService.getStats();
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});
