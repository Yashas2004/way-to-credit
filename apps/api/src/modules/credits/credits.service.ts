import type { MyCreditsResponse } from "@way-to-credit/shared";
import { db } from "../../db/client.js";
import { NotFoundError } from "../../lib/errors.js";
import * as creditsRepo from "./credits.repo.js";

/**
 * Read-only this stage — no credit-awarding logic here. `creditPoints ===
 * undefined` can't happen in practice (requireAuth already re-loaded this
 * exact user row this request), but is guarded defensively rather than
 * assumed.
 */
export async function getMyCredits(userId: string): Promise<MyCreditsResponse> {
  const creditPoints = await creditsRepo.findUserCreditPoints(db, userId);
  if (creditPoints === undefined) {
    throw new NotFoundError("User not found.");
  }

  const milestoneRows = await creditsRepo.listUnlockedMilestonesForUser(db, userId);

  return {
    creditPoints,
    milestones: milestoneRows.map((row) => ({
      milestoneId: row.milestoneId,
      levelNumber: row.levelNumber,
      pointsRequired: row.pointsRequired,
      title: row.title,
      message: row.message,
      unlockedAt: row.unlockedAt.toISOString(),
    })),
  };
}
