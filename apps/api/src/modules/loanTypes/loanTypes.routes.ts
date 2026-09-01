import {
  CreateLoanTypeRequestSchema,
  includeDeletedQuerySchema,
  UpdateLoanTypeRequestSchema,
  uuidParam,
} from "@way-to-credit/shared";
import { Router } from "express";
import { requireActorId } from "../../lib/authContext.js";
import { ValidationError } from "../../lib/errors.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import * as loanTypesService from "./loanTypes.service.js";

export const loanTypesRouter: Router = Router();

loanTypesRouter.use(requireAuth, requireRole("admin"));

loanTypesRouter.post("/", async (req, res, next) => {
  try {
    const parsed = CreateLoanTypeRequestSchema.safeParse(req.body as unknown);
    if (!parsed.success) {
      throw new ValidationError("A valid loan type name is required.");
    }
    const loanType = await loanTypesService.createLoanType(requireActorId(req), parsed.data.name);
    res.status(201).json(loanType);
  } catch (error) {
    next(error);
  }
});

loanTypesRouter.get("/", async (req, res, next) => {
  try {
    const parsed = includeDeletedQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationError("Invalid query parameters.");
    }
    const loanTypes = await loanTypesService.listLoanTypes(parsed.data.includeDeleted);
    res.status(200).json(loanTypes);
  } catch (error) {
    next(error);
  }
});

loanTypesRouter.patch("/:id", async (req, res, next) => {
  try {
    const idResult = uuidParam.safeParse(req.params.id);
    if (!idResult.success) {
      throw new ValidationError("Invalid loan type id.");
    }
    const bodyResult = UpdateLoanTypeRequestSchema.safeParse(req.body as unknown);
    if (!bodyResult.success) {
      throw new ValidationError("A valid loan type name is required.");
    }
    const loanType = await loanTypesService.updateLoanType(
      requireActorId(req),
      idResult.data,
      bodyResult.data.name,
    );
    res.status(200).json(loanType);
  } catch (error) {
    next(error);
  }
});

loanTypesRouter.delete("/:id", async (req, res, next) => {
  try {
    const idResult = uuidParam.safeParse(req.params.id);
    if (!idResult.success) {
      throw new ValidationError("Invalid loan type id.");
    }
    const loanType = await loanTypesService.softDeleteLoanType(requireActorId(req), idResult.data);
    res.status(200).json(loanType);
  } catch (error) {
    next(error);
  }
});

loanTypesRouter.post("/:id/undelete", async (req, res, next) => {
  try {
    const idResult = uuidParam.safeParse(req.params.id);
    if (!idResult.success) {
      throw new ValidationError("Invalid loan type id.");
    }
    const loanType = await loanTypesService.undeleteLoanType(requireActorId(req), idResult.data);
    res.status(200).json(loanType);
  } catch (error) {
    next(error);
  }
});
