import {
  CreateBankRequestSchema,
  includeDeletedQuerySchema,
  UpdateBankRequestSchema,
  uuidParam,
} from "@way-to-credit/shared";
import { Router } from "express";
import { requireActorId } from "../../lib/authContext.js";
import { ValidationError } from "../../lib/errors.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import * as banksService from "./banks.service.js";

export const banksRouter: Router = Router();

banksRouter.use(requireAuth, requireRole("admin"));

banksRouter.post("/", async (req, res, next) => {
  try {
    const parsed = CreateBankRequestSchema.safeParse(req.body as unknown);
    if (!parsed.success) {
      throw new ValidationError("A valid bank name is required.");
    }
    const bank = await banksService.createBank(requireActorId(req), parsed.data.name);
    res.status(201).json(bank);
  } catch (error) {
    next(error);
  }
});

banksRouter.get("/", async (req, res, next) => {
  try {
    const parsed = includeDeletedQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationError("Invalid query parameters.");
    }
    const banks = await banksService.listBanks(parsed.data.includeDeleted);
    res.status(200).json(banks);
  } catch (error) {
    next(error);
  }
});

banksRouter.patch("/:id", async (req, res, next) => {
  try {
    const idResult = uuidParam.safeParse(req.params.id);
    if (!idResult.success) {
      throw new ValidationError("Invalid bank id.");
    }
    const bodyResult = UpdateBankRequestSchema.safeParse(req.body as unknown);
    if (!bodyResult.success) {
      throw new ValidationError("A valid bank name is required.");
    }
    const bank = await banksService.updateBank(
      requireActorId(req),
      idResult.data,
      bodyResult.data.name,
    );
    res.status(200).json(bank);
  } catch (error) {
    next(error);
  }
});

banksRouter.delete("/:id", async (req, res, next) => {
  try {
    const idResult = uuidParam.safeParse(req.params.id);
    if (!idResult.success) {
      throw new ValidationError("Invalid bank id.");
    }
    const bank = await banksService.softDeleteBank(requireActorId(req), idResult.data);
    res.status(200).json(bank);
  } catch (error) {
    next(error);
  }
});

banksRouter.post("/:id/undelete", async (req, res, next) => {
  try {
    const idResult = uuidParam.safeParse(req.params.id);
    if (!idResult.success) {
      throw new ValidationError("Invalid bank id.");
    }
    const bank = await banksService.undeleteBank(requireActorId(req), idResult.data);
    res.status(200).json(bank);
  } catch (error) {
    next(error);
  }
});
