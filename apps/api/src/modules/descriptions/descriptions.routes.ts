import { DescriptionGridQuerySchema, UpsertDescriptionRequestSchema } from "@way-to-credit/shared";
import { Router } from "express";
import { requireActorId } from "../../lib/authContext.js";
import { ValidationError } from "../../lib/errors.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import * as descriptionsService from "./descriptions.service.js";

export const descriptionsRouter: Router = Router();

descriptionsRouter.use(requireAuth, requireRole("admin"));

descriptionsRouter.put("/", async (req, res, next) => {
  try {
    const parsed = UpsertDescriptionRequestSchema.safeParse(req.body as unknown);
    if (!parsed.success) {
      throw new ValidationError("bankId, loanTypeId, statusId, and body are all required.");
    }
    const description = await descriptionsService.upsertDescription(
      requireActorId(req),
      parsed.data,
    );
    res.status(200).json(description);
  } catch (error) {
    next(error);
  }
});

descriptionsRouter.get("/", async (req, res, next) => {
  try {
    const parsed = DescriptionGridQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationError("bankId and loanTypeId query parameters are required.");
    }
    const grid = await descriptionsService.getDescriptionGrid(
      parsed.data.bankId,
      parsed.data.loanTypeId,
    );
    res.status(200).json(grid);
  } catch (error) {
    next(error);
  }
});
