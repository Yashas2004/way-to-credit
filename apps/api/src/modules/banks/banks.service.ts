import { db } from "../../db/client.js";
import { banks } from "../../db/schema/index.js";
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
import { countDescriptionsForBank } from "../descriptions/descriptions.repo.js";
import * as banksRepo from "./banks.repo.js";

type Bank = typeof banks.$inferSelect;

const ENTITY_TYPE = "banks";

export async function createBank(actorId: string, name: string): Promise<Bank> {
  let bank: Bank;
  try {
    bank = await db.transaction(async (tx) => {
      const row = await banksRepo.createBank(tx, name);
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
      throw new ConflictError(`A bank named "${name}" already exists.`);
    }
    throw error;
  }

  await invalidateDescriptionTreeCache();
  return bank;
}

export async function listBanks(includeDeleted: boolean): Promise<Bank[]> {
  return banksRepo.listBanks(db, includeDeleted);
}

export async function updateBank(actorId: string, id: string, name: string): Promise<Bank> {
  let after: Bank;
  try {
    after = await db.transaction(async (tx) => {
      const before = await banksRepo.findBankById(tx, id);
      if (!before) {
        throw new NotFoundError("Bank not found.");
      }

      const updated = await banksRepo.updateBank(tx, id, name);
      if (!updated) {
        throw new NotFoundError("Bank not found.");
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
      throw new ConflictError(`A bank named "${name}" already exists.`);
    }
    throw error;
  }

  await invalidateDescriptionTreeCache();
  return after;
}

export async function softDeleteBank(actorId: string, id: string): Promise<Bank> {
  const result = await runLockedTransaction(async (tx) => {
    const before = await banksRepo.findBankByIdForUpdate(tx, id);
    if (!before) {
      throw new NotFoundError("Bank not found.");
    }
    if (before.deletedAt) {
      return before; // already deleted — idempotent
    }

    const dependentCount = await countDescriptionsForBank(tx, id);
    if (dependentCount > 0) {
      throw new HasDependentDescriptionsError(
        `Cannot delete: ${String(dependentCount)} live description(s) still reference this bank.`,
      );
    }

    const after = await banksRepo.softDeleteBank(tx, id);
    if (!after) {
      throw new NotFoundError("Bank not found.");
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

export async function undeleteBank(actorId: string, id: string): Promise<Bank> {
  const after = await db.transaction(async (tx) => {
    const before = await banksRepo.findBankById(tx, id);
    if (!before) {
      throw new NotFoundError("Bank not found.");
    }
    if (!before.deletedAt) {
      throw new ValidationError("This bank is not deleted.");
    }

    const updated = await banksRepo.undeleteBank(tx, id);
    if (!updated) {
      throw new NotFoundError("Bank not found.");
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
