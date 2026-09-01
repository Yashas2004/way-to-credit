import { Router } from "express";
import { requireActorId } from "../../lib/authContext.js";
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
