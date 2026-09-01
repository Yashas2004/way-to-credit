import { db } from "../../db/client.js";
import { statuses } from "../../db/schema/index.js";
import { recordAudit } from "../../lib/audit.js";
import { invalidateDescriptionTreeCache } from "../../lib/cache.js";
import {
  ConflictError,
  HasDependentDescriptionsError,
  NotFoundError,
  ValidationError,
} from "../../lib/errors.js";
import { runLockedTransaction } from "../../lib/lockedTransaction.js";
import { isUniqueViolationError } from "../../lib/pgErrors.js";
import { countDescriptionsForStatus } from "../descriptions/descriptions.repo.js";
import * as statusesRepo from "./statuses.repo.js";

type Status = typeof statuses.$inferSelect;

const ENTITY_TYPE = "statuses";

export async function createStatus(
  actorId: string,
  input: { name: string; sortOrder: number },
): Promise<Status> {
  let status: Status;
  try {
    status = await db.transaction(async (tx) => {
      const row = await statusesRepo.createStatus(tx, input);
      await recordAudit(tx, {
        actorId,
        actorType: "admin",
        action: "create",
        entityType: ENTITY_TYPE,
        entityId: row.id,
        after: row,
      });
      return row;
    });
  } catch (error) {
    if (isUniqueViolationError(error)) {
      throw new ConflictError(`A status named "${input.name}" already exists.`);
    }
    throw error;
  }

  await invalidateDescriptionTreeCache();
  return status;
}

export async function listStatuses(includeDeleted: boolean): Promise<Status[]> {
  return statusesRepo.listStatuses(db, includeDeleted);
}

export async function updateStatus(
  actorId: string,
  id: string,
  input: { name?: string | undefined; sortOrder?: number | undefined },
): Promise<Status> {
  const patch: { name?: string; sortOrder?: number } = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;

  let after: Status;
  try {
    after = await db.transaction(async (tx) => {
      const before = await statusesRepo.findStatusById(tx, id);
      if (!before) {
        throw new NotFoundError("Status not found.");
      }

      const updated = await statusesRepo.updateStatus(tx, id, patch);
      if (!updated) {
        throw new NotFoundError("Status not found.");
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
      throw new ConflictError(`A status named "${input.name ?? ""}" already exists.`);
    }
    throw error;
  }

  await invalidateDescriptionTreeCache();
  return after;
}

export async function softDeleteStatus(actorId: string, id: string): Promise<Status> {
  const result = await runLockedTransaction(async (tx) => {
    const before = await statusesRepo.findStatusByIdForUpdate(tx, id);
    if (!before) {
      throw new NotFoundError("Status not found.");
    }
    if (before.deletedAt) {
      return before;
    }

    const dependentCount = await countDescriptionsForStatus(tx, id);
    if (dependentCount > 0) {
      throw new HasDependentDescriptionsError(
        `Cannot delete: ${String(dependentCount)} live description(s) still reference this status.`,
      );
    }

    const after = await statusesRepo.softDeleteStatus(tx, id);
    if (!after) {
      throw new NotFoundError("Status not found.");
    }

    await recordAudit(tx, {
      actorId,
      actorType: "admin",
      action: "soft_delete",
      entityType: ENTITY_TYPE,
      entityId: id,
      before,
      after,
    });
    return after;
  });

  await invalidateDescriptionTreeCache();
  return result;
}

export async function undeleteStatus(actorId: string, id: string): Promise<Status> {
  const after = await db.transaction(async (tx) => {
    const before = await statusesRepo.findStatusById(tx, id);
    if (!before) {
      throw new NotFoundError("Status not found.");
    }
    if (!before.deletedAt) {
      throw new ValidationError("This status is not deleted.");
    }

    const updated = await statusesRepo.undeleteStatus(tx, id);
    if (!updated) {
      throw new NotFoundError("Status not found.");
    }

    await recordAudit(tx, {
      actorId,
      actorType: "admin",
      action: "undelete",
      entityType: ENTITY_TYPE,
      entityId: id,
      before,
      after: updated,
    });
    return updated;
  });

  await invalidateDescriptionTreeCache();
  return after;
}
