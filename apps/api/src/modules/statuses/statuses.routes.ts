import {
  CreateStatusRequestSchema,
  includeDeletedQuerySchema,
  UpdateStatusRequestSchema,
  uuidParam,
} from "@way-to-credit/shared";
import { Router } from "express";
import { requireActorId } from "../../lib/authContext.js";
import { ValidationError } from "../../lib/errors.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import * as statusesService from "./statuses.service.js";

export const statusesRouter: Router = Router();

statusesRouter.use(requireAuth, requireRole("admin"));

statusesRouter.post("/", async (req, res, next) => {
  try {
    const parsed = CreateStatusRequestSchema.safeParse(req.body as unknown);
    if (!parsed.success) {
      throw new ValidationError("A valid status name and sortOrder are required.");
    }
    const status = await statusesService.createStatus(requireActorId(req), parsed.data);
    res.status(201).json(status);
  } catch (error) {
    next(error);
  }
});

statusesRouter.get("/", async (req, res, next) => {
  try {
    const parsed = includeDeletedQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationError("Invalid query parameters.");
    }
    const statuses = await statusesService.listStatuses(parsed.data.includeDeleted);
    res.status(200).json(statuses);
  } catch (error) {
    next(error);
  }
});

statusesRouter.patch("/:id", async (req, res, next) => {
  try {
    const idResult = uuidParam.safeParse(req.params.id);
    if (!idResult.success) {
      throw new ValidationError("Invalid status id.");
    }
    const bodyResult = UpdateStatusRequestSchema.safeParse(req.body as unknown);
    if (!bodyResult.success) {
      throw new ValidationError("Invalid status update.");
    }
    const status = await statusesService.updateStatus(
      requireActorId(req),
      idResult.data,
      bodyResult.data,
    );
    res.status(200).json(status);
  } catch (error) {
    next(error);
  }
});

statusesRouter.delete("/:id", async (req, res, next) => {
  try {
    const idResult = uuidParam.safeParse(req.params.id);
    if (!idResult.success) {
      throw new ValidationError("Invalid status id.");
    }
    const status = await statusesService.softDeleteStatus(requireActorId(req), idResult.data);
    res.status(200).json(status);
  } catch (error) {
    next(error);
  }
});

statusesRouter.post("/:id/undelete", async (req, res, next) => {
  try {
    const idResult = uuidParam.safeParse(req.params.id);
    if (!idResult.success) {
      throw new ValidationError("Invalid status id.");
    }
    const status = await statusesService.undeleteStatus(requireActorId(req), idResult.data);
    res.status(200).json(status);
  } catch (error) {
    next(error);
  }
});
