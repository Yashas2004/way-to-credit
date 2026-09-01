import {
  CreateMilestoneRequestSchema,
  UpdateMilestoneRequestSchema,
  uuidParam,
} from "@way-to-credit/shared";
import { Router } from "express";
import { requireActorId } from "../../lib/authContext.js";
import { ValidationError } from "../../lib/errors.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import * as milestonesService from "./milestones.service.js";

export const milestonesRouter: Router = Router();

milestonesRouter.use(requireAuth, requireRole("admin"));

milestonesRouter.post("/", async (req, res, next) => {
  try {
    const parsed = CreateMilestoneRequestSchema.safeParse(req.body as unknown);
    if (!parsed.success) {
      throw new ValidationError(
        "A valid levelNumber, pointsRequired, title, and message are required.",
      );
    }
    const milestone = await milestonesService.createMilestone(requireActorId(req), parsed.data);
    res.status(201).json(milestone);
  } catch (error) {
    next(error);
  }
});

milestonesRouter.get("/", async (_req, res, next) => {
  try {
    const milestones = await milestonesService.listMilestones();
    res.status(200).json(milestones);
  } catch (error) {
    next(error);
  }
});

milestonesRouter.patch("/:id", async (req, res, next) => {
  try {
    const idResult = uuidParam.safeParse(req.params.id);
    if (!idResult.success) {
      throw new ValidationError("Invalid milestone id.");
    }
    const bodyResult = UpdateMilestoneRequestSchema.safeParse(req.body as unknown);
    if (!bodyResult.success) {
      throw new ValidationError("Invalid milestone update.");
    }
    const milestone = await milestonesService.updateMilestone(
      requireActorId(req),
      idResult.data,
      bodyResult.data,
    );
    res.status(200).json(milestone);
  } catch (error) {
    next(error);
  }
});

milestonesRouter.post("/:id/deactivate", async (req, res, next) => {
  try {
    const idResult = uuidParam.safeParse(req.params.id);
    if (!idResult.success) {
      throw new ValidationError("Invalid milestone id.");
    }
    const milestone = await milestonesService.deactivateMilestone(
      requireActorId(req),
      idResult.data,
    );
    res.status(200).json(milestone);
  } catch (error) {
    next(error);
  }
});

milestonesRouter.post("/:id/reactivate", async (req, res, next) => {
  try {
    const idResult = uuidParam.safeParse(req.params.id);
    if (!idResult.success) {
      throw new ValidationError("Invalid milestone id.");
    }
    const milestone = await milestonesService.reactivateMilestone(
      requireActorId(req),
      idResult.data,
    );
    res.status(200).json(milestone);
  } catch (error) {
    next(error);
  }
});
