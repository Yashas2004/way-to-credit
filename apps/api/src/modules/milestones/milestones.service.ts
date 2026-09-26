import type {
  CreateMilestoneRequest,
  MilestoneResponse,
  UpdateMilestoneRequest,
} from "@way-to-credit/shared";
import { db } from "../../db/client.js";
import type { DbOrTx } from "../../db/types.js";
import { recordAudit } from "../../lib/audit.js";
import { ConflictError, NotFoundError } from "../../lib/errors.js";
import { getViolatedConstraint, isUniqueViolationError } from "../../lib/pgErrors.js";
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

/**
 * Any write that leaves a milestone active backfills unlocks for users who
 * already meet its threshold, in the same transaction as the write. Without
 * this, creating a milestone below users' current points, lowering one, or
 * reactivating one they passed while it was inactive left them looking at
 * "Locked — 0 points to go" until their next credit event — the credit path
 * only unlocks when points change. Running it on every active write (not
 * just create/lower) is deliberate: it's idempotent, it also covers
 * reactivation, and it repairs any unlock missed earlier.
 *
 * Same accepted TOCTOU as the credit path (credits.service.ts): a credit
 * award committing concurrently with this write can miss the new threshold
 * on both sides; it self-heals on that user's next credit event or the next
 * write to this milestone.
 */
async function backfillIfActive(tx: DbOrTx, row: milestonesRepo.MilestoneRow): Promise<void> {
  if (row.isActive) {
    await milestonesRepo.backfillUnlocksForMilestone(tx, row.id, row.pointsRequired);
  }
}

const LEVEL_NUMBER_UNIQUE = "milestones_level_number_unique";
const POINTS_REQUIRED_UNIQUE = "milestones_points_required_unique";

/**
 * Both columns are UNIQUE, so the old single "level X or Y points already
 * exists" message never told the admin which field to change. The violated
 * constraint's name says exactly which one collided.
 */
function duplicateMilestoneMessage(
  error: unknown,
  input: { levelNumber?: number | undefined; pointsRequired?: number | undefined },
): string {
  const constraint = getViolatedConstraint(error);
  if (constraint === LEVEL_NUMBER_UNIQUE && input.levelNumber !== undefined) {
    return `A milestone for level ${String(input.levelNumber)} already exists — choose a different level.`;
  }
  if (constraint === POINTS_REQUIRED_UNIQUE && input.pointsRequired !== undefined) {
    return `Another milestone already requires ${String(input.pointsRequired)} points — choose a different points value.`;
  }
  return "A milestone with this level or points value already exists.";
}

export async function createMilestone(
  actorId: string,
  input: CreateMilestoneRequest,
): Promise<MilestoneResponse> {
  let row: milestonesRepo.MilestoneRow;
  try {
    row = await db.transaction(async (tx) => {
      const created = await milestonesRepo.createMilestone(tx, input);
      await backfillIfActive(tx, created);
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
      throw new ConflictError(duplicateMilestoneMessage(error, input));
    }
    throw error;
  }
  // Not 0: the backfill may already have unlocked it for existing users.
  const unlockedCount = await milestonesRepo.countUnlockedForMilestone(db, row.id);
  return toMilestoneResponse(row, unlockedCount);
}

export async function listMilestones(): Promise<MilestoneResponse[]> {
  const rows = await milestonesRepo.listMilestonesWithUnlockCounts(db);
  return rows.map((row) => toMilestoneResponse(row, row.unlockedCount));
}

/**
 * `title`/`message`/`pointsRequired`/`isActive` are all editable here —
 * `levelNumber` is not (immutable post-creation, no route accepts it).
 * Never removes or rewrites a `user_milestones` row — an unlock
 * (unlockedAt/seenAt, the fact of having unlocked it) is a historical record
 * and stays exactly as it was, even if pointsRequired is later raised above
 * that user's points. It only ever adds unlocks, via `backfillIfActive`.
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
      await backfillIfActive(tx, updated);

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
      throw new ConflictError(duplicateMilestoneMessage(error, input));
    }
    throw error;
  }
  // This milestone may well already have real unlocks, so the count has to
  // be fetched, not assumed 0.
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
    await backfillIfActive(tx, updated);

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
