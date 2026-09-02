import { db } from "../../db/client.js";
import { bankLoanTypes } from "../../db/schema/index.js";
import type { DbOrTx } from "../../db/types.js";
import { recordAudit } from "../../lib/audit.js";
import { invalidateDescriptionTreeCache } from "../../lib/cache.js";
import {
  AlreadyAttachedError,
  HasDependentDescriptionsError,
  NotFoundError,
} from "../../lib/errors.js";
import { runLockedTransaction } from "../../lib/lockedTransaction.js";
import * as banksRepo from "../banks/banks.repo.js";
import { countDescriptionsForPair } from "../descriptions/descriptions.repo.js";
import * as loanTypesRepo from "../loanTypes/loanTypes.repo.js";
import * as bankLoanTypesRepo from "./bankLoanTypes.repo.js";

type BankLoanTypeRow = typeof bankLoanTypes.$inferSelect;

const ENTITY_TYPE = "bank_loan_types";

/** Every attach/detach writes two audit rows — entityId has no way to represent a composite key. */
async function recordWiringAudit(
  dbOrTx: DbOrTx,
  actorId: string,
  action: "attach" | "detach",
  bankId: string,
  loanTypeId: string,
  before: unknown,
  after: unknown,
): Promise<void> {
  await recordAudit(dbOrTx, {
    actorId,
    actorType: "admin",
    action,
    entityType: ENTITY_TYPE,
    entityId: bankId,
    before,
    after,
  });
  await recordAudit(dbOrTx, {
    actorId,
    actorType: "admin",
    action,
    entityType: ENTITY_TYPE,
    entityId: loanTypeId,
    before,
    after,
  });
}

export async function attachLoanType(
  actorId: string,
  bankId: string,
  loanTypeId: string,
): Promise<BankLoanTypeRow> {
  const bank = await banksRepo.findBankById(db, bankId);
  if (!bank || bank.deletedAt) {
    throw new NotFoundError("Bank not found.");
  }
  const loanType = await loanTypesRepo.findLoanTypeById(db, loanTypeId);
  if (!loanType || loanType.deletedAt) {
    throw new NotFoundError("Loan type not found.");
  }

  const existing = await bankLoanTypesRepo.findPair(db, bankId, loanTypeId);
  if (existing) {
    throw new AlreadyAttachedError("This loan type is already attached to this bank.");
  }

  const row = await db.transaction(async (tx) => {
    const inserted = await bankLoanTypesRepo.insertPair(tx, bankId, loanTypeId);
    await recordWiringAudit(tx, actorId, "attach", bankId, loanTypeId, null, inserted);
    return inserted;
  });

  await invalidateDescriptionTreeCache();
  return row;
}

export async function detachLoanType(
  actorId: string,
  bankId: string,
  loanTypeId: string,
): Promise<void> {
  await runLockedTransaction(async (tx) => {
    const before = await bankLoanTypesRepo.findPairForUpdate(tx, bankId, loanTypeId);
    if (!before) {
      throw new NotFoundError("This loan type is not attached to this bank.");
    }

    const dependentCount = await countDescriptionsForPair(tx, bankId, loanTypeId);
    if (dependentCount > 0) {
      throw new HasDependentDescriptionsError(
        `Cannot detach: ${String(dependentCount)} live description(s) still reference this pairing.`,
      );
    }

    await bankLoanTypesRepo.deletePair(tx, bankId, loanTypeId);
    await recordWiringAudit(tx, actorId, "detach", bankId, loanTypeId, before, null);
  });

  await invalidateDescriptionTreeCache();
}

export async function listLoanTypesForBank(bankId: string) {
  const bank = await banksRepo.findBankById(db, bankId);
  if (!bank || bank.deletedAt) {
    throw new NotFoundError("Bank not found.");
  }
  return bankLoanTypesRepo.listLoanTypesForBank(db, bankId);
}
