import type {
  CreateMilestoneRequest,
  MilestoneResponse,
  UpdateMilestoneRequest,
} from "@way-to-credit/shared";
import { db } from "../../db/client.js";
import { recordAudit } from "../../lib/audit.js";
import { ConflictError, NotFoundError } from "../../lib/errors.js";
import { isUniqueViolationError } from "../../lib/pgErrors.js";
import * as milestonesRepo from "./milestones.repo.js";

const ENTITY_TYPE = "milestones";

function toMilestoneResponse(
  row: milestonesRepo.MilestoneRow,
  unlockedCount: number,
): MilestoneResponse {
  return {
    id: row.id,
    levelNumber: row.levelNumber,
    pointsRequired: row.pointsRequired,
    title: row.title,
    message: row.message,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    unlockedCount,
  };
}

export async function createMilestone(
  actorId: string,
  input: CreateMilestoneRequest,
): Promise<MilestoneResponse> {
  let row: milestonesRepo.MilestoneRow;
  try {
    row = await db.transaction(async (tx) => {
      const created = await milestonesRepo.createMilestone(tx, input);
      await recordAudit(tx, {
        actorId,
        actorType: "admin",
        action: "create",
        entityType: ENTITY_TYPE,
        entityId: created.id,
        after: created,
      });
      return created;
    });
  } catch (error) {
    if (isUniqueViolationError(error)) {
      throw new ConflictError(
        `A milestone with level ${String(input.levelNumber)} or ${String(input.pointsRequired)} points already exists.`,
      );
    }
    throw error;
  }
  // A brand-new milestone genuinely has 0 unlocks — no need to query for it.
  return toMilestoneResponse(row, 0);
}

export async function listMilestones(): Promise<MilestoneResponse[]> {
  const rows = await milestonesRepo.listMilestonesWithUnlockCounts(db);
  return rows.map((row) => toMilestoneResponse(row, row.unlockedCount));
}

/**
 * `title`/`message`/`pointsRequired`/`isActive` are all editable here —
 * `levelNumber` is not (immutable post-creation, no route accepts it).
 * Never touches `user_milestones` — an unlock row (unlockedAt/seenAt, the
 * fact of having unlocked it) is a historical record and stays exactly as
 * it was regardless of later edits here.
 */
export async function updateMilestone(
  actorId: string,
  id: string,
  input: UpdateMilestoneRequest,
): Promise<MilestoneResponse> {
  let after: milestonesRepo.MilestoneRow;
  try {
    after = await db.transaction(async (tx) => {
      const before = await milestonesRepo.findMilestoneById(tx, id);
      if (!before) {
        throw new NotFoundError("Milestone not found.");
      }

      const updated = await milestonesRepo.updateMilestone(tx, id, input);
      if (!updated) {
        throw new NotFoundError("Milestone not found.");
      }

      await recordAudit(tx, {
        actorId,
        actorType: "admin",
        action: "update",
        entityType: ENTITY_TYPE,
        entityId: id,
        before,
        after: updated,
      });
      return updated;
    });
  } catch (error) {
    if (isUniqueViolationError(error)) {
      throw new ConflictError(
        `A milestone requiring ${String(input.pointsRequired ?? "")} points already exists.`,
      );
    }
    throw error;
  }
  // Editing never touches user_milestones (see the comment above) — this
  // milestone may well already have real unlocks, so the count has to be
  // fetched, not assumed 0.
  const unlockedCount = await milestonesRepo.countUnlockedForMilestone(db, after.id);
  return toMilestoneResponse(after, unlockedCount);
}

async function setActive(
  actorId: string,
  id: string,
  isActive: boolean,
): Promise<MilestoneResponse> {
  const after = await db.transaction(async (tx) => {
    const before = await milestonesRepo.findMilestoneById(tx, id);
    if (!before) {
      throw new NotFoundError("Milestone not found.");
    }

    const updated = await milestonesRepo.updateMilestone(tx, id, { isActive });
    if (!updated) {
      throw new NotFoundError("Milestone not found.");
    }

    await recordAudit(tx, {
      actorId,
      actorType: "admin",
      action: "update",
      entityType: ENTITY_TYPE,
      entityId: id,
      before,
      after: updated,
    });
    return updated;
  });
  const unlockedCount = await milestonesRepo.countUnlockedForMilestone(db, after.id);
  return toMilestoneResponse(after, unlockedCount);
}

export async function deactivateMilestone(actorId: string, id: string): Promise<MilestoneResponse> {
  return setActive(actorId, id, false);
}

export async function reactivateMilestone(actorId: string, id: string): Promise<MilestoneResponse> {
  return setActive(actorId, id, true);
}
