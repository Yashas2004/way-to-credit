import { db } from "../../db/client.js";
import { loanTypes } from "../../db/schema/index.js";
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
import { countDescriptionsForLoanType } from "../descriptions/descriptions.repo.js";
import * as loanTypesRepo from "./loanTypes.repo.js";

type LoanType = typeof loanTypes.$inferSelect;

const ENTITY_TYPE = "loan_types";

export async function createLoanType(actorId: string, name: string): Promise<LoanType> {
  let loanType: LoanType;
  try {
    loanType = await db.transaction(async (tx) => {
      const row = await loanTypesRepo.createLoanType(tx, name);
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
      throw new ConflictError(`A loan type named "${name}" already exists.`);
    }
    throw error;
  }

  await invalidateDescriptionTreeCache();
  return loanType;
}

export async function listLoanTypes(includeDeleted: boolean): Promise<LoanType[]> {
  return loanTypesRepo.listLoanTypes(db, includeDeleted);
}

export async function updateLoanType(actorId: string, id: string, name: string): Promise<LoanType> {
  let after: LoanType;
  try {
    after = await db.transaction(async (tx) => {
      const before = await loanTypesRepo.findLoanTypeById(tx, id);
      if (!before) {
        throw new NotFoundError("Loan type not found.");
      }

      const updated = await loanTypesRepo.updateLoanType(tx, id, name);
      if (!updated) {
        throw new NotFoundError("Loan type not found.");
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
      throw new ConflictError(`A loan type named "${name}" already exists.`);
    }
    throw error;
  }

  await invalidateDescriptionTreeCache();
  return after;
}

export async function softDeleteLoanType(actorId: string, id: string): Promise<LoanType> {
  const result = await runLockedTransaction(async (tx) => {
    const before = await loanTypesRepo.findLoanTypeByIdForUpdate(tx, id);
    if (!before) {
      throw new NotFoundError("Loan type not found.");
    }
    if (before.deletedAt) {
      return before;
    }

    const dependentCount = await countDescriptionsForLoanType(tx, id);
    if (dependentCount > 0) {
      throw new HasDependentDescriptionsError(
        `Cannot delete: ${String(dependentCount)} live description(s) still reference this loan type.`,
      );
    }

    const after = await loanTypesRepo.softDeleteLoanType(tx, id);
    if (!after) {
      throw new NotFoundError("Loan type not found.");
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

export async function undeleteLoanType(actorId: string, id: string): Promise<LoanType> {
  const after = await db.transaction(async (tx) => {
    const before = await loanTypesRepo.findLoanTypeById(tx, id);
    if (!before) {
      throw new NotFoundError("Loan type not found.");
    }
    if (!before.deletedAt) {
      throw new ValidationError("This loan type is not deleted.");
    }

    const updated = await loanTypesRepo.undeleteLoanType(tx, id);
    if (!updated) {
      throw new NotFoundError("Loan type not found.");
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
