import { uuidParam } from "@way-to-credit/shared";
import { Router } from "express";
import { requireActorId } from "../../lib/authContext.js";
import { ValidationError } from "../../lib/errors.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import * as bankLoanTypesService from "./bankLoanTypes.service.js";

export const bankLoanTypesRouter: Router = Router();

bankLoanTypesRouter.use(requireAuth, requireRole("admin"));

function parseIds(
  bankIdRaw: unknown,
  loanTypeIdRaw: unknown,
): { bankId: string; loanTypeId: string } {
  const bankId = uuidParam.safeParse(bankIdRaw);
  const loanTypeId = uuidParam.safeParse(loanTypeIdRaw);
  if (!bankId.success || !loanTypeId.success) {
    throw new ValidationError("Invalid bank id or loan type id.");
  }
  return { bankId: bankId.data, loanTypeId: loanTypeId.data };
}

bankLoanTypesRouter.post("/:bankId/loan-types/:loanTypeId", async (req, res, next) => {
  try {
    const { bankId, loanTypeId } = parseIds(req.params.bankId, req.params.loanTypeId);
    const row = await bankLoanTypesService.attachLoanType(requireActorId(req), bankId, loanTypeId);
    res.status(201).json(row);
  } catch (error) {
    next(error);
  }
});

bankLoanTypesRouter.delete("/:bankId/loan-types/:loanTypeId", async (req, res, next) => {
  try {
    const { bankId, loanTypeId } = parseIds(req.params.bankId, req.params.loanTypeId);
    await bankLoanTypesService.detachLoanType(requireActorId(req), bankId, loanTypeId);
    res.status(200).json({ status: "ok" });
  } catch (error) {
    next(error);
  }
});
