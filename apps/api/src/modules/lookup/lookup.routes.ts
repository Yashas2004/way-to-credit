import { DescriptionLookupQuerySchema } from "@way-to-credit/shared";
import { Router } from "express";
import { ValidationError } from "../../lib/errors.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import { timeWindow } from "../../middleware/timeWindow.js";
import * as lookupService from "./lookup.service.js";

export const lookupRouter: Router = Router();

lookupRouter.use(requireAuth, timeWindow(), requireRole("user"));

lookupRouter.get("/tree", async (_req, res, next) => {
  try {
    const tree = await lookupService.getUserTree();
    res.status(200).json(tree);
  } catch (error) {
    next(error);
  }
});

lookupRouter.get("/description", async (req, res, next) => {
  try {
    const parsed = DescriptionLookupQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationError(
        "bankId, loanTypeId, and statusId are all required and must be valid UUIDs.",
      );
    }
    const result = await lookupService.getDescriptionForTriple(
      parsed.data.bankId,
      parsed.data.loanTypeId,
      parsed.data.statusId,
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});
