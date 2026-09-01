import { AdminListQueriesQuerySchema, uuidParam } from "@way-to-credit/shared";
import { Router } from "express";
import { requireActorId } from "../../lib/authContext.js";
import { ValidationError } from "../../lib/errors.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import * as queriesService from "./queries.service.js";

export const queriesAdminRouter: Router = Router();

queriesAdminRouter.use(requireAuth, requireRole("admin"));

queriesAdminRouter.post("/:id/approve", async (req, res, next) => {
  try {
    const idResult = uuidParam.safeParse(req.params.id);
    if (!idResult.success) {
      throw new ValidationError("Invalid query id.");
    }
    const result = await queriesService.approveQuery(requireActorId(req), idResult.data);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

queriesAdminRouter.post("/:id/reject", async (req, res, next) => {
  try {
    const idResult = uuidParam.safeParse(req.params.id);
    if (!idResult.success) {
      throw new ValidationError("Invalid query id.");
    }
    const result = await queriesService.rejectQuery(requireActorId(req), idResult.data);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

queriesAdminRouter.get("/", async (req, res, next) => {
  try {
    const parsed = AdminListQueriesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationError("Invalid query filters or pagination parameters.");
    }
    const result = await queriesService.listQueriesForAdmin(parsed.data);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

queriesAdminRouter.get("/:id", async (req, res, next) => {
  try {
    const idResult = uuidParam.safeParse(req.params.id);
    if (!idResult.success) {
      throw new ValidationError("Invalid query id.");
    }
    const result = await queriesService.getQueryById(idResult.data);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});
