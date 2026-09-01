import { AdjustCreditsRequestSchema, uuidParam } from "@way-to-credit/shared";
import { Router } from "express";
import { requireActorId } from "../../lib/authContext.js";
import { ValidationError } from "../../lib/errors.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import * as creditsService from "./credits.service.js";

export const creditsAdminRouter: Router = Router();

creditsAdminRouter.use(requireAuth, requireRole("admin"));

function readIdempotencyKey(headerValue: string | string[] | undefined): string {
  const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const parsed = uuidParam.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      "A valid Idempotency-Key header (a client-generated UUID) is required.",
    );
  }
  return parsed.data;
}

creditsAdminRouter.post("/:id/credits", async (req, res, next) => {
  try {
    const idResult = uuidParam.safeParse(req.params.id);
    if (!idResult.success) {
      throw new ValidationError("Invalid user id.");
    }
    const idempotencyKey = readIdempotencyKey(req.headers["idempotency-key"]);
    const bodyResult = AdjustCreditsRequestSchema.safeParse(req.body as unknown);
    if (!bodyResult.success) {
      throw new ValidationError(
        "delta (a non-zero integer between -100 and 100) and a non-empty reason are required.",
      );
    }

    const result = await creditsService.adjustUserCredits(
      requireActorId(req),
      idResult.data,
      bodyResult.data.delta,
      bodyResult.data.reason,
      idempotencyKey,
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});
